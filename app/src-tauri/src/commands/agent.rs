// CC Sesija A §2.1 Task A3 — agent loop streaming Tauri command.
//
// Brief: briefs/2026-04-30-cc-sesija-A-waggle-apps-web-integration.md §2.1 Task A3
//
// Pattern: command returns a request_id immediately; tokio task POSTs to the
// sidecar's `/api/chat` SSE endpoint, parses each event block, and emits
// `agent-stream-{request_id}` to the webview per chunk. End-of-stream emits
// `agent-stream-{request_id}-end` with either `{ ok: true }` or `{ error, ... }`.
//
// The webview's tauri-bindings.runAgentQuery() returns the request_id + an
// unlisten handle so React components can subscribe per-conversation without
// global state.
//
// A3.1 follow-up tracking:
//   - sidecar `/api/chat` calls `runAgentLoop`, not `runRetrievalAgentLoop`
//     as the brief requested. Faza 1's runRetrievalAgentLoop with shape
//     selection is not yet wired into the chat path. The `shape` param is
//     accepted here and passed through the body so a future sidecar patch
//     can read it without changing this command's surface. Document in
//     A3.1 follow-up.

use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::service::ServiceState;

const STREAM_TIMEOUT_SECS: u64 = 300;

/// Start an agent query. Returns a request_id; chunks arrive via the
/// `agent-stream-{request_id}` Tauri event, end via `agent-stream-{request_id}-end`.
#[tauri::command]
pub async fn run_agent_query(
    app: AppHandle,
    state: State<'_, ServiceState>,
    query: String,
    shape: Option<String>,
    workspace_id: Option<String>,
    persona: Option<String>,
    model: Option<String>,
    session: Option<String>,
) -> Result<String, String> {
    let request_id = format!("agent-{}", Uuid::new_v4());
    let port = state.port;
    let app_clone = app.clone();
    let req_id_clone = request_id.clone();

    tokio::spawn(async move {
        if let Err(e) = stream_chat(
            app_clone,
            port,
            req_id_clone,
            query,
            shape,
            workspace_id,
            persona,
            model,
            session,
        )
        .await
        {
            // The end event is already emitted from inside stream_chat on error
            // paths; this stderr is a developer-facing breadcrumb only.
            eprintln!("[agent] run_agent_query stream task error: {}", e);
        }
    });

    Ok(request_id)
}

#[allow(clippy::too_many_arguments)]
async fn stream_chat(
    app: AppHandle,
    port: u16,
    request_id: String,
    query: String,
    shape: Option<String>,
    workspace_id: Option<String>,
    persona: Option<String>,
    model: Option<String>,
    session: Option<String>,
) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{}/api/chat", port);
    let mut body = json!({ "message": query });
    if let Some(ws) = workspace_id {
        body["workspace"] = json!(ws);
    }
    if let Some(p) = persona {
        body["persona"] = json!(p);
    }
    if let Some(m) = model {
        body["model"] = json!(m);
    }
    if let Some(s) = session {
        body["session"] = json!(s);
    }
    if let Some(sh) = shape {
        // A3.1 follow-up: sidecar /api/chat does not yet honor `shape`.
        // Carrying through the body so the future patch is a one-line
        // sidecar change — Tauri command surface stays stable.
        body["shape"] = json!(sh);
    }

    let event_name = format!("agent-stream-{}", request_id);
    let end_event = format!("agent-stream-{}-end", request_id);

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(STREAM_TIMEOUT_SECS))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            let _ = app.emit(
                &end_event,
                json!({ "error": format!("client build failed: {}", e) }),
            );
            return Err(e.to_string());
        }
    };

    let mut resp = match client.post(&url).json(&body).send().await {
        Ok(r) => r,
        Err(e) => {
            let _ = app.emit(
                &end_event,
                json!({ "error": format!("HTTP POST failed: {}", e) }),
            );
            return Err(e.to_string());
        }
    };

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        let _ = app.emit(
            &end_event,
            json!({
                "error": format!("sidecar returned {}", status),
                "body": body_text,
            }),
        );
        return Err(format!("sidecar returned {}", status));
    }

    // Read SSE stream chunk by chunk. SSE events are delimited by a blank
    // line (\n\n). Each block has zero or one `event:` line and one or more
    // `data:` lines. We accumulate bytes into a String buffer, then drain
    // complete blocks one at a time.
    let mut buffer = String::new();
    loop {
        match resp.chunk().await {
            Ok(Some(bytes)) => {
                if let Ok(s) = std::str::from_utf8(&bytes) {
                    buffer.push_str(s);
                }
                while let Some(idx) = buffer.find("\n\n") {
                    let block: String = buffer.drain(..idx + 2).collect();
                    if let Some(parsed) = parse_sse_event(&block) {
                        let _ = app.emit(&event_name, parsed);
                    }
                }
            }
            Ok(None) => break,
            Err(e) => {
                let _ = app.emit(
                    &end_event,
                    json!({ "error": format!("stream read error: {}", e) }),
                );
                return Err(e.to_string());
            }
        }
    }

    // Drain any tail block that didn't end with a blank line (server may close
    // the connection without a final separator).
    let tail = buffer.trim();
    if !tail.is_empty() {
        if let Some(parsed) = parse_sse_event(tail) {
            let _ = app.emit(&event_name, parsed);
        }
    }

    let _ = app.emit(&end_event, json!({ "ok": true }));
    Ok(())
}

