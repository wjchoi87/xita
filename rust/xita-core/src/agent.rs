//! Agent abstraction (v0.5 §16, Phase 6).
//!
//! detect_agent / build_handoff / write_handoff / launch_agent / agent_status
//! 형식의 abstraction 을 제공한다. 초기 타겟 OpenCode, adapter 로
//! Codex·Claude Code·Qwen Code·Custom CLI 를 추가할 수 있다.
//!
//! **Agent launch 는 opt-in**(§16, §22): 명시적 동의 없이는 PermissionDenied.
//! git force 작업과 동일하게 SafetyPolicy 로 거른다.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

use crate::doc::{FmValue, Doc};
use crate::error::{CoreError, Result};
use crate::git::SafetyPolicy;
use crate::storage::{EntityType, Workspace};

/// 지원 Agent. binary 이름으로 PATH 에서 감지한다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentKind {
    Opencode,
    Codex,
    ClaudeCode,
    QwenCode,
}

impl AgentKind {
    pub fn binary(self) -> &'static str {
        match self {
            Self::Opencode => "opencode",
            Self::Codex => "codex",
            Self::ClaudeCode => "claude",
            Self::QwenCode => "qwen-code",
        }
    }
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Opencode => "opencode",
            Self::Codex => "codex",
            Self::ClaudeCode => "claude-code",
            Self::QwenCode => "qwen-code",
        }
    }
}

const ALL_AGENTS: [AgentKind; 4] = [AgentKind::Opencode, AgentKind::Codex, AgentKind::ClaudeCode, AgentKind::QwenCode];

/// 주어진 PATH 디렉토리에서 실행 가능한 agent 바이너리를 감지한다.
/// (테스트 격리: 특정 디렉토리를 넘겨 검증하고, 기본은 env PATH)
pub fn detect_agents_in(paths: &[PathBuf]) -> Vec<AgentKind> {
    ALL_AGENTS
        .iter()
        .copied()
        .filter(|kind| {
            paths.iter().any(|dir| {
                let candidate = dir.join(kind.binary());
                candidate.is_file()
            })
        })
        .collect()
}

/// 환경변수 PATH 기준으로 감지한다.
pub fn detect_agents() -> Vec<AgentKind> {
    let paths: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    detect_agents_in(&paths)
}

