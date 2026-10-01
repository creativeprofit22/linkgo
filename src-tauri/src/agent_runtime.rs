use std::{
    collections::HashSet,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

#[path = "agent_codex.rs"]
mod agent_codex;

use crate::auth::{
    ai_oauth::AiOAuthProvider,
    claude_code_version::{claude_cli_user_agent, note_required_claude_code_version},
    refresh::{
        ensure_fresh_ai_credential, reconnect_message, CredentialStore, OAuthRefreshLocks,
        RefreshEndpoints, RefreshMode,
    },
    storage::AuthStorage,
    unix_timestamp, OAuthCredentials, StoredCredential,
};
use crate::net::destination::{validate_provider_destination, LocalConsent};
use crate::net::transport::{
    provider_http_client, read_bounded_json, truncate_error_message, TransportPolicy,
    PROVIDER_MAX_RESPONSE_BYTES,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentProviderStreamInput {
    pub provider_key: String,
    pub model_name: String,
    pub request: AgentModelRequestInput,
    pub tools: Vec<AgentProviderToolSelectionInput>,
    pub tool_choice: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentModelRequestInput {
    pub messages: Vec<AgentMessageInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentMessageInput {
    pub role: String,
    pub content: String,
    pub tool_name: Option<String>,
    pub provider_tool_call_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProviderToolSelectionInput {
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProviderToolDefinitionInput {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProviderStreamResult {
    pub chunks: Vec<Value>,
}

const GEMINI_CODE_ASSIST_BASE_URL: &str = "https://cloudcode-pa.googleapis.com";
const GEMINI_CODE_ASSIST_VERSION: &str = "v1internal";
const GEMINI_CLI_USER_AGENT: &str = "google-gemini-cli";
const GEMINI_CLI_API_CLIENT: &str = "gemini-cli/0.0.0";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProviderTransport {
    OpenAiCompatible,
    AnthropicCompatible,
    GeminiCodeAssist,
}

fn provider_transport(provider_key: &str) -> Option<ProviderTransport> {
    match provider_key {
        "anthropic" | "minimax" => Some(ProviderTransport::AnthropicCompatible),
        "gemini" => Some(ProviderTransport::GeminiCodeAssist),
        "xiaomi" | "openai" | "glm" | "moonshot" | "deepseek" | "openrouter" | "sakana"
        | "custom" => Some(ProviderTransport::OpenAiCompatible),
        _ => None,
    }
}

fn default_base_url(provider_key: &str) -> Option<&'static str> {
    match provider_key {
        "anthropic" => Some("https://api.anthropic.com"),
        "xiaomi" => Some("https://token-plan-sgp.xiaomimimo.com/v1"),
        "openai" => Some("https://api.openai.com/v1"),
        "glm" => Some("https://api.z.ai/api/coding/paas/v4"),
        "moonshot" => Some("https://api.moonshot.ai/v1"),
        "deepseek" => Some("https://api.deepseek.com/v1"),
        "openrouter" => Some("https://openrouter.ai/api/v1"),
        "sakana" => Some("https://api.sakana.ai/v1"),
        "minimax" => Some("https://api.minimax.io/anthropic"),
        _ => None,
    }
}

/// A provider Base URL that passed the destination policy at execution time,
/// plus the transport permissions it grants.
#[derive(Debug, Clone, PartialEq, Eq)]
struct ProviderEndpoint {
    base_url: String,
    policy: TransportPolicy,
}

/// Re-validates the stored Base URL (or the built-in default) right before a
/// request carries the API key. Values saved by older builds without consent
/// fail closed with an actionable error instead of silently falling back.
fn resolve_endpoint(
    stored_base_url: Option<&str>,
    default_url: Option<&str>,
    allow_local_destination: bool,
) -> Result<ProviderEndpoint, String> {
    let stored = stored_base_url
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let consent = if stored.is_some() {
        LocalConsent::from_flag(allow_local_destination)
    } else {
        LocalConsent::Denied
    };
    let raw = stored
        .or(default_url)
        .ok_or_else(|| "Provider execution requires a Base URL override".to_string())?;
    let destination =
        validate_provider_destination(raw, consent).map_err(|error| error.to_string())?;
    Ok(ProviderEndpoint {
        policy: TransportPolicy::for_destination(&destination, consent),
        base_url: destination.as_str().to_string(),
    })
}

fn provider_endpoint(
    provider_key: &str,
    stored_base_url: Option<&str>,
    allow_local_destination: bool,
) -> Result<ProviderEndpoint, String> {
    resolve_endpoint(
        stored_base_url,
        default_base_url(provider_key),
        allow_local_destination,
    )
}

fn completions_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/chat/completions")
    }
}

fn anthropic_messages_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/v1/messages") || trimmed.ends_with("/messages") {
        trimmed.to_string()
    } else if trimmed.ends_with("/v1") {
        format!("{trimmed}/messages")
    } else {
        format!("{trimmed}/v1/messages")
    }
}

fn gemini_code_assist_url(base_url: &str) -> String {
    let base_url = base_url.trim().trim_end_matches('/');
    if base_url.ends_with(":generateContent") {
        base_url.to_string()
    } else if base_url.ends_with(GEMINI_CODE_ASSIST_VERSION) {
        format!("{base_url}:generateContent")
    } else {
        format!("{base_url}/{GEMINI_CODE_ASSIST_VERSION}:generateContent")
    }
}

fn to_openai_role(role: &str) -> &str {
    match role {
        "system" | "assistant" | "user" => role,
        "tool" => "user",
        _ => "user",
    }
}

fn tool_payloads(tools: &[AgentProviderToolDefinitionInput]) -> Vec<Value> {
    tools
        .iter()
        .map(|tool| {
            json!({
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.input_schema,
                },
            })
        })
        .collect()
}

const SCORE_RELEVANCE_INPUT_SCHEMA_JSON: &str =
    include_str!("../schemas/score_relevance.input.schema.json");
const DRAFT_POST_INPUT_SCHEMA_JSON: &str = include_str!("../schemas/draft_post.input.schema.json");
const AUDIT_POST_INPUT_SCHEMA_JSON: &str = include_str!("../schemas/audit_post.input.schema.json");

fn score_relevance_input_schema() -> Value {
    serde_json::from_str(SCORE_RELEVANCE_INPUT_SCHEMA_JSON)
        .expect("bundled score_relevance input schema should be valid JSON")
}

fn draft_post_input_schema() -> Value {
    serde_json::from_str(DRAFT_POST_INPUT_SCHEMA_JSON)
        .expect("bundled draft_post input schema should be valid JSON")
}

fn audit_post_input_schema() -> Value {
    serde_json::from_str(AUDIT_POST_INPUT_SCHEMA_JSON)
        .expect("bundled audit_post input schema should be valid JSON")
}

fn native_agent_tool_definitions() -> Vec<AgentProviderToolDefinitionInput> {
    vec![
        AgentProviderToolDefinitionInput {
            name: "research_posts".to_string(),
            description: "Collects operator-provided campaign context into local candidate summaries; it does not scrape LinkedIn.".to_string(),
            input_schema: json!({
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "campaignId": { "type": "integer", "minimum": 1 },
                    "workflowRunId": { "type": "integer", "minimum": 1 },
                    "keywords": {
                        "type": "array",
                        "items": { "type": "string", "minLength": 1, "maxLength": 80 },
                        "minItems": 1,
                        "maxItems": 12
                    },
                    "maxPosts": { "type": "integer", "minimum": 1, "maximum": 25, "default": 5 },
                    "notes": { "type": "string", "maxLength": 1000 }
                },
                "required": ["campaignId", "keywords"]
            }),
        },
        AgentProviderToolDefinitionInput {
            name: "score_relevance".to_string(),
            description: "Scores candidate IDs against campaign fit using validated local inputs and rationale output.".to_string(),
            input_schema: score_relevance_input_schema(),
        },
        AgentProviderToolDefinitionInput {
            name: "draft_post".to_string(),
            description: "Creates bounded draft variant structures for later human editing and review.".to_string(),
            input_schema: draft_post_input_schema(),
        },
        AgentProviderToolDefinitionInput {
            name: "audit_post".to_string(),
            description: "Validates and echoes six bounded provider-authored findings for an exact draft content revision and audit run.".to_string(),
            input_schema: audit_post_input_schema(),
        },
        AgentProviderToolDefinitionInput {
            name: "schedule_post".to_string(),
            description: "Requests a local schedule action behind human approval; it never publishes content.".to_string(),
            input_schema: json!({
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "campaignId": { "type": "integer", "minimum": 1 },
                    "approvalId": { "type": "integer", "minimum": 1 },
                    "scheduledFor": { "type": "string", "minLength": 1, "maxLength": 120 },
                    "timezone": { "type": "string", "minLength": 1, "maxLength": 80, "default": "local" }
                },
                "required": ["campaignId", "approvalId", "scheduledFor"]
            }),
        },
        AgentProviderToolDefinitionInput {
            name: "collect_metrics".to_string(),
            description: "Records the shape of a metric collection request without fetching external metrics.".to_string(),
            input_schema: json!({
                "type": "object",
                "additionalProperties": false,
                "properties": {
                    "campaignId": { "type": "integer", "minimum": 1 },
                    "approvalId": { "type": "integer", "minimum": 1 },
                    "publishAttemptId": { "type": "integer", "minimum": 1 },
                    "measuredAt": { "type": "string", "minLength": 1, "maxLength": 120 }
                },
                "required": ["campaignId", "approvalId", "measuredAt"]
            }),
        },
    ]
}

