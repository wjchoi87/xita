//! Derived Index (v0.4 §5, v0.5 §21 — rebuild 가능한 캐시).
//!
//! `.xita/index.json` 은 **derived state** 다. canonical Markdown/YAML 에서
//! `rebuild()` 로 항상 재생성할 수 있고, 삭제되어도 무방하다. Storage 나
//! Sync 의 source of truth 가 아니다.
//!
//! std-only 로 작은 JSON 객체(배열)를 직접 emit/parse 한다(스키마 고정:
//! `{schema_version, workspace_revision, docs:[{type,id,revision}]}`).

use std::fs;

use crate::error::{CoreError, Result};
use crate::storage::{self, EntityType, Workspace, SCHEMA_VERSION};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexEntry {
    pub ty: EntityType,
    pub id: String,
    pub revision: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexMeta {
    pub schema_version: u32,
    pub workspace_revision: u64,
    pub docs: Vec<IndexEntry>,
}

const ALL_TYPES: [EntityType; 6] = [
    EntityType::Product,
    EntityType::Change,
    EntityType::Decision,
    EntityType::Artifact,
    EntityType::Workbench,
    EntityType::Release,
];

pub struct IndexEngine;

impl IndexEngine {
    /// workspace 전체를 스캔해 derived index 를 (.xita/index.json 으로) 재생성.
    pub fn rebuild(ws: &Workspace) -> Result<IndexMeta> {
        let mut docs = Vec::new();
        for ty in ALL_TYPES {
            for id in ws.list_ids(ty)? {
                if let Ok(doc) = ws.read_entity(ty, &id) {
                    let revision = doc_revision(&doc);
                    docs.push(IndexEntry { ty, id, revision });
                }
            }
        }
        docs.sort_by(|a, b| (a.ty.dir(), &a.id).cmp(&(b.ty.dir(), &b.id)));
        let meta = IndexMeta { schema_version: SCHEMA_VERSION, workspace_revision: ws.workspace_revision()?, docs };
        write_index(ws, &meta)?;
        Ok(meta)
    }

    /// index 파일을 읽는다. 없으면 None.
    pub fn load(ws: &Workspace) -> Result<Option<IndexMeta>> {
        let path = ws.meta_dir().join("index.json");
        let raw = match fs::read_to_string(&path) {
            Ok(r) => r,
            Err(_) => return Ok(None),
        };
        parse_index(&raw).map(Some)
    }
}

fn doc_revision(doc: &crate::doc::Doc) -> u64 {
    doc.fields
        .iter()
        .find(|(k, _)| k == "revision")
        .and_then(|(_, v)| v.as_int())
        .unwrap_or(0) as u64
}

fn write_index(ws: &Workspace, meta: &IndexMeta) -> Result<()> {
    let dir = ws.meta_dir();
    fs::create_dir_all(&dir).map_err(|_| CoreError::PermissionDenied)?;
    let mut s = String::from("{\n  \"schema_version\": ");
    s.push_str(&meta.schema_version.to_string());
    s.push_str(",\n  \"workspace_revision\": ");
    s.push_str(&meta.workspace_revision.to_string());
    s.push_str(",\n  \"docs\": [");
    for (i, e) in meta.docs.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        s.push_str(&format!("\n    {{\"type\": \"{}\", \"id\": \"{}\", \"revision\": {}}}", e.ty.dir(), escape(&e.id), e.revision));
    }
    if !meta.docs.is_empty() {
        s.push('\n');
    }
    s.push_str("  ]\n}\n");
    storage::atomic_write(&dir.join("index.json"), &s)
}

fn escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// 고정 스키마 index.json 파서(최소). type/문자열/숫자만 취급.
fn parse_index(raw: &str) -> Result<IndexMeta> {
    let schema_version = number_after(raw, "\"schema_version\"")?.unwrap_or(SCHEMA_VERSION as u64) as u32;
    let workspace_revision = number_after(raw, "\"workspace_revision\"")?.unwrap_or(0);
    let docs_start = raw.find("\"docs\"");
    let mut docs = Vec::new();
    if let Some(start) = docs_start {
        let arr = &raw[start + "\"docs\"".len()..];
        let open = arr.find('[').ok_or(CoreError::InvalidFrontmatter)?;
        let close = arr[open..].find(']').ok_or(CoreError::InvalidFrontmatter)?;
        let body = &arr[open + 1..open + close];
        for obj in split_objects(body) {
            let ty_name = string_after(obj, "\"type\"")?.ok_or(CoreError::InvalidFrontmatter)?;
            let id = string_after(obj, "\"id\"")?.ok_or(CoreError::InvalidFrontmatter)?;
            let revision = number_after(obj, "\"revision\"")?.unwrap_or(0);
            let ty = type_from_dir(&ty_name).ok_or(CoreError::InvalidFrontmatter)?;
            docs.push(IndexEntry { ty, id, revision });
        }
    }
    Ok(IndexMeta { schema_version, workspace_revision, docs })
}

