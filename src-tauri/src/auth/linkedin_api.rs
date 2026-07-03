use reqwest::{
    header::{HeaderMap, CONTENT_TYPE},
    StatusCode,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::redact_error;

const LINKEDIN_USERINFO_ENDPOINT: &str = "https://api.linkedin.com/v2/userinfo";
const LINKEDIN_UGC_POSTS_ENDPOINT: &str = "https://api.linkedin.com/v2/ugcPosts";
pub const LINKEDIN_SOCIAL_ACTIONS_ENDPOINT_BASE: &str =
    "https://api.linkedin.com/rest/socialActions";
pub const LINKEDIN_DEFAULT_MARKETING_VERSION: &str = "202606";
const LINKEDIN_MAX_COMMENTARY_CHARS: usize = 3000;
const LINKEDIN_MAX_COMMENT_TEXT_CHARS: usize = 1250;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LinkedInUserInfo {
    pub sub: String,
    pub name: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LinkedInPublishResult {
    pub platform_post_id: String,
    pub external_post_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LinkedInPublishCommentResult {
    pub platform_comment_id: String,
    pub platform_comment_urn: String,
    pub external_comment_url: String,
}

#[derive(Debug, Deserialize)]
struct LinkedInUserInfoResponse {
    sub: String,
    name: Option<String>,
    email: Option<String>,
}

pub fn userinfo_response_to_userinfo(value: Value) -> Result<LinkedInUserInfo, String> {
    let response: LinkedInUserInfoResponse = serde_json::from_value(value).map_err(redact_error)?;
    let sub = response.sub.trim().to_string();
    if sub.is_empty() {
        return Err("LinkedIn userinfo response did not include a member id".to_string());
    }
    Ok(LinkedInUserInfo {
        sub,
        name: response.name.filter(|value| !value.trim().is_empty()),
        email: response.email.filter(|value| !value.trim().is_empty()),
    })
}

pub fn linked_in_account_label(userinfo: &LinkedInUserInfo) -> String {
    userinfo
        .name
        .as_ref()
        .or(userinfo.email.as_ref())
        .cloned()
        .unwrap_or_else(|| "LinkedIn member".to_string())
}

pub fn linkedin_marketing_version() -> String {
    std::env::var("LINKGO_LINKEDIN_VERSION")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| LINKEDIN_DEFAULT_MARKETING_VERSION.to_string())
}

pub fn validate_linkedin_commentary(commentary: &str) -> Result<(), String> {
    if commentary.trim().is_empty() {
        return Err("LinkedIn post text is required".to_string());
    }
    if commentary.chars().count() > LINKEDIN_MAX_COMMENTARY_CHARS {
        return Err("LinkedIn post text must be 3000 characters or fewer".to_string());
    }
    Ok(())
}

pub fn validate_linkedin_comment_text(commentary: &str) -> Result<(), String> {
    if commentary.trim().is_empty() {
        return Err("LinkedIn comment text is required".to_string());
    }
    if commentary.chars().count() > LINKEDIN_MAX_COMMENT_TEXT_CHARS {
        return Err("LinkedIn comment text must be 1250 characters or fewer".to_string());
    }
    Ok(())
}

pub fn build_member_post_payload(account_id: &str, commentary: &str) -> Result<Value, String> {
    let account_id = account_id.trim();
    if account_id.is_empty() {
        return Err("LinkedIn member id is required".to_string());
    }
    validate_linkedin_commentary(commentary)?;

    Ok(json!({
        "author": format!("urn:li:person:{account_id}"),
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {
                    "text": commentary
                },
                "shareMediaCategory": "NONE",
                "media": []
            }
        },
        "visibility": {
            "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
        }
    }))
}

