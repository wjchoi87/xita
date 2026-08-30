//! Change lifecycle transitions — the single source of truth for the core.
//! (v0.3 §13/§78; UI 메뉴도 이 테이블을 query 한다 — 서버 TS V4Domain 과 동일 표)

/// 허용 전이. key = 현재 status.
pub fn allowed_next(status: &str) -> Vec<&'static str> {
    match status {
        "IDEA" => vec!["PLAN", "BUILD", "PAUSED", "CANCELLED"],
        "PLAN" => vec!["BUILD", "REVIEW", "SHIP_READY", "PAUSED", "CANCELLED"],
        "BUILD" => vec!["PLAN", "REVIEW", "SHIP_READY", "PAUSED", "CANCELLED"],
        "REVIEW" => vec!["BUILD", "SHIP_READY", "PAUSED", "CANCELLED"],
        "SHIP_READY" => vec!["SHIPPED", "BUILD", "PAUSED", "CANCELLED"],
        "SHIPPED" => vec![],
        "PAUSED" => vec!["PLAN", "BUILD", "CANCELLED"],
        "CANCELLED" => vec![],
        _ => vec![],
    }
}

pub fn is_valid_transition(from: &str, to: &str) -> bool {
    allowed_next(from).contains(&to)
}

pub fn is_known_status(s: &str) -> bool {
    ["IDEA", "PLAN", "BUILD", "REVIEW", "SHIP_READY", "SHIPPED", "PAUSED", "CANCELLED"].contains(&s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transitions() {
        assert!(is_valid_transition("IDEA", "PLAN"));
        assert!(is_valid_transition("IDEA", "CANCELLED"));
        assert!(!is_valid_transition("IDEA", "SHIPPED"));
        assert!(!is_valid_transition("SHIPPED", "BUILD"));
        assert!(is_valid_transition("PAUSED", "BUILD"));
        assert!(!is_known_status("NOPE"));
    }
}