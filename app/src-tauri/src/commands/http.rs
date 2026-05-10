// CC Sesija A §2.1 Task A4 — shared HTTP helpers for sidecar-proxy commands.
//
// Extracted from commands/memory.rs at A4 because wiki.rs becomes the second
// consumer (rule of two). Future command modules (onboarding A10+, agent.rs
// where applicable) should also import from here rather than reimplementing.

use serde_json::Value;

const SIDECAR_HOST: &str = "127.0.0.1";

pub fn sidecar_url(port: u16, path: &str) -> String {
    format!("http://{}:{}{}", SIDECAR_HOST, port, path)
}

pub async fn http_get(url: &str) -> Result<reqwest::Response, String> {
    reqwest::get(url)
        .await
        .map_err(|e| format!("HTTP GET {} failed: {}", url, e))
}

pub async fn http_post(url: &str, body: &Value) -> Result<reqwest::Response, String> {
    let client = reqwest::Client::new();
    client
        .post(url)
        .json(body)
        .send()
        .await
        .map_err(|e| format!("HTTP POST {} failed: {}", url, e))
}

pub async fn parse_json(resp: reqwest::Response) -> Result<Value, String> {
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