pub fn build_member_comment_payload(
    account_id: &str,
    target_urn: &str,
    commentary: &str,
) -> Result<Value, String> {
    let account_id = account_id.trim();
    let target_urn = target_urn.trim();
    if account_id.is_empty() {
        return Err("LinkedIn member id is required".to_string());
    }
    if resolve_linkedin_target_urn(target_urn).is_none() {
        return Err("LinkedIn target URN could not be resolved from the candidate URL".to_string());
    }
    validate_linkedin_comment_text(commentary)?;

    Ok(json!({
        "actor": format!("urn:li:person:{account_id}"),
        "object": target_urn,
        "message": {
            "text": commentary
        }
    }))
}

fn linked_in_post_url(platform_post_id: &str) -> String {
    let trimmed = platform_post_id.trim();
    if trimmed.is_empty() {
        String::new()
    } else {
        format!("https://www.linkedin.com/feed/update/{trimmed}/")
    }
}

fn linked_in_comment_url(target_urn: &str) -> String {
    let trimmed = target_urn.trim();
    if trimmed.is_empty() {
        String::new()
    } else {
        format!("https://www.linkedin.com/feed/update/{trimmed}/")
    }
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut output = String::with_capacity(input.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let Ok(value) = u8::from_str_radix(&input[index + 1..index + 3], 16) {
                output.push(value as char);
                index += 3;
                continue;
            }
        }
        output.push(bytes[index] as char);
        index += 1;
    }
    output
}

fn decode_repeatedly(input: &str) -> String {
    let mut decoded = input.trim().to_string();
    for _ in 0..3 {
        let next = percent_decode(&decoded);
        if next == decoded {
            return decoded;
        }
        decoded = next;
    }
    decoded
}

fn find_urn_candidate(value: &str) -> Option<String> {
    let decoded = decode_repeatedly(value);
    for prefix in ["urn:li:ugcPost:", "urn:li:share:", "urn:li:activity:"] {
        if let Some(start) = decoded.find(prefix) {
            let tail = &decoded[start + prefix.len()..];
            let id: String = tail
                .chars()
                .take_while(|character| {
                    character.is_ascii_alphanumeric() || *character == '_' || *character == '-'
                })
                .collect();
            if !id.is_empty() {
                return Some(format!("{prefix}{id}"));
            }
        }
    }

    if let Some(start) = decoded.to_ascii_lowercase().find("activity-") {
        let tail = &decoded[start + "activity-".len()..];
        let id: String = tail
            .chars()
            .take_while(|character| character.is_ascii_digit())
            .collect();
        if !id.is_empty() {
            return Some(format!("urn:li:activity:{id}"));
        }
    }

    None
}

pub fn resolve_linkedin_target_urn(candidate: &str) -> Option<String> {
    let trimmed = candidate.trim();
    if trimmed.is_empty() {
        return None;
    }
    find_urn_candidate(trimmed)
}

fn encode_path_urn(target_urn: &str) -> String {
    target_urn.replace(':', "%3A")
}

fn linked_in_api_error(status: StatusCode, body: &str) -> String {
    let message = linked_in_api_message(body)
        .map(redact_error)
        .filter(|message| !message.trim().is_empty())
        .unwrap_or_else(|| "No response details were provided".to_string());

    format!("LinkedIn API request failed with HTTP {status}: {message}")
}

fn linked_in_api_message(body: &str) -> Option<String> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        return ["message", "error_description", "error", "serviceErrorCode"]
            .iter()
            .find_map(|key| {
                value.get(key).and_then(|field| {
                    field
                        .as_str()
                        .map(str::trim)
                        .filter(|message| !message.is_empty())
                        .map(ToString::to_string)
                        .or_else(|| {
                            field
                                .as_i64()
                                .map(|code| format!("LinkedIn service error code {code}"))
                        })
                })
            });
    }

    Some(trimmed.chars().take(500).collect())
}

