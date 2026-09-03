//! Swift ↔ Rust Bridge — C ABI (v0.5 §7-§9, §17; Phase 2).
//!
//! SwiftUI 는 이 계층을 통해서만 core 를 호출한다. Raw pointer·내부 참조는
//! 노출하지 않는다(§9): 전부 경로+스칼라/문자열 인자 → UTF-8 JSON 문자열 반환.
//! 문자열은 `xita_free_string` 로 해제한다. 오류는 JSON `{ok:false, code, message,
//! recoverable}` 로 typed error 계약(§9)을 전달한다.

use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::panic::{self, AssertUnwindSafe};
use std::path::Path;

use crate::error::CoreError;
use crate::index::IndexEngine;
use crate::operation::{Operation, OperationEngine, OpKind, Outcome, OPERATION_VERSION};
use crate::storage::{EntityType, Workspace};
use crate::sync::{SyncCursor, SyncEngine, SyncPullRequest};
use crate::Result as CoreResult;

fn cstr(ptr: *const c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    let s = unsafe { CStr::from_ptr(ptr) }.to_string_lossy().into_owned();
    Some(s)
}

fn to_c_string(s: String) -> *mut c_char {
    let c = CString::new(s).unwrap_or_default();
    c.into_raw()
}

unsafe fn drop_c_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        let _ = CString::from_raw(ptr);
    }
}

/// Rust 에서 C 할당한 문자열 해제.
///
/// # Safety
/// `ptr` 는 반드시 이 crate 의 `xita_*` 함수가 반환한 포인터여야 하며,
/// 해제 후 재사용하면 안 된다.
#[no_mangle]
pub unsafe extern "C" fn xita_free_string(ptr: *mut c_char) {
    unsafe { drop_c_string(ptr) }
}

fn json_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            other => out.push(other),
        }
    }
    out
}

fn ok_json(entries: &[(&str, String)]) -> String {
    let mut s = String::from("{\"ok\":true");
    for (k, v) in entries {
        s.push_str(",\"");
        s.push_str(k);
        s.push_str("\":");
        s.push_str(v);
    }
    s.push('}');
    s
}

fn err_json(err: &CoreError) -> String {
    format!(
        "{{\"ok\":false,\"code\":\"{}\",\"message\":\"{}\",\"recoverable\":{}}}",
        err.code(),
        json_escape(&err.message()),
        err.recoverable()
    )
}

fn guard<F: FnOnce() -> CoreResult<String>>(f: F) -> *mut c_char {
    let result = panic::catch_unwind(AssertUnwindSafe(f));
    let json = match result {
        Ok(Ok(s)) => s,
        Ok(Err(e)) => err_json(&e),
        Err(_) => err_json(&CoreError::Unknown("bridge panic".into())),
    };
    to_c_string(json)
}

fn ws_from(path: *const c_char) -> CoreResult<Workspace> {
    let path = cstr(path).ok_or(CoreError::WorkspaceNotFound)?;
    if !Path::new(&path).is_dir() {
        return Err(CoreError::WorkspaceNotFound);
    }
    Workspace::open(&path)
}

/// workspace 열기: `{"ok":true,"schema_version":1}` 또는 typed error.
#[no_mangle]
pub extern "C" fn xita_ws_open(path: *const c_char) -> *mut c_char {
    guard(|| {
        let ws = ws_from(path)?;
        Ok(ok_json(&[("schema_version", ws.schema_version()?.to_string())]))
    })
}

