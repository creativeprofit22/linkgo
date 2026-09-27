//! OpenAI ChatGPT-plan transport (Codex Responses backend) used when OpenAI
//! is connected with account sign-in. Declared as a child module of
//! `agent_runtime` so it reuses the native tool allowlist and chunk builders.

use std::collections::HashSet;

use serde_json::{json, Value};

use super::{
    build_response_chunks, native_agent_provider_options, parse_tool_arguments, tool_call_chunk,
    validate_tool_name, AgentMessageInput, AgentProviderStreamInput,
    AgentProviderToolDefinitionInput,
};

pub const CODEX_BASE_URL: &str = "https://chatgpt.com/backend-api";
const CODEX_CLIENT_VERSION: &str = "0.155.1";
const DEFAULT_INSTRUCTIONS: &str = "You are a helpful assistant.";

/// Models that only exist on the public API; the Codex backend rejects them.
pub fn ensure_codex_model(model_name: &str) -> Result<(), String> {
    let model = model_name.trim();
    let api_only = ["gpt-4", "gpt-3", "o1", "o3-mini", "chatgpt-4o"];
    if model.is_empty() || api_only.iter().any(|prefix| model.starts_with(prefix)) {
        return Err(format!(
            "{model} is not available with ChatGPT sign-in; pick a ChatGPT-plan model such as gpt-6-sol, or connect OpenAI with an API key"
        ));
    }
    Ok(())
}

pub fn codex_responses_url(base_url: &str) -> String {
    format!("{}/codex/responses", base_url.trim().trim_end_matches('/'))
}

fn is_responses_lite(model_name: &str) -> bool {
    model_name.starts_with("gpt-5.6-") || model_name.starts_with("gpt-6-")
}

/// Fixed request headers besides Authorization.
pub fn codex_headers(model_name: &str, account_id: &str) -> Vec<(&'static str, String)> {
    let mut headers = vec![
        ("chatgpt-account-id", account_id.to_string()),
        ("OpenAI-Beta", "responses=experimental".to_string()),
        ("Accept", "text/event-stream".to_string()),
    ];
    if is_responses_lite(model_name) {
        headers.push(("originator", "codex_cli_rs".to_string()));
        headers.push(("User-Agent", format!("codex_cli_rs/{CODEX_CLIENT_VERSION}")));
        headers.push(("version", CODEX_CLIENT_VERSION.to_string()));
        headers.push(("X-OpenAI-Internal-Codex-Responses-Lite", "true".to_string()));
    } else {
        headers.push(("originator", "linkgo".to_string()));
        headers.push(("User-Agent", "linkgo".to_string()));
    }
    headers
}

fn input_item(message: &AgentMessageInput) -> Option<Value> {
    match (
        message.role.as_str(),
        message.tool_name.as_deref(),
        message.provider_tool_call_id.as_deref(),
    ) {
        ("system", _, _) => None,
        ("assistant", Some(tool_name), Some(call_id)) => Some(json!({
            "type": "function_call",
            "call_id": call_id,
            "name": tool_name,
            "arguments": message.content,
        })),
        ("tool", _, Some(call_id)) => Some(json!({
            "type": "function_call_output",
            "call_id": call_id,
            "output": message.content,
        })),
        ("assistant", _, _) => Some(json!({
            "type": "message",
            "role": "assistant",
            "content": [{ "type": "output_text", "text": message.content, "annotations": [] }],
        })),
        _ => Some(json!({
            "type": "message",
            "role": "user",
            "content": [{ "type": "input_text", "text": message.content }],
        })),
    }
}

