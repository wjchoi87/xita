//! Canonical Storage + Revision (v0.5 §11-§12; Storage First).
//!
//! - atomic write: temp 파일에 쓴 뒤 rename (parse-before-overwrite). `§11`
//! - entity revision: 파일 frontmatter `revision` 에서 optimistic concurrency.
//!   stale base revision 유입 시 `RevisionConflict`(v0.5 §13 은 Operation 단계지만
//!   저장 계층에서 min guard 를 둔다).
//! - workspace revision: `.xita/workspace.json` 에 atomic 으로 누적 (sync cursor).
//!
//! 구조는 v0.4/§19 를 따른다:
//! ```text
//! <root>/products/<id>.md
//! <root>/changes/<id>.md
//! <root>/<type>/<id>.md ...
//! <root>/.xita/workspace.json
//! ```

use std::fs;
use std::path::{Path, PathBuf};

use crate::doc::{self, Doc};
use crate::error::{CoreError, Result};

/// canonical entity 유형. 디렉토리 이름과 1:1.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntityType {
    Product,
    Change,
    Decision,
    Artifact,
    Workbench,
    Release,
    Capability,
    Readiness,
    Proposal,
    Review,
    Reference,
    Dispatch,
    Milestone,
    Insight,
}

impl EntityType {
    pub fn dir(self) -> &'static str {
        match self {
            Self::Product => "products",
            Self::Change => "changes",
            Self::Decision => "decisions",
            Self::Artifact => "artifacts",
            Self::Workbench => "workbench",
            Self::Release => "releases",
            Self::Capability => "capabilities",
            Self::Readiness => "readiness",
            Self::Proposal => "proposals",
            Self::Review => "reviews",
            Self::Reference => "references",
            Self::Dispatch => "dispatches",
            Self::Milestone => "milestones",
            Self::Insight => "insights",
        }
    }
}

/// Workspace revision holder (`.xita/workspace.json` 의 부분).
#[derive(Debug, Clone, Copy)]
pub struct WorkspaceMeta {
    pub revision: u64,
}

/// canonical workspace 의 root.
#[derive(Debug, Clone)]
pub struct Workspace {
    root: PathBuf,
}

/// canonical workspace format schema version (v0.5 §20).
pub const SCHEMA_VERSION: u32 = 1;