/// operation 적용 (Create/UpdateField/UpdateStatus 단일 필드 형태).
/// kind: "create" | "update_field" | "update_status" | "resolve_conflict"
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn xita_ws_apply_op(
    path: *const c_char,
    op_id: *const c_char,
    device_id: *const c_char,
    target: *const c_char,
    target_id: *const c_char,
    base_revision: u64,
    kind: *const c_char,
    field_key: *const c_char,
    field_value: *const c_char,
) -> *mut c_char {
    guard(|| {
        let ws = ws_from(path)?;
        let op_id = cstr(op_id).ok_or(CoreError::OperationRejected)?;
        let device_id = cstr(device_id).ok_or(CoreError::OperationRejected)?;
        let target_name = cstr(target).ok_or(CoreError::OperationRejected)?;
        let target_id = cstr(target_id).ok_or(CoreError::OperationRejected)?;
        let kind_name = cstr(kind).ok_or(CoreError::OperationRejected)?;
        let key = cstr(field_key).ok_or(CoreError::OperationRejected)?;
        let value = cstr(field_value).ok_or(CoreError::OperationRejected)?;

        let target = type_from_dir(&target_name).ok_or(CoreError::OperationRejected)?;
        let kind = match kind_name.as_str() {
            "create" => OpKind::Create,
            "update_field" => OpKind::UpdateField,
            "update_status" => OpKind::UpdateStatus,
            "resolve_conflict" => OpKind::ResolveConflict,
            "delete" => OpKind::Delete,
            _ => return Err(CoreError::OperationRejected),
        };
        let value = coerce_or_scalar(&value);

        let op = Operation {
            version: OPERATION_VERSION,
            op_id,
            device_id,
            target,
            target_id,
            base_revision,
            kind,
            fields: vec![(key, value)],
        };
        let outcome = OperationEngine::new(ws).apply(&op)?;
        let verdict = match outcome.verdict {
            None => "null".to_string(),
            Some(_) => variant_json(&outcome),
        };
        Ok(ok_json(&[
            ("status", string_json(outcome.status)),
            ("verdict", verdict),
            ("entity_revision", outcome.entity_revision.to_string()),
            ("workspace_revision", outcome.workspace_revision.to_string()),
            ("message", string_json(&outcome.message)),
        ]))
    })
}

fn variant_json(outcome: &Outcome) -> String {
    use crate::operation::Verdict;
    let name = match outcome.verdict {
        Some(Verdict::Safe) => "SAFE",
        Some(Verdict::SafeNonOverlap) => "SAFE_NON_OVERLAP",
        Some(Verdict::Conflict) => "CONFLICT",
        Some(Verdict::Rejected) => "REJECTED",
        None => "NONE",
    };
    format!("\"{}\"", name)
}

fn string_json(s: &str) -> String {
    format!("\"{}\"", json_escape(s))
}

fn coerce_or_scalar(raw: &str) -> crate::doc::FmValue {
    if let Ok(n) = raw.parse::<i64>() {
        return crate::doc::FmValue::Integer(n);
    }
    if raw == "true" || raw == "false" {
        return crate::doc::FmValue::Boolean(raw == "true");
    }
    crate::doc::FmValue::Scalar(raw.to_string())
}

/// incremental pull: `{"ok":true,"workspace_revision":N,"changes":[{type,id,revision,name,status}...]}`
#[no_mangle]
pub extern "C" fn xita_ws_pull(path: *const c_char, cursor: u64) -> *mut c_char {
    guard(|| {
        let ws = ws_from(path)?;
        let resp = SyncEngine::new(ws.clone()).pull(&SyncPullRequest { protocol_version: 1, cursor: SyncCursor(cursor) })?;
        let mut changes = String::from("[");
        for (i, c) in resp.changes.iter().enumerate() {
            if i > 0 {
                changes.push(',');
            }
            let name = field_str(c, "name").unwrap_or_else(|| c.target_id.clone());
            let status = field_str(c, "status").unwrap_or_default();
            let product = field_str(c, "product").unwrap_or_default();
            let kind = field_str(c, "kind").unwrap_or_default();
            let updated = field_str(c, "updated_at").unwrap_or_default();
            changes.push_str(&format!(
                "{{\"type\":\"{}\",\"id\":\"{}\",\"revision\":{},\"name\":\"{}\",\"status\":\"{}\",\"product\":\"{}\",\"kind\":\"{}\",\"updated_at\":\"{}\"}}",
                c.target.dir(),
                json_escape(&c.target_id),
                c.revision,
                json_escape(&name),
                json_escape(&status),
                json_escape(&product),
                json_escape(&kind),
                json_escape(&updated)
            ));
        }
        changes.push(']');
        // changes 는 이미 JSON 배열 문자열이므로 값으로 그대로 삽입
        Ok(ok_json(&[
            ("workspace_revision", resp.workspace_revision.to_string()),
            ("changes", changes),
        ]))
    })
}