/// canonical workspace 의 product/change/artifact 를 읽어 Agent Handoff markdown 을 생성.
pub fn build_handoff(ws: &Workspace, product_id: &str, change_id: &str) -> Result<String> {
    let product = ws.read_entity(EntityType::Product, product_id)?;
    let change = ws.read_entity(EntityType::Change, change_id)?;

    let product_name = field_str(&product, "name").unwrap_or_else(|| product_id.to_string());
    let version = field_str(&product, "version").unwrap_or_else(|| "-".into());
    let change_status = field_str(&change, "status").unwrap_or_else(|| "IDEA".into());

    let mut caps: Vec<String> = Vec::new();
    for id in ws.list_ids(EntityType::Capability).unwrap_or_default() {
        if let Ok(c) = ws.read_entity(EntityType::Capability, &id) {
            if field_str(&c, "product").as_deref() == Some(product_id)
                && field_str(&c, "status").unwrap_or_default() == "active"
            {
                caps.push(field_str(&c, "name").unwrap_or(id));
            }
        }
    }
    let (rdy_overall, blockers) = readiness_summary(ws, product_id);

    let mut refs: Vec<String> = Vec::new();
    for id in ws.list_ids(EntityType::Reference).unwrap_or_default() {
        if let Ok(r) = ws.read_entity(EntityType::Reference, &id) {
            if field_str(&r, "product").as_deref() == Some(product_id) {
                refs.push(format!(
                    "[{}]({}) ({}/{})",
                    field_str(&r, "name").unwrap_or_else(|| id.clone()),
                    field_str(&r, "url").unwrap_or_else(|| "#".into()),
                    field_str(&r, "provider").unwrap_or_else(|| "GENERIC".into()),
                    field_str(&r, "kind").unwrap_or_else(|| "reference".into())
                ));
            }
        }
    }
    let history = recent_events(ws, product_id, 8);
    // decisions (ACTIVE only — SUPERSEDED 제외: §17 "이 결정은 아직 유효한가")
    let mut decs: Vec<String> = Vec::new();
    for id in ws.list_ids(EntityType::Decision).unwrap_or_default() {
        if let Ok(d) = ws.read_entity(EntityType::Decision, &id) {
            if field_str(&d, "product").as_deref() != Some(product_id) {
                continue;
            }
            if field_str(&d, "status").unwrap_or_default() != "ACTIVE" {
                continue;
            }
            let t = field_str(&d, "title").or_else(|| field_str(&d, "name")).unwrap_or(id.clone());
            let dd = field_str(&d, "decision").unwrap_or_default();
            decs.push(if dd.is_empty() { t } else { format!("{t}: {dd}") });
        }
    }

    let mut l = String::new();
    l.push_str("---\nproduct_os:\n  service: xita\n");
    l.push_str(&format!(
        "  product: {}\n  change: {}\n  generated_at: {}\n---\n\n",
        product_id,
        change_id,
        crate::now_iso()
    ));
    l.push_str("# Agent Handoff\n\n");
    /* Mission Card — TS ops.generateHandoff와 동일 계약 (research wave1 M2: Devin playbook 구조)
     * Goal/Acceptance/Forbidden/Needs From User/Snapshot 5블록을 에이전트가 가장 먼저 읽게 선두 배치.
     * 두 엔진(TS REST / Rust mac-native) 산출물이 구조적으로 같아야 handoff 포맷이 신뢰 자산이 된다. */
    let goal = field_str(&change, "intent")
        .filter(|s| !s.is_empty())
        .or_else(|| field_str(&change, "goal"))
        .unwrap_or_else(|| change_id.to_string());
    let non_goals = field_str(&change, "non_goals")
        .or_else(|| field_str(&product, "out_of_scope"))
        .unwrap_or_else(|| "명시 없음 — 결정 필요 시 중단하고 질문".into());
    let open_q = field_str(&change, "open_questions").unwrap_or_else(|| "없음".into());
    l.push_str("## Mission Card\n\n");
    l.push_str(&format!("**Goal** — {goal}\n\n"));
    l.push_str("**Acceptance**");
    if blockers.is_empty() {
        l.push_str(" — (차단 없음)\n\n");
    } else {
        l.push_str(":\n");
        for b in blockers.iter().take(6) {
            l.push_str(&format!("- [ ] {b}\n"));
        }
        l.push('\n');
    }
    l.push_str(&format!("**Forbidden (손대지 마)** — {non_goals}\n\n"));
    l.push_str(&format!("**Needs From User** — {open_q}\n\n"));
    l.push_str(&format!(
        "**Snapshot** — readiness {}% · active capabilities {} · 검증 가능해야 dispatch 유효(Devin 원칙)\n\n---\n\n",
        rdy_overall,
        caps.len()
    ));
    l.push_str("## Product\n\n");
    l.push_str(&format!("{} · {}\n\n", product_name, version));
    l.push_str("## Change\n\n");
    l.push_str(&format!("{} · status {}\n\n", change_id, change_status));
    l.push_str(&format!("## Intent\n\n{}\n\n", field_str(&change, "intent").unwrap_or_else(|| "-".into())));
    l.push_str(&format!("## Goal\n\n{}\n\n", field_str(&change, "goal").unwrap_or_else(|| "-".into())));
    l.push_str("## Current Product State\n\n");
    l.push_str(&format!("- version: {}\n", version));
    l.push_str(&format!("- production_status: {}\n", field_str(&product, "production_status").unwrap_or_else(|| "-".into())));
    l.push_str(&format!("- platforms: {}\n", field_str(&product, "platforms").unwrap_or_else(|| "-".into())));
    for d in field_str(&product, "deployments").unwrap_or_default().split(';').filter(|x| !x.is_empty()) {
        l.push_str(&format!("- deployed: {}\n", d));
    }
    l.push_str(&format!("- readiness: {}%\n", rdy_overall));
    l.push_str(&format!("- capabilities(active): {}\n", caps.len()));
    for b in &blockers {
        l.push_str(&format!("- BLOCKER: {}\n", b));
    }
    l.push('\n');
    l.push_str(&format!("## Context\n\n{}\n\n", field_str(&change, "context").unwrap_or_else(|| "-".into())));
    l.push_str(&format!("## Constraints\n\n{}\n\n", field_str(&change, "constraints").unwrap_or_else(|| "-".into())));
    l.push_str(&format!("## Scope\n\n{}\n\n", field_str(&change, "scope").unwrap_or_else(|| "-".into())));
    l.push_str("## Relevant Capabilities\n\n");
    if caps.is_empty() {
        l.push_str("- (none)\n");
    } else {
        for c in &caps {
            l.push_str(&format!("- {}\n", c));
        }
    }
    l.push('\n');
    l.push_str("## Relevant History\n\n");
    if history.is_empty() {
        l.push_str("- (none)\n");
    } else {
        for h in &history {
            l.push_str(&format!("- {}\n", h));
        }
    }
    l.push('\n');
    l.push_str("## Relevant Decisions\n\n");
    if decs.is_empty() {
        l.push_str("- (none)\n");
    } else {
        for d in &decs {
            l.push_str(&format!("- {d}\n"));
        }
    }
    l.push('\n');
    l.push_str(&format!(
        "## Acceptance Criteria\n\n{}\n\n",
        field_str(&change, "acceptance").unwrap_or_else(|| "-".into())
    ));
    l.push_str("## References\n\n");
    if refs.is_empty() {
        l.push_str("- (none)\n");
    } else {
        for r in &refs {
            l.push_str(&format!("- {}\n", r));
        }
    }
    if !product.body.trim().is_empty() {
        l.push_str("\n### Product Narrative\n\n");
        l.push_str(&product.body);
        l.push_str("\n\n");
    }
    l.push_str("## Requested Work\n\n");
    l.push_str("이 Change 를 완료하라. Scope 변경은 Proposal 을 생성한다.\n");
    l.push_str("\n## Agent Rules\n\n");
    l.push_str("- 중요 Architecture 변경을 임의로 확정하지 않는다.\n");
    l.push_str("- 완료 후 Agent Result 계약(§93)으로 보고한다.\n");
    Ok(l)
}

