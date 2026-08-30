//! Git abstraction (v0.5 §16, Phase 6).
//!
//! Rust Core 는 Git 저장소 *inspection* 만 담당한다 (repository detection,
//! current branch, HEAD). Force Reset / Force Push / History Rewrite /
//! Destructive Checkout 은 **자동 수행 금지**(§16, §22) — `SafetyPolicy` 가
//! 기본으로 거부하고, 명시적 human authorization 만 통과시킨다.

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{CoreError, Result};

/// Git 저장소 (inspection 전용).
#[derive(Debug, Clone)]
pub struct GitRepo {
    root: PathBuf,
}

impl GitRepo {
    /// `root/.git` 존재 여부로 저장소를 감지한다 (worktree 는 파일).
    pub fn detect(root: &Path) -> bool {
        let git = root.join(".git");
        git.is_dir() || git.is_file()
    }

    pub fn open(root: impl Into<PathBuf>) -> Result<Self> {
        let root = root.into();
        if !Self::detect(&root) {
            return Err(CoreError::GitError);
        }
        Ok(Self { root })
    }

    fn git_dir(&self) -> PathBuf {
        let git = self.root.join(".git");
        if git.is_file() {
            // worktree: `gitdir: <path>` 형태. 단순화로 동일 트리 가정.
            return git;
        }
        git
    }

    /// origin remote URL (.git/config 스캔).
    pub fn remote_url(&self) -> Option<String> {
        let cfg = fs::read_to_string(self.git_dir().join("config")).ok()?;
        let mut in_origin = false;
        for line in cfg.lines() {
            let t = line.trim();
            if t.starts_with("[remote") {
                in_origin = t.contains("\"origin\"");
            } else if in_origin && t.starts_with("url") {
                return t.split_once('=').map(|(_, v)| v.trim().to_string());
            }
        }
        None
    }

    /// HEAD 커밋(완전/단축 sha). symbolic 이면 refs 파일 또는 packed-refs 조회.
    pub fn head_commit(&self) -> Option<String> {
        let head = fs::read_to_string(self.git_dir().join("HEAD")).ok()?;
        let head = head.trim();
        if let Some(r) = head.strip_prefix("ref: ") {
            let direct = self.git_dir().join(r.trim());
            if let Ok(sha) = fs::read_to_string(&direct) {
                return Some(sha.trim().to_string());
            }
            let packed = fs::read_to_string(self.git_dir().join("packed-refs")).ok()?;
            return packed
                .lines()
                .find(|l| l.ends_with(r.trim()))
                .map(|l| l.split_whitespace().next().unwrap_or_default().to_string());
        }
        Some(head.to_string())
    }

    /// 현재 브랜치. detached HEAD 면 None. `.git/HEAD` 파싱.
    pub fn current_branch(&self) -> Result<Option<String>> {
        let raw = fs::read_to_string(self.git_dir().join("HEAD")).map_err(|_| CoreError::GitError)?;
        let line = raw.trim();
        if let Some(rest) = line.strip_prefix("ref: refs/heads/") {
            Ok(Some(rest.trim().to_string()))
        } else if line.starts_with("ref: ") {
            Ok(Some(line.trim_start_matches("ref: ").to_string()))
        } else {
            Ok(None) // detached
        }
    }
}

/// §16/§22: 자동으로 수행하면 안 되는 위험한 Git 작업.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UnsafeOperation {
    ForceReset,
    ForcePush,
    HistoryRewrite,
    DestructiveCheckout,
}

impl UnsafeOperation {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ForceReset => "force_reset",
            Self::ForcePush => "force_push",
            Self::HistoryRewrite => "history_rewrite",
            Self::DestructiveCheckout => "destructive_checkout",
        }
    }
}

/// 위험 Git 작업을 명시적 human authorization 없이 거부한다.
#[derive(Debug, Clone)]
pub struct SafetyPolicy {
    authorized: bool,
}

impl SafetyPolicy {
    pub fn new() -> Self {
        Self { authorized: false }
    }

    /// Human 이 명시적으로 위험 작업을 승인했을 때만 호출 (UI 의 명시 확인).
    pub fn authorize_unsafe(mut self) -> Self {
        self.authorized = true;
        self
    }

    pub fn guard(&self, op: UnsafeOperation) -> Result<()> {
        if self.authorized {
            return Ok(());
        }
        let _ = op;
        Err(CoreError::PermissionDenied)
    }
}

impl Default for SafetyPolicy {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        use std::time::{SystemTime, UNIX_EPOCH};
        std::env::temp_dir().join(format!(
            "xita-git-{}-{}",
            name,
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ))
    }

    #[test]
    fn detect_and_branch_parse() {
        let dir = temp_dir("repo");
        fs::create_dir_all(dir.join(".git")).unwrap();
        fs::write(dir.join(".git/HEAD"), "ref: refs/heads/main\n").unwrap();

        let repo = GitRepo::open(&dir).unwrap();
        assert_eq!(repo.current_branch().unwrap(), Some("main".to_string()));

        // detached
        fs::write(dir.join(".git/HEAD"), "9f86d081884c7d659a2feaa0c55ad0fb8\n").unwrap();
        assert_eq!(repo.current_branch().unwrap(), None);
    }

    #[test]
    fn real_repo_remote_and_head() {
        // 이 저장소 자체(xita)로 inspection 검증
        let repo_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
        let ws = match GitRepo::open(&repo_path) {
            Ok(r) => r,
            Err(_) => return, // CI 경로 다를 수 있어 스킵 허용
        };
        assert_eq!(ws.current_branch().unwrap().as_deref(), Some("main"));
        let remote = ws.remote_url();
        assert!(remote.is_none() || remote.unwrap().contains('/'));
        // head: .git/HEAD 가 가리키는 대상 resolve 가능
        assert!(ws.head_commit().map(|h| !h.is_empty()).unwrap_or(false));
    }

    #[test]
    fn detect_false_when_not_repo() {
        let dir = temp_dir("notrepo");
        fs::create_dir_all(&dir).unwrap();
        assert!(!GitRepo::detect(&dir));
        assert_eq!(GitRepo::open(&dir).unwrap_err(), CoreError::GitError);
    }

    #[test]
    fn safety_policy_rejects_unsafe_by_default() {
        let p = SafetyPolicy::new();
        assert_eq!(p.guard(UnsafeOperation::ForcePush).unwrap_err(), CoreError::PermissionDenied);
        assert_eq!(p.guard(UnsafeOperation::HistoryRewrite).unwrap_err(), CoreError::PermissionDenied);
    }

    #[test]
    fn safety_policy_allows_when_authorized() {
        let p = SafetyPolicy::new().authorize_unsafe();
        assert!(p.guard(UnsafeOperation::ForcePush).is_ok());
    }
}