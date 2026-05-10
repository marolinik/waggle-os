// CC Sesija A §2.1 + §2.3: command modules grouped under commands/.
// Each submodule exposes #[tauri::command] async fns wired in lib.rs invoke_handler.

pub mod agent;
pub mod http;
pub mod memory;
pub mod onboarding;
pub mod wiki;