/// Parse a single SSE event block. Returns `{ event, data }` where `data` is the
/// parsed JSON value when possible, otherwise the raw concatenated data text.
/// SSE allows multiple `data:` lines within a single event — they are joined
/// with `\n` per the spec.
fn parse_sse_event(block: &str) -> Option<Value> {
    let mut event_name = String::from("message");
    let mut data_lines: Vec<String> = Vec::new();

    for line in block.lines() {
        if let Some(rest) = line.strip_prefix("event:") {
            event_name = rest.trim().to_string();
        } else if let Some(rest) = line.strip_prefix("data:") {
            // Per SSE spec, a single leading space after `data:` is stripped.
            let value = rest.strip_prefix(' ').unwrap_or(rest);
            data_lines.push(value.to_string());
        }
        // `id:` and `retry:` and comment (`:`) lines are intentionally ignored.
    }

    if data_lines.is_empty() {
        return None;
    }

    let data_str = data_lines.join("\n");
    let data_value: Value =
        serde_json::from_str(&data_str).unwrap_or_else(|_| Value::String(data_str));

    Some(json!({
        "event": event_name,
        "data": data_value,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_sse_simple_data_only() {
        let block = "data: hello\n\n";
        let parsed = parse_sse_event(block).expect("should parse");
        assert_eq!(parsed["event"], "message");
        assert_eq!(parsed["data"], "hello");
    }

    #[test]
    fn parse_sse_event_and_json_data() {
        let block = "event: step\ndata: {\"chunk\":\"hi\"}\n\n";
        let parsed = parse_sse_event(block).expect("should parse");
        assert_eq!(parsed["event"], "step");
        assert_eq!(parsed["data"]["chunk"], "hi");
    }

    #[test]
    fn parse_sse_multiline_data_joined_with_newline() {
        let block = "event: step\ndata: line1\ndata: line2\n\n";
        let parsed = parse_sse_event(block).expect("should parse");
        assert_eq!(parsed["data"], "line1\nline2");
    }

    #[test]
    fn parse_sse_empty_data_returns_none() {
        let block = "event: ping\n\n";
        assert!(parse_sse_event(block).is_none());
    }

    #[test]
    fn parse_sse_strips_single_leading_space_after_colon() {
        let block = "data: foo\n\n";
        let parsed = parse_sse_event(block).expect("should parse");
        assert_eq!(parsed["data"], "foo");
    }
}