fn native_agent_provider_options(
    input: &AgentProviderStreamInput,
) -> (Vec<AgentProviderToolDefinitionInput>, Value) {
    let requested_tool_names = input
        .tools
        .iter()
        .map(|tool| tool.name.as_str())
        .collect::<HashSet<_>>();
    let tools = native_agent_tool_definitions()
        .into_iter()
        .filter(|tool| requested_tool_names.contains(tool.name.as_str()))
        .collect::<Vec<_>>();
    let allowed_tool_names = tools
        .iter()
        .map(|tool| tool.name.as_str())
        .collect::<HashSet<_>>();

    let tool_choice = match input.tool_choice.as_str() {
        Some("auto") if !tools.is_empty() => json!("auto"),
        Some("required") if !tools.is_empty() => json!("required"),
        Some("none") => json!("none"),
        _ => input
            .tool_choice
            .get("name")
            .and_then(Value::as_str)
            .filter(|name| allowed_tool_names.contains(name))
            .map(|name| json!({ "name": name }))
            .unwrap_or_else(|| json!("none")),
    };

    (tools, tool_choice)
}

fn openai_tool_choice(tool_choice: &Value) -> Value {
    match tool_choice.get("name").and_then(Value::as_str) {
        Some(name) => json!({
            "type": "function",
            "function": { "name": name },
        }),
        None => tool_choice.clone(),
    }
}

fn anthropic_tool_choice(tool_choice: &Value) -> Value {
    match tool_choice.as_str() {
        Some("auto") => json!({ "type": "auto" }),
        Some("none") => json!({ "type": "none" }),
        Some("required") => json!({ "type": "any" }),
        _ => match tool_choice.get("name").and_then(Value::as_str) {
            Some(name) => json!({ "type": "tool", "name": name }),
            None => json!({ "type": "auto" }),
        },
    }
}

fn gemini_tool_choice(tool_choice: &Value) -> Value {
    let function_calling_config = match tool_choice.as_str() {
        Some("auto") => json!({ "mode": "AUTO" }),
        Some("none") => json!({ "mode": "NONE" }),
        Some("required") => json!({ "mode": "ANY" }),
        _ => match tool_choice.get("name").and_then(Value::as_str) {
            Some(name) => json!({ "mode": "ANY", "allowedFunctionNames": [name] }),
            None => json!({ "mode": "AUTO" }),
        },
    };
    json!({ "functionCallingConfig": function_calling_config })
}

fn sanitize_gemini_schema(schema: &Value) -> Value {
    let mut clone = schema.clone();
    strip_gemini_unsupported_schema_fields(&mut clone);
    clone
}

fn strip_gemini_unsupported_schema_fields(value: &mut Value) {
    match value {
        Value::Object(map) => {
            map.remove("$schema");
            map.remove("additionalProperties");
            for child in map.values_mut() {
                strip_gemini_unsupported_schema_fields(child);
            }
        }
        Value::Array(items) => {
            for item in items {
                strip_gemini_unsupported_schema_fields(item);
            }
        }
        _ => {}
    }
}

fn response_message(response: &Value) -> Result<&Value, String> {
    response
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .ok_or_else(|| "Provider response did not include an assistant message".to_string())
}

fn content_part_text(part: &Value) -> Option<&str> {
    if part.get("type").and_then(Value::as_str) != Some("text") {
        return None;
    }
    part.get("text").and_then(Value::as_str)
}

fn message_text(message: &Value) -> Option<String> {
    if let Some(text) = message
        .get("content")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
    {
        return Some(text.to_string());
    }

    let text = message
        .get("content")
        .and_then(Value::as_array)?
        .iter()
        .filter_map(content_part_text)
        .collect::<Vec<_>>()
        .join("");
    if text.trim().is_empty() {
        None
    } else {
        Some(text.trim().to_string())
    }
}

fn parse_tool_arguments(arguments: Option<&Value>) -> Result<Value, String> {
    match arguments {
        Some(Value::String(arguments)) => {
            let trimmed = arguments.trim();
            if trimmed.is_empty() {
                Ok(json!({}))
            } else {
                serde_json::from_str::<Value>(trimmed)
                    .map_err(|_| "Provider tool call arguments were not valid JSON".to_string())
            }
        }
        Some(Value::Object(_)) => Ok(arguments.cloned().unwrap_or_else(|| json!({}))),
        Some(Value::Null) | None => Ok(json!({})),
        _ => Err("Provider tool call arguments had an unsupported shape".to_string()),
    }
}

fn validate_tool_name(
    tool_name: &str,
    available_tool_names: &HashSet<String>,
) -> Result<(), String> {
    if available_tool_names.contains(tool_name) {
        Ok(())
    } else {
        Err(format!(
            "Provider requested an unregistered Linkgo tool: {tool_name}"
        ))
    }
}

fn tool_call_chunk(provider_tool_call_id: Option<&str>, tool_name: &str, input: Value) -> Value {
    let mut chunk = json!({
        "type": "tool_call",
        "toolName": tool_name,
        "input": input,
    });
    if let Some(provider_tool_call_id) = provider_tool_call_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        chunk["providerToolCallId"] = json!(provider_tool_call_id);
    }
    chunk
}

fn parse_tool_call(
    tool_call: &Value,
    available_tool_names: &HashSet<String>,
) -> Result<Value, String> {
    let function = tool_call
        .get("function")
        .ok_or_else(|| "Provider tool call did not include a function payload".to_string())?;
    let tool_name = function
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| "Provider tool call did not include a function name".to_string())?;
    validate_tool_name(tool_name, available_tool_names)?;
    let input = parse_tool_arguments(function.get("arguments"))?;
    Ok(tool_call_chunk(
        tool_call.get("id").and_then(Value::as_str),
        tool_name,
        input,
    ))
}

fn parse_legacy_function_call(
    function_call: &Value,
    available_tool_names: &HashSet<String>,
) -> Result<Value, String> {
    let tool_name = function_call
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| "Provider function call did not include a name".to_string())?;
    validate_tool_name(tool_name, available_tool_names)?;
    let input = parse_tool_arguments(function_call.get("arguments"))?;
    Ok(tool_call_chunk(None, tool_name, input))
}

fn parse_content_tool_call(
    content_part: &Value,
    available_tool_names: &HashSet<String>,
) -> Result<Option<Value>, String> {
    let Some(content_type) = content_part.get("type").and_then(Value::as_str) else {
        return Ok(None);
    };
    if content_type != "tool_use" && content_type != "tool_call" {
        return Ok(None);
    }

    let tool_name = content_part
        .get("name")
        .and_then(Value::as_str)
        .ok_or_else(|| "Provider content tool call did not include a name".to_string())?;
    validate_tool_name(tool_name, available_tool_names)?;
    let input = match content_part.get("input") {
        Some(input) => input.clone(),
        None => parse_tool_arguments(content_part.get("args"))?,
    };
    Ok(Some(tool_call_chunk(
        content_part.get("id").and_then(Value::as_str),
        tool_name,
        input,
    )))
}

