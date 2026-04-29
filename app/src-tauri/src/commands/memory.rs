// CC Sesija A §2.1 Task A1 — memory + wiki + identity Tauri commands.
//
// Architecture: thin HTTP proxies to local sidecar (Fastify, port from ServiceState).
// Tauri Rust shell intentionally has no direct sqlite/sqlite-vec dependencies — all
// substrate access goes through the sidecar so that the storage layer (FrameStore,
// HybridSearch, KnowledgeGraph, wiki-compiler) lives in one process.
//
// Command surface matches brief §2.1 Task A1 names:
//   recall_memory          → GET  /api/memory/search
//   save_memory            → POST /api/memory/frames
//   search_entities        → GET  /api/memory/graph
//   compile_wiki_section   → POST /api/wiki/compile
//   get_identity           → GET  /api/identity   (route not yet implemented in sidecar
//                                                  — graceful 404 → placeholder JSON;
//                                                  follow-up A1.1 will add sidecar route)
//
// All commands return serde_json::Value so the React/TS adapter layer (apps/web/src/lib/
// adapter.ts → tauri-bindings.ts) can keep its existing fetch-style response handling.

use serde_json::{json, Value};
use tauri::State;

use crate::service::ServiceState;

const SIDECAR_HOST: &str = "127.0.0.1";

fn sidecar_url(port: u16, path: &str) -> String {
    format!("http://{}:{}{}", SIDECAR_HOST, port, path)
}

async fn http_get(url: &str) -> Result<reqwest::Response, String> {
    reqwest::get(url)
        .await
        .map_err(|e| format!("HTTP GET {} failed: {}", url, e))
}

async fn http_post(url: &str, body: &Value) -> Result<reqwest::Response, String> {
    let client = reqwest::Client::new();
    client
        .post(url)
        .json(body)
        .send()
        .await
        .map_err(|e| format!("HTTP POST {} failed: {}", url, e))
}

async fn parse_json(resp: reqwest::Response) -> Result<Value, String> {
    let status = resp.status();
    if !status.is_success() {
        let body_text = resp
            .text()
            .await
            .unwrap_or_else(|_| "<unreadable body>".to_string());
        return Err(format!("sidecar returned {}: {}", status, body_text));
    }
    resp.json::<Value>()
        .await
        .map_err(|e| format!("sidecar returned non-JSON body: {}", e))
}

/// Recall memory frames matching `query`. Optional `scope` (all|personal|workspace),
/// `limit` (default sidecar-side ~20), `workspace_id` (workspace mind to search).
#[tauri::command]
pub async fn recall_memory(
    state: State<'_, ServiceState>,
    query: String,
    scope: Option<String>,
    limit: Option<u32>,
    workspace_id: Option<String>,
) -> Result<Value, String> {
    let mut url = format!(
        "{}?q={}",
        sidecar_url(state.port, "/api/memory/search"),
        urlencoding::encode(&query)
    );
    if let Some(s) = scope {
        url.push_str(&format!("&scope={}", urlencoding::encode(&s)));
    }
    if let Some(l) = limit {
        url.push_str(&format!("&limit={}", l));
    }
    if let Some(ws) = workspace_id {
        url.push_str(&format!("&workspace={}", urlencoding::encode(&ws)));
    }

    let resp = http_get(&url).await?;
    parse_json(resp).await
}

/// Persist a new memory frame. `content` is required. Optional `workspace_id`,
/// `importance` (low|normal|high|critical per @waggle/core Importance enum), `source`
/// (one of: user_stated, tool_verified, agent_inferred, import, system).
#[tauri::command]
pub async fn save_memory(
    state: State<'_, ServiceState>,
    content: String,
    workspace_id: Option<String>,
    importance: Option<String>,
    source: Option<String>,
) -> Result<Value, String> {
    let mut body = json!({ "content": content });
    if let Some(ws) = workspace_id {
        body["workspace"] = json!(ws);
    }
    if let Some(imp) = importance {
        body["importance"] = json!(imp);
    }
    if let Some(src) = source {
        body["source"] = json!(src);
    }

    let url = sidecar_url(state.port, "/api/memory/frames");
    let resp = http_post(&url, &body).await?;
    parse_json(resp).await
}

/// Search the knowledge graph for entities/relations. Returns `{nodes, edges}` shape
/// from sidecar's KnowledgeGraph layer. `scope` defaults to "all" if not provided.
#[tauri::command]
pub async fn search_entities(
    state: State<'_, ServiceState>,
    workspace_id: Option<String>,
    scope: Option<String>,
) -> Result<Value, String> {
    let mut url = sidecar_url(state.port, "/api/memory/graph").to_string();
    let mut params: Vec<String> = Vec::new();
    if let Some(ws) = workspace_id {
        params.push(format!("workspace={}", urlencoding::encode(&ws)));
    }
    if let Some(s) = scope {
        params.push(format!("scope={}", urlencoding::encode(&s)));
    }
    if !params.is_empty() {
        url.push('?');
        url.push_str(&params.join("&"));
    }

    let resp = http_get(&url).await?;
    parse_json(resp).await
}

/// Get the user identity record from sidecar's IdentityLayer.
///
/// SIDECAR GAP (CC Sesija A §2.1 A1 follow-up A1.1): the sidecar does not yet
/// register a `/api/identity` route. Until that route ships, this command returns
/// a placeholder identity object so the React UI integration is not blocked.
/// The placeholder shape matches what packages/core/src/mind/identity.ts produces
/// for an unconfigured workspace, so downstream consumers see consistent fields.
#[tauri::command]
pub async fn get_identity(state: State<'_, ServiceState>) -> Result<Value, String> {
    let url = sidecar_url(state.port, "/api/identity");
    match http_get(&url).await {
        Ok(resp) if resp.status().as_u16() == 404 => Ok(identity_placeholder()),
        Ok(resp) => parse_json(resp).await,
        Err(_) => Ok(identity_placeholder()),
    }
}

fn identity_placeholder() -> Value {
    json!({
        "configured": false,
        "name": null,
        "email": null,
        "preferences": {},
        "_note": "identity sidecar route not implemented (CC Sesija A A1.1 follow-up)"
    })
}

/// Trigger wiki compilation for the active or specified workspace. Returns the
/// compilation summary (page count, entities, gaps) from packages/wiki-compiler.
#[tauri::command]
pub async fn compile_wiki_section(
    state: State<'_, ServiceState>,
    workspace_id: Option<String>,
) -> Result<Value, String> {
    let mut body = json!({});
    if let Some(ws) = workspace_id {
        body["workspace"] = json!(ws);
    }

    let url = sidecar_url(state.port, "/api/wiki/compile");
    let resp = http_post(&url, &body).await?;
    parse_json(resp).await
}