/// product readiness aggregate — items pipe-list("name|STATUS|progress|note") 스칸.
pub fn readiness_summary(ws: &Workspace, product_id: &str) -> (u64, Vec<String>) {
    let ids = ws.list_ids(EntityType::Readiness).unwrap_or_default();
    let mut total = 0u64;
    let mut score = 0u64;
    let mut blockers = Vec::new();
    for id in ids {
        let Ok(doc) = ws.read_entity(EntityType::Readiness, &id) else {
            continue;
        };
        if field_str(&doc, "product").as_deref() != Some(product_id) {
            continue;
        }
        let kind = field_str(&doc, "kind").unwrap_or_else(|| id.clone());
        if let Some((_, FmValue::List(lines))) = doc.fields.iter().find(|(k, _)| k == "items") {
            for line in lines {
                let parts: Vec<&str> = line.split('|').collect();
                if parts.len() >= 3 {
                    let status = parts[1];
                    let prog: u64 = parts[2].parse().unwrap_or(0);
                    if status != "NA" {
                        total += 1;
                        score += prog;
                    }
                    if status == "BLOCKED" {
                        blockers.push(format!("{}: {}", kind, parts[0]));
                    }
                }
            }
        }
    }
    // 반올림 (JS Math.round 정합) — 절삭이면 30/32 → 0 으로 왜곡됨
    let overall = if total == 0 { 0 } else { ((score * 2 + total) / (total * 2)).min(100) };
    (overall, blockers)
}

fn recent_events(ws: &Workspace, product_id: &str, take: usize) -> Vec<String> {
    let path = ws.meta_dir().join("events.jsonl");
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return Vec::new();
    };
    let needle = format!("\"product\":\"{}\"", product_id);
    let mut out: Vec<String> = raw
        .lines()
        .filter(|l| l.contains(&needle))
        .filter_map(|l| {
            let t = l.find("\"title\":\"")? + 9;
            let rest = &l[t..];
            let end = rest.find('"')?;
            Some(rest[..end].to_string())
        })
        .collect();
    if out.len() > take {
        out = out.split_off(out.len() - take);
    }
    out
}

