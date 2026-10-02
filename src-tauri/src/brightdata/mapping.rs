//! Pure mapping from Bright Data LinkedIn post records to Source Imports rows.
//!
//! Records come from `pipelines linkedin_posts --json` (CLI) or a datasets v3
//! snapshot (direct). Only the fields the candidate pipeline needs are kept;
//! the rest of the record is discarded. A malformed or error record becomes a
//! rejected row with a reason; it never fails the whole batch. Records whose
//! URL is not a LinkedIn post URL are dropped.

use serde_json::{json, Map, Value};
use url::Url;

use crate::js_text::{js_trim, utf16_len, utf16_prefix};
use crate::js_url::{is_allowed_linkedin_url, normalize_profile_url};
use crate::source_imports::{SourceImportRowInput, SourceImportRowValue};

use super::RunMode;

const MAX_URL: usize = 1000;
const MAX_CONTENT: usize = 3000;
const MAX_AUTHOR_NAME: usize = 160;
const MAX_AUTHOR_URL: usize = 1000;
const MAX_POSTED_AT: usize = 80;
const MAX_URN: usize = 500;
const MAX_KEYWORD: usize = 80;
const MAX_REASON: usize = 500;

/// True for `https://<sub>.linkedin.com/posts/...` and
/// `https://<sub>.linkedin.com/feed/update/...` URLs.
pub(crate) fn is_linkedin_post_url(value: &str) -> bool {
    let trimmed = js_trim(value);
    if !is_allowed_linkedin_url(trimmed) {
        return false;
    }
    let Ok(url) = Url::parse(trimmed) else {
        return false;
    };
    let path = url.path();
    path.starts_with("/posts/") || path.starts_with("/feed/update/")
}

fn string_field<'a>(record: &'a Map<String, Value>, key: &str) -> Option<&'a str> {
    record
        .get(key)
        .and_then(Value::as_str)
        .map(js_trim)
        .filter(|value| !value.is_empty())
}

fn bounded(value: &str, max: usize) -> String {
    utf16_prefix(js_trim(value), max).to_string()
}

/// `urn:li:activity:<id>` when the record id is a LinkedIn activity number.
fn activity_urn(record: &Map<String, Value>) -> String {
    match string_field(record, "id") {
        Some(id) if id.len() <= 40 && id.bytes().all(|byte| byte.is_ascii_digit()) => {
            format!("urn:li:activity:{id}")
        }
        _ => String::new(),
    }
}

fn author_profile_url(record: &Map<String, Value>) -> String {
    string_field(record, "use_url")
        .filter(|value| is_allowed_linkedin_url(value))
        .map(normalize_profile_url)
        .filter(|value| utf16_len(value) <= MAX_AUTHOR_URL)
        .unwrap_or_default()
}

fn rejected(row_number: i64, audit: Value, reason: &str) -> SourceImportRowInput {
    SourceImportRowInput {
        row_number,
        input_json: audit.to_string(),
        value: None,
        validation_error: bounded(reason, MAX_REASON),
    }
}

/// Maps one record. `None` means the record is dropped (not a LinkedIn post).
fn map_record(
    record: &Value,
    row_number: i64,
    mode: RunMode,
    source_keyword: &str,
) -> Option<SourceImportRowInput> {
    let Some(record) = record.as_object() else {
        return Some(rejected(
            row_number,
            json!({ "connector": "brightdata", "invalid": "not_an_object" }),
            "Bright Data record is not an object",
        ));
    };
    let url = string_field(record, "url")
        .or_else(|| {
            record
                .get("input")
                .and_then(Value::as_object)
                .and_then(|input| string_field(input, "url"))
        })
        .unwrap_or_default();
    if !is_linkedin_post_url(url) {
        return None;
    }
    if utf16_len(url) > MAX_URL {
        return Some(rejected(
            row_number,
            json!({ "connector": "brightdata", "url": utf16_prefix(url, MAX_URL) }),
            "LinkedIn post URL is too long",
        ));
    }
    if let Some(error) = string_field(record, "error") {
        let code = string_field(record, "error_code").unwrap_or("error");
        return Some(rejected(
            row_number,
            json!({ "connector": "brightdata", "url": url, "errorCode": bounded(code, 80) }),
            &format!("Bright Data could not collect this post ({code}): {error}"),
        ));
    }
    let content = match record.get("post_text") {
        Some(Value::String(text)) if !js_trim(text).is_empty() => bounded(text, MAX_CONTENT),
        Some(Value::String(_)) | None | Some(Value::Null) => {
            return Some(rejected(
                row_number,
                json!({ "connector": "brightdata", "url": url }),
                "Bright Data record has no post text",
            ));
        }
        Some(_) => {
            return Some(rejected(
                row_number,
                json!({ "connector": "brightdata", "url": url }),
                "Bright Data post text is not a string",
            ));
        }
    };
    let value = SourceImportRowValue {
        url: url.to_string(),
        content,
        // `user_name` is the display name in live records; `user_id` (the
        // profile slug) is the fallback.
        author_name: string_field(record, "user_name")
            .or_else(|| string_field(record, "user_id"))
            .map(|value| bounded(value, MAX_AUTHOR_NAME))
            .unwrap_or_default(),
        author_profile_url: author_profile_url(record),
        posted_at: string_field(record, "date_posted")
            .filter(|value| utf16_len(value) <= MAX_POSTED_AT)
            .map(str::to_string),
        platform_resource_urn: bounded(&activity_urn(record), MAX_URN),
        source_keyword: bounded(source_keyword, MAX_KEYWORD),
        notes: format!("brightdata:{}", mode.as_str()),
    };
    let audit = json!({
        "url": value.url,
        "content": value.content,
        "authorName": value.author_name,
        "authorProfileUrl": value.author_profile_url,
        "postedAt": value.posted_at,
        "platformResourceUrn": value.platform_resource_urn,
        "sourceKeyword": value.source_keyword,
        "notes": value.notes,
    });
    let input_json = audit.to_string();
    Some(SourceImportRowInput {
        row_number,
        input_json: if utf16_len(&input_json) <= 20_000 {
            input_json
        } else {
            json!({ "connector": "brightdata", "url": value.url, "truncated": true }).to_string()
        },
        value: Some(value),
        validation_error: String::new(),
    })
}

