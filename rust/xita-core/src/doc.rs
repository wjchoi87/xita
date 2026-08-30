//! Markdown + YAML Frontmatter 문서 처리 (v0.5 §5, §11; Storage First).
//!
//! canonical workspace 의 각 파일은:
//! ```text
//! ---
//! id: novel
//! type: product
//! revision: 1
//! status: production
//! ---
//! # Novel
//! body...
//! ```
//!
//! 이 모듈은 frontmatter 를 순서 보존 scalar/list 로 파싱·직렬화한다. 외부
//! YAML 의존을 최소화하고, Rust Core 가 생성한 값을 원형 그대로 돌려받는 것을
//! 보장한다(v0.5 §21 round-trip). 알려지지 않은 필드는 보존한다(v0.5 §22).

use crate::error::{CoreError, Result};

/// Frontmatter 값. 이 스켈레톤에서는 scalar / string list / null 을 지원한다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FmValue {
    Scalar(String),
    List(Vec<String>),
    Null,
    Boolean(bool),
    Integer(i64),
}

impl FmValue {
    pub fn as_str(&self) -> Option<&str> {
        if let Self::Scalar(s) = self {
            Some(s)
        } else {
            None
        }
    }
    pub fn as_int(&self) -> Option<i64> {
        if let Self::Integer(n) = self {
            Some(*n)
        } else {
            self.as_str().and_then(|s| s.parse().ok())
        }
    }
    pub fn as_bool(&self) -> Option<bool> {
        if let Self::Boolean(b) = self {
            Some(*b)
        } else {
            self.as_str().map(|s| s == "true")
        }
    }
    pub fn as_list(&self) -> Option<&Vec<String>> {
        if let Self::List(l) = self {
            Some(l)
        } else {
            None
        }
    }
}

/// 파싱된 canonical 문서.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Doc {
    /// 순서 보존 frontmatter 필드.
    pub fields: Vec<(String, FmValue)>,
    /// frontmatter 아래 본문.
    pub body: String,
}

const SEP: &str = "---";

fn parse_bool(s: &str) -> Option<bool> {
    match s.trim().to_ascii_lowercase().as_str() {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}

/// scalar string 을 (있으면) int/bool 로 해석.
fn coerce(raw: &str) -> FmValue {
    let t = raw.trim();
    if t.is_empty() {
        return FmValue::Null;
    }
    if let Some(b) = parse_bool(t) {
        return FmValue::Boolean(b);
    }
    if let Ok(n) = t.parse::<i64>() {
        return FmValue::Integer(n);
    }
    FmValue::Scalar(t.to_string())
}

/// frontmatter 블록(개행 포함)을 파싱. `key: value` / `key:` + `  - item`.
fn parse_frontmatter_block(block: &str) -> Result<Vec<(String, FmValue)>> {
    let mut out = Vec::new();
    let mut lines = block.lines().peekable();
    while let Some(line) = lines.next() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some((k, v)) = trimmed.split_once(':') {
            let key = k.trim().to_string();
            let v = v.trim();
            if v.is_empty() {
                // inline 또는 block list
                let mut items = Vec::new();
                while let Some(l) = lines.peek() {
                    let t = l.trim_start();
                    if t.starts_with("- ") {
                        items.push(t.strip_prefix("- ").unwrap_or(t).trim().to_string());
                        lines.next();
                    } else {
                        break;
                    }
                }
                if !items.is_empty() {
                    out.push((key, FmValue::List(items)));
                } else {
                    out.push((key, FmValue::Null));
                }
            } else {
                out.push((key, coerce(v)));
            }
        } else {
            // 지원하지 않는 라인 → 오류 처리하지 않고 무시하지 말고 오류로
            return Err(CoreError::InvalidFrontmatter);
        }
    }
    Ok(out)
}

/// raw markdown 문서를 파싱. frontmatter 가 없으면 빈 fields 로 처리.
pub fn parse(raw: &str) -> Result<Doc> {
    let text = raw.strip_prefix('\u{feff}').unwrap_or(raw);
    if !text.starts_with(SEP) {
        return Ok(Doc { fields: Vec::new(), body: text.to_string() });
    }
    let rest = &text[SEP.len()..];
    let Some(close) = find_block_end(rest) else {
        return Err(CoreError::InvalidFrontmatter);
    };
    let block = &rest[..close];
    // close 는 종료 `\n---` 의 `\n` 위치. 본문은 `\n---` 이후.
    let body = &rest[close + 1 + SEP.len()..];
    let fields = parse_frontmatter_block(block)?;
    Ok(Doc {
        fields,
        body: body.trim().to_string(),
    })
}