impl Workspace {
    pub fn open(root: impl Into<PathBuf>) -> Result<Self> {
        let root = root.into();
        if !root.is_dir() {
            return Err(CoreError::WorkspaceNotFound);
        }
        Ok(Self { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// canonical workspace 의 `.xita` 메타 디렉토리 (ledger 등).
    pub fn meta_dir(&self) -> PathBuf {
        self.root.join(".xita")
    }

    fn entity_dir(&self, ty: EntityType) -> PathBuf {
        self.root.join(ty.dir())
    }

    fn entity_path(&self, ty: EntityType, id: &str) -> PathBuf {
        let safe: String = id
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') { c } else { '-' })
            .collect();
        self.entity_dir(ty).join(format!("{}.md", safe))
    }

    /// (test) entity 파일 경로 노출.
    #[cfg(test)]
    pub(crate) fn entity_path_for_test(&self, ty: EntityType, id: &str) -> PathBuf {
        self.entity_path(ty, id)
    }

    // ---- workspace revision ---------------------------------------------
    pub fn workspace_revision(&self) -> Result<u64> {
        let path = self.meta_dir().join("workspace.json");
        let raw = match fs::read_to_string(&path) {
            Ok(r) => r,
            // 아직 없는 workspace → revision 0
            Err(_) => return Ok(0),
        };
        // workspace.json = {"workspace_revision": N, "last_updated": "..."}
        // 최소 파싱: `"workspace_revision": <num>` 탐색.
        let key = "\"workspace_revision\"";
        match raw.find(key) {
            Some(i) => {
                let after = &raw[i + key.len()..];
                let colon = after.find(':').ok_or(CoreError::InvalidFrontmatter)?;
                let num_part = after[colon + 1..]
                    .trim_start()
                    .split(|c: char| !c.is_ascii_digit())
                    .next()
                    .unwrap_or("");
                let n: u64 = num_part.parse().map_err(|_| CoreError::InvalidFrontmatter)?;
                Ok(n)
            }
            None => Ok(0),
        }
    }

    /// workspace revision 을 1 증가시키며 atomic 저장 (+ schema_version, §20).
    pub fn bump_workspace_revision(&self) -> Result<u64> {
        let next = self.workspace_revision()? + 1;
        let payload = format!(
            "{{\n  \"schema_version\": {},\n  \"workspace_revision\": {},\n  \"last_updated\": \"{}\"\n}}\n",
            SCHEMA_VERSION,
            next,
            crate::now_iso()
        );
        let meta = self.meta_dir();
        fs::create_dir_all(&meta).map_err(|_| CoreError::PermissionDenied)?;
        atomic_write(&meta.join("workspace.json"), &payload)?;
        Ok(next)
    }

    /// workspace.json 의 schema_version. 없으면 현재 SCHEMA_VERSION.
    pub fn schema_version(&self) -> Result<u32> {
        let path = self.meta_dir().join("workspace.json");
        let raw = match fs::read_to_string(&path) {
            Ok(r) => r,
            Err(_) => return Ok(SCHEMA_VERSION),
        };
        let key = "\"schema_version\"";
        match raw.find(key) {
            Some(i) => {
                let after = &raw[i + key.len()..];
                let colon = after.find(':').ok_or(CoreError::InvalidFrontmatter)?;
                let num: u32 = after[colon + 1..]
                    .trim_start()
                    .split(|c: char| !c.is_ascii_digit())
                    .next()
                    .unwrap_or("1")
                    .parse()
                    .map_err(|_| CoreError::InvalidFrontmatter)?;
                Ok(num)
            }
            None => Ok(SCHEMA_VERSION),
        }
    }

    // ---- entity read/write ----------------------------------------------
    pub fn read_entity(&self, ty: EntityType, id: &str) -> Result<Doc> {
        let raw = fs::read_to_string(self.entity_path(ty, id)).map_err(|_| CoreError::StorageReadFailed)?;
        doc::parse(&raw)
    }

    /// canonical mutation. base_revision 를 주면 mismatch 시 `RevisionConflict`.
    /// 다음 revision 을 반환한다.
    pub fn write_entity(
        &self,
        ty: EntityType,
        id: &str,
        doc: &Doc,
        base_revision: Option<u64>,
    ) -> Result<u64> {
        let path = self.entity_path(ty, id);
        // Parse-before-overwrite(§11): 기존 파일이 망가진 frontmatter 면
        // 조용히 덮어쓰지 않고 오류를 전파한다(§22 알 수 없는 필드 보존/손상 금지).
        let current = match self.read_entity(ty, id) {
            Ok(existing) => field_int(&existing, "revision").unwrap_or(0),
            Err(CoreError::InvalidFrontmatter) => return Err(CoreError::InvalidFrontmatter),
            Err(CoreError::StorageReadFailed) => 0, // 신규
            Err(e) => return Err(e),
        };
        if let Some(base) = base_revision {
            if base != 0 && base != current {
                return Err(CoreError::RevisionConflict);
            }
        }
        let next = current + 1;
        // canonical: frontmatter 의 revision 을 next 로 갱신한 복사본을 쓴다.
        let mut updated = doc.clone();
        set_field(&mut updated, "revision", format!("{}", next));
        let dir = self.entity_dir(ty);
        fs::create_dir_all(&dir).map_err(|_| CoreError::PermissionDenied)?;
        atomic_write(&path, &doc::serialize(&updated))?;
        self.bump_workspace_revision()?;
        Ok(next)
    }

    /// canonical entity 삭제 (atomic 한 파일 제거 + workspace revision bump).
    pub fn delete_entity(&self, ty: EntityType, id: &str) -> Result<bool> {
        let path = self.entity_path(ty, id);
        if !path.exists() {
            return Ok(false);
        }
        fs::remove_file(&path).map_err(|_| CoreError::StorageWriteFailed)?;
        self.bump_workspace_revision()?;
        Ok(true)
    }

    pub fn list_ids(&self, ty: EntityType) -> Result<Vec<String>> {
        let dir = self.entity_dir(ty);
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => return Ok(Vec::new()),
        };
        let mut out = Vec::new();
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if let Some(stripped) = name.strip_suffix(".md") {
                out.push(stripped.to_string());
            }
        }
        out.sort();
        Ok(out)
    }
}

fn field_int(doc: &Doc, key: &str) -> Option<u64> {
    for (k, v) in &doc.fields {
        if k == key {
            return v.as_int().map(|n| n as u64);
        }
    }
    None
}

fn set_field(doc: &mut Doc, key: &str, value: String) {
    for (k, v) in doc.fields.iter_mut() {
        if k == key {
            *v = crate::doc::FmValue::Integer(value.parse().unwrap_or(0));
            return;
        }
    }
    doc.fields.push((key.to_string(), crate::doc::FmValue::Scalar(value)));
}

/// temp 쓰기 → rename 원자 교체 (v0.5 §11).
pub fn atomic_write(path: &Path, content: &str) -> Result<()> {
    let dir = path.parent().ok_or(CoreError::StorageWriteFailed)?;
    fs::create_dir_all(dir).map_err(|_| CoreError::PermissionDenied)?;
    let tmp = dir.join(format!(
        ".{}.{}.{}.tmp",
        path.file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_default(),
        std::process::id(),
        // 고유도 확보
        crate::now_iso().replace([':', '.'], "-")
    ));
    fs::write(&tmp, content).map_err(|_| CoreError::StorageWriteFailed)?;
    fs::rename(&tmp, path).map_err(|_| CoreError::StorageWriteFailed)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::doc::FmValue;

    fn temp_ws() -> Workspace {
        let dir = std::env::temp_dir().join(format!("xita-core-test-{}", unique()));
        fs::create_dir_all(dir.join(".xita")).unwrap();
        Workspace { root: dir }
    }

    fn unique() -> String {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos().to_string()
    }

    #[test]
    fn write_read_entity_and_sets_revision() {
        let ws = temp_ws();
        let d = Doc { fields: vec![("id".into(), FmValue::Scalar("novel".into()))], body: "# Novel".into() };
        let rev = ws.write_entity(EntityType::Product, "novel", &d, None).unwrap();
        assert_eq!(rev, 1);
        let read = ws.read_entity(EntityType::Product, "novel").unwrap();
        assert_eq!(field_int(&read, "revision"), Some(1));
        assert_eq!(read.body, "# Novel");
        // 재기록 → revision 2
        let rev2 = ws.write_entity(EntityType::Product, "novel", &read, None).unwrap();
        assert_eq!(rev2, 2);
    }

    #[test]
    fn stale_revision_is_rejected() {
        let ws = temp_ws();
        let d = Doc { fields: vec![], body: "# x".into() };
        ws.write_entity(EntityType::Change, "c1", &d, None).unwrap();
        // base_revision 5 는 canonical(1) 과 불일치
        let err = ws.write_entity(EntityType::Change, "c1", &d, Some(5)).unwrap_err();
        assert_eq!(err, CoreError::RevisionConflict);
    }

    #[test]
    fn schema_version_written_on_bump() {
        let ws = temp_ws();
        assert_eq!(ws.schema_version().unwrap(), SCHEMA_VERSION);
        let d = Doc { fields: vec![], body: "x".into() };
        ws.write_entity(EntityType::Product, "p1", &d, None).unwrap();
        assert_eq!(ws.schema_version().unwrap(), SCHEMA_VERSION);
    }

    #[test]
    fn parse_before_overwrite_rejects_corrupt_file() {
        let ws = temp_ws();
        let d = Doc { fields: vec![], body: "ok".into() };
        ws.write_entity(EntityType::Product, "p1", &d, None).unwrap();
        // 파일을 망가뜨린다 (frontmatter 시작했지만 종료 마커 없음)
        let p = ws.entity_path_for_test(EntityType::Product, "p1");
        fs::write(&p, "---\nnotkv\n").unwrap();
        let err = ws.write_entity(EntityType::Product, "p1", &d, None).unwrap_err();
        assert_eq!(err, CoreError::InvalidFrontmatter);
    }

    #[test]
    fn atomic_write_fails_when_parent_is_not_dir() {
        let ws = temp_ws();
        let blocker = ws.root().join("blocker");
        fs::write(&blocker, "x").unwrap();
        let path = blocker.join("x.md");
        let err = atomic_write(&path, "content").unwrap_err();
        assert!(err == CoreError::PermissionDenied || err == CoreError::StorageWriteFailed);
    }

    #[test]
    fn workspace_revision_monotonic() {
        let ws = temp_ws();
        let d = Doc { fields: vec![], body: "x".into() };
        assert_eq!(ws.workspace_revision().unwrap(), 0);
        ws.write_entity(EntityType::Decision, "d1", &d, None).unwrap();
        let r = ws.workspace_revision().unwrap();
        assert!(r >= 1, "workspace revision should increase");
    }
}