fn tool_call_chunks(
    message: &Value,
    available_tool_names: &HashSet<String>,
) -> Result<Vec<Value>, String> {
    let mut chunks = Vec::new();
    if let Some(tool_calls) = message.get("tool_calls").and_then(Value::as_array) {
        for tool_call in tool_calls {
            chunks.push(parse_tool_call(tool_call, available_tool_names)?);
        }
    }

    if chunks.is_empty() {
        if let Some(function_call) = message.get("function_call") {
            chunks.push(parse_legacy_function_call(
                function_call,
                available_tool_names,
            )?);
        }
    }

    if let Some(content_parts) = message.get("content").and_then(Value::as_array) {
        for content_part in content_parts {
            if let Some(chunk) = parse_content_tool_call(content_part, available_tool_names)? {
                chunks.push(chunk);
            }
        }
    }

    Ok(chunks)
}

fn build_response_chunks(
    text: Option<String>,
    mut tool_chunks: Vec<Value>,
) -> Result<Vec<Value>, String> {
    if text.is_none() && tool_chunks.is_empty() {
        return Err("Provider response did not include assistant text or tool calls".to_string());
    }

    let mut chunks = Vec::new();
    if let Some(text) = text.as_ref() {
        chunks.push(json!({ "type": "text", "text": text }));
    }

    let tool_count = tool_chunks.len();
    chunks.append(&mut tool_chunks);
    let output_summary =
        text.unwrap_or_else(|| format!("Provider requested {tool_count} Linkgo tool(s)."));
    chunks.push(json!({ "type": "done", "outputSummary": output_summary }));
    Ok(chunks)
}

fn openai_response_chunks(
    response: &Value,
    tools: &[AgentProviderToolDefinitionInput],
) -> Result<Vec<Value>, String> {
    let message = response_message(response)?;
    let text = message_text(message);
    let available_tool_names = tools
        .iter()
        .map(|tool| tool.name.clone())
        .collect::<HashSet<_>>();
    let tool_chunks = tool_call_chunks(message, &available_tool_names)?;
    build_response_chunks(text, tool_chunks)
}

fn anthropic_response_chunks(
    response: &Value,
    tools: &[AgentProviderToolDefinitionInput],
) -> Result<Vec<Value>, String> {
    let available_tool_names = tools
        .iter()
        .map(|tool| tool.name.clone())
        .collect::<HashSet<_>>();
    let content = response
        .get("content")
        .and_then(Value::as_array)
        .ok_or_else(|| "Provider response did not include Anthropic content".to_string())?;
    let mut text_parts = Vec::new();
    let mut tool_chunks = Vec::new();
    for part in content {
        match part.get("type").and_then(Value::as_str) {
            Some("text") => {
                if let Some(text) = part.get("text").and_then(Value::as_str) {
                    text_parts.push(text);
                }
            }
            Some("tool_use") | Some("tool_call") => {
                let tool_name = part
                    .get("name")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "Provider tool call did not include a name".to_string())?;
                validate_tool_name(tool_name, &available_tool_names)?;
                tool_chunks.push(tool_call_chunk(
                    part.get("id").and_then(Value::as_str),
                    tool_name,
                    part.get("input").cloned().unwrap_or_else(|| json!({})),
                ));
            }
            _ => {}
        }
    }
    let text = text_parts.join("").trim().to_string();
    build_response_chunks((!text.is_empty()).then_some(text), tool_chunks)
}

fn gemini_response_chunks(
    response: &Value,
    tools: &[AgentProviderToolDefinitionInput],
) -> Result<Vec<Value>, String> {
    let available_tool_names = tools
        .iter()
        .map(|tool| tool.name.clone())
        .collect::<HashSet<_>>();
    let candidates = response
        .get("response")
        .and_then(|value| value.get("candidates"))
        .or_else(|| response.get("candidates"))
        .and_then(Value::as_array)
        .ok_or_else(|| "Provider response did not include Gemini candidates".to_string())?;
    let parts = candidates
        .first()
        .and_then(|candidate| candidate.get("content"))
        .and_then(|content| content.get("parts"))
        .and_then(Value::as_array)
        .ok_or_else(|| "Provider response did not include Gemini content parts".to_string())?;
    let mut text_parts = Vec::new();
    let mut tool_chunks = Vec::new();
    for part in parts {
        if let Some(text) = part.get("text").and_then(Value::as_str) {
            text_parts.push(text);
        }
        if let Some(function_call) = part.get("functionCall") {
            let tool_name = function_call
                .get("name")
                .and_then(Value::as_str)
                .ok_or_else(|| "Provider function call did not include a name".to_string())?;
            validate_tool_name(tool_name, &available_tool_names)?;
            tool_chunks.push(tool_call_chunk(
                function_call.get("id").and_then(Value::as_str),
                tool_name,
                function_call
                    .get("args")
                    .cloned()
                    .unwrap_or_else(|| json!({})),
            ));
        }
    }
    let text = text_parts.join("").trim().to_string();
    build_response_chunks((!text.is_empty()).then_some(text), tool_chunks)
}

fn parsed_message_content(message: &AgentMessageInput) -> Value {
    serde_json::from_str(&message.content)
        .unwrap_or_else(|_| Value::String(message.content.clone()))
}

fn openai_message(message: &AgentMessageInput) -> Value {
    match (
        message.role.as_str(),
        message.tool_name.as_deref(),
        message.provider_tool_call_id.as_deref(),
    ) {
        ("assistant", Some(tool_name), Some(tool_call_id)) => json!({
            "role": "assistant",
            "content": null,
            "tool_calls": [{
                "id": tool_call_id,
                "type": "function",
                "function": {
                    "name": tool_name,
                    "arguments": message.content,
                },
            }],
        }),
        ("tool", _, Some(tool_call_id)) => json!({
            "role": "tool",
            "tool_call_id": tool_call_id,
            "content": message.content,
        }),
        _ => json!({
            "role": to_openai_role(&message.role),
            "content": message.content,
        }),
    }
}

fn openai_payload(input: &AgentProviderStreamInput) -> Value {
    let messages = input
        .request
        .messages
        .iter()
        .map(openai_message)
        .collect::<Vec<_>>();

    let mut payload = json!({
        "model": input.model_name,
        "messages": messages,
        "stream": false,
        "max_tokens": 1200,
    });

    let (tools, tool_choice) = native_agent_provider_options(input);
    payload["tools"] = Value::Array(tool_payloads(&tools));
    payload["tool_choice"] = openai_tool_choice(&tool_choice);

    payload
}

fn anthropic_payload(input: &AgentProviderStreamInput) -> Value {
    let mut system_parts = Vec::new();
    let mut messages = Vec::new();
    for message in &input.request.messages {
        match (
            message.role.as_str(),
            message.tool_name.as_deref(),
            message.provider_tool_call_id.as_deref(),
        ) {
            ("system", _, _) => system_parts.push(message.content.as_str()),
            ("assistant", Some(tool_name), Some(tool_call_id)) => messages.push(json!({
                "role": "assistant",
                "content": [{
                    "type": "tool_use",
                    "id": tool_call_id,
                    "name": tool_name,
                    "input": parsed_message_content(message),
                }],
            })),
            ("tool", _, Some(tool_call_id)) => messages.push(json!({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": tool_call_id,
                    "content": message.content,
                }],
            })),
            ("assistant", _, _) => messages.push(json!({
                "role": "assistant",
                "content": message.content,
            })),
            _ => messages.push(json!({
                "role": "user",
                "content": message.content,
            })),
        }
    }

    let mut payload = json!({
        "model": input.model_name,
        "max_tokens": 1200,
        "messages": messages,
        "stream": false,
    });
    let system = system_parts.join("\n\n");
    if !system.trim().is_empty() {
        payload["system"] = json!(system);
    }

    let (tools, tool_choice) = native_agent_provider_options(input);
    payload["tools"] = Value::Array(
        tools
            .iter()
            .map(|tool| {
                json!({
                    "name": tool.name,
                    "description": tool.description,
                    "input_schema": tool.input_schema,
                })
            })
            .collect(),
    );
    payload["tool_choice"] = anthropic_tool_choice(&tool_choice);

    payload
}

