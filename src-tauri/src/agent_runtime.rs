use std::{
    collections::HashSet,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::auth::{storage::AuthStorage, StoredCredential};

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

fn provider_base_url(provider_key: &str, stored_base_url: Option<&str>) -> Result<String, String> {
    if let Some(base_url) = stored_base_url.filter(|value| !value.trim().is_empty()) {
        return Ok(base_url.trim().to_string());
    }
    default_base_url(provider_key)
        .map(ToString::to_string)
        .ok_or_else(|| "Provider execution requires a Base URL override".to_string())
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

fn gemini_code_assist_url(stored_base_url: Option<&str>) -> String {
    let base_url = stored_base_url
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(GEMINI_CODE_ASSIST_BASE_URL)
        .trim()
        .trim_end_matches('/');
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
    response_json
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .or_else(|| response_json.get("message").and_then(Value::as_str))
        .unwrap_or("Provider request failed")
        .to_string()
}

fn execute_openai_compatible(
    input: &AgentProviderStreamInput,
    api_key: &str,
    base_url: &str,
) -> Result<AgentProviderStreamResult, String> {
    let response = reqwest::blocking::Client::new()
        .post(completions_url(base_url))
        .bearer_auth(api_key)
        .json(&openai_payload(input))
        .send()
        .map_err(|_| "Provider request failed".to_string())?;
    let status = response.status();
    let response_json = response
        .json::<Value>()
        .map_err(|_| "Provider response was not valid JSON".to_string())?;
    if !status.is_success() {
        return Err(parse_provider_error(&response_json));
    }

    let (tools, _) = native_agent_provider_options(input);
    Ok(AgentProviderStreamResult {
        chunks: openai_response_chunks(&response_json, &tools)?,
    })
}

fn execute_anthropic_compatible(
    input: &AgentProviderStreamInput,
    api_key: &str,
    base_url: &str,
) -> Result<AgentProviderStreamResult, String> {
    let client = reqwest::blocking::Client::new();
    let mut request = client
        .post(anthropic_messages_url(base_url))
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

    let response = request
        .send()
        .map_err(|_| "Provider request failed".to_string())?;
    let status = response.status();
    let response_json = response
        .json::<Value>()
        .map_err(|_| "Provider response was not valid JSON".to_string())?;
    if !status.is_success() {
        return Err(parse_provider_error(&response_json));
    }

    let (tools, _) = native_agent_provider_options(input);
    Ok(AgentProviderStreamResult {
        chunks: anthropic_response_chunks(&response_json, &tools)?,
    })
}

fn execute_gemini_code_assist(
    input: &AgentProviderStreamInput,
    api_key: &str,
    stored_base_url: Option<&str>,
) -> Result<AgentProviderStreamResult, String> {
    let response = reqwest::blocking::Client::new()
        .post(gemini_code_assist_url(stored_base_url))
        .bearer_auth(api_key)
        .header("User-Agent", GEMINI_CLI_USER_AGENT)
        .header("X-Goog-Api-Client", GEMINI_CLI_API_CLIENT)
        .json(&gemini_payload(input))
        .send()
        .map_err(|_| "Provider request failed".to_string())?;
    let status = response.status();
    let response_json = response
        .json::<Value>()
        .map_err(|_| "Provider response was not valid JSON".to_string())?;
    if !status.is_success() {
        return Err(parse_provider_error(&response_json));
    }

    let (tools, _) = native_agent_provider_options(input);
    Ok(AgentProviderStreamResult {
        chunks: gemini_response_chunks(&response_json, &tools)?,
    })
}

#[tauri::command]
pub fn linkgo_agent_provider_stream(
    app: AppHandle,
    input: AgentProviderStreamInput,
) -> Result<AgentProviderStreamResult, String> {
    let storage = AuthStorage::new(&app)?;
    let credential = storage
        .load(&input.provider_key)?
        .ok_or_else(|| "Provider is not connected".to_string())?;
    let StoredCredential::ApiKey(credentials) = credential else {
        return Err("Provider-backed agent execution requires API-key credentials".to_string());
    };
    let transport = provider_transport(&input.provider_key)
        .ok_or_else(|| format!("Unsupported agent provider: {}", input.provider_key))?;
    match transport {
        ProviderTransport::OpenAiCompatible => {
            let base_url = provider_base_url(&input.provider_key, credentials.base_url.as_deref())?;
            execute_openai_compatible(&input, &credentials.api_key, &base_url)
        }
        ProviderTransport::AnthropicCompatible => {
            let base_url = provider_base_url(&input.provider_key, credentials.base_url.as_deref())?;
            execute_anthropic_compatible(&input, &credentials.api_key, &base_url)
        }
        ProviderTransport::GeminiCodeAssist => execute_gemini_code_assist(
            &input,
            &credentials.api_key,
            credentials.base_url.as_deref(),
        ),
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
        assert_eq!(
            gemini_code_assist_url(None),
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
