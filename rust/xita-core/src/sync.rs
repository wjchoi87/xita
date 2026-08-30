//! Sync protocol semantics (v0.5 §14-§15, Phase 5).
//!
//! Rust Core 는 transport 와 분리된 sync *semantics* 를 소유한다:
//! protocol version / cursor / incremental pull / operation push / result /
//! conflict 표현. HTTP · Bonjour · TLS 등 transport 는 플랫폼(스위프트) 레이어
//! 책임이다 (§15).
//!
//! Authority: macOS/PC 가 canonical writer, Mobile 은 replica+op producer (§14).

use crate::doc::{FmValue, Doc};
use crate::error::{CoreError, Result};
use crate::operation::{Operation, OperationEngine};
use crate::storage::{EntityType, Workspace};

pub const CURRENT_PROTOCOL_VERSION: u32 = 1;
/// push 요청 시 최소 요구되는 device identity 길이.
const MIN_DEVICE_ID_LEN: usize = 2;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Platform {
    MacOS,
    IOS,
    Android,
    Other(String),
}

impl Platform {
    pub fn as_str(&self) -> &str {
        match self {
            Self::MacOS => "macOS",
            Self::IOS => "iOS",
            Self::Android => "Android",
            Self::Other(s) => s,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeviceIdentity {
    pub device_id: String,
    pub host_identity: Option<String>,
    pub platform: Platform,
}

/// sync cursor = workspace/entity revision (incremental pull 용).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SyncCursor(pub u64);

impl SyncCursor {
    pub fn get(&self) -> u64 {
        self.0
    }
}

/// pull 응답에 담기는 변경 항목 (incremental change).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EntityChange {
    pub target: EntityType,
    pub target_id: String,
    pub revision: u64,
    pub fields: Vec<(String, FmValue)>,
    pub body: String,
}

#[derive(Debug, Clone)]
pub struct SyncPullRequest {
    pub protocol_version: u32,
    pub cursor: SyncCursor,
}

#[derive(Debug, Clone)]
pub struct SyncPullResponse {
    pub protocol_version: u32,
    pub workspace_revision: u64,
    pub changes: Vec<EntityChange>,
}

#[derive(Debug, Clone)]
pub struct SyncPushRequest {
    pub protocol_version: u32,
    pub device: DeviceIdentity,
    pub cursor: SyncCursor,
    pub operations: Vec<Operation>,
}

/// 단일 operation 결과 (push 응답 item).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OperationResult {
    pub op_id: String,
    pub status: &'static str, // APPLIED | DEDUPED | CONFLICT | REJECTED
    pub entity_revision: u64,
    pub conflict: Option<Conflict>,
}

/// 사람 판단이 필요한 conflict (v0.5 §13 → Needs You).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Conflict {
    pub op_id: String,
    pub target: EntityType,
    pub target_id: String,
    pub base_revision: u64,
    pub canonical_revision: u64,
    pub message: String,
}

#[derive(Debug, Clone)]
pub struct SyncPushResponse {
    pub protocol_version: u32,
    pub workspace_revision: u64,
    pub results: Vec<OperationResult>,
    pub conflicts: Vec<Conflict>,
}

pub struct SyncEngine {
    ws: Workspace,
}

impl SyncEngine {
    pub fn new(ws: Workspace) -> Self {
        Self { ws }
    }

    fn check_version(version: u32) -> Result<()> {
        if version != CURRENT_PROTOCOL_VERSION {
            return Err(CoreError::SyncProtocolError);
        }
        Ok(())
    }

    /// incremental pull: revision > cursor 인 entity 변경만 반환.
    pub fn pull(&self, req: &SyncPullRequest) -> Result<SyncPullResponse> {
        Self::check_version(req.protocol_version)?;
        let mut changes = Vec::new();
        for ty in ALL_TYPES {
            for id in self.ws.list_ids(ty)? {
                let doc = self.ws.read_entity(ty, &id)?;
                let rev = doc_revision(&doc);
                if rev > req.cursor.get() {
                    changes.push(EntityChange {
                        target: ty,
                        target_id: id,
                        revision: rev,
                        fields: doc.fields,
                        body: doc.body,
                    });
                }
            }
        }
        // deterministic order
        changes.sort_by(|a, b| (a.target.dir(), &a.target_id).cmp(&(b.target.dir(), &b.target_id)));
        Ok(SyncPullResponse {
            protocol_version: CURRENT_PROTOCOL_VERSION,
            workspace_revision: self.ws.workspace_revision()?,
            changes,
        })
    }

    /// push: operation 을 순서대로 적용. 결과와 conflict 를 수집한다.
    pub fn push(&self, req: &SyncPushRequest) -> Result<SyncPushResponse> {
        Self::check_version(req.protocol_version)?;
        if req.device.device_id.len() < MIN_DEVICE_ID_LEN {
            return Err(CoreError::OperationRejected);
        }
        let engine = OperationEngine::new(self.ws.clone());
        let mut results = Vec::new();
        let mut conflicts = Vec::new();
        for op in &req.operations {
            let outcome = engine.apply(op)?;
            let conflict = if outcome.status == "CONFLICT" {
                Some(Conflict {
                    op_id: op.op_id.clone(),
                    target: op.target,
                    target_id: op.target_id.clone(),
                    base_revision: op.base_revision,
                    canonical_revision: outcome.entity_revision,
                    message: outcome.message.clone(),
                })
            } else {
                None
            };
            if let Some(c) = &conflict {
                conflicts.push(c.clone());
            }
            results.push(OperationResult {
                op_id: op.op_id.clone(),
                status: outcome.status,
                entity_revision: outcome.entity_revision,
                conflict,
            });
        }
        Ok(SyncPushResponse {
            protocol_version: CURRENT_PROTOCOL_VERSION,
            workspace_revision: self.ws.workspace_revision()?,
            results,
            conflicts,
        })
    }
}