fn gemini_contents_and_system(messages: &[AgentMessageInput]) -> (Vec<Value>, Option<Value>) {
    let mut system_parts = Vec::new();
    let mut contents = Vec::new();
    for message in messages {
        match (message.role.as_str(), message.tool_name.as_deref()) {
            ("system", _) => system_parts.push(message.content.as_str()),
            ("assistant", Some(tool_name)) => contents.push(json!({
                "role": "model",
                "parts": [{
                    "functionCall": {
                        "name": tool_name,
                        "args": parsed_message_content(message),
                    },
                }],
            })),
            ("tool", Some(tool_name)) => contents.push(json!({
                "role": "user",
                "parts": [{
                    "functionResponse": {
                        "name": tool_name,
                        "response": parsed_message_content(message),
                    },
                }],
            })),
            ("assistant", _) => contents.push(json!({
                "role": "model",
                "parts": [{ "text": message.content }],
            })),
            _ => contents.push(json!({
                "role": "user",
                "parts": [{ "text": message.content }],
            })),
        }
    }

    let system_text = system_parts.join("\n\n");
    let system_instruction = (!system_text.trim().is_empty()).then(|| {
        json!({
            "parts": [{ "text": system_text }],
        })
    });
    (contents, system_instruction)
}

fn gemini_user_prompt_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("linkgo-agent-run-{nanos}")
}

fn gemini_payload(input: &AgentProviderStreamInput) -> Value {
    let (contents, system_instruction) = gemini_contents_and_system(&input.request.messages);
    let mut request = json!({
        "contents": contents,
        "generationConfig": {
            "maxOutputTokens": 1200,
        },
    });
    if let Some(system_instruction) = system_instruction {
        request["systemInstruction"] = system_instruction;
    }

    let (tools, tool_choice) = native_agent_provider_options(input);
    request["tools"] = json!([
        {
            "functionDeclarations": tools
                .iter()
                .map(|tool| {
                    json!({
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": sanitize_gemini_schema(&tool.input_schema),
                    })
                })
                .collect::<Vec<_>>()
        }
    ]);
    request["toolConfig"] = gemini_tool_choice(&tool_choice);

    json!({
        "model": input.model_name,
        "user_prompt_id": gemini_user_prompt_id(),
        "request": request,
    })
}

fn parse_provider_error(response_json: &Value) -> String {
    let message = response_json
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .or_else(|| response_json.get("message").and_then(Value::as_str))
        .unwrap_or("Provider request failed");
    truncate_error_message(message)
}

/// Sends a provider request and reads a bounded JSON response. Redirect
/// responses are never followed and surface as a failed request.
fn send_provider_request(request: reqwest::blocking::RequestBuilder) -> Result<Value, String> {
    let response = request
        .send()
        .map_err(|_| "Provider request failed".to_string())?;
    let status = response.status();
    if status.is_redirection() {
        return Err(format!(
            "Provider request was redirected (HTTP {}); redirects are not followed. Check the Base URL",
            status.as_u16()
        ));
    }
    let response_json =
        read_bounded_json::<Value>(response, PROVIDER_MAX_RESPONSE_BYTES).map_err(|error| {
            if error.contains("limit") {
                "Provider response was too large".to_string()
            } else {
                "Provider response was not valid JSON".to_string()
            }
        })?;
    if !status.is_success() {
        return Err(parse_provider_error(&response_json));
    }
    Ok(response_json)
}

fn execute_openai_compatible(
    input: &AgentProviderStreamInput,
    api_key: &str,
    endpoint: &ProviderEndpoint,
) -> Result<AgentProviderStreamResult, String> {
    let request = provider_http_client(endpoint.policy)?
        .post(completions_url(&endpoint.base_url))
        .bearer_auth(api_key)
        .json(&openai_payload(input));
    let response_json = send_provider_request(request)?;

    let (tools, _) = native_agent_provider_options(input);
    Ok(AgentProviderStreamResult {
        chunks: openai_response_chunks(&response_json, &tools)?,
    })
}

fn execute_anthropic_compatible(
    input: &AgentProviderStreamInput,
    api_key: &str,
    endpoint: &ProviderEndpoint,
) -> Result<AgentProviderStreamResult, String> {
    let client = provider_http_client(endpoint.policy)?;
    let mut request = client
        .post(anthropic_messages_url(&endpoint.base_url))
        .header("anthropic-version", "2023-06-01")
        .json(&anthropic_payload(input));
    if api_key.starts_with("sk-ant-oat") {
        request = request.bearer_auth(api_key).header(
            "anthropic-beta",
            "claude-code-20250219, oauth-2025-04-20, fine-grained-tool-streaming-2025-05-14",
        );
    } else {
        request = request.header("x-api-key", api_key);
    }

    let response_json = send_provider_request(request)?;

    let (tools, _) = native_agent_provider_options(input);
    Ok(AgentProviderStreamResult {
        chunks: anthropic_response_chunks(&response_json, &tools)?,
    })
}

fn execute_gemini_code_assist(
    input: &AgentProviderStreamInput,
    api_key: &str,
    endpoint: &ProviderEndpoint,
) -> Result<AgentProviderStreamResult, String> {
    let request = provider_http_client(endpoint.policy)?
        .post(gemini_code_assist_url(&endpoint.base_url))
        .bearer_auth(api_key)
        .header("User-Agent", GEMINI_CLI_USER_AGENT)
        .header("X-Goog-Api-Client", GEMINI_CLI_API_CLIENT)
        .json(&gemini_payload(input));
    let response_json = send_provider_request(request)?;

    let (tools, _) = native_agent_provider_options(input);
    Ok(AgentProviderStreamResult {
        chunks: gemini_response_chunks(&response_json, &tools)?,
    })
}

/// Identity block Anthropic requires at the start of the system prompt for
/// Claude-plan sign-in tokens.
const CLAUDE_CODE_IDENTITY: &str = "You are Claude Code, Anthropic's official CLI for Claude.";
const ANTHROPIC_OAUTH_BETAS: &str = "claude-code-20250219,oauth-2025-04-20";

/// Anthropic payload for sign-in tokens: the Claude Code identity block goes
/// first, followed by Linkgo's own system prompt.
fn anthropic_oauth_payload(input: &AgentProviderStreamInput) -> Value {
    let mut payload = anthropic_payload(input);
    let mut system = vec![json!({ "type": "text", "text": CLAUDE_CODE_IDENTITY })];
    if let Some(text) = payload.get("system").and_then(Value::as_str) {
        system.push(json!({ "type": "text", "text": text }));
    }
    payload["system"] = Value::Array(system);
    payload
}

