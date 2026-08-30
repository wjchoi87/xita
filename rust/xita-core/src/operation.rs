//! Operation + Conflict Engine (v0.5 §12-§13; Phase 4).
//!
//! - Operation Engine: Revision check → Validation → Idempotency → Canonical
//!   mutation → History/Conflict 기록 (v0.5 §12 Operation Engine 목록).
//! - Conflict Engine(Verdict):
//!   - `Safe`           : base revision 일치 → 즉시 적용
//!   - `SafeNonOverlap` : base 가 stale 이어도 non-overlap(안전) 필드만 → 자동 적용
//!   - `Conflict`       : stale + semantic(상태/수명주기) 필드 → 사람 판단(Needs You)
//!   - `Rejected`       : 대상 없음 / 잘못된 op → 거부 (v0.5 §13)
//!
//! Idempotency 는 `.xita/ops.jsonl` ledger 로, op_id 재전송 시 중복 적용하지 않는다.
//! Conflict 는 `.xita/conflicts.jsonl` 에 기록되어 Needs You 로 Projection 된다.

use std::fs;
use std::path::PathBuf;

use crate::doc::{FmValue, Doc};
use crate::error::{CoreError, Result};
use crate::storage::{EntityType, Workspace};

/// 같은 entity·필드에 대해 오버랩으로 보는 semantic 필드.
/// stale revision 과 결합하면 Conflict 로 분류한다 (v0.5 §13).
const SEMANTIC_FIELDS: &[&str] = &[
    "status",
    "lifecycle",
    "stage",
    "shipped_at",
    "cancelled_at",
    "paused_at",
    "current_revision",
    "supersedes",
];

fn is_semantic(key: &str) -> bool {
    SEMANTIC_FIELDS.contains(&key)
}

fn is_safe(key: &str) -> bool {
    !is_semantic(key)
}

/// Operation 종류. 작게 시작하고 확장한다 (v0.5 §12 목록의 일부).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpKind {
    Create,
    UpdateField,
    UpdateStatus,
    ResolveConflict,
    Delete,
}

/// Bridge/Sync 로 들어오는 operation (v0.4/§12 계약과 유사).
#[derive(Debug, Clone)]
pub struct Operation {
    /// operation 계약 버전(§20). mismatch 는 OperationRejected.
    pub version: u32,
    pub op_id: String,
    pub device_id: String,
    pub target: EntityType,
    pub target_id: String,
    pub base_revision: u64,
    pub kind: OpKind,
    /// 적용할 필드 (Create 는 초기 필드, Update 는 변경 필드).
    pub fields: Vec<(String, FmValue)>,
}

/// operation 계약 버전 (v0.5 §20).
pub const OPERATION_VERSION: u32 = 1;

/// Conflict Engine 결론 (v0.5 §13).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    Safe,
    SafeNonOverlap,
    Conflict,
    Rejected,
}

/// apply() 결과 — Swift 가 Human-readable state 로 전환할 최소 형태.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Outcome {
    pub status: &'static str, // APPLIED | DEDUPED | CONFLICT | REJECTED
    pub verdict: Option<Verdict>,
    pub entity_revision: u64,
    pub workspace_revision: u64,
    pub message: String,
}

fn doc_revision(doc: &Doc) -> u64 {
    doc.fields
        .iter()
        .find(|(k, _)| k == "revision")
        .and_then(|(_, v)| v.as_int())
        .unwrap_or(0) as u64
}

fn upsert_field(doc: &mut Doc, key: &str, value: FmValue) {
    if let Some(slot) = doc.fields.iter_mut().find(|(k, _)| k == key) {
        slot.1 = value;
    } else {
        doc.fields.push((key.to_string(), value));
    }
}

/// Conflict Engine 분류 (순수 함수).
pub fn classify(base_revision: u64, canonical_revision: u64, fields: &[(String, FmValue)]) -> Verdict {
    if fields.is_empty() {
        return Verdict::Rejected;
    }
    if canonical_revision == base_revision {
        return Verdict::Safe;
    }
    // stale: 오버랩 없으면 auto, 아니라면 conflict
    if fields.iter().all(|(k, _)| is_safe(k)) {
        return Verdict::SafeNonOverlap;
    }
    Verdict::Conflict
}

pub struct OperationEngine {
    ws: Workspace,
}