fn field_str(change: &crate::sync::EntityChange, key: &str) -> Option<String> {
    change.fields.iter().find(|(k, _)| k == key).map(|(_, v)| match v {
        crate::doc::FmValue::Scalar(s) => s.clone(),
        crate::doc::FmValue::Integer(n) => n.to_string(),
        crate::doc::FmValue::Boolean(b) => b.to_string(),
        other => format!("{:?}", other),
    })
}

/// derived index rebuild: `{"ok":true,"schema_version":1,"workspace_revision":N,"docs":N}`
#[no_mangle]
pub extern "C" fn xita_ws_index_rebuild(path: *const c_char) -> *mut c_char {
    guard(|| {
        let ws = ws_from(path)?;
        let meta = IndexEngine::rebuild(&ws)?;
        Ok(ok_json(&[
            ("schema_version", meta.schema_version.to_string()),
            ("workspace_revision", meta.workspace_revision.to_string()),
            ("docs", meta.docs.len().to_string()),
        ]))
    })
}

fn type_from_dir(dir: &str) -> Option<EntityType> {
    match dir {
        "product" | "products" => Some(EntityType::Product),
        "change" | "changes" => Some(EntityType::Change),
        "decision" | "decisions" => Some(EntityType::Decision),
        "artifact" | "artifacts" => Some(EntityType::Artifact),
        "workbench" => Some(EntityType::Workbench),
        "release" | "releases" => Some(EntityType::Release),
        "capability" | "capabilities" => Some(EntityType::Capability),
        "readiness" => Some(EntityType::Readiness),
        "proposal" | "proposals" => Some(EntityType::Proposal),
        "review" | "reviews" => Some(EntityType::Review),
        "reference" | "references" => Some(EntityType::Reference),
        "dispatch" | "dispatches" => Some(EntityType::Dispatch),
        "patch" | "patches" => Some(EntityType::Patch),
        "milestone" | "milestones" => Some(EntityType::Milestone),
        "insight" | "insights" => Some(EntityType::Insight),
        _ => None,
    }
}

/// fields 포맷: 한 줄에 `key\tvalue`, 줄로 구분 (multi-field create/update).
fn parse_fields_tsv(tsv: &str) -> Vec<(String, crate::doc::FmValue)> {
    tsv.lines()
        .filter_map(|l| {
            let mut parts = l.splitn(2, '\t');
            let k = parts.next()?.trim();
            let v = parts.next()?;
            if k.is_empty() {
                return None;
            }
            Some((k.to_string(), coerce_or_scalar(v.trim())))
        })
        .collect()
}

/// multi-field operation — 단일 필드 버전을 대체하는 확장 API.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn xita_ws_apply_op_multi(
    path: *const c_char,
    op_id: *const c_char,
    device_id: *const c_char,
    target: *const c_char,
    target_id: *const c_char,
    base_revision: u64,
    kind: *const c_char,
    fields_tsv: *const c_char,
) -> *mut c_char {
    guard(|| {
        let ws = ws_from(path)?;
        let target = type_from_dir(&cstr(target).ok_or(CoreError::OperationRejected)?)
            .ok_or(CoreError::OperationRejected)?;
        let kind = match cstr(kind).unwrap_or_default().as_str() {
            "create" => OpKind::Create,
            "update_field" => OpKind::UpdateField,
            "update_status" => OpKind::UpdateStatus,
            "resolve_conflict" => OpKind::ResolveConflict,
            "delete" => OpKind::Delete,
            _ => return Err(CoreError::OperationRejected),
        };
        let fields = parse_fields_tsv(&cstr(fields_tsv).unwrap_or_default());
        let is_delete = kind == OpKind::Delete;
        if fields.is_empty() && !is_delete {
            return Err(CoreError::OperationRejected);
        }
        let op = Operation {
            version: OPERATION_VERSION,
            op_id: cstr(op_id).ok_or(CoreError::OperationRejected)?,
            device_id: cstr(device_id).ok_or(CoreError::OperationRejected)?,
            target,
            target_id: cstr(target_id).ok_or(CoreError::OperationRejected)?,
            base_revision,
            kind,
            fields: if is_delete {
                vec![("unused".to_string(), crate::doc::FmValue::Scalar("".into()))]
            } else {
                fields
            },
        };
        let outcome = OperationEngine::new(ws).apply(&op)?;
        let verdict = match outcome.verdict {
            None => "null".to_string(),
            Some(_) => variant_json(&outcome),
        };
        Ok(ok_json(&[
            ("status", string_json(outcome.status)),
            ("verdict", verdict),
            ("entity_revision", outcome.entity_revision.to_string()),
            ("workspace_revision", outcome.workspace_revision.to_string()),
            ("message", string_json(&outcome.message)),
        ]))
    })
}