fn anthropic_oauth_headers(user_agent: &str) -> [(&'static str, &str); 4] {
    [
        ("anthropic-version", "2023-06-01"),
        ("anthropic-beta", ANTHROPIC_OAUTH_BETAS),
        ("User-Agent", user_agent),
        ("x-app", "cli"),
    ]
}

/// Outcome of a signed-in provider call; 401 is kept distinct so the caller
/// can force one refresh and retry once.
enum OAuthCallError {
    Unauthorized,
    Failed(String),
}

fn send_oauth_request(
    request: reqwest::blocking::RequestBuilder,
    body_is_sse: bool,
) -> Result<Value, OAuthCallError> {
    let response = request
        .send()
        .map_err(|_| OAuthCallError::Failed("Provider request failed".to_string()))?;
    let status = response.status();
    if status.as_u16() == 401 {
        return Err(OAuthCallError::Unauthorized);
    }
    if status.is_redirection() {
        return Err(OAuthCallError::Failed(format!(
            "Provider request was redirected (HTTP {}); redirects are not followed",
            status.as_u16()
        )));
    }
    let bytes = crate::net::transport::read_bounded_bytes(response, PROVIDER_MAX_RESPONSE_BYTES)
        .map_err(|_| OAuthCallError::Failed("Provider response was too large".to_string()))?;
    if !status.is_success() {
        let parsed = serde_json::from_slice::<Value>(&bytes).unwrap_or(Value::Null);
        let message = parse_provider_error(&parsed);
        return Err(OAuthCallError::Failed(format!(
            "{message} (HTTP {})",
            status.as_u16()
        )));
    }
    if body_is_sse {
        let text = String::from_utf8_lossy(&bytes);
        return agent_codex::completed_response_from_sse(&text).map_err(OAuthCallError::Failed);
    }
    serde_json::from_slice::<Value>(&bytes)
        .map_err(|_| OAuthCallError::Failed("Provider response was not valid JSON".to_string()))
}

fn call_with_oauth(
    provider: AiOAuthProvider,
    input: &AgentProviderStreamInput,
    credentials: &OAuthCredentials,
    claude_cli_user_agent: &str,
) -> Result<Value, OAuthCallError> {
    let client =
        provider_http_client(TransportPolicy::PUBLIC_HTTPS).map_err(OAuthCallError::Failed)?;
    match provider {
        AiOAuthProvider::Anthropic => {
            let endpoint = resolve_endpoint(None, default_base_url("anthropic"), false)
                .map_err(OAuthCallError::Failed)?;
            let mut request = client
                .post(anthropic_messages_url(&endpoint.base_url))
                .bearer_auth(&credentials.access_token)
                .json(&anthropic_oauth_payload(input));
            for (name, value) in anthropic_oauth_headers(claude_cli_user_agent) {
                request = request.header(name, value);
            }
            send_oauth_request(request, false)
        }
        AiOAuthProvider::OpenAi => {
            agent_codex::ensure_codex_model(&input.model_name).map_err(OAuthCallError::Failed)?;
            let account_id = credentials.account_id.as_deref().ok_or_else(|| {
                OAuthCallError::Failed(reconnect_message(AiOAuthProvider::OpenAi))
            })?;
            let endpoint = resolve_endpoint(None, Some(agent_codex::CODEX_BASE_URL), false)
                .map_err(OAuthCallError::Failed)?;
            let mut request = client
                .post(agent_codex::codex_responses_url(&endpoint.base_url))
                .bearer_auth(&credentials.access_token)
                .json(&agent_codex::codex_payload(input));
            for (name, value) in agent_codex::codex_headers(&input.model_name, account_id) {
                request = request.header(name, value);
            }
            send_oauth_request(request, true)
        }
    }
}

fn oauth_response_chunks(
    provider: AiOAuthProvider,
    input: &AgentProviderStreamInput,
    response: &Value,
) -> Result<AgentProviderStreamResult, String> {
    let (tools, _) = native_agent_provider_options(input);
    let chunks = match provider {
        AiOAuthProvider::Anthropic => anthropic_response_chunks(response, &tools)?,
        AiOAuthProvider::OpenAi => agent_codex::codex_response_chunks(response, &tools)?,
    };
    Ok(AgentProviderStreamResult { chunks })
}

/// Signed-in (OAuth) execution: refresh if expiring, call, and on a 401 force
/// one refresh and retry once. A rejected refresh leaves the credential in
/// the reconnect state. For Anthropic, a "version X or newer is required"
/// failure that raises the cached Claude Code version (`note_required`) is
/// retried once with the rebuilt User-Agent, like gg's agent session.
fn execute_with_oauth(
    storage: &dyn CredentialStore,
    locks: &OAuthRefreshLocks,
    provider: AiOAuthProvider,
    input: &AgentProviderStreamInput,
    stored: &OAuthCredentials,
    claude_cli_user_agent: impl Fn() -> String,
    note_required: impl FnOnce(&str) -> bool,
) -> Result<AgentProviderStreamResult, String> {
    execute_with_oauth_using(
        storage,
        locks,
        provider,
        input,
        stored,
        claude_cli_user_agent,
        note_required,
        |credentials, user_agent| call_with_oauth(provider, input, credentials, user_agent),
    )
}

/// `execute_with_oauth` with the provider call injected so tests can point
/// it at a local server.
#[allow(clippy::too_many_arguments)]
fn execute_with_oauth_using(
    storage: &dyn CredentialStore,
    locks: &OAuthRefreshLocks,
    provider: AiOAuthProvider,
    input: &AgentProviderStreamInput,
    stored: &OAuthCredentials,
    claude_cli_user_agent: impl Fn() -> String,
    note_required: impl FnOnce(&str) -> bool,
    call: impl Fn(&OAuthCredentials, &str) -> Result<Value, OAuthCallError>,
) -> Result<AgentProviderStreamResult, String> {
    if stored.needs_reauth {
        return Err(reconnect_message(provider));
    }
    // Resolved lazily (it may hit npm) and only for Anthropic.
    let mut user_agent = match provider {
        AiOAuthProvider::Anthropic => claude_cli_user_agent(),
        AiOAuthProvider::OpenAi => String::new(),
    };
    let mut endpoints = RefreshEndpoints::production(provider, user_agent.clone())?;
    let credentials = ensure_fresh_ai_credential(
        storage,
        locks,
        provider,
        &endpoints,
        unix_timestamp(),
        RefreshMode::IfExpiring,
    )?;
    let first = match call(&credentials, &user_agent) {
        Err(OAuthCallError::Failed(message))
            if provider == AiOAuthProvider::Anthropic && note_required(&message) =>
        {
            user_agent = claude_cli_user_agent();
            endpoints = RefreshEndpoints::production(provider, user_agent.clone())?;
            call(&credentials, &user_agent)
        }
        other => other,
    };
    match first {
        Ok(response) => oauth_response_chunks(provider, input, &response),
        Err(OAuthCallError::Failed(message)) => Err(message),
        Err(OAuthCallError::Unauthorized) => {
            let refreshed = ensure_fresh_ai_credential(
                storage,
                locks,
                provider,
                &endpoints,
                unix_timestamp(),
                RefreshMode::AfterRejected(&credentials.access_token),
            )?;
            match call(&refreshed, &user_agent) {
                Ok(response) => oauth_response_chunks(provider, input, &response),
                Err(OAuthCallError::Failed(message)) => Err(message),
                Err(OAuthCallError::Unauthorized) => Err(format!(
                    "{} rejected the signed-in credential (HTTP 401). Reconnect in Integrations",
                    provider.label()
                )),
            }
        }
    }
}

#[tauri::command]
pub fn linkgo_agent_provider_stream(
    app: AppHandle,
    locks: tauri::State<'_, OAuthRefreshLocks>,
    input: AgentProviderStreamInput,
) -> Result<AgentProviderStreamResult, String> {
    let storage = AuthStorage::new(&app)?;
    let credential = storage
        .load(&input.provider_key)?
        .ok_or_else(|| "Provider is not connected".to_string())?;
    let credentials = match credential {
        StoredCredential::ApiKey(credentials) => credentials,
        StoredCredential::OAuth(oauth) => {
            let provider = AiOAuthProvider::from_key(&input.provider_key).ok_or_else(|| {
                "Provider-backed agent execution requires API-key credentials".to_string()
            })?;
            return execute_with_oauth(
                &storage,
                &locks,
                provider,
                &input,
                &oauth,
                || claude_cli_user_agent(&app),
                |message| note_required_claude_code_version(&app, message),
            );
        }
    };
    let transport = provider_transport(&input.provider_key)
        .ok_or_else(|| format!("Unsupported agent provider: {}", input.provider_key))?;
    let stored_base_url = credentials.base_url.as_deref();
    let allow_local = credentials.allow_local_destination;
    match transport {
        ProviderTransport::OpenAiCompatible => {
            let endpoint = provider_endpoint(&input.provider_key, stored_base_url, allow_local)?;
            execute_openai_compatible(&input, &credentials.api_key, &endpoint)
        }
        ProviderTransport::AnthropicCompatible => {
            let endpoint = provider_endpoint(&input.provider_key, stored_base_url, allow_local)?;
            execute_anthropic_compatible(&input, &credentials.api_key, &endpoint)
        }
        ProviderTransport::GeminiCodeAssist => {
            let endpoint = resolve_endpoint(
                stored_base_url,
                Some(GEMINI_CODE_ASSIST_BASE_URL),
                allow_local,
            )?;
            execute_gemini_code_assist(&input, &credentials.api_key, &endpoint)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn draft_tool() -> AgentProviderToolDefinitionInput {
        AgentProviderToolDefinitionInput {
            name: "draft_post".to_string(),
            description: "Creates bounded draft variant structures.".to_string(),
            input_schema: draft_post_input_schema(),
        }
    }

    #[test]
    fn serializes_registered_tools_as_openai_function_tools() {
        let payloads = tool_payloads(&[draft_tool()]);

        assert_eq!(payloads[0]["type"], "function");
        assert_eq!(payloads[0]["function"]["name"], "draft_post");
        assert_eq!(payloads[0]["function"]["parameters"]["type"], "object");
    }

    #[test]
    fn native_score_relevance_schema_covers_the_frontend_contract() {
        let tools = native_agent_tool_definitions();
        let score_tool = tools
            .iter()
            .find(|tool| tool.name == "score_relevance")
            .expect("score_relevance should stay native-allowlisted");
        let schema = &score_tool.input_schema;
        let score_items = &schema["properties"]["scores"]["items"];

        assert_eq!(
            schema["required"],
            json!(["campaignId", "candidatePostIds", "scores"])
        );
        assert_eq!(schema["additionalProperties"], false);
        assert_eq!(schema["properties"]["minimumScore"]["default"], 60);
        assert_eq!(
            schema["properties"]["autoRejectBelowMinimum"]["default"],
            false
        );
        assert_eq!(schema["properties"]["scores"]["minItems"], 1);
        assert_eq!(schema["properties"]["scores"]["maxItems"], 50);
        assert_eq!(score_items["additionalProperties"], false);
        assert_eq!(
            score_items["required"],
            json!(["candidatePostId", "score", "rationale"])
        );
        assert_eq!(
            score_items["properties"]["candidatePostId"]["type"],
            "integer"
        );
        assert_eq!(
            score_items["properties"]["candidatePostId"]["exclusiveMinimum"],
            0
        );
        assert_eq!(score_items["properties"]["score"]["minimum"], 0);
        assert_eq!(score_items["properties"]["score"]["maximum"], 100);
        assert_eq!(score_items["properties"]["rationale"]["minLength"], 1);
        assert_eq!(score_items["properties"]["rationale"]["maxLength"], 500);
    }

    #[test]
    fn native_draft_post_schema_matches_the_frontend_contract() {
        let tools = native_agent_tool_definitions();
        let draft_tool = tools
            .iter()
            .find(|tool| tool.name == "draft_post")
            .expect("draft_post should stay native-allowlisted");
        let schema = &draft_tool.input_schema;
        let variants = &schema["properties"]["variants"];
        let variant_items = &variants["items"];

        assert_eq!(
            schema["required"],
            json!([
                "draftGenerationRequestId",
                "campaignId",
                "candidatePostId",
                "contentIntent",
                "variants"
            ])
        );
        assert_eq!(schema["additionalProperties"], false);
        assert_eq!(schema["properties"]["variantCount"]["default"], 3);
        assert_eq!(schema["properties"]["variantCount"]["minimum"], 3);
        assert_eq!(schema["properties"]["variantCount"]["maximum"], 5);
        assert_eq!(
            schema["properties"]["contentIntent"]["enum"],
            json!(["event", "launch", "idea", "community"])
        );
        assert_eq!(variants["minItems"], 3);
        assert_eq!(variants["maxItems"], 5);
        assert_eq!(variant_items["additionalProperties"], false);
        assert_eq!(
            variant_items["required"],
            json!(["hook", "body", "cta", "hashtags"])
        );
        assert_eq!(variant_items["properties"]["hook"]["maxLength"], 280);
        assert_eq!(variant_items["properties"]["body"]["maxLength"], 2500);
        assert_eq!(variant_items["properties"]["hashtags"]["maxItems"], 5);
    }

    #[test]
    fn native_adapter_filters_renderer_tools_through_the_native_allowlist() {
        let mut input: AgentProviderStreamInput = serde_json::from_value(json!({
            "providerKey": "custom",
            "modelName": "custom-model",
            "request": { "messages": [{ "role": "user", "content": "Draft a post" }] },
            "tools": [
                {
                    "name": "draft_post",
                    "description": "Untrusted renderer description",
                    "inputSchema": { "type": "string" }
                },
                {
                    "name": "publish_post",
                    "description": "Must never cross the allowlist",
                    "inputSchema": {}
                }
            ],
            "toolChoice": "auto"
        }))
        .expect("Tauri command input should consume provider options");

        let (tools, tool_choice) = native_agent_provider_options(&input);
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].name, "draft_post");
        assert_eq!(tools[0].input_schema, draft_post_input_schema());
        assert_eq!(tool_choice, "auto");

        input.tool_choice = json!({ "name": "publish_post" });
        let (_, filtered_choice) = native_agent_provider_options(&input);
        assert_eq!(filtered_choice, "none");
    }

    #[test]
    fn serializes_openai_payload_without_renderer_supplied_credentials() {
        let input = AgentProviderStreamInput {
            provider_key: "custom".to_string(),
            model_name: "custom-model".to_string(),
            request: AgentModelRequestInput {
                messages: vec![
                    AgentMessageInput {
                        role: "system".to_string(),
                        content: "System guardrails".to_string(),
                        tool_name: None,
                        provider_tool_call_id: None,
                    },
                    AgentMessageInput {
                        role: "user".to_string(),
                        content: "Draft a post".to_string(),
                        tool_name: None,
                        provider_tool_call_id: None,
                    },
                ],
            },
            tools: vec![AgentProviderToolSelectionInput {
                name: "draft_post".to_string(),
            }],
            tool_choice: json!("auto"),
        };

        let payload = openai_payload(&input);

        assert_eq!(payload["model"], "custom-model");
        assert_eq!(payload["messages"][0]["role"], "system");
        assert_eq!(payload["tools"][0]["function"]["name"], "draft_post");
        assert_eq!(payload["tool_choice"], "auto");
        assert!(payload.get("provider").is_none());
        assert!(payload.get("apiKey").is_none());
        assert!(payload.get("baseUrl").is_none());
    }

    #[test]
    fn serializes_tool_calls_and_results_for_each_provider_transport() {
        let input: AgentProviderStreamInput = serde_json::from_value(json!({
            "providerKey": "custom",
            "modelName": "custom-model",
            "request": {
                "messages": [
                    { "role": "user", "content": "Draft a post" },
                    {
                        "role": "assistant",
                        "content": "{\"campaignId\":1,\"candidatePostId\":2}",
                        "toolName": "draft_post",
                        "providerToolCallId": "call_123"
                    },
                    {
                        "role": "tool",
                        "content": "{\"summary\":\"Draft saved\"}",
                        "toolName": "draft_post",
                        "providerToolCallId": "call_123"
                    }
                ]
            },
            "tools": [{ "name": "draft_post" }],
            "toolChoice": "auto"
        }))
        .expect("multi-turn provider input should deserialize");

        let openai = openai_payload(&input);
        assert_eq!(openai["messages"][1]["tool_calls"][0]["id"], "call_123");
        assert_eq!(
            openai["messages"][1]["tool_calls"][0]["function"]["name"],
            "draft_post"
        );
        assert_eq!(openai["messages"][2]["role"], "tool");
        assert_eq!(openai["messages"][2]["tool_call_id"], "call_123");

        let anthropic = anthropic_payload(&input);
        assert_eq!(anthropic["messages"][1]["content"][0]["type"], "tool_use");
        assert_eq!(
            anthropic["messages"][2]["content"][0]["type"],
            "tool_result"
        );
        assert_eq!(
            anthropic["messages"][2]["content"][0]["tool_use_id"],
            "call_123"
        );

        let gemini = gemini_payload(&input);
        assert_eq!(
            gemini["request"]["contents"][1]["parts"][0]["functionCall"]["name"],
            "draft_post"
        );
        assert_eq!(
            gemini["request"]["contents"][2]["parts"][0]["functionResponse"]["response"]["summary"],
            "Draft saved"
        );
    }

    #[test]
    fn converts_provider_tool_calls_to_agent_chunks() {
        let response = json!({
            "choices": [
                {
                    "message": {
                        "content": "Preparing a draft.",
                        "tool_calls": [
                            {
                                "id": "call_123",
                                "type": "function",
                                "function": {
                                    "name": "draft_post",
                                    "arguments": "{\"campaignId\":1,\"candidatePostId\":2,\"variantCount\":2,\"angle\":\"Operator lesson\"}"
                                }
                            }
                        ]
                    }
                }
            ]
        });

        let chunks = openai_response_chunks(&response, &[draft_tool()]).expect("chunks");

        assert_eq!(
            chunks[0],
            json!({ "type": "text", "text": "Preparing a draft." })
        );
        assert_eq!(chunks[1]["type"], "tool_call");
        assert_eq!(chunks[1]["providerToolCallId"], "call_123");
        assert_eq!(chunks[1]["toolName"], "draft_post");
        assert_eq!(chunks[1]["input"]["campaignId"], 1);
        assert_eq!(chunks[2]["type"], "done");
    }

    #[test]
    fn converts_content_tool_calls_to_agent_chunks() {
        let response = json!({
            "choices": [
                {
                    "message": {
                        "content": [
                            { "type": "text", "text": "Drafting next." },
                            {
                                "type": "tool_use",
                                "id": "toolu_123",
                                "name": "draft_post",
                                "input": {
                                    "campaignId": 1,
                                    "candidatePostId": 2,
                                    "variantCount": 2,
                                    "angle": "Operator lesson"
                                }
                            }
                        ]
                    }
                }
            ]
        });

        let chunks = openai_response_chunks(&response, &[draft_tool()]).expect("chunks");

        assert_eq!(
            chunks[0],
            json!({ "type": "text", "text": "Drafting next." })
        );
        assert_eq!(chunks[1]["type"], "tool_call");
        assert_eq!(chunks[1]["providerToolCallId"], "toolu_123");
        assert_eq!(chunks[1]["toolName"], "draft_post");
        assert_eq!(chunks[1]["input"]["campaignId"], 1);
    }

    #[test]
    fn rejects_unregistered_provider_tool_calls() {
        let response = json!({
            "choices": [
                {
                    "message": {
                        "tool_calls": [
                            {
                                "id": "call_123",
                                "type": "function",
                                "function": {
                                    "name": "publish_post",
                                    "arguments": "{}"
                                }
                            }
                        ]
                    }
                }
            ]
        });

        let error =
            openai_response_chunks(&response, &[draft_tool()]).expect_err("unregistered tool");

        assert!(error.contains("unregistered Linkgo tool"));
    }

    #[test]
    fn provider_transports_and_defaults_match_installed_gg_ai_registry() {
        assert_eq!(
            provider_transport("anthropic"),
            Some(ProviderTransport::AnthropicCompatible)
        );
        assert_eq!(
            provider_transport("minimax"),
            Some(ProviderTransport::AnthropicCompatible)
        );
        assert_eq!(
            provider_transport("gemini"),
            Some(ProviderTransport::GeminiCodeAssist)
        );
        assert_eq!(
            provider_transport("xiaomi"),
            Some(ProviderTransport::OpenAiCompatible)
        );
        assert_eq!(
            provider_transport("sakana"),
            Some(ProviderTransport::OpenAiCompatible)
        );
        assert_eq!(
            provider_transport("custom"),
            Some(ProviderTransport::OpenAiCompatible)
        );

        assert_eq!(
            default_base_url("xiaomi"),
            Some("https://token-plan-sgp.xiaomimimo.com/v1")
        );
        assert_eq!(
            default_base_url("glm"),
            Some("https://api.z.ai/api/coding/paas/v4")
        );
        assert_eq!(
            default_base_url("deepseek"),
            Some("https://api.deepseek.com/v1")
        );
        assert_eq!(
            default_base_url("openrouter"),
            Some("https://openrouter.ai/api/v1")
        );
        assert_eq!(default_base_url("sakana"), Some("https://api.sakana.ai/v1"));
        assert_eq!(
            default_base_url("moonshot"),
            Some("https://api.moonshot.ai/v1")
        );
        assert_eq!(
            default_base_url("minimax"),
            Some("https://api.minimax.io/anthropic")
        );
    }

    #[test]
    fn execution_revalidates_stored_destinations() {
        let default = provider_endpoint("openai", None, false).expect("default");
        assert_eq!(
            completions_url(&default.base_url),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(default.policy, TransportPolicy::PUBLIC_HTTPS);

        // Values stored by older builds without consent fail closed.
        for stored in [
            "http://localhost:11434/v1",
            "http://169.254.169.254/latest",
            "https://10.0.0.5/v1",
            "http://api.example.com/v1",
            "file:///etc/passwd",
        ] {
            assert!(
                provider_endpoint("custom", Some(stored), false).is_err(),
                "{stored} must be rejected at execution"
            );
        }

        let local = provider_endpoint("custom", Some("http://localhost:11434/v1"), true)
            .expect("consented local endpoint");
        assert_eq!(
            completions_url(&local.base_url),
            "http://localhost:11434/v1/chat/completions"
        );
        assert_ne!(local.policy, TransportPolicy::PUBLIC_HTTPS);

        // Consent never loosens public destinations.
        assert!(provider_endpoint("custom", Some("http://api.example.com/v1"), true).is_err());
        assert!(provider_endpoint("custom", None, true).is_err());
    }

    #[test]
    fn provider_error_messages_are_truncated() {
        let long = "x".repeat(10_000);
        let message = parse_provider_error(&json!({ "error": { "message": long } }));
        assert!(message.chars().count() <= 501);
    }

    #[test]
    fn signed_in_credential_needing_reconnect_fails_before_any_request() {
        struct EmptyStore;
        impl CredentialStore for EmptyStore {
            fn load(&self, _: &str) -> Result<Option<StoredCredential>, String> {
                Ok(None)
            }
            fn save(&self, _: StoredCredential) -> Result<(), String> {
                Err("must not save".to_string())
            }
        }
        let input: AgentProviderStreamInput = serde_json::from_value(json!({
            "providerKey": "openai",
            "modelName": "gpt-6-sol",
            "request": { "messages": [] },
            "tools": [],
            "toolChoice": "none",
        }))
        .expect("input");
        let stored = OAuthCredentials {
            access_token: String::new(),
            refresh_token: None,
            expires_at: None,
            refresh_expires_at: None,
            account_id: None,
            account_label: None,
            scopes: Vec::new(),
            provider_key: "openai".to_string(),
            needs_reauth: true,
        };
        let error = execute_with_oauth(
            &EmptyStore,
            &OAuthRefreshLocks::default(),
            AiOAuthProvider::OpenAi,
            &input,
            &stored,
            || panic!("a reconnect-required credential must not resolve the Claude CLI version"),
            |_| panic!("a reconnect-required credential must not note a required version"),
        )
        .unwrap_err();
        assert_eq!(error, "OpenAI sign-in expired — reconnect in Integrations");
    }

    struct AnthropicStore(OAuthCredentials);
    impl CredentialStore for AnthropicStore {
        fn load(&self, _: &str) -> Result<Option<StoredCredential>, String> {
            Ok(Some(StoredCredential::OAuth(self.0.clone())))
        }
        fn save(&self, _: StoredCredential) -> Result<(), String> {
            Err("must not save".to_string())
        }
    }

    fn anthropic_oauth_fixture() -> (AgentProviderStreamInput, OAuthCredentials) {
        let input: AgentProviderStreamInput = serde_json::from_value(json!({
            "providerKey": "anthropic",
            "modelName": "claude-opus-5",
            "request": { "messages": [{ "role": "user", "content": "Hi" }] },
            "tools": [],
            "toolChoice": "none",
        }))
        .expect("input");
        let stored = OAuthCredentials {
            access_token: "access".to_string(),
            refresh_token: Some("refresh".to_string()),
            expires_at: None,
            refresh_expires_at: None,
            account_id: None,
            account_label: None,
            scopes: Vec::new(),
            provider_key: "anthropic".to_string(),
            needs_reauth: false,
        };
        (input, stored)
    }

    /// Runs signed-in execution against a scripted local server, handing out
    /// `user_agents` in order on each User-Agent (re)build.
    fn run_anthropic_oauth(
        server: &crate::auth::ai_oauth::test_support::FakeServer,
        user_agents: &[&str],
        note_required: impl FnOnce(&str) -> bool,
    ) -> (Result<AgentProviderStreamResult, String>, usize) {
        use crate::auth::ai_oauth::test_support::local_client;
        let (input, stored) = anthropic_oauth_fixture();
        let builds = std::cell::Cell::new(0usize);
        let result = execute_with_oauth_using(
            &AnthropicStore(stored.clone()),
            &OAuthRefreshLocks::default(),
            AiOAuthProvider::Anthropic,
            &input,
            &stored,
            || {
                let index = builds.get();
                builds.set(index + 1);
                user_agents[index.min(user_agents.len() - 1)].to_string()
            },
            note_required,
            |credentials, user_agent| {
                let mut request = local_client()
                    .post(&server.url)
                    .bearer_auth(&credentials.access_token)
                    .json(&anthropic_oauth_payload(&input));
                for (name, value) in anthropic_oauth_headers(user_agent) {
                    request = request.header(name, value);
                }
                send_oauth_request(request, false)
            },
        );
        (result, builds.get())
    }

    const ANTHROPIC_OK: &str =
        r#"{"content":[{"type":"text","text":"Hello"}],"stop_reason":"end_turn"}"#;

    #[test]
    fn anthropic_oauth_retries_once_after_required_version_error() {
        use crate::auth::ai_oauth::test_support::spawn_fake_server;
        let required = json!({
            "type": "error",
            "error": {
                "type": "invalid_request_error",
                "message": "Claude Code 2.1.278 does not support this model; version 2.1.280 or newer is required."
            }
        });
        let server = spawn_fake_server(
            vec![(400, required.to_string()), (200, ANTHROPIC_OK.to_string())],
            std::time::Duration::ZERO,
        );
        let noted = std::cell::RefCell::new(None::<String>);
        let (result, builds) = run_anthropic_oauth(
            &server,
            &[
                "claude-cli/2.1.278 (external, cli)",
                "claude-cli/2.1.280 (external, cli)",
            ],
            |message| {
                *noted.borrow_mut() = Some(message.to_string());
                true
            },
        );

        assert!(result.is_ok(), "{result:?}");
        assert_eq!((server.hit_count(), builds), (2, 2));
        assert!(noted
            .borrow()
            .as_deref()
            .is_some_and(|message| message.contains("version 2.1.280 or newer is required")));
        assert!(server
            .request(0)
            .contains("claude-cli/2.1.278 (external, cli)"));
        assert!(server
            .request(1)
            .contains("claude-cli/2.1.280 (external, cli)"));
    }

    #[test]
    fn anthropic_oauth_does_not_retry_other_failures_or_unraised_versions() {
        use crate::auth::ai_oauth::test_support::spawn_fake_server;
        // Unrelated failure: `note_required` declines, so no retry.
        let overloaded = json!({ "error": { "message": "Overloaded" } });
        let server = spawn_fake_server(
            vec![
                (529, overloaded.to_string()),
                (200, ANTHROPIC_OK.to_string()),
            ],
            std::time::Duration::ZERO,
        );
        let (result, builds) =
            run_anthropic_oauth(&server, &["claude-cli/2.1.280 (external, cli)"], |_| false);
        assert_eq!(result.unwrap_err(), "Overloaded (HTTP 529)");
        assert_eq!((server.hit_count(), builds), (1, 1));

        // Retry happens at most once even if the retried call fails the same way.
        let required = json!({ "error": { "message": "version 2.1.290 or newer is required" } });
        let server =
            spawn_fake_server(vec![(400, required.to_string())], std::time::Duration::ZERO);
        let (result, builds) =
            run_anthropic_oauth(&server, &["claude-cli/2.1.280 (external, cli)"], |_| true);
        assert_eq!(
            result.unwrap_err(),
            "version 2.1.290 or newer is required (HTTP 400)"
        );
        assert_eq!((server.hit_count(), builds), (2, 2));
    }

    #[test]
    fn serializes_anthropic_compatible_payload_and_response_chunks() {
        let input = AgentProviderStreamInput {
            provider_key: "anthropic".to_string(),
            model_name: "claude-sonnet-4-6".to_string(),
            request: AgentModelRequestInput {
                messages: vec![
                    AgentMessageInput {
                        role: "system".to_string(),
                        content: "System guardrails".to_string(),
                        tool_name: None,
                        provider_tool_call_id: None,
                    },
                    AgentMessageInput {
                        role: "user".to_string(),
                        content: "Draft a post".to_string(),
                        tool_name: None,
                        provider_tool_call_id: None,
                    },
                ],
            },
            tools: vec![AgentProviderToolSelectionInput {
                name: "draft_post".to_string(),
            }],
            tool_choice: json!("auto"),
        };

        let oauth_payload = anthropic_oauth_payload(&input);
        assert_eq!(
            oauth_payload["system"][0]["text"],
            json!(CLAUDE_CODE_IDENTITY)
        );
        assert_eq!(
            oauth_payload["system"][1]["text"],
            json!("System guardrails")
        );
        let headers = anthropic_oauth_headers("claude-cli/2.1.283 (external, cli)");
        assert!(headers.contains(&("anthropic-beta", "claude-code-20250219,oauth-2025-04-20")));
        assert!(headers.contains(&("x-app", "cli")));
        assert!(headers.contains(&("User-Agent", "claude-cli/2.1.283 (external, cli)")));

        let payload = anthropic_payload(&input);
        assert_eq!(payload["system"], "System guardrails");
        assert_eq!(payload["messages"][0]["role"], "user");
        assert_eq!(payload["tools"][0]["input_schema"]["type"], "object");
        assert_eq!(payload["tool_choice"], json!({ "type": "auto" }));
        assert_eq!(
            anthropic_messages_url("https://api.minimax.io/anthropic"),
            "https://api.minimax.io/anthropic/v1/messages"
        );

        let response = json!({
            "content": [
                { "type": "text", "text": "Preparing a draft." },
                {
                    "type": "tool_use",
                    "id": "toolu_123",
                    "name": "draft_post",
                    "input": { "campaignId": 1, "candidatePostId": 2 }
                }
            ]
        });
        let chunks = anthropic_response_chunks(&response, &[draft_tool()]).expect("chunks");
        assert_eq!(
            chunks[0],
            json!({ "type": "text", "text": "Preparing a draft." })
        );
        assert_eq!(chunks[1]["providerToolCallId"], "toolu_123");
        assert_eq!(chunks[1]["toolName"], "draft_post");
    }

    #[test]
    fn serializes_gemini_code_assist_payload_and_response_chunks() {
        let input = AgentProviderStreamInput {
            provider_key: "gemini".to_string(),
            model_name: "gemini-2.5-flash".to_string(),
            request: AgentModelRequestInput {
                messages: vec![
                    AgentMessageInput {
                        role: "system".to_string(),
                        content: "System guardrails".to_string(),
                        tool_name: None,
                        provider_tool_call_id: None,
                    },
                    AgentMessageInput {
                        role: "user".to_string(),
                        content: "Draft a post".to_string(),
                        tool_name: None,
                        provider_tool_call_id: None,
                    },
                ],
            },
            tools: vec![AgentProviderToolSelectionInput {
                name: "draft_post".to_string(),
            }],
            tool_choice: json!("auto"),
        };

        let payload = gemini_payload(&input);
        let endpoint =
            resolve_endpoint(None, Some(GEMINI_CODE_ASSIST_BASE_URL), false).expect("default");
        assert_eq!(
            gemini_code_assist_url(&endpoint.base_url),
            "https://cloudcode-pa.googleapis.com/v1internal:generateContent"
        );
        assert_eq!(payload["model"], "gemini-2.5-flash");
        assert_eq!(
            payload["request"]["systemInstruction"]["parts"][0]["text"],
            "System guardrails"
        );
        assert_eq!(
            payload["request"]["tools"][0]["functionDeclarations"][0]["parameters"]["type"],
            "object"
        );
        assert_eq!(
            payload["request"]["toolConfig"],
            json!({ "functionCallingConfig": { "mode": "AUTO" } })
        );

        let response = json!({
            "response": {
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                { "text": "Preparing a draft." },
                                {
                                    "functionCall": {
                                        "id": "gemini_call_123",
                                        "name": "draft_post",
                                        "args": { "campaignId": 1, "candidatePostId": 2 }
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        });
        let chunks = gemini_response_chunks(&response, &[draft_tool()]).expect("chunks");
        assert_eq!(
            chunks[0],
            json!({ "type": "text", "text": "Preparing a draft." })
        );
        assert_eq!(chunks[1]["providerToolCallId"], "gemini_call_123");
        assert_eq!(chunks[1]["toolName"], "draft_post");
    }
}
