//! xita-core — XITA shared core (v0.5)
//!
//! SwiftUI(Native UI) ↔ Rust Bridge ↔ xita-core(Rust). 이 crate 는 UI 를
//! 모르며 Platform UX 를 담당하지 않는다(v0.5 §6). v0.5 §23 Phase 3
//! "Storage First" 까지 구현: Markdown/YAML frontmatter, atomic write,
//! entity/workspace revision, typed error contract.
//!
//! 이후 Phase 4(Operation/Conflict), Phase 5(Sync), Phase 6(Git/Agent) 로
//! 확장한다 (v0.5 §24 migration priority 에 따른다).

pub mod agent;
pub mod bridge;

pub mod doc;
pub mod error;
pub mod git;
pub mod index;
pub mod lifecycle;
pub mod operation;
pub mod storage;
pub mod sync;

pub use agent::{AgentKind, AgentProcess, AgentStatus, build_handoff, detect_agents, launch_spec, write_handoff};
pub use error::{CoreError, Result};
pub use git::{GitRepo, SafetyPolicy, UnsafeOperation};
pub use index::{IndexEngine, IndexEntry, IndexMeta};
pub use operation::{Operation, OperationEngine, OpKind, Outcome, Verdict, OPERATION_VERSION};
pub use storage::{EntityType, Workspace};
pub use sync::{Conflict, DeviceIdentity, OperationResult, Platform, SyncCursor, SyncEngine, SyncPullRequest, SyncPullResponse, SyncPushRequest, SyncPushResponse};

/// ISO-8601-ish 시각 (경합 파일명·last_updated 용).
pub fn now_iso() -> String {
    // std-only: UTC epoch 를 견적. 정확한 캘린더 ISO 는 chrono 추가 시 대체.
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{}", secs)
}

/// v0.5 §7 권장 API 형태의 coarse-grained 저장 접근 예시.
/// (여기서는 Storage first 이므로 entity CRUD 수준 제공)
pub mod api {
    use crate::doc::FmValue;
    use crate::storage::{EntityType, Workspace};
    use crate::Result;

    pub fn get_products(ws: &Workspace) -> Result<Vec<String>> {
        ws.list_ids(EntityType::Product)
    }

    /// product projection: name/version/revision(Storage-first 수준).
    pub fn get_product_projection(ws: &Workspace, id: &str) -> Result<std::collections::BTreeMap<String, String>> {
        let doc = ws.read_entity(EntityType::Product, id)?;
        let name = field(&doc, "name").unwrap_or_else(|| id.to_string());
        let version = field(&doc, "version").unwrap_or_else(|| "-".into());
        let revision = field(&doc, "revision").unwrap_or_else(|| "-".into());
        let mut m = std::collections::BTreeMap::new();
        m.insert("id".into(), id.to_string());
        m.insert("name".into(), name);
        m.insert("version".into(), version);
        m.insert("revision".into(), revision);
        Ok(m)
    }

    fn field(doc: &crate::doc::Doc, key: &str) -> Option<String> {
        doc.fields.iter().find(|(k, _)| k == key).map(|(_, v)| match v {
            FmValue::Scalar(s) => s.clone(),
            FmValue::Integer(n) => n.to_string(),
            other => format!("{:?}", other),
        })
    }

    /// v0.5 §12: UI/Sync 는 canonical Markdown 을 직접 수정하지 않고 이 함수로
    /// operation 을 보낸다. 결과는 typed outcome 으로 받는다.
    pub fn apply_operation(ws: &Workspace, op: crate::operation::Operation) -> Result<crate::Outcome> {
        let engine = crate::OperationEngine::new(ws.clone());
        engine.apply(&op)
    }
}

#[cfg(test)]
mod smoke {
    use super::*;
    use crate::doc::{Doc, FmValue};
    use std::fs;

    fn unique() -> String {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos().to_string()
    }

    #[test]
    fn open_missing_workspace_errors() {
        let ws = Workspace::open("/no/such/dir/xita-nowhere");
        assert_eq!(ws.unwrap_err(), CoreError::WorkspaceNotFound);
    }

    #[test]
    fn create_product_via_api() {
        let dir = std::env::temp_dir().join(format!("xita-api-{}", unique()));
        fs::create_dir_all(&dir).unwrap();
        let ws = Workspace::open(&dir).expect("open");
        let doc = Doc { fields: vec![("name".into(), FmValue::Scalar("CarBook".into())), ("version".into(), FmValue::Scalar("v2.3.1".into()))], body: "# CarBook".into() };
        ws.write_entity(EntityType::Product, "carbook", &doc, None).unwrap();
        let list = api::get_products(&ws).unwrap();
        assert_eq!(list, vec!["carbook".to_string()]);
        let proj = api::get_product_projection(&ws, "carbook").unwrap();
        assert_eq!(proj.get("name").map(|s| s.as_str()), Some("CarBook"));
        assert_eq!(proj.get("version").map(|s| s.as_str()), Some("v2.3.1"));
    }
}