/// canonical Agent Handoff(markdown) 생성 — agent.rs 가 product/change 를 직접 읽는다.
#[no_mangle]
pub extern "C" fn xita_build_handoff(path: *const c_char, product_id: *const c_char, change_id: *const c_char) -> *mut c_char {
    guard(|| {
        let ws = ws_from(path)?;
        let md = crate::agent::build_handoff(&ws, &cstr(product_id).ok_or(CoreError::OperationRejected)?, &cstr(change_id).ok_or(CoreError::OperationRejected)?)?;
        Ok(format!("{{\"ok\":true,\"markdown\":{}}}", string_json(&md)))
    })
}

/// PATH 에서 감지되는 agent 바이너리 목록.
#[no_mangle]
pub extern "C" fn xita_detect_agents() -> *mut c_char {
    guard(|| {
        let names: Vec<String> = crate::agent::detect_agents().iter().map(|k| k.as_str().to_string()).collect();
        let arr = names.iter().map(|n| format!("\"{}\"", json_escape(n))).collect::<Vec<_>>().join(",");
        Ok(format!("{{\"ok\":true,\"agents\":[{}]}}", arr))
    })
}

/// 지정 디렉토리의 git repository 검사 (inspection 전용, §16).
#[no_mangle]
pub extern "C" fn xita_git_inspect(dir: *const c_char) -> *mut c_char {
    guard(|| {
        let d = cstr(dir).ok_or(CoreError::GitError)?;
        let p = std::path::Path::new(&d);
        let is_repo = crate::git::GitRepo::detect(p);
        let (branch, remote, head) = if is_repo {
            let repo = crate::git::GitRepo::open(p)?;
            (repo.current_branch()?, repo.remote_url(), repo.head_commit())
        } else {
            (None, None, None)
        };
        let opt_json = |v: Option<String>| match v {
            Some(s) => string_json(&s),
            None => "null".to_string(),
        };
        Ok(format!(
            "{{\"ok\":true,\"is_repo\":{},\"branch\":{},\"remote\":{},\"head\":{}}}",
            is_repo,
            opt_json(branch),
            opt_json(remote),
            opt_json(head)
        ))
    })
}

/// Needs You 성 conflict 목록 (`.xita/conflicts.jsonl`).
#[no_mangle]
pub extern "C" fn xita_ws_conflicts(path: *const c_char) -> *mut c_char {
    guard(|| {
        let ws = ws_from(path)?;
        let raw = std::fs::read_to_string(ws.meta_dir().join("conflicts.jsonl")).unwrap_or_default();
        let mut items = Vec::new();
        for line in raw.lines().filter(|l| !l.trim().is_empty()) {
            // "op_id|target_id|base|canonical|kind"
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() >= 5 {
                items.push(format!(
                    "{{\"op_id\":\"{}\",\"target_id\":\"{}\",\"base_revision\":{},\"canonical_revision\":{},\"kind\":\"{}\"}}",
                    json_escape(parts[0]),
                    json_escape(parts[1]),
                    parts[2].parse::<u64>().unwrap_or(0),
                    parts[3].parse::<u64>().unwrap_or(0),
                    json_escape(parts[4])
                ));
            }
        }
        Ok(format!("{{\"ok\":true,\"conflicts\":[{}]}}", items.join(",")))
    })
}

