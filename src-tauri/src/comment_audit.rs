//! Native port of the renderer `auditCommentVariant` rules.
//!
//! Comment audit findings gate review and publishing, so they are computed
//! where they are stored: the renderer cannot supply its own findings.
//! Parity notes: JS `length` counts UTF-16 code units and JS `\b`/`\d` in `u`
//! mode are ASCII-only, so this port uses `encode_utf16`, `(?-u:\b)` and `[0-9]`.

use regex::Regex;
use std::sync::OnceLock;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Finding {
    pub rule_key: &'static str,
    pub severity: &'static str,
    pub message: &'static str,
}

const MAX_COMMENT_UTF16: usize = 1250;

struct Patterns {
    hashtag: Regex,
    external_link: Regex,
    mention: Regex,
    generic: Regex,
    quoted: Regex,
    first_person: Regex,
}

fn patterns() -> &'static Patterns {
    static PATTERNS: OnceLock<Patterns> = OnceLock::new();
    PATTERNS.get_or_init(|| Patterns {
        hashtag: Regex::new(r"#[\p{L}\p{N}_-]+").expect("valid hashtag regex"),
        external_link: Regex::new(r"(?i)https?://|www\.").expect("valid link regex"),
        mention: Regex::new(r"@[\p{L}\p{N}_.-]+").expect("valid mention regex"),
        generic: Regex::new(
            r"(?i)(?-u:\b)(great post|thanks for sharing|love this|insightful post|nice post)(?-u:\b)",
        )
        .expect("valid generic regex"),
        quoted: Regex::new(r#"[“"][^”"]+[”"]"#).expect("valid quote regex"),
        first_person: Regex::new(
            r"(?i)(?-u:\b)(i|we|my|our|i've|we've|i’m|we’re|i'd|we'd)(?-u:\b)",
        )
        .expect("valid first-person regex"),
    })
}

fn finding(rule_key: &'static str, severity: &'static str, message: &'static str) -> Finding {
    Finding {
        rule_key,
        severity,
        message,
    }
}

fn severity_rank(severity: &str) -> u8 {
    match severity {
        "block" => 0,
        "warning" => 1,
        _ => 2,
    }
}

fn has_specificity_signal(body: &str) -> bool {
    let p = patterns();
    body.chars().any(|c| c.is_ascii_digit())
        || p.quoted.is_match(body)
        || p.first_person.is_match(body)
}

pub(crate) fn audit_comment_variant(body: &str) -> Vec<Finding> {
    let p = patterns();
    let trimmed = body.trim();
    let length = trimmed.encode_utf16().count();
    let mut findings = Vec::with_capacity(7);

    findings.push(if length == 0 {
        finding("required_text", "block", "Add a comment before review.")
    } else {
        finding("required_text", "pass", "This comment has text to review.")
    });
    findings.push(if length > MAX_COMMENT_UTF16 {
        finding(
            "comment_length",
            "block",
            "Keep comments under Linkgo's 1,250 character cap.",
        )
    } else {
        finding(
            "comment_length",
            "pass",
            "This comment stays under Linkgo's 1,250 character cap.",
        )
    });
    findings.push(if p.external_link.is_match(trimmed) {
        finding(
            "external_link",
            "block",
            "Remove external links before review.",
        )
    } else {
        finding("external_link", "pass", "No external link was found.")
    });
    findings.push(if p.hashtag.find_iter(trimmed).count() > 2 {
        finding("hashtag_limit", "block", "Use two or fewer hashtags.")
    } else {
        finding(
            "hashtag_limit",
            "pass",
            "This comment uses two or fewer hashtags.",
        )
    });
    if p.mention.find_iter(trimmed).count() > 1 {
        findings.push(finding(
            "mention_limit",
            "warning",
            "Use at most one mention unless the reviewer confirms it is intentional.",
        ));
    }
    if length < 40 || p.generic.is_match(trimmed) {
        findings.push(finding(
            "generic_reply",
            "warning",
            "Make the reply more specific than a generic reaction.",
        ));
    }
    if !has_specificity_signal(trimmed) {
        findings.push(finding(
            "specificity",
            "warning",
            "Add a number, quoted phrase, or first-person signal.",
        ));
    }
    findings.sort_by(|left, right| {
        severity_rank(left.severity)
            .cmp(&severity_rank(right.severity))
            .then_with(|| left.rule_key.cmp(right.rule_key))
    });
    findings
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys(body: &str) -> Vec<String> {
        audit_comment_variant(body)
            .into_iter()
            .map(|f| format!("{}:{}", f.severity, f.rule_key))
            .collect()
    }

    #[test]
    fn specific_comment_passes_every_rule() {
        assert_eq!(
            keys("We tried this at 3 teams and saw churn drop by a third."),
            vec![
                "pass:comment_length",
                "pass:external_link",
                "pass:hashtag_limit",
                "pass:required_text"
            ]
        );
    }

    #[test]
    fn blocks_and_warnings_sort_first_then_by_rule_key() {
        assert_eq!(
            keys("Great post! see www.x.com #a #b #c @one @two"),
            vec![
                "block:external_link",
                "block:hashtag_limit",
                "warning:generic_reply",
                "warning:mention_limit",
                "warning:specificity",
                "pass:comment_length",
                "pass:required_text"
            ]
        );
    }

    #[test]
    fn empty_and_over_length_bodies_block() {
        assert!(keys("   ").contains(&"block:required_text".to_string()));
        // 1251 UTF-16 units: JS counts the astral emoji as two units.
        let body = format!("{}{}", "a".repeat(1249), "😀");
        assert!(keys(&body).contains(&"block:comment_length".to_string()));
        let at_cap = format!("{}{}", "a".repeat(1248), "😀");
        assert!(keys(&at_cap).contains(&"pass:comment_length".to_string()));
    }

    #[test]
    fn word_boundaries_and_digits_follow_js_ascii_semantics() {
        // "Iwe" has no ASCII word boundary around "i"/"we"; no digits present.
        let generic = "Iwe totally agree with every single part of it, honestly.";
        assert!(keys(generic).contains(&"warning:specificity".to_string()));
        // Curly apostrophe first-person and a non-ASCII digit (not \d in JS).
        let curly = "I’m convinced the onboarding changes matter most here, friend.";
        assert!(!keys(curly).contains(&"warning:specificity".to_string()));
        let arabic_digit = "The rollout covered ٣ regions without much fanfare at all.";
        assert!(keys(arabic_digit).contains(&"warning:specificity".to_string()));
        let quoted = "The line “ship small” stuck with the whole team afterwards.";
        assert!(!keys(quoted).contains(&"warning:specificity".to_string()));
    }
}