fn doc_revision(doc: &Doc) -> u64 {
    doc.fields
        .iter()
        .find(|(k, _)| k == "revision")
        .and_then(|(_, v)| v.as_int())
        .unwrap_or(0) as u64
}

const ALL_TYPES: [EntityType; 14] = [
    EntityType::Product,
    EntityType::Change,
    EntityType::Decision,
    EntityType::Artifact,
    EntityType::Workbench,
    EntityType::Release,
    EntityType::Capability,
    EntityType::Readiness,
    EntityType::Proposal,
    EntityType::Review,
    EntityType::Reference,
    EntityType::Dispatch,
    EntityType::Milestone,
    EntityType::Insight,
];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::operation::{OpKind, OPERATION_VERSION};

    fn ws() -> Workspace {
        use std::time::{SystemTime, UNIX_EPOCH};
        let dir = std::env::temp_dir().join(format!(
            "xita-sync-test-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        Workspace::open(&dir).unwrap()
    }

    fn dev() -> DeviceIdentity {
        DeviceIdentity { device_id: "iphone-01".into(), host_identity: Some("mac-1".into()), platform: Platform::IOS }
    }

    fn sync_op(op_id: &str, target_id: &str, ty: EntityType, base: u64) -> Operation {
        Operation {
            version: OPERATION_VERSION,
            op_id: op_id.into(),
            device_id: "iphone-01".into(),
            target: ty,
            target_id: target_id.into(),
            base_revision: base,
            kind: OpKind::Create,
            fields: vec![("name".to_string(), FmValue::Scalar("Sample".into()))],
        }
    }

    #[test]
    fn pull_incremental_then_empty() {
        let ws = ws();
        let engine = SyncEngine::new(ws.clone());
        // 초기에 entity 생성 (선 sync)
        let op_engine = OperationEngine::new(ws.clone());
        op_engine.apply(&sync_op("op-1", "novel", EntityType::Product, 0)).unwrap();

        let r1 = engine.pull(&SyncPullRequest { protocol_version: 1, cursor: SyncCursor(0) }).unwrap();
        assert_eq!(r1.changes.len(), 1);
        assert_eq!(r1.changes[0].revision, 1);

        // cursor == 현재 revision → 변경 없음
        let r2 = engine.pull(&SyncPullRequest { protocol_version: 1, cursor: SyncCursor(r1.workspace_revision) }).unwrap();
        assert_eq!(r2.changes.len(), 0);
    }

    #[test]
    fn push_applies_and_reports_conflicts() {
        let ws = ws();
        // 사전 생성(base 1 완료)
        let e1 = OperationEngine::new(ws.clone());
        e1.apply(&sync_op("op-seed", "c1", EntityType::Change, 0)).unwrap();
        // base 0(stale) + status(semantic) → CONFLICT
        let conflict_op = Operation {
            version: OPERATION_VERSION,
            op_id: "op-conf".into(),
            device_id: "iphone-01".into(),
            target: EntityType::Change,
            target_id: "c1".into(),
            base_revision: 0,
            kind: OpKind::UpdateStatus,
            fields: vec![("status".to_string(), FmValue::Scalar("SHIPPED".into()))],
        };
        let engine = SyncEngine::new(ws.clone());
        let req = SyncPushRequest {
            protocol_version: 1,
            device: dev(),
            cursor: SyncCursor(0),
            operations: vec![conflict_op],
        };
        let resp = engine.push(&req).unwrap();
        assert_eq!(resp.results.len(), 1);
        assert_eq!(resp.results[0].status, "CONFLICT");
        assert_eq!(resp.conflicts.len(), 1);
        assert_eq!(resp.conflicts[0].target_id, "c1");
    }

    #[test]
    fn push_dedupes_repeated_op() {
        let ws = ws();
        let engine = SyncEngine::new(ws.clone());
        let op = sync_op("op-x", "p1", EntityType::Product, 0);
        let r1 = engine.push(&SyncPushRequest { protocol_version: 1, device: dev(), cursor: SyncCursor(0), operations: vec![op.clone()] }).unwrap();
        assert_eq!(r1.results[0].status, "APPLIED");
        let r2 = engine.push(&SyncPushRequest { protocol_version: 1, device: dev(), cursor: SyncCursor(0), operations: vec![op] }).unwrap();
        assert_eq!(r2.results[0].status, "DEDUPED");
    }

    #[test]
    fn protocol_version_mismatch_is_sync_error() {
        let ws = ws();
        let engine = SyncEngine::new(ws.clone());
        let err = engine.pull(&SyncPullRequest { protocol_version: 99, cursor: SyncCursor(0) }).unwrap_err();
        assert_eq!(err, CoreError::SyncProtocolError);
        let err2 = engine.push(&SyncPushRequest { protocol_version: 99, device: dev(), cursor: SyncCursor(0), operations: vec![] }).unwrap_err();
        assert_eq!(err2, CoreError::SyncProtocolError);
    }

    #[test]
    fn short_device_id_rejected() {
        let ws = ws();
        let engine = SyncEngine::new(ws.clone());
        let bad = DeviceIdentity { device_id: "a".into(), host_identity: None, platform: Platform::MacOS };
        let err = engine.push(&SyncPushRequest { protocol_version: 1, device: bad, cursor: SyncCursor(0), operations: vec![] }).unwrap_err();
        assert_eq!(err, CoreError::OperationRejected);
    }
}