/// 단건 문서 (detail 뷰/본문 편집용): fields 문자열화 + body.
#[no_mangle]
pub extern "C" fn xita_ws_get_doc(path: *const c_char, target: *const c_char, id: *const c_char) -> *mut c_char {
    guard(|| {
        let ws = ws_from(path)?;
        let ty = type_from_dir(&cstr(target).ok_or(CoreError::OperationRejected)?).ok_or(CoreError::OperationRejected)?;
        let id = cstr(id).ok_or(CoreError::OperationRejected)?;
        let doc = ws.read_entity(ty, &id)?;
        let mut fields = String::from("{");
        for (i, (k, v)) in doc.fields.iter().enumerate() {
            if i > 0 {
                fields.push(',');
            }
            let sv = match v {
                crate::doc::FmValue::Scalar(s) => s.clone(),
                crate::doc::FmValue::Integer(n) => n.to_string(),
                crate::doc::FmValue::Boolean(b) => b.to_string(),
                crate::doc::FmValue::Null => String::new(),
                crate::doc::FmValue::List(l) => l.join(", "),
            };
            fields.push_str(&format!("\"{}\":\"{}\"", json_escape(k), json_escape(&sv)));
        }
        fields.push('}');
        Ok(format!(
            "{{\"ok\":true,\"fields\":{},\"body\":{}}}",
            fields,
            string_json(&doc.body)
        ))
    })
}

/// lifecycle 전이 테이블 (UI 메뉴 구성용).
#[no_mangle]
pub extern "C" fn xita_valid_transitions(current: *const c_char) -> *mut c_char {
    guard(|| {
        let cur = cstr(current).unwrap_or_default();
        let list: Vec<String> = crate::lifecycle::allowed_next(&cur).iter().map(|s| format!("\"{}\"", s)).collect();
        Ok(format!("{{\"ok\":true,\"transitions\":[{}]}}", list.join(",")))
    })
}

/// 서사 본문 갱신 — op_id 자동 생성, base_revision 생략 시 current.
#[no_mangle]
pub extern "C" fn xita_ws_set_body(path: *const c_char, target: *const c_char, id: *const c_char, body: *const c_char) -> *mut c_char {
    guard(|| {
        let ws = ws_from(path)?;
        let ty = type_from_dir(&cstr(target).ok_or(CoreError::OperationRejected)?).ok_or(CoreError::OperationRejected)?;
        let id = cstr(id).ok_or(CoreError::OperationRejected)?;
        let body = cstr(body).unwrap_or_default();
        let op_id = format!("body-{}-{}", std::process::id(), crate::now_iso());
        let op = Operation {
            version: OPERATION_VERSION,
            op_id,
            device_id: "xita-macos".into(),
            target: ty,
            target_id: id,
            base_revision: 0,
            kind: OpKind::UpdateField,
            fields: vec![("#body".to_string(), crate::doc::FmValue::Scalar(body))],
        };
        let outcome = OperationEngine::new(ws).apply(&op)?;
        Ok(ok_json(&[
            ("status", string_json(outcome.status)),
            ("entity_revision", outcome.entity_revision.to_string()),
            ("message", string_json(&outcome.message)),
        ]))
    })
}

/// §20 DoS 템플릿 적용
#[no_mangle]
pub extern "C" fn xita_apply_ship_template(path: *const c_char, product_id: *const c_char, product_type: *const c_char) -> *mut c_char {
    guard(|| {
        let ws = ws_from(path)?;
        let created = crate::agent::apply_ship_template(&ws, &cstr(product_id).ok_or(CoreError::OperationRejected)?, &cstr(product_type).unwrap_or_else(|| "WEB_SAAS".into()))?;
        Ok(format!("{{\"ok\":true,\"groups\":{}}}", created))
    })
}

/// readiness item 상태 갱신
#[no_mangle]
pub extern "C" fn xita_patch_readiness(path: *const c_char, product_id: *const c_char, kind: *const c_char, item: *const c_char, status: *const c_char, progress: u64) -> *mut c_char {
    guard(|| {
        let ws = ws_from(path)?;
        let changed = crate::agent::patch_readiness(
            &ws,
            &cstr(product_id).ok_or(CoreError::OperationRejected)?,
            &cstr(kind).ok_or(CoreError::OperationRejected)?,
            &cstr(item).ok_or(CoreError::OperationRejected)?,
            &cstr(status).ok_or(CoreError::OperationRejected)?,
            progress,
        )?;
        Ok(format!("{{\"ok\":true,\"changed\":{}}}", changed))
    })
}