pub fn extract_publish_result(
    headers: &HeaderMap,
    body: &str,
) -> Result<LinkedInPublishResult, String> {
    let header_id = headers
        .get("x-restli-id")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .trim()
        .to_string();

    let body_id = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| {
            value
                .get("id")
                .and_then(Value::as_str)
                .or_else(|| value.get("value").and_then(Value::as_str))
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
        })
        .unwrap_or_default();

    let platform_post_id = if header_id.is_empty() {
        body_id
    } else {
        header_id
    };

    if platform_post_id.is_empty() {
        return Err("LinkedIn publish response did not include a post id".to_string());
    }

    Ok(LinkedInPublishResult {
        external_post_url: linked_in_post_url(&platform_post_id),
        platform_post_id,
    })
}

pub fn extract_comment_publish_result(
    headers: &HeaderMap,
    body: &str,
    target_urn: &str,
) -> Result<LinkedInPublishCommentResult, String> {
    let header_id = headers
        .get("x-restli-id")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .trim()
        .to_string();

    let body_value = serde_json::from_str::<Value>(body).ok();
    let body_id = body_value
        .as_ref()
        .and_then(|value| value.get("id").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .unwrap_or_default();
    let body_urn = body_value
        .as_ref()
        .and_then(|value| value.get("commentUrn").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
        .unwrap_or_default();

    let platform_comment_id = if !header_id.is_empty() {
        header_id
    } else if !body_id.is_empty() {
        body_id
    } else {
        body_urn.clone()
    };

    if platform_comment_id.is_empty() {
        return Err("LinkedIn comment response did not include a comment id".to_string());
    }

    Ok(LinkedInPublishCommentResult {
        platform_comment_urn: if body_urn.is_empty() {
            platform_comment_id.clone()
        } else {
            body_urn
        },
        platform_comment_id,
        external_comment_url: linked_in_comment_url(target_urn),
    })
}

pub fn get_linkedin_userinfo(access_token: &str) -> Result<LinkedInUserInfo, String> {
    let response = reqwest::blocking::Client::new()
        .get(LINKEDIN_USERINFO_ENDPOINT)
        .bearer_auth(access_token)
        .send()
        .map_err(redact_error)?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().unwrap_or_default();
        return Err(linked_in_api_error(status, &error_text));
    }

    let userinfo = response.json::<Value>().map_err(redact_error)?;

    userinfo_response_to_userinfo(userinfo)
}

pub fn publish_linkedin_member_post(
    access_token: &str,
    account_id: &str,
    commentary: &str,
) -> Result<LinkedInPublishResult, String> {
    let payload = build_member_post_payload(account_id, commentary)?;
    let response = reqwest::blocking::Client::new()
        .post(LINKEDIN_UGC_POSTS_ENDPOINT)
        .bearer_auth(access_token)
        .header("X-Restli-Protocol-Version", "2.0.0")
        .header(CONTENT_TYPE, "application/json")
        .json(&payload)
        .send()
        .map_err(redact_error)?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().unwrap_or_default();
        return Err(linked_in_api_error(status, &error_text));
    }

    let headers = response.headers().clone();
    let body = response.text().map_err(redact_error)?;
    extract_publish_result(&headers, &body)
}

pub fn publish_linkedin_member_comment(
    access_token: &str,
    account_id: &str,
    target_urn: &str,
    commentary: &str,
) -> Result<LinkedInPublishCommentResult, String> {
    let payload = build_member_comment_payload(account_id, target_urn, commentary)?;
    let endpoint = format!(
        "{}/{}/comments",
        LINKEDIN_SOCIAL_ACTIONS_ENDPOINT_BASE,
        encode_path_urn(target_urn)
    );
    let response = reqwest::blocking::Client::new()
        .post(endpoint)
        .bearer_auth(access_token)
        .header("Linkedin-Version", linkedin_marketing_version())
        .header("X-Restli-Protocol-Version", "2.0.0")
        .header(CONTENT_TYPE, "application/json")
        .json(&payload)
        .send()
        .map_err(redact_error)?;

    let status = response.status();
    if !status.is_success() {
        let error_text = response.text().unwrap_or_default();
        return Err(linked_in_api_error(status, &error_text));
    }

    let headers = response.headers().clone();
    let body = response.text().map_err(redact_error)?;
    extract_comment_publish_result(&headers, &body, target_urn)
}

