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

use crate::service::{ServiceEndpoint, ServiceState};

const STREAM_TIMEOUT_SECS: u64 = 300;
const SESSION_TOKEN_RESPONSE_MAX_BYTES: usize = 4096;

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
    let endpoint = crate::service::ensure_service(state).await?;
    let app_clone = app.clone();
    let req_id_clone = request_id.clone();

    tokio::spawn(async move {
        if let Err(e) = stream_chat(
            app_clone,
            endpoint,
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

fn with_desktop_bootstrap(
    request: reqwest::RequestBuilder,
    bootstrap_token: &str,
) -> reqwest::RequestBuilder {
    request.header("x-waggle-desktop-bootstrap", bootstrap_token)
}

fn with_session_bearer(
    request: reqwest::RequestBuilder,
    session_token: &str,
) -> reqwest::RequestBuilder {
    request.bearer_auth(session_token)
}

fn build_loopback_client(builder: reqwest::ClientBuilder) -> Result<reqwest::Client, String> {
    builder
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(STREAM_TIMEOUT_SECS))
        .build()
        .map_err(|error| error.to_string())
}

async fn bootstrap_session_token(
    client: &reqwest::Client,
    endpoint: &ServiceEndpoint,
) -> Result<String, String> {
    let url = format!("http://127.0.0.1:{}/api/auth/session-token", endpoint.port);
    let response = with_desktop_bootstrap(client.get(url), &endpoint.bootstrap_token)
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|error| format!("Session bootstrap failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Session bootstrap returned {}", response.status()));
    }
    if response
        .content_length()
        .is_some_and(|length| length > SESSION_TOKEN_RESPONSE_MAX_BYTES as u64)
    {
        return Err("Session bootstrap response is too large".to_string());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Session bootstrap response failed: {error}"))?;
    if bytes.len() > SESSION_TOKEN_RESPONSE_MAX_BYTES {
        return Err("Session bootstrap response is too large".to_string());
    }
    let payload: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "Session bootstrap returned invalid JSON".to_string())?;
    let token = payload
        .get("token")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.len() <= 1024)
        .ok_or_else(|| "Session bootstrap returned an invalid token".to_string())?;
    Ok(token.to_string())
}