/// 첫 개행 이후 `\n---` 종료 위치를 찾는다. 없으면 None.
fn find_block_end(rest: &str) -> Option<usize> {
    let body = rest.find('\n')?;
    let after = &rest[body..];
    let marker = format!("\n{}", SEP);
    let pos = after.find(&marker)?;
    // pos 는 `\n`(마커 시작) 위치 → 이상 없음
    Some(body + pos)
}

fn scalar_repr(v: &FmValue) -> Option<String> {
    match v {
        FmValue::Scalar(s) => Some(s.clone()),
        FmValue::Integer(n) => Some(n.to_string()),
        FmValue::Boolean(b) => Some(b.to_string()),
        FmValue::Null => Some("null".into()),
        FmValue::List(_) => None,
    }
}

/// Doc 을 canonical markdown 문자열로 직렬화.
pub fn serialize(doc: &Doc) -> String {
    let mut out = String::new();
    if !doc.fields.is_empty() {
        out.push_str(SEP);
        out.push('\n');
        for (k, v) in &doc.fields {
            if let Some(s) = scalar_repr(v) {
                out.push_str(k);
                out.push_str(": ");
                out.push_str(&s);
                out.push('\n');
            } else if let Some(items) = v.as_list() {
                out.push_str(k);
                out.push_str(":\n");
                for it in items {
                    out.push_str("  - ");
                    out.push_str(it);
                    out.push('\n');
                }
            } else {
                out.push_str(k);
                out.push_str(": null\n");
            }
        }
        out.push_str(SEP);
        out.push('\n');
    }
    out.push('\n');
    out.push_str(doc.body.trim());
    out.push('\n');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_preserves_fields_and_body() {
        let raw = format!(
            "{SEP}\nid: novel\ntype: product\nrevision: 1\nstatus: production\n{SEP}\n\n# Novel\n\n취향 기반 플랫폼"
        );
        let doc = parse(&raw).expect("parse");
        assert_eq!(doc.fields.len(), 4);
        assert_eq!(doc.fields[0].0, "id");
        assert_eq!(doc.fields[0].1.as_str(), Some("novel"));
        assert_eq!(doc.fields[2].1.as_int(), Some(1));
        assert!(doc.body.contains("# Novel"));
        let out = serialize(&doc);
        let doc2 = parse(&out).expect("reparse");
        assert_eq!(doc, doc2, "round-trip must be stable");
    }

    #[test]
    fn invalid_line_is_rejected() {
        let raw = format!("{SEP}\nnotkv\n{SEP}\nbody");
        assert!(parse(&raw).is_err());
    }

    #[test]
    fn golden_fixture_products_novel() {
        // cargo test 는 crate root 를 cwd 로 실행 → fixtures/ 상대 경로
        let raw = std::fs::read_to_string("fixtures/products/novel.md").expect("fixture exists");
        let doc = parse(&raw).expect("parse");
        assert_eq!(get(&doc, "id"), Some("novel"));
        assert_eq!(get(&doc, "type"), Some("product"));
        assert_eq!(doc.fields.iter().find(|(k, _)| k == "revision").and_then(|(_, v)| v.as_int()), Some(1));
        assert!(doc.body.contains("Novel"));
        // golden round-trip 안정
        let doc2 = parse(&serialize(&doc)).expect("reparse");
        assert_eq!(doc, doc2);
    }

    #[test]
    fn golden_fixture_list_and_invalid() {
        let raw = std::fs::read_to_string("fixtures/decisions/payment_provider.md").expect("fixture");
        let doc = parse(&raw).expect("parse");
        assert_eq!(get(&doc, "id"), Some("payment_provider"));
        let opt = doc.fields.iter().find(|(k, _)| k == "options");
        assert!(matches!(opt.map(|(_, v)| v.as_list()), Some(Some(l)) if l.len() == 2));

        let bad = std::fs::read_to_string("fixtures/invalid/unclosed.md").expect("fixture");
        assert_eq!(parse(&bad).unwrap_err(), CoreError::InvalidFrontmatter);
    }

    fn get<'a>(doc: &'a Doc, key: &'a str) -> Option<&'a str> {
        doc.fields.iter().find(|(k, _)| k == key).and_then(|(_, v)| v.as_str())
    }

    #[test]
    fn missing_frontmatter_returns_body_only() {
        let doc = parse("# just body").expect("parse");
        assert!(doc.fields.is_empty());
        assert_eq!(doc.body, "# just body");
    }
}