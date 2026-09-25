//! Native ports of the renderer's WHATWG `URL` helpers.
//!
//! The renderer normalized URLs with `new URL()` plus setter calls; stored
//! dedupe keys and contact matching depend on the exact output, so these use
//! the WHATWG-compliant `url` crate and replay the same setter sequence.
//! Parity is pinned by `tests` against outputs recorded from Node 22.

use url::Url;

use crate::js_text::js_trim;

fn js_lowercase(value: &str) -> String {
    value.to_lowercase()
}

/// Replays `hostname = hostname.toLocaleLowerCase()`, `hash = ""`, optionally
/// `search = ""`, and trailing-slash trimming of `pathname`.
fn normalize(value: &str, clear_search: bool) -> String {
    let trimmed = js_trim(value);
    if trimmed.is_empty() {
        return String::new();
    }
    let Ok(mut url) = Url::parse(trimmed) else {
        return js_lowercase(trimmed);
    };
    // `protocol` is already lowercase after parsing. Special-scheme hosts are
    // already lowercase too; opaque hosts (e.g. `foo://HOST`) are not.
    if let Some(host) = url.host_str() {
        let lowered = js_lowercase(host);
        if lowered != host {
            // Setter failures are ignored, like the JS `hostname` setter.
            let _ = url.set_host(Some(&lowered));
        }
    }
    url.set_fragment(None);
    if clear_search {
        url.set_query(None);
    }
    // The JS `pathname` setter is a no-op for opaque paths (`mailto:`).
    if !url.cannot_be_a_base() {
        let path = url.path();
        if path.encode_utf16().count() > 1 {
            let stripped = path.trim_end_matches('/').to_string();
            url.set_path(&stripped);
        }
    }
    url.to_string()
}

/// Port of the renderer `normalizeCandidateUrl` (keeps the query).
pub(crate) fn normalize_candidate_url(value: &str) -> String {
    normalize(value, false)
}

/// Port of the candidate-policy `normalizeProfileUrl` (drops the query).
pub(crate) fn normalize_profile_url(value: &str) -> String {
    normalize(value, true)
}