/// §20 Definition of Ship 템플릿 (멍등). server ops 들 파이프 포맷 공유.
pub fn apply_ship_template(ws: &Workspace, product_id: &str, product_type: &str) -> Result<usize> {
    let tpl: &[(&str, &[&str])] = match product_type {
        "MOBILE_SAAS" => &[
            ("PRODUCT", &["Core Flow", "Error States", "Empty States", "Onboarding"]),
            ("TECH", &["Production API", "Production DB", "Secrets", "Logging", "Crash Reporting", "Backup", "Rate Limit", "Monitoring"]),
            ("BUSINESS", &["Pricing", "Payment", "Analytics", "Conversion"]),
            ("LEGAL", &["Privacy Policy", "Terms", "Account Deletion"]),
            ("ASSETS", &["App Icon", "Screenshots", "Feature Graphic"]),
            ("STORE", &["Description", "Keywords", "Release Notes", "Play Store", "App Store"]),
            ("QA", &["Android", "iOS", "Production Payment", "Upgrade", "Account Deletion"]),
        ],
        _ => &[
            ("PRODUCT", &["Core Flow", "Error States", "Empty States", "Onboarding"]),
            ("TECH", &["Production Deploy", "DB", "Secrets", "Logging", "Backup", "Monitoring"]),
            ("BUSINESS", &["Pricing", "Payment", "Analytics"]),
            ("LEGAL", &["Privacy Policy", "Terms"]),
            ("QA", &["Cross-browser", "Payment E2E"]),
        ],
    };
    let mut created = 0;
    for (kind, items) in tpl {
        let id = format!("{}-{}", product_id, kind.to_lowercase());
        if ws.read_entity(EntityType::Readiness, &id).is_ok() {
            continue;
        }
        let lines: Vec<String> = items.iter().map(|n| format!("{}|PENDING|0|", n)).collect();
        let doc = Doc {
            fields: vec![
                ("product".into(), FmValue::Scalar(product_id.to_string())),
                ("kind".into(), FmValue::Scalar(kind.to_string())),
                ("status".into(), FmValue::Scalar("group".into())),
                ("items".into(), FmValue::List(lines)),
            ],
            body: format!("# {} readiness\n", kind),
        };
        ws.write_entity(EntityType::Readiness, &id, &doc, None)?;
        created += 1;
    }
    Ok(created)
}

/// §20/§67 Settings — 템플릿 정의 조회 (apply 없이 미리보기).
pub fn ship_template_preview(product_type: &str) -> Vec<(&'static str, Vec<&'static str>)> {
    let tpl: &[(&str, &[&str])] = match product_type {
        "MOBILE_SAAS" => &[
            ("PRODUCT", &["Core Flow", "Error States", "Empty States", "Onboarding"]),
            ("TECH", &["Production API", "Production DB", "Secrets", "Logging", "Crash Reporting", "Backup", "Rate Limit", "Monitoring"]),
            ("BUSINESS", &["Pricing", "Payment", "Analytics", "Conversion"]),
            ("LEGAL", &["Privacy Policy", "Terms", "Account Deletion"]),
            ("ASSETS", &["App Icon", "Screenshots", "Feature Graphic"]),
            ("STORE", &["Description", "Keywords", "Release Notes", "Play Store", "App Store"]),
            ("QA", &["Android", "iOS", "Production Payment", "Upgrade", "Account Deletion"]),
        ],
        _ => &[
            ("PRODUCT", &["Core Flow", "Error States", "Empty States", "Onboarding"]),
            ("TECH", &["Production Deploy", "DB", "Secrets", "Logging", "Backup", "Monitoring"]),
            ("BUSINESS", &["Pricing", "Payment", "Analytics"]),
            ("LEGAL", &["Privacy Policy", "Terms"]),
            ("QA", &["Cross-browser", "Payment E2E"]),
        ],
    };
    tpl.iter().map(|(k, items)| (*k, items.to_vec())).collect()
}

/// items 한 항목 상태 갱신.
pub fn patch_readiness(
    ws: &Workspace,
    product_id: &str,
    kind: &str,
    item: &str,
    status: &str,
    progress: u64,
) -> Result<bool> {
    let id = format!("{}-{}", product_id, kind.to_lowercase());
    let doc = ws.read_entity(EntityType::Readiness, &id)?;
    let mut changed = false;
    let mut fields = doc.fields.clone();
    for (k, v) in fields.iter_mut() {
        if k == "items" {
            if let FmValue::List(lines) = v {
                for line in lines.iter_mut() {
                    let parts: Vec<&str> = line.split('|').collect();
                    if parts.first() == Some(&item) {
                        let note = parts.get(3).copied().unwrap_or("");
                        *line = format!("{}|{}|{}|{}", item, status, progress, note);
                        changed = true;
                    }
                }
            }
        }
    }
    if changed {
        let doc2 = Doc { fields, body: doc.body.clone() };
        ws.write_entity(EntityType::Readiness, &id, &doc2, None)?;
    }
    Ok(changed)
}

