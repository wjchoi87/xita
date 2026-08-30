//! Typed error contract (v0.5 §9).
//!
//! Rust Core 는 UI 에 단일 문자열 Error 를 던지지 않는다. 코드 기반 요약
//! Error 를 유지하고, Swift 에서는 `code` 를 Human-readable state 상의
//! 재시도/회복 분기로 변환한다.
//!
//! 값은 `code`, `message`, `recoverable` 를 담는다.

use std::fmt;

/// Core 오류 분류. v0.5 §9 의 예시 목록을 따른다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CoreError {
    StorageReadFailed,
    StorageWriteFailed,
    InvalidFrontmatter,
    RevisionConflict,
    OperationRejected,
    WorkspaceNotFound,
    PermissionDenied,
    SyncProtocolError,
    GitError,
    AgentLaunchError,
    /// 기타/아직 분류 안 된 오류.
    Unknown(String),
}

impl CoreError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::StorageReadFailed => "STORAGE_READ_FAILED",
            Self::StorageWriteFailed => "STORAGE_WRITE_FAILED",
            Self::InvalidFrontmatter => "INVALID_FRONTMATTER",
            Self::RevisionConflict => "REVISION_CONFLICT",
            Self::OperationRejected => "OPERATION_REJECTED",
            Self::WorkspaceNotFound => "WORKSPACE_NOT_FOUND",
            Self::PermissionDenied => "PERMISSION_DENIED",
            Self::SyncProtocolError => "SYNC_PROTOCOL_ERROR",
            Self::GitError => "GIT_ERROR",
            Self::AgentLaunchError => "AGENT_LAUNCH_ERROR",
            Self::Unknown(_) => "UNKNOWN",
        }
    }

    pub fn message(&self) -> String {
        match self {
            Self::StorageReadFailed => "storage read failed".into(),
            Self::StorageWriteFailed => "storage write failed".into(),
            Self::InvalidFrontmatter => "invalid frontmatter".into(),
            Self::RevisionConflict => "revision conflict".into(),
            Self::OperationRejected => "operation rejected".into(),
            Self::WorkspaceNotFound => "workspace not found".into(),
            Self::PermissionDenied => "permission denied".into(),
            Self::SyncProtocolError => "sync protocol error".into(),
            Self::GitError => "git error".into(),
            Self::AgentLaunchError => "agent launch error".into(),
            Self::Unknown(m) => m.clone(),
        }
    }

    /// 대부분의 데이터/저장 오류는 재시도 가능하지만, conflict 는 사람 판단이
    /// 필요하므로 recoverable=false 를 권장한다 (v0.5 §13 → Needs You).
    pub fn recoverable(&self) -> bool {
        matches!(
            self,
            Self::StorageReadFailed
                | Self::StorageWriteFailed
                | Self::PermissionDenied
                | Self::WorkspaceNotFound
                | Self::GitError
                | Self::AgentLaunchError
        )
    }
}

impl fmt::Display for CoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code(), self.message())
    }
}

impl std::error::Error for CoreError {}

pub type Result<T> = std::result::Result<T, CoreError>;