/// Port of `isAllowedLinkedInUrl`: HTTPS on `linkedin.com` or a subdomain.
pub(crate) fn is_allowed_linkedin_url(value: &str) -> bool {
    let Ok(url) = Url::parse(value) else {
        return false;
    };
    let host = js_lowercase(url.host_str().unwrap_or_default());
    url.scheme() == "https" && (host == "linkedin.com" || host.ends_with(".linkedin.com"))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// (input, normalizeCandidateUrl, normalizeProfileUrl, isAllowedLinkedInUrl
    /// on the trimmed input) recorded from the renderer helpers on Node 22.
    const CASES: &[(&str, &str, &str, bool)] = &[
        (
            "HTTPS://WWW.LinkedIn.COM/feed/update/urn:li:activity:1/?x=1#frag",
            "https://www.linkedin.com/feed/update/urn:li:activity:1?x=1",
            "https://www.linkedin.com/feed/update/urn:li:activity:1",
            true,
        ),
        (
            "https://www.linkedin.com//",
            "https://www.linkedin.com/",
            "https://www.linkedin.com/",
            true,
        ),
        (
            "https://www.linkedin.com",
            "https://www.linkedin.com/",
            "https://www.linkedin.com/",
            true,
        ),
        (
            "https://www.linkedin.com/in/ada///?trk=1",
            "https://www.linkedin.com/in/ada?trk=1",
            "https://www.linkedin.com/in/ada",
            true,
        ),
        (
            "  https://www.linkedin.com/in/Ada  ",
            "https://www.linkedin.com/in/Ada",
            "https://www.linkedin.com/in/Ada",
            true,
        ),
        ("not a url", "not a url", "not a url", false),
        (
            "WWW.LINKEDIN.COM/in/x",
            "www.linkedin.com/in/x",
            "www.linkedin.com/in/x",
            false,
        ),
        (
            "https://www.linked\u{130}n.com/in/x",
            "https://www.xn--linkedin-u0e.com/in/x",
            "https://www.xn--linkedin-u0e.com/in/x",
            false,
        ),
        (
            "https://\u{ff57}\u{ff57}\u{ff57}.linkedin.com/in/x",
            "https://www.linkedin.com/in/x",
            "https://www.linkedin.com/in/x",
            true,
        ),
        (
            "https://www.linkedin.com.evil.com/",
            "https://www.linkedin.com.evil.com/",
            "https://www.linkedin.com.evil.com/",
            false,
        ),
        (
            "http://www.linkedin.com/",
            "http://www.linkedin.com/",
            "http://www.linkedin.com/",
            false,
        ),
        (
            "https://linkedin.com:443/in/%7Eada/",
            "https://linkedin.com/in/%7Eada",
            "https://linkedin.com/in/%7Eada",
            true,
        ),
        (
            "https://evil.com/.linkedin.com",
            "https://evil.com/.linkedin.com",
            "https://evil.com/.linkedin.com",
            false,
        ),
        (
            "https://u:p@www.linkedin.com/a b",
            "https://u:p@www.linkedin.com/a%20b",
            "https://u:p@www.linkedin.com/a%20b",
            true,
        ),
        (
            "mailto:Ada@Example.COM",
            "mailto:Ada@Example.COM",
            "mailto:Ada@Example.COM",
            false,
        ),
        (
            "foo://HOST/Path/",
            "foo://host/Path",
            "foo://host/Path",
            false,
        ),
        (
            "https://www.linkedin.com/a/b/../c/./",
            "https://www.linkedin.com/a/c",
            "https://www.linkedin.com/a/c",
            true,
        ),
        (
            "https://[::1]/x/",
            "https://[::1]/x",
            "https://[::1]/x",
            false,
        ),
        (
            "https://www.linkedin.com/in/ada?q=a b#x",
            "https://www.linkedin.com/in/ada?q=a%20b",
            "https://www.linkedin.com/in/ada",
            true,
        ),
        (
            "https://www.linkedin.com/in/%E4%BD%A0/",
            "https://www.linkedin.com/in/%E4%BD%A0",
            "https://www.linkedin.com/in/%E4%BD%A0",
            true,
        ),
        (
            "https://www.linkedin.com/in/\u{4f60}\u{597d}/",
            "https://www.linkedin.com/in/%E4%BD%A0%E5%A5%BD",
            "https://www.linkedin.com/in/%E4%BD%A0%E5%A5%BD",
            true,
        ),
        (
            "https://WWW.LINKEDIN.COM./x",
            "https://www.linkedin.com./x",
            "https://www.linkedin.com./x",
            false,
        ),
        (
            "https://127.0.0.1/x/",
            "https://127.0.0.1/x",
            "https://127.0.0.1/x",
            false,
        ),
        (
            "https://www.linkedin.com\\in\\ada\\",
            "https://www.linkedin.com/in/ada",
            "https://www.linkedin.com/in/ada",
            true,
        ),
        ("foo:/a/b//", "foo:/a/b", "foo:/a/b", false),
        (
            "https://www.linkedin.com/?",
            "https://www.linkedin.com/?",
            "https://www.linkedin.com/",
            true,
        ),
        (
            "https://www.linkedin.com/#",
            "https://www.linkedin.com/",
            "https://www.linkedin.com/",
            true,
        ),
    ];

    #[test]
    fn url_helpers_match_recorded_renderer_outputs() {
        for (input, candidate, profile, allowed) in CASES {
            assert_eq!(
                normalize_candidate_url(input),
                *candidate,
                "candidate {input:?}"
            );
            assert_eq!(normalize_profile_url(input), *profile, "profile {input:?}");
            assert_eq!(
                is_allowed_linkedin_url(js_trim(input)),
                *allowed,
                "allowed {input:?}"
            );
        }
    }

    #[test]
    fn blank_input_normalizes_to_empty() {
        assert_eq!(normalize_candidate_url("  "), "");
        assert_eq!(normalize_profile_url("\u{FEFF}"), "");
    }
}
