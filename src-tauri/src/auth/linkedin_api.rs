use reqwest::{
    header::{HeaderMap, CONTENT_TYPE},
    StatusCode,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::redact_error;

const LINKEDIN_USERINFO_ENDPOINT: &str = "https://api.linkedin.com/v2/userinfo";
const LINKEDIN_UGC_POSTS_ENDPOINT: &str = "https://api.linkedin.com/v2/ugcPosts";
const LINKEDIN_MAX_COMMENTARY_CHARS: usize = 3000;

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

pub fn validate_linkedin_commentary(commentary: &str) -> Result<(), String> {
    if commentary.trim().is_empty() {
        return Err("LinkedIn post text is required".to_string());
    }
    if commentary.chars().count() > LINKEDIN_MAX_COMMENTARY_CHARS {
        return Err("LinkedIn post text must be 3000 characters or fewer".to_string());
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

fn linked_in_post_url(platform_post_id: &str) -> String {
    let trimmed = platform_post_id.trim();
    if trimmed.is_empty() {
        String::new()
    } else {
        format!("https://www.linkedin.com/feed/update/{trimmed}/")
    }
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

#[cfg(test)]
mod tests {
    use reqwest::header::{HeaderMap, HeaderValue};
    use serde_json::json;

    use super::{
        build_member_post_payload, extract_publish_result, linked_in_account_label,
        linked_in_api_error, userinfo_response_to_userinfo, validate_linkedin_commentary,
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
}