impl OperationEngine {
    pub fn new(ws: Workspace) -> Self {
        Self { ws }
    }

    pub fn apply(&self, op: &Operation) -> Result<Outcome> {
        if op.version != OPERATION_VERSION {
            return Ok(Outcome {
                status: "REJECTED",
                verdict: Some(Verdict::Rejected),
                entity_revision: 0,
                workspace_revision: self.ws.workspace_revision()?,
                message: format!("operation version {} not supported (current {})", op.version, OPERATION_VERSION),
            });
        }
        if self.seen(&op.op_id) {
            return Ok(Outcome {
                status: "DEDUPED",
                verdict: None,
                entity_revision: 0,
                workspace_revision: self.ws.workspace_revision()?,
                message: "duplicate op_id; skipped".into(),
            });
        }

        // Delete: canonical 파일 제거 (idempotent: 이미 없으면 APPLIED-noop)
        if op.kind == OpKind::Delete {
            let removed = self.ws.delete_entity(op.target, &op.target_id)?;
            self.record_op(&op.op_id)?;
            let meta = crate::storage::Workspace::workspace_revision(&self.ws)?;
            return Ok(Outcome {
                status: "APPLIED",
                verdict: Some(Verdict::Safe),
                entity_revision: 0,
                workspace_revision: meta,
                message: if removed { "deleted".into() } else { "already absent".into() },
            });
        }

        // ResolveConflict 는 canonical mutation 이 아니라 ledger 정리
        if op.kind == OpKind::ResolveConflict {
            self.resolve_conflict(&op.target_id);
            self.record_op(&op.op_id)?;
            let wr = self.ws.workspace_revision()?;
            return Ok(Outcome {
                status: "APPLIED",
                verdict: Some(Verdict::Safe),
                entity_revision: 0,
                workspace_revision: wr,
                message: "conflict resolved".into(),
            });
        }

        let existing = self.ws.read_entity(op.target, &op.target_id);
        let (mut doc, canonical_rev) = match existing {
            Ok(d) => {
                let rev = doc_revision(&d);
                (d, rev)
            }
            Err(CoreError::StorageReadFailed) => {
                if op.kind == OpKind::Create && op.base_revision == 0 {
                    let mut d = Doc { fields: vec![("id".into(), FmValue::Scalar(op.target_id.clone())), ("type".into(), FmValue::Scalar(op.target.dir().to_string()))], body: String::new() };
                    for (k, v) in &op.fields {
                        upsert_field(&mut d, k, v.clone());
                    }
                    let rev = self.ws.write_entity(op.target, &op.target_id, &d, None)?;
                    self.record_op(&op.op_id)?;
                    let wr = self.ws.workspace_revision()?;
                    return Ok(Outcome {
                        status: "APPLIED",
                        verdict: Some(Verdict::Safe),
                        entity_revision: rev,
                        workspace_revision: wr,
                        message: "created".into(),
                    });
                }
                return Ok(Outcome {
                    status: "REJECTED",
                    verdict: Some(Verdict::Rejected),
                    entity_revision: 0,
                    workspace_revision: self.ws.workspace_revision()?,
                    message: format!("unknown {}: {}", op.target.dir(), op.target_id),
                });
            }
            Err(e) => return Err(e),
        };

        let verdict = classify(op.base_revision, canonical_rev, &op.fields);
        // Lifecycle guard (§13/§78): revision 일치 후 update_status 는 전이 테이블 검증.
        if op.kind == OpKind::UpdateStatus && verdict != Verdict::Conflict {
            if let Some((_, to_val)) = op.fields.iter().find(|(k, _)| k == "status") {
                let from = doc
                    .fields
                    .iter()
                    .find(|(k, _)| k == "status")
                    .and_then(|(_, v)| v.as_str())
                    .unwrap_or("IDEA")
                    .to_string();
                let to = to_val.as_str().unwrap_or("").to_string();
                if !crate::lifecycle::is_known_status(&to) || !crate::lifecycle::is_valid_transition(&from, &to) {
                    return Ok(Outcome {
                        status: "REJECTED",
                        verdict: Some(Verdict::Rejected),
                        entity_revision: canonical_rev,
                        workspace_revision: self.ws.workspace_revision()?,
                        message: format!("invalid transition {from} -> {to}"),
                    });
                }
            }
        }
        match verdict {
            Verdict::Conflict => {
                self.record_conflict(op, canonical_rev)?;
                Ok(Outcome {
                    status: "CONFLICT",
                    verdict: Some(Verdict::Conflict),
                    entity_revision: canonical_rev,
                    workspace_revision: self.ws.workspace_revision()?,
                    message: format!("stale revision {} vs {}", op.base_revision, canonical_rev),
                })
            }
            Verdict::Rejected => Ok(Outcome {
                status: "REJECTED",
                verdict: Some(Verdict::Rejected),
                entity_revision: canonical_rev,
                workspace_revision: self.ws.workspace_revision()?,
                message: "empty or unknown operation".into(),
            }),
            Verdict::Safe | Verdict::SafeNonOverlap => {
                for (k, v) in &op.fields {
                    if k == "#body" {
                        // 서사 본문(markdown) 갱신 — frontmatter 아님 (v0.4 §3)
                        if let Some(b) = v.as_str() {
                            doc.body = b.to_string();
                        }
                        continue;
                    }
                    upsert_field(&mut doc, k, v.clone());
                }
                let rev = self.ws.write_entity(op.target, &op.target_id, &doc, None)?;
                self.record_op(&op.op_id)?;
                let wr = self.ws.workspace_revision()?;
                Ok(Outcome {
                    status: "APPLIED",
                    verdict: Some(verdict),
                    entity_revision: rev,
                    workspace_revision: wr,
                    message: if verdict == Verdict::Safe { "applied".into() } else { "applied (safe non-overlap)".into() },
                })
            }
        }
    }