#[allow(clippy::too_many_arguments)]
async fn stream_chat(
    app: AppHandle,
    endpoint: ServiceEndpoint,
    request_id: String,
    query: String,
    shape: Option<String>,
    workspace_id: Option<String>,
    persona: Option<String>,
    model: Option<String>,
    session: Option<String>,
) -> Result<(), String> {
    // A3.1 (2026-04-30): re-pointed from /api/chat to /api/agent/run.
    // /api/agent/run is the dedicated shape-aware structured-retrieval
    // endpoint (runRetrievalAgentLoop) — distinct from /api/chat which is
    // for conversational multi-turn dialogue (runAgentLoop). Shape now flows
    // end-to-end: Tauri body field "shape" → sidecar promptShapeOverride
    // → runRetrievalAgentLoop pickShape().
    //
    // The TS binding's `session` arg is intentionally ignored here:
    // /api/agent/run is one-shot (no persistent session), so passing
    // session through would just be dead weight. Binding signature stays
    // stable so callers don't break.
    let url = format!("http://127.0.0.1:{}/api/agent/run", endpoint.port);
    let mut body = json!({ "question": query });
    if let Some(ws) = workspace_id {
        body["workspace"] = json!(ws);
    }
    if let Some(p) = persona {
        body["persona"] = json!(p);
    }
    if let Some(m) = model {
        body["model"] = json!(m);
    }
    if let Some(sh) = shape {
        body["shape"] = json!(sh);
    }
    // `session` arg accepted by the Tauri command for binding-stability but
    // not threaded into /api/agent/run (one-shot). Suppress unused-warn.
    let _ = session;

    let event_name = format!("agent-stream-{}", request_id);
    let end_event = format!("agent-stream-{}-end", request_id);

    let client = match build_loopback_client(reqwest::Client::builder()) {
        Ok(c) => c,
        Err(e) => {
            let _ = app.emit(
                &end_event,
                json!({ "error": format!("client build failed: {}", e) }),
            );
            return Err(e.to_string());
        }
    };

    let session_token = match bootstrap_session_token(&client, &endpoint).await {
        Ok(token) => token,
        Err(error) => {
            let _ = app.emit(&end_event, json!({ "error": error }));
            return Err(error);
        }
    };

    let mut resp = match with_session_bearer(client.post(&url), &session_token)
        .json(&body)
        .send()
        .await
    {
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
    let mut terminal_error: Option<String> = None;
    let mut saw_successful_done = false;
    loop {
        match resp.chunk().await {
            Ok(Some(bytes)) => {
                if let Ok(s) = std::str::from_utf8(&bytes) {
                    buffer.push_str(s);
                }
                while let Some(idx) = buffer.find("\n\n") {
                    let block: String = buffer.drain(..idx + 2).collect();
                    if let Some(parsed) = parse_sse_event(&block) {
                        if terminal_error.is_none() {
                            terminal_error = terminal_failure(&parsed);
                        }
                        saw_successful_done |= successful_done(&parsed);
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
            if terminal_error.is_none() {
                terminal_error = terminal_failure(&parsed);
            }
            saw_successful_done |= successful_done(&parsed);
            let _ = app.emit(&event_name, parsed);
        }
    }

    if let Err(error) = stream_outcome(terminal_error, saw_successful_done) {
        let _ = app.emit(&end_event, json!({ "error": error }));
        return Err(error);
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

fn terminal_failure(event: &Value) -> Option<String> {
    match event.get("event").and_then(Value::as_str) {
        Some("error") => {
            let data = event.get("data").unwrap_or(&Value::Null);
            let detail = data
                .get("error")
                .or_else(|| data.get("message"))
                .or_else(|| data.get("code"))
                .and_then(Value::as_str)
                .or_else(|| data.as_str())
                .unwrap_or("agent run reported an error");
            Some(detail.to_string())
        }
        Some("done")
            if event
                .get("data")
                .and_then(|data| data.get("ok"))
                .and_then(Value::as_bool)
                == Some(false) =>
        {
            Some("agent run reported done.ok=false".to_string())
        }
        _ => None,
    }
}

fn successful_done(event: &Value) -> bool {
    event.get("event").and_then(Value::as_str) == Some("done")
        && event
            .get("data")
            .and_then(|data| data.get("ok"))
            .and_then(Value::as_bool)
            == Some(true)
}

fn stream_outcome(terminal_error: Option<String>, saw_successful_done: bool) -> Result<(), String> {
    if let Some(error) = terminal_error {
        return Err(error);
    }
    if !saw_successful_done {
        return Err("agent run ended before done.ok=true".to_string());
    }
    Ok(())
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

    #[test]
    fn failed_done_event_is_a_terminal_failure() {
        let parsed =
            parse_sse_event("event: done\ndata: {\"ok\":false}\n\n").expect("should parse");
        assert_eq!(
            terminal_failure(&parsed).as_deref(),
            Some("agent run reported done.ok=false")
        );
    }

    #[test]
    fn agent_request_uses_the_bootstrapped_bearer_token() {
        let client = reqwest::Client::new();
        let request = with_session_bearer(
            client.post("http://127.0.0.1:3333/api/agent/run"),
            "desktop-session-token",
        )
        .build()
        .expect("request should build");
        assert_eq!(
            request
                .headers()
                .get(reqwest::header::AUTHORIZATION)
                .and_then(|value| value.to_str().ok()),
            Some("Bearer desktop-session-token")
        );
    }

    #[tokio::test]
    async fn bootstrap_uses_the_owned_launch_credential() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("listener should bind");
        let port = listener.local_addr().expect("listener address").port();
        let proxy_listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("proxy trap should bind");
        let proxy_port = proxy_listener
            .local_addr()
            .expect("proxy trap address")
            .port();
        let upstream = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.expect("request should arrive");
            let mut request = Vec::with_capacity(4096);
            let mut chunk = [0_u8; 512];
            while !request.windows(4).any(|window| window == b"\r\n\r\n") {
                let read = socket.read(&mut chunk).await.expect("request should read");
                assert!(read > 0, "request ended before headers completed");
                request.extend_from_slice(&chunk[..read]);
                assert!(request.len() <= 4096, "request headers exceeded bound");
            }
            let request = String::from_utf8_lossy(&request);
            assert!(request.starts_with("GET /api/auth/session-token HTTP/1.1"));
            assert!(request
                .to_ascii_lowercase()
                .contains("x-waggle-desktop-bootstrap: owned-bootstrap-token"));
            socket
                .write_all(
                    b"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: 33\r\nconnection: close\r\n\r\n{\"token\":\"desktop-session-token\"}",
                )
                .await
                .expect("response should write");
        });
        let endpoint = crate::service::ServiceEndpoint {
            port,
            instance_id: "owned-instance".to_string(),
            bootstrap_token: "owned-bootstrap-token".to_string(),
        };
        let client = build_loopback_client(
            reqwest::Client::builder().proxy(
                reqwest::Proxy::all(format!("http://127.0.0.1:{proxy_port}"))
                    .expect("proxy should parse"),
            ),
        )
        .expect("client should build");

        let token = bootstrap_session_token(&client, &endpoint)
            .await
            .expect("bootstrap should succeed");

        assert_eq!(token, "desktop-session-token");
        upstream.await.expect("upstream should finish");
        assert!(
            tokio::time::timeout(Duration::from_millis(100), proxy_listener.accept())
                .await
                .is_err(),
            "owned loopback request must bypass every configured proxy"
        );
    }

    #[test]
    fn stream_outcome_requires_explicit_successful_done_event() {
        assert_eq!(
            stream_outcome(None, false).expect_err("missing done must fail"),
            "agent run ended before done.ok=true"
        );
        assert_eq!(stream_outcome(None, true), Ok(()));
        assert_eq!(
            stream_outcome(Some("upstream failed".to_string()), true)
                .expect_err("terminal error must win"),
            "upstream failed"
        );
    }
}