fn split_objects(body: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let bytes = body.as_bytes();
    let mut depth = 0i32;
    let mut start = 0usize;
    let mut in_str = false;
    for (i, &b) in bytes.iter().enumerate() {
        if b == b'"' {
            in_str = !in_str;
            continue;
        }
        if in_str {
            continue;
        }
        if b == b'{' {
            if depth == 0 {
                start = i + 1;
            }
            depth += 1;
        } else if b == b'}' {
            depth -= 1;
            if depth == 0 {
                out.push(&body[start..i]);
            }
        }
    }
    out
}

fn type_from_dir(dir: &str) -> Option<EntityType> {
    match dir {
        "products" => Some(EntityType::Product),
        "changes" => Some(EntityType::Change),
        "decisions" => Some(EntityType::Decision),
        "artifacts" => Some(EntityType::Artifact),
        "workbench" => Some(EntityType::Workbench),
        "releases" => Some(EntityType::Release),
        _ => None,
    }
}

fn number_after(raw: &str, key: &str) -> Result<Option<u64>> {
    let Some(i) = raw.find(key) else { return Ok(None) };
    let after = &raw[i + key.len()..];
    let colon = after.find(':').ok_or(CoreError::InvalidFrontmatter)?;
    let part = after[colon + 1..].trim_start();
    let num: String = part.chars().take_while(|c| c.is_ascii_digit()).collect();
    if num.is_empty() {
        return Ok(None);
    }
    num.parse().map(Some).map_err(|_| CoreError::InvalidFrontmatter)
}

fn string_after(raw: &str, key: &str) -> Result<Option<String>> {
    let Some(i) = raw.find(key) else { return Ok(None) };
    let after = &raw[i + key.len()..];
    let colon = after.find(':').ok_or(CoreError::InvalidFrontmatter)?;
    let part = after[colon + 1..].trim_start();
    if !part.starts_with('"') {
        return Ok(None);
    }
    let mut out = String::new();
    let mut chars = part[1..].chars();
    while let Some(c) = chars.next() {
        if c == '\\' {
            if let Some(n) = chars.next() {
                out.push(n);
            }
        } else if c == '"' {
            break;
        } else {
            out.push(c);
        }
    }
    Ok(Some(out))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::doc::FmValue;
    use crate::operation::{Operation, OperationEngine, OpKind, OPERATION_VERSION};

    fn ws() -> Workspace {
        use std::time::{SystemTime, UNIX_EPOCH};
        let dir = std::env::temp_dir().join(format!(
            "xita-index-{}",
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        Workspace::open(&dir).unwrap()
    }

    fn seed(ws: &Workspace) {
        let e = OperationEngine::new(ws.clone());
        for (op, target, id) in [
            ("i1", EntityType::Product, "novel"),
            ("i2", EntityType::Change, "ai-recommendation"),
            ("i3", EntityType::Workbench, "cold-start"),
        ] {
            let op = Operation {
                version: OPERATION_VERSION,
                op_id: op.into(),
                device_id: "test".into(),
                target,
                target_id: id.into(),
                base_revision: 0,
                kind: OpKind::Create,
                fields: vec![("name".to_string(), FmValue::Scalar("x".into()))],
            };
            e.apply(&op).unwrap();
        }
    }

    #[test]
    fn index_rebuild_and_load_round_trip() {
        let ws = ws();
        seed(&ws);
        let meta = IndexEngine::rebuild(&ws).unwrap();
        assert_eq!(meta.docs.len(), 3);
        let loaded = IndexEngine::load(&ws).unwrap().unwrap();
        assert_eq!(loaded, meta);
    }

    #[test]
    fn index_rebuild_after_delete() {
        let ws = ws();
        seed(&ws);
        let _ = IndexEngine::rebuild(&ws).unwrap();
        let path = ws.meta_dir().join("index.json");
        std::fs::remove_file(&path).unwrap();
        assert!(IndexEngine::load(&ws).unwrap().is_none());
        // 삭제 후 rebuild 로 복원 (v0.4 §5 derived)
        let meta = IndexEngine::rebuild(&ws).unwrap();
        assert_eq!(meta.docs.len(), 3);
        assert!(IndexEngine::load(&ws).unwrap().is_some());
    }

    #[test]
    fn empty_workspace_index() {
        let ws = ws();
        let meta = IndexEngine::rebuild(&ws).unwrap();
        assert!(meta.docs.is_empty());
    }
}