    pub fn list_conflicts(&self) -> Result<Vec<String>> {
        self.read_lines("conflicts.jsonl")
    }

    // ---- ledger ----------------------------------------------------------
    fn meta(&self) -> PathBuf {
        self.ws.meta_dir()
    }

    fn seen(&self, op_id: &str) -> bool {
        self.read_lines("ops.jsonl")
            .map(|l| l.iter().any(|e| e == op_id))
            .unwrap_or(false)
    }

    fn record_op(&self, op_id: &str) -> Result<()> {
        self.append_line("ops.jsonl", op_id)
    }

    fn record_conflict(&self, op: &Operation, canonical_rev: u64) -> Result<()> {
        let entry = format!(
            "{}|{}|{}|{}|{}",
            op.op_id, op.target_id, op.base_revision, canonical_rev, op.kind_label()
        );
        self.append_line("conflicts.jsonl", &entry)
    }

    fn resolve_conflict(&self, op_id: &str) {
        let _ = self.rewrite_without("conflicts.jsonl", op_id);
    }

    fn read_lines(&self, name: &str) -> Result<Vec<String>> {
        let path = self.meta().join(name);
        let raw = match fs::read_to_string(&path) {
            Ok(r) => r,
            Err(_) => return Ok(Vec::new()),
        };
        Ok(raw.lines().map(|l| strip_trailing(l).to_string()).filter(|l| !l.is_empty()).collect())
    }

    fn append_line(&self, name: &str, line: &str) -> Result<()> {
        let meta = self.meta();
        fs::create_dir_all(&meta).map_err(|_| CoreError::PermissionDenied)?;
        let path = meta.join(name);
        let mut raw = fs::read_to_string(&path).unwrap_or_default();
        if !raw.is_empty() && !raw.ends_with('\n') {
            raw.push('\n');
        }
        raw.push_str(line);
        raw.push('\n');
        crate::storage::atomic_write(&path, &raw)
    }

    fn rewrite_without(&self, name: &str, needle: &str) -> Result<()> {
        let meta = self.meta();
        fs::create_dir_all(&meta).map_err(|_| CoreError::PermissionDenied)?;
        let path = meta.join(name);
        let raw = fs::read_to_string(&path).unwrap_or_default();
        let kept: Vec<&str> = raw.lines().filter(|l| !l.contains(needle)).collect();
        crate::storage::atomic_write(&path, &format!("{}\n", kept.join("\n").trim()))
    }
}

impl Operation {
    fn kind_label(&self) -> &'static str {
        match self.kind {
            OpKind::Create => "create",
            OpKind::UpdateField => "update_field",
            OpKind::UpdateStatus => "update_status",
            OpKind::ResolveConflict => "resolve_conflict",
            OpKind::Delete => "delete",
        }
    }
}

fn strip_trailing(l: &str) -> &str {
    l.trim_end()
}
#[cfg(test)]
mod tests {
    use super::*;