/// §67 Settings — Ship Template 미리보기 {ok, groups:[{kind, items:[...]}]}
#[no_mangle]
pub extern "C" fn xita_ship_template_preview(product_type: *const c_char) -> *mut c_char {
    guard(|| {
        let t = cstr(product_type).unwrap_or_else(|| "WEB_SAAS".into());
        let groups: Vec<String> = crate::agent::ship_template_preview(&t)
            .into_iter()
            .map(|(kind, items)| {
                let its = items.iter().map(|i| format!("\"{}\"", json_escape(i))).collect::<Vec<_>>().join(",");
                format!("{{\"kind\":\"{}\",\"items\":[{}]}}", kind, its)
            })
            .collect();
        Ok(format!("{{\"ok\":true,\"product_type\":\"{}\",\"groups\":[{}]}}", json_escape(&t), groups.join(",")))
    })
}

/// §51 승인 (Mac 단독 구동 대응)
#[no_mangle]
pub extern "C" fn xita_ws_approve_change(path: *const c_char, change_id: *const c_char) -> *mut c_char {
    guard(|| {
        let ws = ws_from(path)?;
        let out = crate::operation::approve_change(&ws, &cstr(change_id).ok_or(CoreError::OperationRejected)?)?;
        Ok(ok_json(&[
            ("status", string_json(out.status)),
            ("message", string_json(&out.message)),
            ("entity_revision", out.entity_revision.to_string()),
        ]))
    })
}

/// product readiness aggregate {overall, blockers[]}
#[no_mangle]
pub extern "C" fn xita_ws_readiness(path: *const c_char, product_id: *const c_char) -> *mut c_char {
    guard(|| {
        let ws = ws_from(path)?;
        let (overall, blockers) = crate::agent::readiness_summary(&ws, &cstr(product_id).ok_or(CoreError::OperationRejected)?);
        let bl = blockers.iter().map(|b| format!("\"{}\"", json_escape(b))).collect::<Vec<_>>().join(",");
        Ok(format!("{{\"ok\":true,\"overall\":{},\"blockers\":[{}]}}", overall, bl))
    })
}

#[cfg(test)]
mod bridge_tests {
    use super::*;

    fn call(ptr: *mut c_char) -> String {
        let s = unsafe { std::ffi::CStr::from_ptr(ptr) }.to_string_lossy().into_owned();
        unsafe { xita_free_string(ptr) };
        s
    }

    #[test]
    fn fields_tsv_parse() {
        let f = parse_fields_tsv("product\tnovel\nstatus\tIDEA");
        assert_eq!(f.len(), 2);
        assert_eq!(f[0].0, "product");
        assert_eq!(f[1].1.as_str(), Some("IDEA"));
    }

    #[test]
    fn multi_field_and_handoff_roundtrip() {
        use std::time::{SystemTime, UNIX_EPOCH};
        let dir = std::env::temp_dir().join(format!("xita-bridge-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&dir).unwrap();
        let d = std::ffi::CString::new(dir.to_str().unwrap()).unwrap();
        let out = call(xita_ws_apply_op_multi(d.as_ptr(), std::ffi::CString::new("b1").unwrap().as_ptr(), std::ffi::CString::new("mac").unwrap().as_ptr(), std::ffi::CString::new("product").unwrap().as_ptr(), std::ffi::CString::new("novel").unwrap().as_ptr(), 0, std::ffi::CString::new("create").unwrap().as_ptr(), std::ffi::CString::new("name\tNovel\nversion\tv1.0").unwrap().as_ptr()));
        assert!(out.contains("\"APPLIED\""), "{out}");
        let out2 = call(xita_ws_apply_op_multi(d.as_ptr(), std::ffi::CString::new("b2").unwrap().as_ptr(), std::ffi::CString::new("mac").unwrap().as_ptr(), std::ffi::CString::new("change").unwrap().as_ptr(), std::ffi::CString::new("c1").unwrap().as_ptr(), 0, std::ffi::CString::new("create").unwrap().as_ptr(), std::ffi::CString::new("product\tnovel\nstatus\tIDEA").unwrap().as_ptr()));
        assert!(out2.contains("\"APPLIED\""), "{out2}");
        let md = call(xita_build_handoff(d.as_ptr(), std::ffi::CString::new("novel").unwrap().as_ptr(), std::ffi::CString::new("c1").unwrap().as_ptr()));
        assert!(md.contains("Agent Handoff"), "{md}");
        let agents = call(xita_detect_agents());
        assert!(agents.contains("\"agents\""), "{agents}");
    }
}