#[cfg(test)]
mod tests {
    use reqwest::header::{HeaderMap, HeaderValue};
    use serde_json::json;

    use super::{
        build_member_comment_payload, build_member_post_payload, extract_comment_publish_result,
        extract_publish_result, linked_in_account_label, linked_in_api_error,
        linkedin_marketing_version, resolve_linkedin_target_urn, userinfo_response_to_userinfo,
        validate_linkedin_comment_text, validate_linkedin_commentary,
    };

    #[test]
    fn userinfo_response_maps_sub_and_name() {
        let userinfo = userinfo_response_to_userinfo(json!({
            "sub": "abc123",
            "name": "Ada Lovelace",
            "email": "ada@example.com"
        }))
        .unwrap();

        assert_eq!(userinfo.sub, "abc123");
        assert_eq!(linked_in_account_label(&userinfo), "Ada Lovelace");
    }

    #[test]
    fn userinfo_label_falls_back_to_email_then_member() {
        let email_only = userinfo_response_to_userinfo(json!({
            "sub": "abc123",
            "email": "ada@example.com"
        }))
        .unwrap();
        let sub_only = userinfo_response_to_userinfo(json!({ "sub": "abc123" })).unwrap();

        assert_eq!(linked_in_account_label(&email_only), "ada@example.com");
        assert_eq!(linked_in_account_label(&sub_only), "LinkedIn member");
    }

    #[test]
    fn publish_payload_contains_member_author_and_public_text_post_shape() {
        let payload = build_member_post_payload("person-1", "Hello LinkedIn").unwrap();

        assert_eq!(payload["author"], "urn:li:person:person-1");
        assert_eq!(payload["lifecycleState"], "PUBLISHED");
        assert_eq!(
            payload["specificContent"]["com.linkedin.ugc.ShareContent"]["shareCommentary"]["text"],
            "Hello LinkedIn"
        );
        assert_eq!(
            payload["specificContent"]["com.linkedin.ugc.ShareContent"]["shareMediaCategory"],
            "NONE"
        );
        assert_eq!(
            payload["visibility"]["com.linkedin.ugc.MemberNetworkVisibility"],
            "PUBLIC"
        );
    }

    #[test]
    fn publish_rejects_empty_or_over_limit_commentary() {
        assert!(validate_linkedin_commentary("   ").is_err());
        assert!(validate_linkedin_commentary(&"a".repeat(3001)).is_err());
        assert!(validate_linkedin_commentary(&"a".repeat(3000)).is_ok());
    }

    #[test]
    fn comment_payload_contains_actor_object_and_message() {
        let payload =
            build_member_comment_payload("person-1", "urn:li:ugcPost:123", "Thoughtful comment")
                .unwrap();

        assert_eq!(payload["actor"], "urn:li:person:person-1");
        assert_eq!(payload["object"], "urn:li:ugcPost:123");
        assert_eq!(payload["message"]["text"], "Thoughtful comment");
        assert_eq!(linkedin_marketing_version(), "202606");
    }

    #[test]
    fn comment_text_rejects_empty_or_over_limit_text() {
        assert!(validate_linkedin_comment_text("   ").is_err());
        assert!(validate_linkedin_comment_text(&"a".repeat(1251)).is_err());
        assert!(validate_linkedin_comment_text(&"a".repeat(1250)).is_ok());
    }