/// handoff markdown 을 canonical workspace `.xita/handoffs/` 에 atomic write 하고 경로 반환.
pub fn write_handoff(ws: &Workspace, product_id: &str, change_id: &str) -> Result<PathBuf> {
    let content = build_handoff(ws, product_id, change_id)?;
    let dir = ws.meta_dir().join("handoffs");
    fs::create_dir_all(&dir).map_err(|_| CoreError::PermissionDenied)?;
    let file = dir.join(format!("{}-{}-{}.md", product_id, change_id, crate::now_iso()));
    crate::storage::atomic_write(&file, &content)?;
    Ok(file)
}

/// 실행 준비 명세 (spawn 과 분리 — 검증 가능, §16: launch 는 opt-in).
#[derive(Debug, Clone)]
pub struct LaunchSpec {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: PathBuf,
}

pub fn launch_spec(kind: AgentKind, handoff_path: &Path, cwd: &Path) -> LaunchSpec {
    LaunchSpec {
        program: kind.binary().to_string(),
        args: vec![handoff_path.to_string_lossy().into_owned()],
        cwd: cwd.to_path_buf(),
    }
}

/// 실행 중인 Agent 프로세스 핸들.
#[derive(Debug)]
pub struct AgentProcess {
    child: Child,
}

impl AgentProcess {
    /// opt-in 없으면 거부(§16, §22). 바이너리가 없으면 AGENT_LAUNCH_ERROR.
    pub fn launch(spec: &LaunchSpec, policy: &SafetyPolicy) -> Result<Self> {
        policy.guard(crate::git::UnsafeOperation::DestructiveCheckout)?;
        let child = Command::new(&spec.program)
            .args(&spec.args)
            .current_dir(&spec.cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| CoreError::AgentLaunchError)?;
        Ok(Self { child })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentStatus {
    Running,
    Exited(i32),
}

impl AgentProcess {
    pub fn status(&mut self) -> Result<AgentStatus> {
        match self.child.try_wait().map_err(|_| CoreError::AgentLaunchError)? {
            Some(status) => Ok(AgentStatus::Exited(status.code().unwrap_or(-1))),
            None => Ok(AgentStatus::Running),
        }
    }
}

fn field_str(doc: &crate::doc::Doc, key: &str) -> Option<String> {
    doc.fields.iter().find(|(k, _)| k == key).map(|(_, v)| match v {
        crate::doc::FmValue::Scalar(s) => s.clone(),
        crate::doc::FmValue::Integer(n) => n.to_string(),
        other => format!("{:?}", other),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::doc::FmValue;
    use crate::operation::{Operation, OperationEngine, OpKind};

    fn ws() -> Workspace {
        use std::time::{SystemTime, UNIX_EPOCH};
        let dir = std::env::temp_dir().join(format!(
            "xita-agent-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        Workspace::open(&dir).unwrap()
    }

    fn seed(ws: &Workspace) {
        let e = OperationEngine::new(ws.clone());
        let op = |op_id: &str, target_id: &str, ty: EntityType, name: &str| Operation {
            version: crate::operation::OPERATION_VERSION,
            op_id: op_id.into(),
            device_id: "test".into(),
            target: ty,
            target_id: target_id.into(),
            base_revision: 0,
            kind: OpKind::Create,
            fields: vec![("name".to_string(), FmValue::Scalar(name.into()))],
        };
        e.apply(&op("p1", "novel", EntityType::Product, "Novel")).unwrap();
        e.apply(&op("c1", "ai-recommendation", EntityType::Change, "AI Recommendation")).unwrap();
    }

    #[test]
    fn detect_agents_in_path() {
        let dir = std::env::temp_dir().join(format!("xita-bin-{}", crate::now_iso()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("opencode"), "#!/bin/sh\nexit 0\n").unwrap();
        let found = detect_agents_in(std::slice::from_ref(&dir));
        assert!(found.contains(&AgentKind::Opencode));
        assert!(!found.contains(&AgentKind::Codex));
    }

    #[test]
    fn build_and_write_handoff() {
        let ws = ws();
        seed(&ws);
        let md = build_handoff(&ws, "novel", "ai-recommendation").unwrap();
        assert!(md.contains("# Agent Handoff"));
        assert!(md.contains("Novel"));
        assert!(md.contains("product_os:"));
        for sec in ["## Intent", "## Goal", "## Current Product State", "## Relevant Capabilities", "## Relevant Decisions", "## Acceptance Criteria", "## References", "## Agent Rules"] {
            assert!(md.contains(sec), "missing {sec}");
        }
        let path = write_handoff(&ws, "novel", "ai-recommendation").unwrap();
        assert!(path.is_file());
        assert!(fs::read_to_string(&path).unwrap().contains("ai-recommendation"));
    }

    #[test]
    fn mission_card_leads_handoff() {
        // TS ops.generateHandoff와 동일 계약: 에이전트가 먼저 읽는 5블록 선두
        let ws = ws();
        seed(&ws);
        let md = build_handoff(&ws, "novel", "ai-recommendation").unwrap();
        assert!(md.contains("## Mission Card"));
        assert!(md.contains("**Goal**"));
        assert!(md.contains("**Forbidden (손대지 마)**"));
        assert!(md.contains("**Needs From User**"));
        assert!(md.contains("**Snapshot**"));
        // Mission Card가 본문(Product 섹션)보다 앞에 와야 함
        assert!(
            md.find("## Mission Card").unwrap() < md.find("## Product").unwrap(),
            "mission card must lead"
        );
    }

    #[test]
    fn insight_type_roundtrips() {
        // 14번째 EntityType: storage/sync/bridge 전역 노출 확인
        use crate::doc::{Doc, FmValue};
        let ws = ws();
        let d = Doc {
            fields: vec![("name".into(), FmValue::Scalar("onboarding drop".into()))],
            body: "# 관찰\n가입 직후 3일차 이탈".into(),
        };
        let rev = ws.write_entity(EntityType::Insight, "novel-onboarding-drop", &d, None).unwrap();
        assert_eq!(rev, 1);
        let read = ws.read_entity(EntityType::Insight, "novel-onboarding-drop").unwrap();
        assert!(read.body.contains("3일차 이탈"));
        assert_eq!(
            ws.list_ids(EntityType::Insight).unwrap(),
            vec!["novel-onboarding-drop".to_string()],
            "insight must be enumerable like the other 13 types"
        );
        assert_eq!(EntityType::Insight.dir(), "insights");
    }

    #[test]
    fn ship_template_and_readiness_patch() {
        let ws = ws();
        let created = apply_ship_template(&ws, "novel", "MOBILE_SAAS").unwrap();
        assert_eq!(created, 7);
        // idempotent
        assert_eq!(apply_ship_template(&ws, "novel", "MOBILE_SAAS").unwrap(), 0);
        let (overall, _b) = readiness_summary(&ws, "novel");
        assert_eq!(overall, 0);
        assert!(patch_readiness(&ws, "novel", "TECH", "Backup", "DONE", 100).unwrap());
        let (overall2, _) = readiness_summary(&ws, "novel", );
        assert!(overall2 > 0);
        // blocker
        patch_readiness(&ws, "novel", "QA", "iOS", "BLOCKED", 0).unwrap();
        let (_o, blockers) = readiness_summary(&ws, "novel");
        assert_eq!(blockers, vec!["QA: iOS".to_string()]);
    }

    #[test]
    fn launch_requires_opt_in_and_binary() {
        let policy_deny = SafetyPolicy::new();
        let spec = LaunchSpec { program: "definitely-not-installed-xita".into(), args: vec![], cwd: std::env::temp_dir() };
        let err = AgentProcess::launch(&spec, &policy_deny).unwrap_err();
        assert_eq!(err, CoreError::PermissionDenied);

        let policy_ok = SafetyPolicy::new().authorize_unsafe();
        let err2 = AgentProcess::launch(&spec, &policy_ok).unwrap_err();
        assert_eq!(err2, CoreError::AgentLaunchError);
    }

    #[test]
    fn agent_process_status_exits() {
        let policy = SafetyPolicy::new().authorize_unsafe();
        let spec = LaunchSpec { program: "true".into(), args: vec![], cwd: std::env::temp_dir() };
        let mut proc = AgentProcess::launch(&spec, &policy).unwrap();
        let s = proc.status().unwrap();
        assert!(s == AgentStatus::Exited(0) || s == AgentStatus::Running);
    }
}