    fn ws() -> (Workspace, std::path::PathBuf) {
        use std::time::{SystemTime, UNIX_EPOCH};
        let dir = std::env::temp_dir().join(format!(
            "xita-op-test-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        (Workspace::open(&dir).unwrap(), dir)
    }

    fn op(op_id: &str, target_id: &str, target: EntityType, base: u64, kind: OpKind, fields: Vec<(&str, FmValue)>) -> Operation {
        Operation {
            version: OPERATION_VERSION,
            op_id: op_id.into(),
            device_id: "dev1".into(),
            target,
            target_id: target_id.into(),
            base_revision: base,
            kind,
            fields: fields.into_iter().map(|(k, v)| (k.to_string(), v)).collect(),
        }
    }

    #[test]
    fn create_then_safe_update_and_status_conflict() {
        let (ws, _tmp) = ws();
        let engine = OperationEngine::new(ws.clone());

        // create (base 0)
        let o1 = op("op-create-c1", "c1", EntityType::Change, 0, OpKind::Create, vec![("status", FmValue::Scalar("IDEA".into()))]);
        let r1 = engine.apply(&o1).unwrap();
        assert_eq!(r1.status, "APPLIED");
        assert_eq!(r1.entity_revision, 1);

        // safe update with matching base (rev 1)
        let o2 = op("op-update-c1", "c1", EntityType::Change, 1, OpKind::UpdateField, vec![("summary", FmValue::Scalar("설명".into()))]);
        let r2 = engine.apply(&o2).unwrap();
        assert_eq!(r2.status, "APPLIED");
        assert_eq!(r2.verdict, Some(Verdict::Safe));
        assert_eq!(r2.entity_revision, 2);

        // duplicate op_id → DEDUPED, revision 유지
        let r2b = engine.apply(&o2).unwrap();
        assert_eq!(r2b.status, "DEDUPED");

        // stale base(1) + semantic status → CONFLICT, conflicts ledger 기록
        let o3 = op("op-status-c1", "c1", EntityType::Change, 1, OpKind::UpdateStatus, vec![("status", FmValue::Scalar("SHIPPED".into()))]);
        let r3 = engine.apply(&o3).unwrap();
        assert_eq!(r3.status, "CONFLICT");
        assert_eq!(r3.verdict, Some(Verdict::Conflict));
        assert!(engine.list_conflicts().unwrap().iter().any(|c| c.contains("c1")));

        // resolve conflict → ledger 비움
        let o4 = Operation { version: OPERATION_VERSION, op_id: "resolve-c1".into(), device_id: "host".into(), target: EntityType::Change, target_id: "c1".into(), base_revision: 0, kind: OpKind::ResolveConflict, fields: vec![] };
        let r4 = engine.apply(&o4).unwrap();
        assert_eq!(r4.status, "APPLIED");
        assert!(!engine.list_conflicts().unwrap().iter().any(|c| c.contains("c1")));
    }

    #[test]
    fn stale_safe_field_auto_applies_non_overlap() {
        let (ws, _tmp) = ws();
        let engine = OperationEngine::new(ws.clone());
        let o1 = op("op-create-p1", "p1", EntityType::Product, 0, OpKind::Create, vec![("name", FmValue::Scalar("Novel".into()))]);
        engine.apply(&o1).unwrap(); // rev 1

        // stale base(1 을 0 으로) + description(safe) → SAFE_NON_OVERLAP auto
        let o2 = op("op-desc-p1", "p1", EntityType::Product, 0, OpKind::UpdateField, vec![("description", FmValue::Scalar("설명 추가".into()))]);
        let r2 = engine.apply(&o2).unwrap();
        assert_eq!(r2.verdict, Some(Verdict::SafeNonOverlap));
        assert_eq!(r2.status, "APPLIED");
        let doc = ws.read_entity(EntityType::Product, "p1").unwrap();
        assert!(doc.fields.iter().any(|(k, v)| k == "description" && v.as_str() == Some("설명 추가")));
    }

    #[test]
    fn update_missing_target_is_rejected() {
        let (ws, _tmp) = ws();
        let engine = OperationEngine::new(ws.clone());
        let o = op("op-rej", "nope", EntityType::Change, 1, OpKind::UpdateStatus, vec![("status", FmValue::Scalar("BUILD".into()))]);
        let r = engine.apply(&o).unwrap();
        assert_eq!(r.status, "REJECTED");
        assert_eq!(r.verdict, Some(Verdict::Rejected));
    }

    #[test]
    fn unsupported_operation_version_rejected() {
        let (ws, _tmp) = ws();
        let engine = OperationEngine::new(ws.clone());
        let mut o = op("op-vbad", "c1", EntityType::Change, 0, OpKind::Create, vec![("status", FmValue::Scalar("IDEA".into()))]);
        o.version = 99;
        let r = engine.apply(&o).unwrap();
        assert_eq!(r.status, "REJECTED");
    }

    #[test]
    fn empty_fields_rejected() {
        let (ws, _tmp) = ws();
        let o = Operation { version: OPERATION_VERSION, op_id: "e1".into(), device_id: "d".into(), target: EntityType::Change, target_id: "c1".into(), base_revision: 1, kind: OpKind::UpdateField, fields: vec![] };
        assert_eq!(classify(1, 2, &[]), Verdict::Rejected);
        let engine = OperationEngine::new(ws.clone());
        assert_eq!(engine.apply(&o).unwrap().status, "REJECTED");
    }
}

#[cfg(test)]
mod lifecycle_guard_tests {
    use super::*;
    use crate::storage::EntityType;

    fn ws() -> (Workspace, std::path::PathBuf) {
        use std::time::{SystemTime, UNIX_EPOCH};
        let dir = std::env::temp_dir().join(format!(
            "xita-guard-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let d2 = dir.clone();
        (Workspace::open(&dir).unwrap(), d2)
    }

    #[test]
    fn invalid_transition_rejected_valid_applied() {
        let (ws, _t) = ws();
        let e = OperationEngine::new(ws.clone());
        e.apply(&Operation {
            version: OPERATION_VERSION,
            op_id: "g1".into(),
            device_id: "d".into(),
            target: EntityType::Change,
            target_id: "c1".into(),
            base_revision: 0,
            kind: OpKind::Create,
            fields: vec![("status".to_string(), FmValue::Scalar("IDEA".into()))],
        })
        .unwrap();
        // IDEA -> SHIPPED invalid
        let bad = e.apply(&Operation {
            version: OPERATION_VERSION,
            op_id: "g2".into(),
            device_id: "d".into(),
            target: EntityType::Change,
            target_id: "c1".into(),
            base_revision: 1,
            kind: OpKind::UpdateStatus,
            fields: vec![("status".to_string(), FmValue::Scalar("SHIPPED".into()))],
        })
        .unwrap();
        assert_eq!(bad.status, "REJECTED");
        assert!(bad.message.contains("invalid transition"));
        // IDEA -> PLAN valid
        let good = e.apply(&Operation {
            version: OPERATION_VERSION,
            op_id: "g3".into(),
            device_id: "d".into(),
            target: EntityType::Change,
            target_id: "c1".into(),
            base_revision: 1,
            kind: OpKind::UpdateStatus,
            fields: vec![("status".to_string(), FmValue::Scalar("PLAN".into()))],
        })
        .unwrap();
        assert_eq!(good.status, "APPLIED");
    }

    #[test]
    fn delete_removes_file_and_body_edit_persists() {
        let (ws, _t) = ws();
        let e = OperationEngine::new(ws.clone());
        e.apply(&Operation {
            version: OPERATION_VERSION,
            op_id: "d1".into(),
            device_id: "d".into(),
            target: EntityType::Product,
            target_id: "p9".into(),
            base_revision: 0,
            kind: OpKind::Create,
            fields: vec![("name".to_string(), FmValue::Scalar("Nine".into()))],
        })
        .unwrap();
        // #body update (update_field → safe)
        e.apply(&Operation {
            version: OPERATION_VERSION,
            op_id: "d2".into(),
            device_id: "d".into(),
            target: EntityType::Product,
            target_id: "p9".into(),
            base_revision: 1,
            kind: OpKind::UpdateField,
            fields: vec![("#body".to_string(), FmValue::Scalar("# Nine\n\n서사".into()))],
        })
        .unwrap();
        let doc = ws.read_entity(EntityType::Product, "p9").unwrap();
        assert!(doc.body.contains("서사"));
        // delete
        let out = e.apply(&Operation {
            version: OPERATION_VERSION,
            op_id: "d3".into(),
            device_id: "d".into(),
            target: EntityType::Product,
            target_id: "p9".into(),
            base_revision: 0,
            kind: OpKind::Delete,
            fields: vec![],
        })
        .unwrap();
        assert_eq!(out.status, "APPLIED");
        assert!(ws.list_ids(EntityType::Product).unwrap().is_empty());
    }
}

/// capability_changes 해석 — List(pipe lines) 또는 Scalar("a|X;b|Y")
pub fn cap_changes_of(doc: &Doc) -> Vec<(String, String)> {
    let Some((_, v)) = doc.fields.iter().find(|(k, _)| k == "capability_changes") else {
        return Vec::new();
    };
    let entries: Vec<String> = match v {
        FmValue::List(lines) => lines.clone(),
        FmValue::Scalar(s) => s.split(';').map(|x| x.to_string()).collect(),
        _ => Vec::new(),
    };
    entries
        .iter()
        .filter(|l| l.contains('|'))
        .map(|l| {
            let mut it = l.splitn(2, '|');
            let id = it.next().unwrap_or_default().to_string();
            let action = it.next().unwrap_or("MODIFY").to_string();
            (id, action)
        })
        .collect()
}

/// §51 Change Approval — Capability 적용 → Review 승인 → SHIPPED → Timeline.
/// Mac/앱 단독 구동에서도 서버 ops와 동일 semantics 로 승인할 수 있다.
pub fn approve_change(ws: &Workspace, change_id: &str) -> Result<Outcome> {
    let change = ws.read_entity(EntityType::Change, change_id)?;
    let product = meta_str(&change, "product").unwrap_or_default();
    let mut applied = 0usize;

    // capability_changes: "capId|ACTION" 의 pipe-list 또는 semicolon-string (Mac TSV 경로)
    for (cap_id, action) in cap_changes_of(&change) {
        let Ok(cap) = ws.read_entity(EntityType::Capability, &cap_id) else {
            continue;
        };
        let next_status = match action.as_str() {
            "REMOVE" => "removed",
            "DEPRECATE" => "deprecated",
            _ => "active",
        };
        let mut fields: Vec<(String, FmValue)> = cap
            .fields
            .iter()
            .filter(|(k, _)| k != "revision")
            .cloned()
            .collect();
        set(&mut fields, "status", FmValue::Scalar(next_status.into()));
        set(&mut fields, "last_change", FmValue::Scalar(change_id.into()));
        let cap_doc = Doc { fields, body: cap.body };
        ws.write_entity(EntityType::Capability, &cap_id, &cap_doc, None)?;
        applied += 1;
    }

    // reviews for this change → approved
    let review_ids = ws.list_ids(EntityType::Review).unwrap_or_default();
    for rid in review_ids {
        if let Ok(r) = ws.read_entity(EntityType::Review, &rid) {
            let is_mine = r
                .fields
                .iter()
                .any(|(k, v)| k == "change" && v.as_str() == Some(change_id));
            if !is_mine {
                continue;
            }
            let mut fields: Vec<(String, FmValue)> = r.fields.iter().filter(|(k, _)| k != "revision").cloned().collect();
            set(&mut fields, "status", FmValue::Scalar("approved".into()));
            let doc = Doc { fields, body: r.body };
            ws.write_entity(EntityType::Review, &rid, &doc, None)?;
        }
    }

    // change → SHIPPED (lifecycle 단계를 건너뛸 수 있도록 update_field 경로 사용)
    let mut cfields: Vec<(String, FmValue)> = change.fields.iter().filter(|(k, _)| k != "revision").cloned().collect();
    set(&mut cfields, "status", FmValue::Scalar("SHIPPED".into()));
    set(&mut cfields, "stage", FmValue::Scalar("ship".into()));
    set(&mut cfields, "shipped_at", FmValue::Scalar(crate::now_iso()));
    let cdoc = Doc { fields: cfields, body: change.body };
    let rev = ws.write_entity(EntityType::Change, change_id, &cdoc, None)?;

    // timeline event (§63 human-significant)
    let ev_path = ws.meta_dir().join("events.jsonl");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&ev_path) {
        use std::io::Write;
        let _ = writeln!(
            f,
            "{{\"ts\":\"{}\",\"event_type\":\"CHANGE_APPROVED\",\"product\":\"{}\",\"change\":\"{}\",\"title\":\"{} approved -> SHIPPED (capabilities applied: {})\"}}",
            crate::now_iso(),
            product,
            change_id,
            change_id,
            applied
        );
    }

    Ok(Outcome {
        status: "APPLIED",
        verdict: Some(Verdict::Safe),
        entity_revision: rev,
        workspace_revision: ws.workspace_revision().unwrap_or(0),
        message: format!("approved; capabilities applied: {applied}"),
    })
}

fn meta_str(doc: &Doc, key: &str) -> Option<String> {
    doc.fields
        .iter()
        .find(|(k, _)| k == key)
        .and_then(|(_, v)| v.as_str().map(|s| s.to_string()))
}

fn set(fields: &mut Vec<(String, FmValue)>, key: &str, value: FmValue) {
    if let Some(slot) = fields.iter_mut().find(|(k, _)| k == key) {
        slot.1 = value;
    } else {
        fields.push((key.to_string(), value));
    }
}

#[cfg(test)]
mod approve_tests {
    use super::*;
    use crate::storage::EntityType;

    fn ws() -> Workspace {
        use std::time::{SystemTime, UNIX_EPOCH};
        let dir = std::env::temp_dir().join(format!(
            "xita-approve-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        Workspace::open(&dir).unwrap()
    }

    #[test]
    fn approve_applies_capabilities_ships_and_events() {
        let ws = ws();
        let e = OperationEngine::new(ws.clone());
        // capability + change(with pipe capability_changes) + review
        let cap = Operation {
            version: OPERATION_VERSION, op_id: "a1".into(), device_id: "m".into(),
            target: EntityType::Capability, target_id: "novel-billing".into(), base_revision: 0,
            kind: OpKind::Create, fields: vec![
                ("product".to_string(), FmValue::Scalar("novel".into())),
                ("name".to_string(), FmValue::Scalar("Billing".into())),
                ("status".to_string(), FmValue::Scalar("active".into())),
            ],
        };
        e.apply(&cap).unwrap();
        let ch = Operation {
            version: OPERATION_VERSION, op_id: "a2".into(), device_id: "m".into(),
            target: EntityType::Change, target_id: "rec".into(), base_revision: 0,
            kind: OpKind::Create, fields: vec![
                ("product".to_string(), FmValue::Scalar("novel".into())),
                ("status".to_string(), FmValue::Scalar("REVIEW".into())),
            ],
        };
        e.apply(&ch).unwrap();
        // attach capability_changes via update_field (List 직렬화는 create fields 로)
        let attach = Operation {
            version: OPERATION_VERSION, op_id: "a3".into(), device_id: "m".into(),
            target: EntityType::Change, target_id: "rec".into(), base_revision: 1,
            kind: OpKind::UpdateField,
            // semicolon-scalar 형태 (Mac TSV 경로) 도 허용되어야 함
            fields: vec![("capability_changes".to_string(), FmValue::Scalar("novel-billing|DEPRECATE".into()))],
        };
        e.apply(&attach).unwrap();
        // review doc
        let rv = Operation {
            version: OPERATION_VERSION, op_id: "a4".into(), device_id: "m".into(),
            target: EntityType::Review, target_id: "rec-r1".into(), base_revision: 0,
            kind: OpKind::Create, fields: vec![
                ("change".to_string(), FmValue::Scalar("rec".into())),
                ("status".to_string(), FmValue::Scalar("ready_for_review".into())),
            ],
        };
        e.apply(&rv).unwrap();

        let out = approve_change(&ws, "rec").unwrap();
        assert_eq!(out.status, "APPLIED");
        assert!(out.message.contains("capabilities applied: 1"));

        let cap2 = ws.read_entity(EntityType::Capability, "novel-billing").unwrap();
        assert_eq!(meta_str(&cap2, "status").as_deref(), Some("deprecated"));
        let ch2 = ws.read_entity(EntityType::Change, "rec").unwrap();
        assert_eq!(meta_str(&ch2, "status").as_deref(), Some("SHIPPED"));
        let rv2 = ws.read_entity(EntityType::Review, "rec-r1").unwrap();
        assert_eq!(meta_str(&rv2, "status").as_deref(), Some("approved"));
        let events = std::fs::read_to_string(ws.meta_dir().join("events.jsonl")).unwrap();
        assert!(events.contains("CHANGE_APPROVED"));
    }
}