    #[test]
    fn target_urn_extraction_handles_encoded_feed_and_activity_urls() {
        assert_eq!(
            resolve_linkedin_target_urn(
                "https://www.linkedin.com/feed/update/urn%3Ali%3AugcPost%3A123/"
            )
            .as_deref(),
            Some("urn:li:ugcPost:123")
        );
        assert_eq!(
            resolve_linkedin_target_urn(
                "https://www.linkedin.com/posts/example_activity-456-share-abc"
            )
            .as_deref(),
            Some("urn:li:activity:456")
        );
        assert_eq!(
            resolve_linkedin_target_urn("https://www.linkedin.com/feed/update/urn:li:share:789/")
                .as_deref(),
            Some("urn:li:share:789")
        );
        assert_eq!(
            resolve_linkedin_target_urn("urn:li:activity:1001").as_deref(),
            Some("urn:li:activity:1001")
        );
        assert_eq!(
            resolve_linkedin_target_urn("urn%3Ali%3Aactivity%3A1001").as_deref(),
            Some("urn:li:activity:1001")
        );
    }

    #[test]
    fn api_error_includes_status_and_safe_linkedin_message() {
        let error = linked_in_api_error(
            reqwest::StatusCode::TOO_MANY_REQUESTS,
            r#"{"message":"Resource level throttle limit reached"}"#,
        );

        assert_eq!(
            error,
            "LinkedIn API request failed with HTTP 429 Too Many Requests: Resource level throttle limit reached"
        );
    }

    #[test]
    fn api_error_keeps_status_when_secret_message_is_redacted() {
        let error = linked_in_api_error(
            reqwest::StatusCode::UNAUTHORIZED,
            r#"{"message":"access token abc failed"}"#,
        );

        assert_eq!(
            error,
            "LinkedIn API request failed with HTTP 401 Unauthorized: Credential operation failed; secret details were redacted"
        );
    }

    #[test]
    fn publish_result_prefers_restli_id_header() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-restli-id",
            HeaderValue::from_static("urn:li:ugcPost:from-header"),
        );

        let result =
            extract_publish_result(&headers, r#"{"id":"urn:li:ugcPost:from-body"}"#).unwrap();

        assert_eq!(result.platform_post_id, "urn:li:ugcPost:from-header");
        assert_eq!(
            result.external_post_url,
            "https://www.linkedin.com/feed/update/urn:li:ugcPost:from-header/"
        );
    }

    #[test]
    fn publish_result_rejects_missing_post_id() {
        let headers = HeaderMap::new();

        let error = extract_publish_result(&headers, r#"{"status":"ok"}"#).unwrap_err();

        assert_eq!(error, "LinkedIn publish response did not include a post id");
    }

    #[test]
    fn comment_result_prefers_restli_id_then_body_fields() {
        let mut headers = HeaderMap::new();
        headers.insert("x-restli-id", HeaderValue::from_static("header-comment"));
        let from_header = extract_comment_publish_result(
            &headers,
            r#"{"id":"body-comment","commentUrn":"urn:li:comment:(urn:li:ugcPost:1,body-comment)"}"#,
            "urn:li:ugcPost:1",
        )
        .unwrap();
        assert_eq!(from_header.platform_comment_id, "header-comment");
        assert_eq!(
            from_header.platform_comment_urn,
            "urn:li:comment:(urn:li:ugcPost:1,body-comment)"
        );

        let no_headers = HeaderMap::new();
        let from_id = extract_comment_publish_result(
            &no_headers,
            r#"{"id":"body-comment"}"#,
            "urn:li:ugcPost:1",
        )
        .unwrap();
        assert_eq!(from_id.platform_comment_id, "body-comment");

        let from_urn = extract_comment_publish_result(
            &no_headers,
            r#"{"commentUrn":"urn:li:comment:(urn:li:ugcPost:1,urn-only)"}"#,
            "urn:li:ugcPost:1",
        )
        .unwrap();
        assert_eq!(
            from_urn.platform_comment_id,
            "urn:li:comment:(urn:li:ugcPost:1,urn-only)"
        );
        assert_eq!(
            from_urn.external_comment_url,
            "https://www.linkedin.com/feed/update/urn:li:ugcPost:1/"
        );
    }
}
