//! JavaScript-compatible text helpers for native ports of renderer logic.
//!
//! Stored values (dedupe hashes, summaries) must match what the renderer used
//! to write, so these follow ECMAScript semantics rather than Rust's:
//! JS `\s`/`trim` whitespace differs from `char::is_whitespace` (JS includes
//! U+FEFF and excludes U+0085), and JS lengths count UTF-16 code units.

/// ECMAScript `WhiteSpace` + `LineTerminator` (the `\s` class and `trim`).
pub(crate) fn is_js_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{0B}' | '\u{0C}' | '\r' | ' ' | '\u{A0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}

/// `String.prototype.trim`.
pub(crate) fn js_trim(value: &str) -> &str {
    value.trim_matches(is_js_space)
}

/// `value.trim().replace(/\s+/gu, " ")`.
pub(crate) fn js_collapse_whitespace(value: &str) -> String {
    js_trim(value)
        .split(is_js_space)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

pub(crate) fn utf16_len(value: &str) -> usize {
    value.encode_utf16().count()
}

/// Longest char-boundary prefix of at most `max_units` UTF-16 code units.
/// JS `slice` could split a surrogate pair; Rust strings cannot hold a lone
/// surrogate, so the pair is dropped whole instead.
pub(crate) fn utf16_prefix(value: &str, max_units: usize) -> &str {
    let mut units = 0;
    for (index, c) in value.char_indices() {
        units += c.len_utf16();
        if units > max_units {
            return &value[..index];
        }
    }
    value
}

/// Port of the renderer `boundWorkflowSummary`: collapse whitespace, cap at
/// 1000 UTF-16 units with an ellipsis.
pub(crate) fn bound_workflow_summary(value: &str) -> String {
    let normalized = js_collapse_whitespace(value);
    if utf16_len(&normalized) <= 1000 {
        return normalized;
    }
    let head = utf16_prefix(&normalized, 999).trim_end_matches(is_js_space);
    format!("{head}…")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whitespace_follows_ecmascript_not_rust() {
        assert_eq!(js_trim("\u{FEFF} a \u{A0}"), "a");
        assert_eq!(js_trim("\u{85}a"), "\u{85}a");
        assert_eq!(js_collapse_whitespace("  a \n\t b\u{3000}c "), "a b c");
    }

    #[test]
    fn utf16_prefix_counts_surrogate_pairs() {
        assert_eq!(utf16_len("a😀"), 3);
        assert_eq!(utf16_prefix("a😀b", 2), "a");
        assert_eq!(utf16_prefix("a😀b", 3), "a😀");
    }

    #[test]
    fn bound_summary_caps_with_ellipsis() {
        assert_eq!(bound_workflow_summary(" x  y "), "x y");
        let long = format!("{} tail", "a".repeat(1100));
        let bounded = bound_workflow_summary(&long);
        assert_eq!(utf16_len(&bounded), 1000);
        assert!(bounded.ends_with('…'));
    }
}