/// Responses-API payload. The Codex backend has no named tool choice, so a
/// named choice narrows the offered tools to that one and requires a call.
pub fn codex_payload(input: &AgentProviderStreamInput) -> Value {
    let instructions = input
        .request
        .messages
        .iter()
        .filter(|message| message.role == "system")
        .map(|message| message.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");
    let items = input
        .request
        .messages
        .iter()
        .filter_map(input_item)
        .collect::<Vec<_>>();

    let (mut tools, tool_choice) = native_agent_provider_options(input);
    let choice = match (
        tool_choice.as_str(),
        tool_choice.get("name").and_then(Value::as_str),
    ) {
        (Some(choice), _) => choice.to_string(),
        (None, Some(name)) => {
            tools.retain(|tool| tool.name == name);
            "required".to_string()
        }
        _ => "auto".to_string(),
    };

    let mut payload = json!({
        "model": input.model_name,
        "store": false,
        "stream": true,
        "instructions": if instructions.trim().is_empty() { DEFAULT_INSTRUCTIONS.to_string() } else { instructions },
        "input": items,
        "tool_choice": choice,
        "parallel_tool_calls": false,
    });
    if !tools.is_empty() {
        payload["tools"] = Value::Array(
            tools
                .iter()
                .map(|tool| {
                    json!({
                        "type": "function",
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.input_schema,
                        "strict": Value::Null,
                    })
                })
                .collect(),
        );
    }
    if is_responses_lite(&input.model_name) {
        payload["text"] = json!({ "verbosity": "low" });
        payload["reasoning"] = json!({ "effort": "low", "summary": "auto" });
    }
    payload
}

fn sanitized_error(value: &Value) -> String {
    let message = value
        .get("response")
        .and_then(|response| response.get("error"))
        .or_else(|| value.get("error"))
        .and_then(|error| error.get("message"))
        .or_else(|| value.get("message"))
        .and_then(Value::as_str)
        .unwrap_or("ChatGPT response failed");
    crate::net::transport::truncate_error_message(message)
}

/// Parses a buffered SSE body and returns the final `response` object.
pub fn completed_response_from_sse(body: &str) -> Result<Value, String> {
    for line in body.lines() {
        let Some(data) = line.strip_prefix("data:") else {
            continue;
        };
        let data = data.trim();
        if data.is_empty() || data == "[DONE]" {
            continue;
        }
        let Ok(event) = serde_json::from_str::<Value>(data) else {
            continue;
        };
        match event.get("type").and_then(Value::as_str) {
            Some("response.completed") | Some("response.done") => {
                return event
                    .get("response")
                    .cloned()
                    .ok_or_else(|| "ChatGPT response was missing its body".to_string());
            }
            Some("response.failed") | Some("error") => return Err(sanitized_error(&event)),
            _ => {}
        }
    }
    Err("ChatGPT response ended before completing".to_string())
}

/// Maps Responses `output` items to agent chunks through the tool allowlist.
pub fn codex_response_chunks(
    response: &Value,
    tools: &[AgentProviderToolDefinitionInput],
) -> Result<Vec<Value>, String> {
    let available: HashSet<String> = tools.iter().map(|tool| tool.name.clone()).collect();
    let output = response
        .get("output")
        .and_then(Value::as_array)
        .ok_or_else(|| "ChatGPT response did not include output".to_string())?;
    let mut text_parts = Vec::new();
    let mut tool_chunks = Vec::new();
    for item in output {
        match item.get("type").and_then(Value::as_str) {
            Some("message") => {
                for part in item
                    .get("content")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    if part.get("type").and_then(Value::as_str) == Some("output_text") {
                        if let Some(text) = part.get("text").and_then(Value::as_str) {
                            text_parts.push(text.to_string());
                        }
                    }
                }
            }
            Some("function_call") => {
                let name = item
                    .get("name")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "Provider tool call did not include a name".to_string())?;
                validate_tool_name(name, &available)?;
                let input = parse_tool_arguments(item.get("arguments"))?;
                tool_chunks.push(tool_call_chunk(
                    item.get("call_id").and_then(Value::as_str),
                    name,
                    input,
                ));
            }
            _ => {}
        }
    }
    let text = text_parts.join("").trim().to_string();
    build_response_chunks((!text.is_empty()).then_some(text), tool_chunks)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_runtime::{AgentModelRequestInput, AgentProviderToolSelectionInput};

    fn input(model: &str, tool_choice: Value) -> AgentProviderStreamInput {
        AgentProviderStreamInput {
            provider_key: "openai".to_string(),
            model_name: model.to_string(),
            request: AgentModelRequestInput {
                messages: vec![
                    AgentMessageInput {
                        role: "system".to_string(),
                        content: "Be brief.".to_string(),
                        tool_name: None,
                        provider_tool_call_id: None,
                    },
                    AgentMessageInput {
                        role: "user".to_string(),
                        content: "Hello".to_string(),
                        tool_name: None,
                        provider_tool_call_id: None,
                    },
                    AgentMessageInput {
                        role: "assistant".to_string(),
                        content: "{\"topic\":\"x\"}".to_string(),
                        tool_name: Some("draft_post".to_string()),
                        provider_tool_call_id: Some("call_1".to_string()),
                    },
                    AgentMessageInput {
                        role: "tool".to_string(),
                        content: "done".to_string(),
                        tool_name: Some("draft_post".to_string()),
                        provider_tool_call_id: Some("call_1".to_string()),
                    },
                ],
            },
            tools: vec![AgentProviderToolSelectionInput {
                name: "draft_post".to_string(),
            }],
            tool_choice,
        }
    }

    #[test]
    fn payload_uses_responses_shape_without_storage() {
        let payload = codex_payload(&input("gpt-6-sol", json!("auto")));
        assert_eq!(payload["store"], json!(false));
        assert_eq!(payload["stream"], json!(true));
        assert_eq!(payload["instructions"], json!("Be brief."));
        let items = payload["input"].as_array().expect("input");
        assert_eq!(items.len(), 3);
        assert_eq!(items[0]["content"][0]["type"], json!("input_text"));
        assert_eq!(items[1]["type"], json!("function_call"));
        assert_eq!(items[2]["type"], json!("function_call_output"));
        assert_eq!(payload["tools"][0]["name"], json!("draft_post"));
        assert_eq!(payload["tool_choice"], json!("auto"));
    }

    #[test]
    fn named_tool_choice_becomes_required_with_only_that_tool() {
        let payload = codex_payload(&input("gpt-6-sol", json!({ "name": "draft_post" })));
        assert_eq!(payload["tool_choice"], json!("required"));
        assert_eq!(payload["tools"].as_array().map(Vec::len), Some(1));
    }

    #[test]
    fn headers_carry_account_and_beta() {
        let headers = codex_headers("gpt-6-sol", "acct-9");
        assert!(headers.contains(&("chatgpt-account-id", "acct-9".to_string())));
        assert!(headers.contains(&("OpenAI-Beta", "responses=experimental".to_string())));
        assert!(headers.iter().any(|(name, _)| *name == "originator"));
    }

    #[test]
    fn api_only_models_are_rejected() {
        assert!(ensure_codex_model("gpt-4.1-mini").is_err());
        assert!(ensure_codex_model("gpt-6-luna").is_ok());
    }

    #[test]
    fn parses_completed_sse_into_text_and_allowed_tool_chunks() {
        let body = concat!(
            "event: response.created\n",
            "data: {\"type\":\"response.created\",\"response\":{}}\n\n",
            "data: {\"type\":\"response.output_text.delta\",\"delta\":\"Hi\"}\n\n",
            "data: {\"type\":\"response.completed\",\"response\":{\"output\":[",
            "{\"type\":\"reasoning\",\"summary\":[]},",
            "{\"type\":\"message\",\"content\":[{\"type\":\"output_text\",\"text\":\"Hi there\"}]},",
            "{\"type\":\"function_call\",\"call_id\":\"c1\",\"name\":\"draft_post\",\"arguments\":\"{\\\"topic\\\":\\\"a\\\"}\"}",
            "]}}\n\n"
        );
        let response = completed_response_from_sse(body).expect("completed");
        let (tools, _) = native_agent_provider_options(&input("gpt-6-sol", json!("auto")));
        let chunks = codex_response_chunks(&response, &tools).expect("chunks");
        assert_eq!(chunks[0], json!({ "type": "text", "text": "Hi there" }));
        assert_eq!(chunks[1]["toolName"], json!("draft_post"));
        assert_eq!(chunks[1]["providerToolCallId"], json!("c1"));
        assert_eq!(chunks[2]["type"], json!("done"));
    }

    #[test]
    fn unregistered_tool_and_failures_are_rejected() {
        let response = json!({"output":[{"type":"function_call","name":"delete_everything","arguments":"{}"}]});
        let (tools, _) = native_agent_provider_options(&input("gpt-6-sol", json!("auto")));
        assert!(codex_response_chunks(&response, &tools).is_err());

        let failed = "data: {\"type\":\"response.failed\",\"response\":{\"error\":{\"message\":\"quota exceeded\"}}}\n";
        assert_eq!(
            completed_response_from_sse(failed).unwrap_err(),
            "quota exceeded"
        );
        assert!(completed_response_from_sse("data: {\"type\":\"response.created\"}\n").is_err());
    }
}
