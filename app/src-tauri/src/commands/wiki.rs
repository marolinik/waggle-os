// CC Sesija A §2.1 Task A4 — wiki Tauri commands.
//
// Brief: briefs/2026-04-30-cc-sesija-A-waggle-apps-web-integration.md §2.1 Task A4
//
// Read-side wiki commands proxying to the sidecar's /api/wiki/* routes which read
// from the per-workspace MindDB (FrameStore + KnowledgeGraph). The compile route
// triggers a fresh wiki-compiler pass for the active workspace.
//
// Brief §2.1 Task A4 says "reads packages/wiki-compiler output direktno iz hive-mind
// frame store" — direktno here means "without intermediate cache" not "direct
// sqlite from Rust" (Tauri shell intentionally has no sqlite deps; substrate stays
// in the sidecar process — see commands/memory.rs header for full rationale).
//
// Note: compile_wiki_section was previously colocated in commands/memory.rs (A1).
// A4 moves it here for cohesion. Tauri command surface is unchanged; lib.rs
// invoke_handler entry just rewires from `memory::compile_wiki_section` to
// `wiki::compile_wiki_section`.

use serde_json::{json, Value};
use tauri::State;

use crate::commands::http::{http_get, http_post, parse_json, sidecar_url};
use crate::service::ServiceState;

/// List all compiled wiki pages for the active workspace. Returns the page
/// index (slugs + titles + metadata); call get_wiki_page_content for the body.
#[tauri::command]
pub async fn get_wiki_pages(state: State<'_, ServiceState>) -> Result<Value, String> {
    let url = sidecar_url(state.port, "/api/wiki/pages");
    let resp = http_get(&url).await?;
    parse_json(resp).await
}

/// Fetch a single wiki page's metadata (title, type, source frame ids, etc.)
/// without the full markdown body. Use get_wiki_page_content for the body.
#[tauri::command]
pub async fn get_wiki_page(
    state: State<'_, ServiceState>,
    slug: String,
) -> Result<Value, String> {
    let url = sidecar_url(state.port, &format!("/api/wiki/pages/{}", urlencoding::encode(&slug)));
    let resp = http_get(&url).await?;
    parse_json(resp).await
}

/// Fetch the full markdown content for a wiki page by slug. Returns whatever
/// the sidecar emits (typically `{ slug, content, ... }`).
#[tauri::command]
pub async fn get_wiki_page_content(
    state: State<'_, ServiceState>,
    slug: String,
) -> Result<Value, String> {
    let url = sidecar_url(
        state.port,
        &format!("/api/wiki/pages/{}/content", urlencoding::encode(&slug)),
    );
    let resp = http_get(&url).await?;
    parse_json(resp).await
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