/// Maps records to numbered rows, dropping non-post records and keeping at
/// most `limit` rows. Row numbers are contiguous from 1.
pub(crate) fn map_records(
    records: &[Value],
    mode: RunMode,
    source_keyword: &str,
    limit: usize,
) -> Vec<SourceImportRowInput> {
    let mut rows = Vec::new();
    for record in records {
        if rows.len() >= limit {
            break;
        }
        let next_number = i64::try_from(rows.len() + 1).unwrap_or(i64::MAX);
        if let Some(row) = map_record(record, next_number, mode, source_keyword) {
            rows.push(row);
        }
    }
    rows
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_body(raw: &str) -> Value {
        let value: Value = serde_json::from_str(raw).unwrap();
        assert_eq!(value["_provisional"], Value::Bool(true));
        value["body"].clone()
    }

    fn pipelines_records() -> Vec<Value> {
        fixture_body(include_str!("fixtures/cli_pipelines_linkedin_posts.json"))
            .as_array()
            .unwrap()
            .clone()
    }

    fn live_body(raw: &str) -> Vec<Value> {
        let value: Value = serde_json::from_str(raw).unwrap();
        assert!(value.get("_provisional").is_none());
        value["body"].as_array().unwrap().clone()
    }

    #[test]
    fn maps_live_cli_capture() {
        let records = live_body(include_str!(
            "fixtures/live_cli_pipelines_linkedin_posts.json"
        ));
        let rows = map_records(&records, RunMode::PostUrl, "", 20);
        assert_eq!(rows.len(), 1);
        let row = rows[0].value.as_ref().unwrap();
        assert_eq!(
            row.url,
            "https://www.linkedin.com/posts/bright-data_bright-data-x-calven-ai-activity-7508842671566815232-KJCW"
        );
        assert_eq!(row.author_name, "Bright Data");
        assert_eq!(
            row.author_profile_url,
            "https://il.linkedin.com/company/bright-data"
        );
        assert_eq!(
            row.platform_resource_urn,
            "urn:li:activity:7508842671566815232"
        );
        assert_eq!(row.posted_at.as_deref(), Some("2026-09-24T11:00:00.451Z"));
        assert!(!row.content.is_empty());
    }

    #[test]
    fn maps_live_company_snapshot_capture() {
        let records = live_body(include_str!("fixtures/live_direct_snapshot_company.json"));
        let rows = map_records(&records, RunMode::Watchlist, "Bright Data", 20);
        assert_eq!(rows.len(), 3);
        for row in &rows {
            let value = row.value.as_ref().expect("live records map cleanly");
            assert!(is_linkedin_post_url(&value.url));
            assert_eq!(value.author_name, "Bright Data");
            assert!(value.platform_resource_urn.starts_with("urn:li:activity:"));
            assert_eq!(value.notes, "brightdata:watchlist");
        }
    }

    #[test]
    fn maps_cli_pipeline_fixture_into_rows() {
        let rows = map_records(&pipelines_records(), RunMode::PostUrl, "ai agents", 20);
        assert_eq!(rows.len(), 3);
        let first = rows[0].value.as_ref().unwrap();
        assert_eq!(
            first.url,
            "https://www.linkedin.com/posts/synthetic-author-one_ai-agents-activity-7300000000000000001-AbCd"
        );
        assert!(first.content.starts_with("Shipping an agent is easy."));
        assert_eq!(first.author_name, "synthetic-author-one");
        assert_eq!(
            first.author_profile_url,
            "https://www.linkedin.com/in/synthetic-author-one"
        );
        assert_eq!(first.posted_at.as_deref(), Some("2026-09-28T09:15:00.000Z"));
        assert_eq!(
            first.platform_resource_urn,
            "urn:li:activity:7300000000000000001"
        );
        assert_eq!(first.source_keyword, "ai agents");
        assert_eq!(first.notes, "brightdata:post_url");
        let audit: Value = serde_json::from_str(&rows[0].input_json).unwrap();
        assert_eq!(audit["notes"], "brightdata:post_url");
        assert!(audit.get("num_likes").is_none());

        assert_eq!(
            rows[1].value.as_ref().unwrap().author_profile_url,
            "https://de.linkedin.com/company/synthetic-company"
        );

        assert!(rows[2].value.is_none());
        assert!(rows[2].validation_error.contains("dead_page"));
        assert_eq!(
            rows.iter().map(|row| row.row_number).collect::<Vec<_>>(),
            vec![1, 2, 3]
        );
    }

    #[test]
    fn maps_direct_snapshot_fixture_and_rejects_empty_text() {
        let records = fixture_body(include_str!("fixtures/direct_snapshot_discover.json"));
        let rows = map_records(
            records.as_array().unwrap(),
            RunMode::Watchlist,
            "Watchlist",
            20,
        );
        // The error record's input URL is a company page, not a post: dropped.
        assert_eq!(rows.len(), 2);
        assert_eq!(
            rows[0].value.as_ref().unwrap().notes,
            "brightdata:watchlist"
        );
        assert!(rows[1].value.is_none());
        assert_eq!(
            rows[1].validation_error,
            "Bright Data record has no post text"
        );
    }

    #[test]
    fn drops_non_post_urls_and_respects_limit() {
        let records = vec![
            json!({ "url": "https://www.example.com/posts/x", "post_text": "a" }),
            json!({ "url": "http://www.linkedin.com/posts/x", "post_text": "a" }),
            json!({ "url": "https://www.linkedin.com/in/someone", "post_text": "a" }),
            json!({ "url": "https://www.linkedin.com/posts/a", "post_text": "one" }),
            json!({ "url": "https://www.linkedin.com/feed/update/urn:li:activity:1", "post_text": "two" }),
            json!({ "url": "https://www.linkedin.com/posts/c", "post_text": "three" }),
        ];
        let rows = map_records(&records, RunMode::PostUrl, "q", 2);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[1].row_number, 2);
        assert_eq!(rows[1].value.as_ref().unwrap().content, "two");
    }

    #[test]
    fn truncates_fields_to_source_import_limits() {
        let long_text = "é".repeat(MAX_CONTENT + 50);
        let records = vec![json!({
            "url": "https://www.linkedin.com/posts/a",
            "post_text": long_text,
            "user_id": "u".repeat(400),
            "date_posted": "x".repeat(200),
            "id": "not-numeric",
            "use_url": "https://evil.example/in/x",
        })];
        let rows = map_records(&records, RunMode::Watchlist, &"k".repeat(200), 20);
        let value = rows[0].value.as_ref().unwrap();
        assert_eq!(utf16_len(&value.content), MAX_CONTENT);
        assert_eq!(utf16_len(&value.author_name), MAX_AUTHOR_NAME);
        assert_eq!(utf16_len(&value.source_keyword), MAX_KEYWORD);
        assert_eq!(value.posted_at, None);
        assert_eq!(value.platform_resource_urn, "");
        assert_eq!(value.author_profile_url, "");
    }

    #[test]
    fn malformed_records_fail_the_row_not_the_batch() {
        let records = vec![
            json!("not an object"),
            json!({ "url": "https://www.linkedin.com/posts/a", "post_text": 42 }),
            json!({ "url": "https://www.linkedin.com/posts/b", "post_text": "ok" }),
        ];
        let rows = map_records(&records, RunMode::PostUrl, "", 20);
        assert_eq!(rows.len(), 3);
        assert_eq!(
            rows[0].validation_error,
            "Bright Data record is not an object"
        );
        assert_eq!(
            rows[1].validation_error,
            "Bright Data post text is not a string"
        );
        assert!(rows[2].value.is_some());
        assert!(rows
            .iter()
            .all(|row| { row.value.is_some() || !row.validation_error.trim().is_empty() }));
    }

    #[test]
    fn post_url_detection() {
        assert!(is_linkedin_post_url(
            "https://de.linkedin.com/posts/x_activity-1"
        ));
        assert!(is_linkedin_post_url(
            "https://www.linkedin.com/feed/update/urn:li:activity:1/"
        ));
        assert!(!is_linkedin_post_url("https://www.linkedin.com/in/x"));
        assert!(!is_linkedin_post_url(
            "https://linkedin.com.evil.example/posts/x"
        ));
        assert!(!is_linkedin_post_url("not a url"));
    }
}
