use serde::{Deserialize, Serialize};
use std::ffi::OsStr;
#[cfg(windows)]
use std::fs::{File, OpenOptions};
#[cfg(windows)]
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
#[cfg(windows)]
use std::process::Stdio;
use std::process::{Child, Command};
#[cfg(windows)]
use std::sync::Arc;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::commands::agent::{
    bootstrap_session_token, build_loopback_client, with_desktop_bootstrap, with_session_bearer,
};

const WATCHDOG_FAILURE_THRESHOLD: u32 = 3;
const WATCHDOG_INITIAL_STARTUP_GRACE: Duration = Duration::from_secs(600);
const READY_RECORD_MAX_BYTES: u64 = 16 * 1024;
const GRACEFUL_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(12);
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;
#[cfg(windows)]
const MAX_SERVICE_LOG_BYTES: u64 = 5 * 1024 * 1024;
#[cfg(windows)]
const SERVICE_LOG_DIR_ENV: &str = "WAGGLE_DESKTOP_SERVICE_LOG_DIR";

#[cfg(windows)]
#[derive(Debug)]
struct KillOnCloseJob(windows_sys::Win32::Foundation::HANDLE);

#[cfg(windows)]
unsafe impl Send for KillOnCloseJob {}

#[cfg(windows)]
impl Drop for KillOnCloseJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

#[cfg(windows)]
fn create_kill_on_close_job() -> Result<KillOnCloseJob, String> {
    use windows_sys::Win32::System::JobObjects::{
        CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK,
    };

    let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
    if job.is_null() {
        return Err(format!(
            "Unable to create the managed service job: {}",
            std::io::Error::last_os_error()
        ));
    }
    let job = KillOnCloseJob(job);
    let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
    limits.BasicLimitInformation.LimitFlags =
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK;
    let configured = unsafe {
        SetInformationJobObject(
            job.0,
            JobObjectExtendedLimitInformation,
            std::ptr::from_ref(&limits).cast(),
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    };
    if configured == 0 {
        return Err(format!(
            "Unable to configure the managed service job: {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(job)
}

#[cfg(windows)]
fn assign_child_to_job(job: &KillOnCloseJob, child: &Child) -> Result<(), String> {
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::System::JobObjects::AssignProcessToJobObject;

    let assigned = unsafe { AssignProcessToJobObject(job.0, child.as_raw_handle() as HANDLE) };
    if assigned == 0 {
        return Err(format!(
            "Unable to bind the service lifetime to Waggle: {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ServiceEndpoint {
    pub port: u16,
    pub instance_id: String,
    pub bootstrap_token: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct ManagedLaunchConfig {
    instance_id: String,
    bootstrap_token: String,
    ready_path: PathBuf,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DesktopReadyRecord {
    schema_version: u8,
    instance_id: String,
    pid: u32,
    host: String,
    preferred_port: u16,
    port: u16,
    started_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HealthIdentity {
    instance_id: Option<String>,
    port: Option<u16>,
}

fn managed_launch_config(instance_id: &str) -> Result<ManagedLaunchConfig, String> {
    let instance_id = instance_id.trim();
    if instance_id.is_empty() {
        return Err("Managed service instance ID cannot be empty".to_string());
    }
    let ready_path = std::env::temp_dir()
        .join("waggle-sidecar-ready")
        .join(format!("sidecar-{}-{instance_id}.json", std::process::id()));
    if !ready_path.is_absolute() {
        return Err("Managed service ready path must be absolute".to_string());
    }
    Ok(ManagedLaunchConfig {
        instance_id: instance_id.to_string(),
        bootstrap_token: Uuid::new_v4().to_string(),
        ready_path,
    })
}

fn new_managed_launch_config() -> Result<ManagedLaunchConfig, String> {
    managed_launch_config(&Uuid::new_v4().to_string())
}

fn apply_managed_launch_environment(
    command: &mut Command,
    preferred_port: u16,
    config: &ManagedLaunchConfig,
) {
    command.env("WAGGLE_PORT", preferred_port.to_string());
    command.env("WAGGLE_DESKTOP_PORT_FALLBACK", "1");
    command.env("WAGGLE_INSTANCE_ID", &config.instance_id);
    command.env("WAGGLE_DESKTOP_BOOTSTRAP_TOKEN", &config.bootstrap_token);
    command.env("WAGGLE_READY_FILE", &config.ready_path);
}

fn parse_ready_record(
    bytes: &[u8],
    expected_instance_id: &str,
    expected_pid: u32,
    expected_preferred_port: u16,
    bootstrap_token: &str,
) -> Result<ServiceEndpoint, String> {
    if bytes.len() as u64 > READY_RECORD_MAX_BYTES {
        return Err("Managed service ready record is too large".to_string());
    }
    let record: DesktopReadyRecord = serde_json::from_slice(bytes)
        .map_err(|error| format!("Invalid managed service ready record: {error}"))?;
    if record.schema_version != 1
        || record.instance_id != expected_instance_id
        || record.pid != expected_pid
        || record.host != "127.0.0.1"
        || record.preferred_port != expected_preferred_port
        || record.port == 0
        || record.started_at.trim().is_empty()
    {
        return Err("Managed service ready record does not match the owned launch".to_string());
    }
    Ok(ServiceEndpoint {
        port: record.port,
        instance_id: record.instance_id,
        bootstrap_token: bootstrap_token.to_string(),
    })
}

fn health_payload_matches(bytes: &[u8], endpoint: &ServiceEndpoint) -> bool {
    serde_json::from_slice::<HealthIdentity>(bytes).is_ok_and(|health| {
        health.instance_id.as_deref() == Some(endpoint.instance_id.as_str())
            && health.port == Some(endpoint.port)
    })
}

fn netstat_has_owned_listener(bytes: &[u8], port: u16, pid: u32) -> bool {
    String::from_utf8_lossy(bytes).lines().any(|line| {
        let columns = line.split_whitespace().collect::<Vec<_>>();
        if columns.len() < 5
            || !columns[0].eq_ignore_ascii_case("TCP")
            || !columns[3].eq_ignore_ascii_case("LISTENING")
            || columns[4].parse::<u32>().ok() != Some(pid)
        {
            return false;
        }
        let Some((host, local_port)) = columns[1].rsplit_once(':') else {
            return false;
        };
        host == "127.0.0.1" && local_port.parse::<u16>().ok() == Some(port)
    })
}

#[cfg(windows)]
fn listener_is_owned_by_pid(port: u16, pid: u32) -> Result<bool, String> {
    let system_root = std::env::var_os("SystemRoot")
        .or_else(|| std::env::var_os("WINDIR"))
        .map(PathBuf::from)
        .ok_or_else(|| "Unable to resolve the Windows system directory".to_string())?;
    let netstat = system_root.join("System32").join("netstat.exe");
    if !netstat.is_file() {
        return Err("Unable to locate the Windows TCP ownership verifier".to_string());
    }
    let mut command = Command::new(netstat);
    command.args(["-ano", "-p", "tcp"]);
    hide_windows_console(&mut command);
    let output = command
        .output()
        .map_err(|error| format!("Unable to inspect Windows TCP ownership: {error}"))?;
    if !output.status.success() {
        return Err("Windows TCP ownership verification failed".to_string());
    }
    Ok(netstat_has_owned_listener(&output.stdout, port, pid))
}

#[cfg(not(windows))]
fn listener_is_owned_by_pid(_port: u16, _pid: u32) -> Result<bool, String> {
    // The active launch gate is Windows-first. macOS retains the existing
    // instance/child-handle validation until its platform-specific owner
    // query is implemented in the deferred macOS certification phase.
    Ok(true)
}

struct ManagedLaunch {
    generation: u64,
    child: Child,
    #[cfg(windows)]
    _job: KillOnCloseJob,
    config: ManagedLaunchConfig,
    endpoint: Option<ServiceEndpoint>,
    started_at: Instant,
}

struct ServiceRuntime {
    next_generation: u64,
    active: Option<ManagedLaunch>,
    desired_running: bool,
    shutdown_started: bool,
}

pub struct ServiceState {
    preferred_port: u16,
    runtime: Mutex<ServiceRuntime>,
}

impl ServiceState {
    pub fn new(preferred_port: u16) -> Self {
        Self {
            preferred_port,
            runtime: Mutex::new(ServiceRuntime {
                next_generation: 1,
                active: None,
                desired_running: true,
                shutdown_started: false,
            }),
        }
    }

    pub(crate) fn verified_port(&self) -> Result<u16, String> {
        current_launch_token(self)?
            .and_then(|token| token.endpoint.map(|endpoint| endpoint.port))
            .ok_or_else(|| "Managed service endpoint has not been verified".to_string())
    }
}

#[derive(Clone, Debug)]
struct LaunchToken {
    generation: u64,
    instance_id: String,
    bootstrap_token: String,
    ready_path: PathBuf,
    pid: u32,
    preferred_port: u16,
    endpoint: Option<ServiceEndpoint>,
    started_at: Instant,
}

fn valid_node_override(custom: Option<&OsStr>) -> Option<PathBuf> {
    let custom_path = PathBuf::from(custom?);
    custom_path.is_file().then_some(custom_path)
}

/// Resolve the Node.js binary path.
/// Priority: WAGGLE_NODE_PATH env → bundled resources/node[.exe] → system PATH "node"
fn resolve_node_path() -> String {
    // 1. Explicit env override (development/advanced users)
    let custom = std::env::var_os("WAGGLE_NODE_PATH");
    if let Some(custom_path) = valid_node_override(custom.as_deref()) {
        return custom_path.to_string_lossy().to_string();
    }
    if custom.as_deref().is_some_and(|value| !value.is_empty()) {
        eprintln!("[waggle] Ignoring WAGGLE_NODE_PATH because it is not a runtime file");
    }

    // 2. Bundled Node.js in resources/ directory (next to exe)
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    if let Some(ref dir) = exe_dir {
        let bundled = if cfg!(windows) {
            dir.join("resources").join("node.exe")
        } else {
            dir.join("resources").join("node")
        };
        if bundled.exists() {
            return bundled.to_string_lossy().to_string();
        }
    }

    // 3. Development fallback: relative to src-tauri working dir
    if cfg!(debug_assertions) {
        let dev_resources = if cfg!(windows) {
            "resources/node.exe"
        } else {
            "resources/node"
        };
        if std::path::Path::new(dev_resources).exists() {
            return dev_resources.to_string();
        }
    }

    // 4. System PATH fallback
    "node".to_string()
}

#[derive(Debug, PartialEq, Eq)]
enum ServiceScriptKind {
    Bundled,
    DevSource,
}

#[derive(Debug, PartialEq, Eq)]
struct ServiceScript {
    path: PathBuf,
    kind: ServiceScriptKind,
}

#[derive(Debug, PartialEq, Eq)]
struct BundledNpmEnvironment {
    data_dir: PathBuf,
    path: std::ffi::OsString,
    npm_exec_path: PathBuf,
    npm_prefix: PathBuf,
    npm_cache: PathBuf,
}

fn bundled_npm_environment(
    resources_dir: &Path,
    configured_data_dir: Option<&OsStr>,
    home_dir: Option<&OsStr>,
    ambient_path: Option<&OsStr>,
) -> Result<BundledNpmEnvironment, String> {
    let data_dir = configured_data_dir
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            home_dir
                .filter(|value| !value.is_empty())
                .map(PathBuf::from)
                .map(|home| home.join(".waggle"))
        })
        .ok_or_else(|| "Unable to resolve writable npm data directory".to_string())?;
    let runtime_dir = resources_dir
        .join("node_modules")
        .join("waggle-node-runtime");
    let npm_root = data_dir.join("npm");
    let separator = if cfg!(windows) { ";" } else { ":" };
    let mut path = std::ffi::OsString::from(runtime_dir.join("bin"));
    path.push(separator);
    path.push(resources_dir);
    if let Some(existing_path) = ambient_path.filter(|value| !value.is_empty()) {
        path.push(separator);
        path.push(existing_path);
    }

    Ok(BundledNpmEnvironment {
        data_dir,
        path,
        npm_exec_path: runtime_dir
            .join("node_modules")
            .join("npm")
            .join("bin")
            .join("npm-cli.js"),
        npm_prefix: npm_root.join("prefix"),
        npm_cache: npm_root.join("cache"),
    })
}

#[cfg(windows)]
fn hide_windows_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(windows)]
fn rotate_service_log(log_path: &Path) -> Result<(), String> {
    let metadata = match std::fs::symlink_metadata(log_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("Unable to inspect service log: {error}")),
    };
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err("Service log path is not a regular file".to_string());
    }
    if metadata.len() < MAX_SERVICE_LOG_BYTES {
        return Ok(());
    }

    let previous_path = log_path.with_file_name("service.log.1");
    if previous_path.exists() {
        std::fs::remove_file(&previous_path)
            .map_err(|error| format!("Unable to replace previous service log: {error}"))?;
    }
    std::fs::rename(log_path, previous_path)
        .map_err(|error| format!("Unable to rotate service log: {error}"))
}

#[cfg(windows)]
struct ServiceLogWriter {
    file: Option<File>,
    length: u64,
    path: PathBuf,
}

#[cfg(windows)]
impl ServiceLogWriter {
    fn open(data_dir: &Path) -> Result<Self, String> {
        let log_dir = data_dir.join("logs");
        std::fs::create_dir_all(&log_dir)
            .map_err(|error| format!("Unable to create service log directory: {error}"))?;
        let path = log_dir.join("service.log");
        rotate_service_log(&path)?;
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|error| format!("Unable to open service log: {error}"))?;
        let length = file
            .metadata()
            .map_err(|error| format!("Unable to inspect service log: {error}"))?
            .len();
        Ok(Self {
            file: Some(file),
            length,
            path,
        })
    }

    fn rotate(&mut self) -> Result<(), String> {
        if let Some(mut file) = self.file.take() {
            file.flush()
                .map_err(|error| format!("Unable to flush service log: {error}"))?;
        }
        rotate_service_log(&self.path)?;
        self.file = Some(
            OpenOptions::new()
                .create(true)
                .append(true)
                .open(&self.path)
                .map_err(|error| format!("Unable to reopen service log: {error}"))?,
        );
        self.length = 0;
        Ok(())
    }

    fn write_capped(&mut self, mut bytes: &[u8]) -> Result<(), String> {
        while !bytes.is_empty() {
            if self.length >= MAX_SERVICE_LOG_BYTES {
                self.rotate()?;
            }
            let available = (MAX_SERVICE_LOG_BYTES - self.length) as usize;
            let count = available.min(bytes.len());
            let file = self
                .file
                .as_mut()
                .ok_or_else(|| "Service log is unavailable".to_string())?;
            file.write_all(&bytes[..count])
                .map_err(|error| format!("Unable to write service log: {error}"))?;
            file.flush()
                .map_err(|error| format!("Unable to flush service log: {error}"))?;
            self.length += count as u64;
            bytes = &bytes[count..];
        }
        Ok(())
    }
}

#[cfg(windows)]
fn pump_service_log<R: Read + Send + 'static>(mut input: R, output: Arc<Mutex<ServiceLogWriter>>) {
    std::thread::spawn(move || {
        let mut buffer = [0u8; 8192];
        loop {
            let count = match input.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(count) => count,
            };
            let Ok(mut writer) = output.lock() else {
                break;
            };
            if writer.write_capped(&buffer[..count]).is_err() {
                break;
            }
        }
    });
}

#[cfg(windows)]
fn start_service_log_capture(child: &mut Child, data_dir: &Path) -> Result<(), String> {
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Managed service stdout pipe is unavailable".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Managed service stderr pipe is unavailable".to_string())?;
    let writer = Arc::new(Mutex::new(ServiceLogWriter::open(data_dir)?));
    pump_service_log(stdout, Arc::clone(&writer));
    pump_service_log(stderr, writer);
    Ok(())
}

#[cfg(windows)]
fn configured_service_log_dir(command: &Command) -> Option<PathBuf> {
    command
        .get_envs()
        .find(|(name, _)| *name == OsStr::new(SERVICE_LOG_DIR_ENV))
        .and_then(|(_, value)| value)
        .map(PathBuf::from)
}

#[cfg(windows)]
fn configure_bundled_windows_process(command: &mut Command, data_dir: &Path) -> Result<(), String> {
    ServiceLogWriter::open(data_dir)?;
    hide_windows_console(command);
    command
        .env(SERVICE_LOG_DIR_ENV, data_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    Ok(())
}

fn find_dev_service_script(current_dir: &Path) -> Option<PathBuf> {
    for dir in current_dir.ancestors() {
        let candidate = dir
            .join("packages")
            .join("server")
            .join("src")
            .join("local")
            .join("service.ts");
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

fn resolve_service_script(
    exe_dir: Option<&Path>,
    current_dir: &Path,
) -> Result<ServiceScript, String> {
    if let Some(dir) = exe_dir {
        let bundled = dir.join("resources").join("service.js");
        if bundled.exists() {
            return Ok(ServiceScript {
                path: bundled,
                kind: ServiceScriptKind::Bundled,
            });
        }
    }

    if cfg!(debug_assertions) {
        if let Some(script) = find_dev_service_script(current_dir) {
            return Ok(ServiceScript {
                path: script,
                kind: ServiceScriptKind::DevSource,
            });
        }
    }

    Err("Unable to locate sidecar service.js resource".to_string())
}

/// Build the Command used to spawn the sidecar process.
/// Shared by both the sync auto-start path and the async `ensure_service` tauri command.
fn build_service_command(
    preferred_port: u16,
    launch_config: &ManagedLaunchConfig,
) -> Result<Command, String> {
    let node_path = resolve_node_path();

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    let current_dir = std::env::current_dir().map_err(|e| e.to_string())?;
    let service_script = resolve_service_script(exe_dir.as_deref(), &current_dir)?;

    let mut cmd = if service_script.kind == ServiceScriptKind::DevSource {
        let mut c = Command::new(&node_path);
        c.arg("--import").arg("tsx").arg(&service_script.path);
        c
    } else {
        let mut c = Command::new(&node_path);
        c.arg(&service_script.path);
        c
    };

    apply_managed_launch_environment(&mut cmd, preferred_port, launch_config);

    if service_script.kind == ServiceScriptKind::Bundled {
        cmd.env("WAGGLE_SKIP_LITELLM", "1");

        if let Some(ref dir) = exe_dir {
            let resources_dir = dir.join("resources");
            let native_dir = resources_dir.join("native");
            let node_modules_dir = resources_dir.join("node_modules");
            let configured_data_dir = std::env::var_os("WAGGLE_DATA_DIR");
            let home_dir = if cfg!(windows) {
                std::env::var_os("USERPROFILE")
                    .filter(|value| !value.is_empty())
                    .or_else(|| std::env::var_os("HOME").filter(|value| !value.is_empty()))
            } else {
                std::env::var_os("HOME")
                    .filter(|value| !value.is_empty())
                    .or_else(|| std::env::var_os("USERPROFILE").filter(|value| !value.is_empty()))
            };
            let ambient_path = std::env::var_os("PATH");
            let npm_environment = bundled_npm_environment(
                &resources_dir,
                configured_data_dir.as_deref(),
                home_dir.as_deref(),
                ambient_path.as_deref(),
            )?;
            std::fs::create_dir_all(&npm_environment.npm_prefix)
                .map_err(|error| format!("Unable to create bundled npm prefix: {error}"))?;
            std::fs::create_dir_all(&npm_environment.npm_cache)
                .map_err(|error| format!("Unable to create bundled npm cache: {error}"))?;
            cmd.env("PATH", &npm_environment.path);
            cmd.env("NPM_EXECPATH", &npm_environment.npm_exec_path);
            cmd.env("NPM_CONFIG_PREFIX", &npm_environment.npm_prefix);
            cmd.env("NPM_CONFIG_CACHE", &npm_environment.npm_cache);
            #[cfg(windows)]
            configure_bundled_windows_process(&mut cmd, &npm_environment.data_dir)?;

            // NODE_PATH must include the staged production deps
            // (resources/node_modules — better-sqlite3, @fastify/static,
            // drizzle-orm, @huggingface/transformers, …) so the sidecar's bare
            // require()/import() calls resolve, plus resources/native for any
            // abs-path native consumers. Node accepts multiple entries,
            // ';'-separated on Windows and ':' elsewhere.
            let sep = if cfg!(windows) { ";" } else { ":" };
            let node_path = format!(
                "{}{}{}",
                node_modules_dir.to_string_lossy(),
                sep,
                native_dir.to_string_lossy(),
            );
            cmd.env("NODE_PATH", node_path);

            let vec_ext = if cfg!(windows) {
                native_dir.join("vec0.dll")
            } else if cfg!(target_os = "macos") {
                native_dir.join("vec0.dylib")
            } else {
                native_dir.join("vec0.so")
            };
            if vec_ext.exists() {
                cmd.env("WAGGLE_SQLITE_VEC_PATH", vec_ext.to_string_lossy().as_ref());
            }

            let ort_dir = native_dir.join("onnxruntime");
            if ort_dir.exists() {
                cmd.env(
                    "ONNXRUNTIME_NODE_BINDING_PATH",
                    ort_dir.to_string_lossy().as_ref(),
                );
            }
        }
    }

    Ok(cmd)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::process::Stdio;
    use std::sync::mpsc;
    use std::thread;

    fn long_lived_command() -> Command {
        let mut command = if cfg!(windows) {
            let mut command = Command::new("cmd");
            command.args(["/C", "ping -n 30 127.0.0.1 >NUL"]);
            command
        } else {
            let mut command = Command::new("sh");
            command.args(["-c", "sleep 30"]);
            command
        };
        command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        command
    }

    fn cooperative_command(marker: &Path) -> Command {
        let mut command = if cfg!(windows) {
            let mut command = Command::new("powershell.exe");
            command.args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &format!(
                    "while (-not (Test-Path -LiteralPath '{}')) {{ Start-Sleep -Milliseconds 20 }}",
                    marker.to_string_lossy().replace('\'', "''")
                ),
            ]);
            command
        } else {
            let mut command = Command::new("sh");
            command.args([
                "-c",
                &format!("while [ ! -f '{}' ]; do sleep 0.02; done", marker.display()),
            ]);
            command
        };
        command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        command
    }

    fn spawn_shutdown_endpoint(
        instance_id: String,
        marker: Option<PathBuf>,
    ) -> (u16, mpsc::Receiver<Vec<String>>, thread::JoinHandle<()>) {
        let listener =
            std::net::TcpListener::bind(("127.0.0.1", 0)).expect("binds shutdown endpoint");
        let port = listener
            .local_addr()
            .expect("reads shutdown address")
            .port();
        let (sender, receiver) = mpsc::channel();
        let handle = thread::spawn(move || {
            let mut requests = Vec::new();
            for _ in 0..3 {
                let (mut stream, _) = listener.accept().expect("accepts shutdown request");
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .expect("sets request timeout");
                let mut bytes = Vec::new();
                let mut buffer = [0_u8; 4096];
                loop {
                    let read = stream.read(&mut buffer).expect("reads shutdown request");
                    if read == 0 {
                        break;
                    }
                    bytes.extend_from_slice(&buffer[..read]);
                    if bytes.windows(4).any(|window| window == b"\r\n\r\n") {
                        break;
                    }
                }
                let request = String::from_utf8_lossy(&bytes).to_string();
                let first_line = request.lines().next().unwrap_or_default();
                let (status, body) = if first_line.starts_with("GET /health ") {
                    (
                        "200 OK",
                        format!(
                            "{{\"status\":\"ok\",\"instanceId\":\"{instance_id}\",\"port\":{port}}}"
                        ),
                    )
                } else if first_line.starts_with("GET /api/auth/session-token ") {
                    (
                        "200 OK",
                        "{\"token\":\"desktop-session-token\"}".to_string(),
                    )
                } else if first_line.starts_with("POST /api/auth/desktop-shutdown ") {
                    if let Some(marker) = marker.as_ref() {
                        std::fs::write(marker, b"stop").expect("signals cooperative child");
                    }
                    ("202 Accepted", "{\"accepted\":true}".to_string())
                } else {
                    ("404 Not Found", "{}".to_string())
                };
                write!(
                    stream,
                    "HTTP/1.1 {status}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
                    body.len()
                )
                .expect("writes shutdown response");
                requests.push(request);
            }
            sender.send(requests).expect("returns captured requests");
        });
        (port, receiver, handle)
    }

    #[test]
    fn managed_launch_uses_unique_ready_paths_and_exact_child_environment() {
        let first = managed_launch_config("instance-a").expect("first launch config");
        let second = managed_launch_config("instance-b").expect("second launch config");
        assert!(first.ready_path.is_absolute());
        assert_ne!(first.ready_path, second.ready_path);
        assert_ne!(first.bootstrap_token, second.bootstrap_token);

        let mut command = long_lived_command();
        apply_managed_launch_environment(&mut command, 3333, &first);
        let environment = command
            .get_envs()
            .filter_map(|(name, value)| value.map(|value| (name.to_owned(), value.to_owned())))
            .collect::<std::collections::HashMap<_, _>>();

        assert_eq!(
            environment.get(OsStr::new("WAGGLE_PORT")),
            Some(&3333.to_string().into())
        );
        assert_eq!(
            environment.get(OsStr::new("WAGGLE_DESKTOP_PORT_FALLBACK")),
            Some(&"1".into())
        );
        assert_eq!(
            environment.get(OsStr::new("WAGGLE_INSTANCE_ID")),
            Some(&"instance-a".into())
        );
        assert_eq!(
            environment.get(OsStr::new("WAGGLE_DESKTOP_BOOTSTRAP_TOKEN")),
            Some(&first.bootstrap_token.clone().into())
        );
        assert_eq!(
            environment.get(OsStr::new("WAGGLE_READY_FILE")),
            Some(&first.ready_path.into_os_string())
        );

        let generated_first = new_managed_launch_config().expect("generated first launch");
        let generated_second = new_managed_launch_config().expect("generated second launch");
        assert_ne!(generated_first.instance_id, generated_second.instance_id);
        assert_ne!(
            generated_first.bootstrap_token,
            generated_second.bootstrap_token
        );
        assert_ne!(generated_first.ready_path, generated_second.ready_path);
    }

    #[test]
    fn ready_record_accepts_only_the_owned_complete_launch() {
        let valid = br#"{"schemaVersion":1,"instanceId":"instance-a","pid":42,"host":"127.0.0.1","preferredPort":3333,"port":49152,"startedAt":"2026-08-03T00:00:00.000Z"}"#;
        assert_eq!(
            parse_ready_record(valid, "instance-a", 42, 3333, "bootstrap-a")
                .expect("owned ready record"),
            ServiceEndpoint {
                port: 49152,
                instance_id: "instance-a".to_string(),
                bootstrap_token: "bootstrap-a".to_string()
            }
        );
        assert!(parse_ready_record(valid, "instance-b", 42, 3333, "bootstrap-a").is_err());
        assert!(parse_ready_record(valid, "instance-a", 43, 3333, "bootstrap-a").is_err());
        assert!(parse_ready_record(valid, "instance-a", 42, 3334, "bootstrap-a").is_err());
        assert!(parse_ready_record(
            br#"{"instanceId":"instance-a","port":49152}"#,
            "instance-a",
            42,
            3333,
            "bootstrap-a"
        )
        .is_err());
        assert!(parse_ready_record(br#"{"schemaVersion":1,"instanceId":"instance-a","pid":42,"host":"127.0.0.1","preferredPort":3333,"port":0,"startedAt":"now"}"#, "instance-a", 42, 3333, "bootstrap-a").is_err());
    }

    #[test]
    fn health_payload_requires_the_exact_owned_endpoint() {
        let endpoint = ServiceEndpoint {
            port: 49152,
            instance_id: "instance-a".to_string(),
            bootstrap_token: "bootstrap-a".to_string(),
        };
        assert!(health_payload_matches(
            br#"{"status":"ok","instanceId":"instance-a","port":49152}"#,
            &endpoint
        ));
        assert!(!health_payload_matches(
            br#"{"status":"ok","instanceId":"instance-b","port":49152}"#,
            &endpoint
        ));
        assert!(!health_payload_matches(
            br#"{"status":"ok","port":49152}"#,
            &endpoint
        ));
        assert!(!health_payload_matches(
            br#"{"status":"ok","instanceId":"instance-a","port":3333}"#,
            &endpoint
        ));
        assert!(!health_payload_matches(b"not-json", &endpoint));
    }

    #[test]
    fn windows_listener_proof_requires_exact_loopback_port_and_child_pid() {
        let output =
            b"Proto  Local Address          Foreign Address        State           PID\r\n\
  TCP    127.0.0.1:49152        0.0.0.0:0              LISTENING       4242\r\n\
  TCP    127.0.0.1:49153        0.0.0.0:0              LISTENING       9999\r\n";
        assert!(netstat_has_owned_listener(output, 49152, 4242));
        assert!(!netstat_has_owned_listener(output, 49152, 9999));
        assert!(!netstat_has_owned_listener(output, 49153, 4242));
        assert!(!netstat_has_owned_listener(
            b"TCP 0.0.0.0:49152 0.0.0.0:0 LISTENING 4242",
            49152,
            4242,
        ));
        assert!(!netstat_has_owned_listener(
            b"TCP 127.0.0.1:49152 0.0.0.0:0 ESTABLISHED 4242",
            49152,
            4242,
        ));
    }

    #[cfg(windows)]
    #[test]
    fn windows_listener_owner_is_verified_against_the_os_table() {
        let listener =
            std::net::TcpListener::bind(("127.0.0.1", 0)).expect("binds owned loopback listener");
        let port = listener
            .local_addr()
            .expect("reads listener address")
            .port();
        assert!(listener_is_owned_by_pid(port, std::process::id())
            .expect("queries Windows TCP ownership"));
        assert!(
            !listener_is_owned_by_pid(port, std::process::id().saturating_add(1))
                .expect("rejects a different owner")
        );
    }

    #[test]
    fn explicit_stop_suppresses_watchdog_respawn() {
        let state = ServiceState::new(3333);
        spawn_managed_service_with(&state, |_, _| Ok(long_lived_command()))
            .expect("starts managed child");
        stop_service_sync(&state).expect("stops managed child");
        let build_called = std::cell::Cell::new(false);

        let recovery = recover_service_with(
            &state,
            true,
            Duration::ZERO,
            WATCHDOG_FAILURE_THRESHOLD,
            true,
            |_, _| {
                build_called.set(true);
                Ok(long_lived_command())
            },
        )
        .expect("suppresses stopped service recovery");

        assert_eq!(recovery, WatchdogRecovery::Suppressed);
        assert!(!build_called.get());
    }

    #[test]
    fn stale_generation_cannot_commit_or_delete_the_current_launch() {
        let state = ServiceState::new(3333);
        let first = spawn_managed_service_with(&state, |_, _| Ok(long_lived_command()))
            .expect("starts first generation");
        std::fs::create_dir_all(first.ready_path.parent().expect("ready parent"))
            .expect("creates ready parent");
        std::fs::write(&first.ready_path, b"first").expect("writes first ready file");
        stop_service_sync(&state).expect("stops first generation");
        assert!(!first.ready_path.exists());

        let second = spawn_managed_service_with(&state, |_, _| Ok(long_lived_command()))
            .expect("starts second generation");
        assert_ne!(first.generation, second.generation);
        assert_ne!(first.instance_id, second.instance_id);
        std::fs::create_dir_all(second.ready_path.parent().expect("second ready parent"))
            .expect("creates second ready parent");
        std::fs::write(&second.ready_path, b"second").expect("writes second ready file");
        assert!(commit_endpoint_if_current(
            &state,
            &second,
            ServiceEndpoint {
                port: 49153,
                instance_id: second.instance_id.clone(),
                bootstrap_token: second.bootstrap_token.clone()
            },
        )
        .expect("commits current endpoint"));
        assert!(!commit_endpoint_if_current(
            &state,
            &first,
            ServiceEndpoint {
                port: 49152,
                instance_id: first.instance_id.clone(),
                bootstrap_token: first.bootstrap_token.clone()
            },
        )
        .expect("rejects stale commit"));
        remove_launch_ready_file(&first.ready_path);
        assert!(second.ready_path.exists());
        assert_eq!(
            state.verified_port().expect("preserves current endpoint"),
            49153
        );
        assert_eq!(
            current_launch_token(&state)
                .expect("reads current launch")
                .expect("active launch")
                .generation,
            second.generation,
        );
        stop_service_sync(&state).expect("cleans up second generation");
    }

    #[test]
    fn command_port_is_unavailable_until_the_owned_endpoint_is_committed() {
        let state = ServiceState::new(3333);
        let launch = spawn_managed_service_with(&state, |_, _| Ok(long_lived_command()))
            .expect("starts managed child");
        assert!(state.verified_port().is_err());

        let endpoint = ServiceEndpoint {
            port: 49152,
            instance_id: launch.instance_id.clone(),
            bootstrap_token: launch.bootstrap_token.clone(),
        };
        assert!(
            commit_endpoint_if_current(&state, &launch, endpoint).expect("commits owned endpoint")
        );
        assert_eq!(state.verified_port().expect("reads verified port"), 49152);
        stop_service_sync(&state).expect("stops managed child");
        assert!(state.verified_port().is_err());
    }

    #[test]
    fn service_script_prefers_bundled_resource_when_present() {
        let root =
            std::env::temp_dir().join(format!("waggle-service-script-{}", std::process::id()));
        let resources = root.join("resources");
        std::fs::create_dir_all(&resources).expect("creates temp resources");
        std::fs::write(resources.join("service.js"), "console.log('ok')").expect("writes service");

        let script = resolve_service_script(Some(&root), Path::new("D:/Projects/waggle-os"))
            .expect("bundled script resolves");

        assert_eq!(script.kind, ServiceScriptKind::Bundled);
        assert_eq!(script.path, resources.join("service.js"));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn dev_service_script_searches_current_dir_ancestors() {
        let root =
            std::env::temp_dir().join(format!("waggle-dev-service-script-{}", std::process::id()));
        let script = root
            .join("packages")
            .join("server")
            .join("src")
            .join("local")
            .join("service.ts");
        std::fs::create_dir_all(script.parent().expect("script parent")).expect("creates dirs");
        std::fs::write(&script, "export {};").expect("writes service");

        let nested = root.join("app").join("src-tauri");
        std::fs::create_dir_all(&nested).expect("creates nested cwd");

        assert_eq!(find_dev_service_script(&nested), Some(script));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn invalid_node_overrides_do_not_shadow_runtime_fallbacks() {
        let directory_override = std::env::temp_dir();
        assert_eq!(valid_node_override(None), None);
        assert_eq!(valid_node_override(Some(OsStr::new(""))), None);
        assert_eq!(
            valid_node_override(Some(directory_override.as_os_str())),
            None
        );
    }

    #[test]
    fn existing_node_override_is_accepted() {
        let root =
            std::env::temp_dir().join(format!("waggle-node-override-{}", std::process::id()));
        std::fs::create_dir_all(&root).expect("creates temp runtime dir");
        let runtime = root.join(if cfg!(windows) { "node.exe" } else { "node" });
        std::fs::write(&runtime, b"runtime").expect("writes temp runtime");

        assert_eq!(
            valid_node_override(Some(runtime.as_os_str())),
            Some(runtime.clone())
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn bundled_npm_environment_uses_configured_data_dir_and_preserves_path() {
        let resources = Path::new("waggle resources");
        let data_dir = Path::new("waggle data");
        let ambient_entries = vec![PathBuf::from("ambient-one"), PathBuf::from("ambient two")];
        let ambient_path = std::env::join_paths(&ambient_entries).expect("joins ambient PATH");
        let environment = bundled_npm_environment(
            resources,
            Some(data_dir.as_os_str()),
            Some(OsStr::new("unused home")),
            Some(ambient_path.as_os_str()),
        )
        .expect("bundled npm environment resolves");

        assert_eq!(
            environment.npm_exec_path,
            resources
                .join("node_modules")
                .join("waggle-node-runtime")
                .join("node_modules")
                .join("npm")
                .join("bin")
                .join("npm-cli.js")
        );
        assert_eq!(environment.npm_prefix, data_dir.join("npm").join("prefix"));
        assert_eq!(environment.npm_cache, data_dir.join("npm").join("cache"));
        assert_eq!(environment.data_dir, data_dir);
        let mut expected_path_entries = vec![
            resources
                .join("node_modules")
                .join("waggle-node-runtime")
                .join("bin"),
            resources.to_path_buf(),
        ];
        expected_path_entries.extend(ambient_entries);
        assert_eq!(
            std::env::split_paths(&environment.path).collect::<Vec<_>>(),
            expected_path_entries
        );
    }

    #[test]
    fn bundled_npm_environment_falls_back_to_waggle_home() {
        let resources = Path::new("resources");
        let home = Path::new("home");
        let environment = bundled_npm_environment(
            resources,
            Some(OsStr::new("")),
            Some(home.as_os_str()),
            None,
        )
        .expect("fallback npm environment resolves");

        assert_eq!(
            environment.npm_prefix,
            home.join(".waggle").join("npm").join("prefix")
        );
        assert_eq!(
            environment.npm_cache,
            home.join(".waggle").join("npm").join("cache")
        );
        assert_eq!(environment.data_dir, home.join(".waggle"));
    }

    #[test]
    fn bundled_npm_environment_requires_a_writable_home() {
        let result = bundled_npm_environment(Path::new("resources"), None, None, None);
        assert_eq!(
            result,
            Err("Unable to resolve writable npm data directory".to_string())
        );
    }

    #[cfg(windows)]
    #[test]
    fn oversized_service_log_is_rotated_before_launch() {
        let root = std::env::temp_dir().join(format!(
            "waggle-service-log-{}-{}",
            std::process::id(),
            Uuid::new_v4()
        ));
        let log_dir = root.join("logs");
        std::fs::create_dir_all(&log_dir).expect("creates log directory");
        let log_path = log_dir.join("service.log");
        std::fs::write(&log_path, vec![b'x'; MAX_SERVICE_LOG_BYTES as usize])
            .expect("writes oversized service log");

        rotate_service_log(&log_path).expect("rotates service log");

        assert!(!log_path.exists());
        assert_eq!(
            std::fs::metadata(log_dir.join("service.log.1"))
                .expect("reads rotated log")
                .len(),
            MAX_SERVICE_LOG_BYTES
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[cfg(windows)]
    #[test]
    fn service_log_writer_caps_current_and_retained_logs() {
        let root = std::env::temp_dir().join(format!(
            "waggle-service-log-cap-{}-{}",
            std::process::id(),
            Uuid::new_v4()
        ));
        let mut writer = ServiceLogWriter::open(&root).expect("opens service log writer");
        writer
            .write_capped(&vec![b'x'; MAX_SERVICE_LOG_BYTES as usize + 1024])
            .expect("writes oversized diagnostics");
        writer
            .write_capped(&vec![b'y'; MAX_SERVICE_LOG_BYTES as usize])
            .expect("rolls diagnostics during one process lifetime");
        drop(writer);

        let log_dir = root.join("logs");
        let current = std::fs::metadata(log_dir.join("service.log"))
            .expect("reads current service log")
            .len();
        let retained = std::fs::metadata(log_dir.join("service.log.1"))
            .expect("reads retained service log")
            .len();
        assert!(current <= MAX_SERVICE_LOG_BYTES);
        assert!(retained <= MAX_SERVICE_LOG_BYTES);
        assert!(current + retained <= MAX_SERVICE_LOG_BYTES * 2);
        let _ = std::fs::remove_dir_all(root);
    }

    #[cfg(windows)]
    #[test]
    fn closing_the_service_job_terminates_its_child() {
        let mut child = long_lived_command().spawn().expect("starts service child");
        let job = create_kill_on_close_job().expect("creates kill-on-close job");
        assign_child_to_job(&job, &child).expect("assigns service child to job");

        drop(job);

        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            if child.try_wait().expect("inspects service child").is_some() {
                break;
            }
            if Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                panic!("service child survived closing the kill-on-close job");
            }
            thread::sleep(Duration::from_millis(25));
        }
    }

    #[cfg(windows)]
    #[test]
    fn closing_the_service_job_preserves_a_user_detached_descendant() {
        use windows_sys::Win32::Foundation::{CloseHandle, WAIT_TIMEOUT};
        use windows_sys::Win32::System::Threading::{
            OpenProcess, WaitForSingleObject, PROCESS_QUERY_LIMITED_INFORMATION,
        };

        let root = std::env::temp_dir().join(format!(
            "waggle-detached-job-{}-{}",
            std::process::id(),
            Uuid::new_v4()
        ));
        std::fs::create_dir_all(&root).expect("creates detached-job fixture");
        let marker = root.join("pid.txt");
        let escaped_marker = marker.to_string_lossy().replace('\'', "''");
        let script = format!(
            "$child = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\\ping.exe') -ArgumentList '-t','127.0.0.1' -WindowStyle Hidden -PassThru; Set-Content -LiteralPath '{escaped_marker}' -Value $child.Id -NoNewline; Start-Sleep -Seconds 30"
        );
        let mut command = Command::new("powershell.exe");
        command.args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            &script,
        ]);
        command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        hide_windows_console(&mut command);

        let mut parent = command.spawn().expect("starts detached-session fixture");
        let job = create_kill_on_close_job().expect("creates service job");
        assign_child_to_job(&job, &parent).expect("assigns service fixture to job");
        let deadline = Instant::now() + Duration::from_secs(10);
        while !marker.exists() {
            if Instant::now() >= deadline {
                let _ = parent.kill();
                let _ = parent.wait();
                panic!("detached-session fixture did not publish its pid");
            }
            thread::sleep(Duration::from_millis(25));
        }
        let detached_pid = std::fs::read_to_string(&marker)
            .expect("reads detached pid")
            .trim()
            .parse::<u32>()
            .expect("parses detached pid");

        drop(job);
        let _ = parent.wait();
        const SYNCHRONIZE_ACCESS: u32 = 0x00100000;
        let detached = unsafe {
            OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE_ACCESS,
                0,
                detached_pid,
            )
        };
        let survived =
            !detached.is_null() && unsafe { WaitForSingleObject(detached, 0) } == WAIT_TIMEOUT;
        if !detached.is_null() {
            unsafe { CloseHandle(detached) };
        }
        let mut cleanup = Command::new("taskkill");
        cleanup
            .args(["/PID", &detached_pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        hide_windows_console(&mut cleanup);
        let _ = cleanup.status();
        let _ = std::fs::remove_dir_all(root);

        assert!(
            survived,
            "user-owned detached session died with the service job"
        );
    }

    #[test]
    fn exited_service_child_does_not_block_restart() {
        let state = ServiceState::new(3333);
        let command = if cfg!(windows) {
            let mut command = Command::new("cmd");
            command.args(["/C", "exit", "0"]);
            command
        } else {
            let mut command = Command::new("sh");
            command.args(["-c", "exit 0"]);
            command
        };
        spawn_managed_service_with(&state, |_, _| Ok(command)).expect("starts short-lived child");

        for _ in 0..100 {
            if current_launch_token(&state)
                .expect("inspects service child")
                .is_none()
            {
                break;
            }
            thread::sleep(Duration::from_millis(10));
        }
        assert!(current_launch_token(&state)
            .expect("reads launch")
            .is_none());
    }

    #[test]
    fn running_service_child_remains_registered() {
        let state = ServiceState::new(3333);
        let launch = spawn_managed_service_with(&state, |_, _| Ok(long_lived_command()))
            .expect("starts long-lived child");

        assert_eq!(
            current_launch_token(&state)
                .expect("inspects service child")
                .expect("preserves running service child")
                .generation,
            launch.generation,
        );
        stop_service_sync(&state).expect("stops long-lived child");
    }

    #[tokio::test]
    async fn bounded_shutdown_requests_drain_then_allows_cooperative_child_exit() {
        let state = ServiceState::new(3333);
        let marker = std::env::temp_dir().join(format!(
            "waggle-graceful-stop-{}-{}",
            std::process::id(),
            Uuid::new_v4()
        ));
        let launch = spawn_managed_service_with(&state, |_, _| Ok(cooperative_command(&marker)))
            .expect("starts cooperative child");
        let (port, requests, server_thread) =
            spawn_shutdown_endpoint(launch.instance_id.clone(), Some(marker.clone()));
        let endpoint = ServiceEndpoint {
            port,
            instance_id: launch.instance_id.clone(),
            bootstrap_token: launch.bootstrap_token.clone(),
        };
        assert!(commit_endpoint_if_current(&state, &launch, endpoint)
            .expect("commits shutdown endpoint"));

        assert_eq!(
            stop_service_bounded_with_timeout(&state, Duration::from_secs(3))
                .await
                .expect("stops cooperative child"),
            ServiceStopOutcome::Graceful
        );
        assert!(current_launch_token(&state)
            .expect("reads stopped launch")
            .is_none());
        assert!(spawn_managed_service_with(&state, |_, _| Ok(long_lived_command())).is_err());
        let build_called = std::cell::Cell::new(false);
        assert_eq!(
            recover_service_with(
                &state,
                true,
                Duration::ZERO,
                WATCHDOG_FAILURE_THRESHOLD,
                true,
                |_, _| {
                    build_called.set(true);
                    Ok(long_lived_command())
                },
            )
            .expect("suppresses watchdog after graceful shutdown"),
            WatchdogRecovery::Suppressed
        );
        assert!(!build_called.get());

        let captured = requests
            .recv_timeout(Duration::from_secs(2))
            .expect("captures shutdown requests");
        server_thread.join().expect("joins shutdown endpoint");
        assert_eq!(captured.len(), 3);
        assert!(captured[0].starts_with("GET /health HTTP/1.1"));
        assert!(captured[1].starts_with("GET /api/auth/session-token HTTP/1.1"));
        assert!(captured[2].starts_with("POST /api/auth/desktop-shutdown HTTP/1.1"));
        let bootstrap_header =
            format!("x-waggle-desktop-bootstrap: {}", launch.bootstrap_token).to_ascii_lowercase();
        assert!(captured[1].to_ascii_lowercase().contains(&bootstrap_header));
        assert!(captured[2]
            .to_ascii_lowercase()
            .contains("authorization: bearer desktop-session-token"));
        assert!(captured[2].to_ascii_lowercase().contains(&bootstrap_header));
        let _ = std::fs::remove_file(marker);
    }

    #[tokio::test]
    async fn bounded_shutdown_forces_only_the_exact_uncooperative_launch() {
        let state = ServiceState::new(3333);
        let launch = spawn_managed_service_with(&state, |_, _| Ok(long_lived_command()))
            .expect("starts uncooperative child");
        let (port, requests, server_thread) =
            spawn_shutdown_endpoint(launch.instance_id.clone(), None);
        let endpoint = ServiceEndpoint {
            port,
            instance_id: launch.instance_id.clone(),
            bootstrap_token: launch.bootstrap_token.clone(),
        };
        assert!(commit_endpoint_if_current(&state, &launch, endpoint)
            .expect("commits shutdown endpoint"));
        let started = Instant::now();

        assert_eq!(
            stop_service_bounded_with_timeout(&state, Duration::from_millis(200))
                .await
                .expect("forces uncooperative child"),
            ServiceStopOutcome::Forced
        );
        assert!(started.elapsed() < Duration::from_secs(2));
        assert!(current_launch_token(&state)
            .expect("reads forced launch")
            .is_none());
        let build_called = std::cell::Cell::new(false);
        assert_eq!(
            recover_service_with(
                &state,
                true,
                Duration::ZERO,
                WATCHDOG_FAILURE_THRESHOLD,
                true,
                |_, _| {
                    build_called.set(true);
                    Ok(long_lived_command())
                },
            )
            .expect("suppresses watchdog after forced shutdown"),
            WatchdogRecovery::Suppressed
        );
        assert!(!build_called.get());

        let captured = requests
            .recv_timeout(Duration::from_secs(2))
            .expect("captures forced shutdown requests");
        server_thread.join().expect("joins shutdown endpoint");
        assert!(captured
            .iter()
            .any(|request| request.starts_with("POST /api/auth/desktop-shutdown HTTP/1.1")));
    }

    #[test]
    fn forced_shutdown_refuses_a_stale_generation_and_preserves_replacement() {
        let state = ServiceState::new(3333);
        let stale = spawn_managed_service_with(&state, |_, _| Ok(long_lived_command()))
            .expect("starts first generation");
        stop_service_sync(&state).expect("stops first generation");
        let replacement = spawn_managed_service_with(&state, |_, _| Ok(long_lived_command()))
            .expect("starts replacement generation");

        assert!(force_stop_exact_launch(&state, &stale).is_err());
        let current = current_launch_token(&state)
            .expect("reads replacement")
            .expect("replacement remains active");
        assert_eq!(current.generation, replacement.generation);
        assert_eq!(current.pid, replacement.pid);
        stop_service_sync(&state).expect("stops replacement generation");
    }

    #[test]
    fn service_spawn_holds_process_lock_until_child_registered() {
        let state = ServiceState::new(3333);
        spawn_managed_service_with(&state, |_, _| {
            assert!(matches!(
                state.runtime.try_lock(),
                Err(std::sync::TryLockError::WouldBlock)
            ));
            Ok(long_lived_command())
        })
        .expect("spawns service while holding process lock");
        stop_service_sync(&state).expect("stops service child");
    }

    #[test]
    fn watchdog_keeps_a_live_sidecar_during_cold_embedding_startup() {
        assert!(!watchdog_should_restart(
            false,
            true,
            Duration::from_secs(45),
            WATCHDOG_FAILURE_THRESHOLD,
        ));
        assert!(!watchdog_should_restart(
            false,
            true,
            WATCHDOG_INITIAL_STARTUP_GRACE - Duration::from_secs(1),
            u32::MAX,
        ));
    }

    #[test]
    fn watchdog_restarts_an_exited_sidecar_during_cold_startup() {
        assert!(watchdog_should_restart(false, false, Duration::ZERO, 1,));
    }

    #[test]
    fn watchdog_restarts_after_startup_grace_or_established_health_loss() {
        assert!(watchdog_should_restart(
            false,
            true,
            WATCHDOG_INITIAL_STARTUP_GRACE,
            WATCHDOG_FAILURE_THRESHOLD,
        ));
        assert!(!watchdog_should_restart(
            true,
            true,
            Duration::ZERO,
            WATCHDOG_FAILURE_THRESHOLD - 1,
        ));
        assert!(watchdog_should_restart(
            true,
            true,
            Duration::ZERO,
            WATCHDOG_FAILURE_THRESHOLD,
        ));
    }

    #[test]
    fn watchdog_does_not_spawn_while_a_cold_sidecar_is_alive() {
        let state = ServiceState::new(3333);
        spawn_managed_service_with(&state, |_, _| Ok(long_lived_command()))
            .expect("starts cold sidecar");
        let build_called = std::cell::Cell::new(false);

        let recovery = recover_service_with(
            &state,
            false,
            Duration::from_secs(45),
            u32::MAX,
            true,
            |_, _| {
                build_called.set(true);
                Ok(long_lived_command())
            },
        )
        .expect("defers cold sidecar recovery");

        assert_eq!(recovery, WatchdogRecovery::Deferred);
        assert!(!build_called.get());
        stop_service_sync(&state).expect("stops cold sidecar");
    }

    #[test]
    fn watchdog_restart_holds_the_process_lock_until_registration() {
        let state = ServiceState::new(3333);

        let recovery = recover_service_with(&state, false, Duration::ZERO, 1, true, |_, _| {
            assert!(matches!(
                state.runtime.try_lock(),
                Err(std::sync::TryLockError::WouldBlock)
            ));
            Ok(long_lived_command())
        })
        .expect("restarts exited sidecar atomically");

        assert_eq!(recovery, WatchdogRecovery::Restarted);
        assert!(current_launch_token(&state)
            .expect("reads restarted sidecar")
            .is_some());
        stop_service_sync(&state).expect("stops restarted sidecar");
    }

    #[test]
    fn watchdog_restart_rotates_identity_and_removes_old_ready_file() {
        let state = ServiceState::new(3333);
        let first = spawn_managed_service_with(&state, |_, _| Ok(long_lived_command()))
            .expect("starts first sidecar");
        std::fs::create_dir_all(first.ready_path.parent().expect("ready parent"))
            .expect("creates ready parent");
        std::fs::write(&first.ready_path, b"first").expect("writes old ready file");

        assert_eq!(
            recover_service_with(
                &state,
                true,
                Duration::ZERO,
                WATCHDOG_FAILURE_THRESHOLD,
                true,
                |_, _| Ok(long_lived_command()),
            )
            .expect("restarts managed child"),
            WatchdogRecovery::Restarted,
        );
        let second = current_launch_token(&state)
            .expect("reads restarted child")
            .expect("registered restarted child");
        assert_ne!(first.generation, second.generation);
        assert_ne!(first.instance_id, second.instance_id);
        assert!(!first.ready_path.exists());
        assert!(second.endpoint.is_none());
        stop_service_sync(&state).expect("stops restarted sidecar");
    }
}

fn remove_launch_ready_file(path: &Path) {
    match std::fs::symlink_metadata(path) {
        Ok(_) => {
            let _ = std::fs::remove_file(path);
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => {}
    }
}

fn managed_launch_is_running(launch: &mut ManagedLaunch) -> Result<bool, String> {
    match launch.child.try_wait() {
        Ok(None) => Ok(true),
        Ok(Some(_)) => Ok(false),
        Err(error) => Err(format!("Failed to inspect service process: {error}")),
    }
}

fn launch_token(launch: &ManagedLaunch, preferred_port: u16) -> LaunchToken {
    LaunchToken {
        generation: launch.generation,
        instance_id: launch.config.instance_id.clone(),
        bootstrap_token: launch.config.bootstrap_token.clone(),
        ready_path: launch.config.ready_path.clone(),
        pid: launch.child.id(),
        preferred_port,
        endpoint: launch.endpoint.clone(),
        started_at: launch.started_at,
    }
}

fn current_launch_token(state: &ServiceState) -> Result<Option<LaunchToken>, String> {
    let mut runtime = state.runtime.lock().map_err(|error| error.to_string())?;
    let exited = match runtime.active.as_mut() {
        Some(launch) => !managed_launch_is_running(launch)?,
        None => return Ok(None),
    };
    if exited {
        if let Some(launch) = runtime.active.take() {
            remove_launch_ready_file(&launch.config.ready_path);
        }
        return Ok(None);
    }
    Ok(runtime
        .active
        .as_ref()
        .map(|launch| launch_token(launch, state.preferred_port)))
}

fn spawn_locked(
    runtime: &mut ServiceRuntime,
    preferred_port: u16,
    build_command: impl FnOnce(u16, &ManagedLaunchConfig) -> Result<Command, String>,
) -> Result<LaunchToken, String> {
    let config = new_managed_launch_config()?;
    remove_launch_ready_file(&config.ready_path);
    let generation = runtime.next_generation;
    runtime.next_generation = runtime.next_generation.saturating_add(1);
    let mut command = build_command(preferred_port, &config)?;
    #[cfg(windows)]
    let log_dir = configured_service_log_dir(&command);
    #[cfg(windows)]
    let job = create_kill_on_close_job()?;
    let mut child = command
        .spawn()
        .map_err(|error| format!("Failed to start service: {error}"))?;
    #[cfg(windows)]
    {
        if let Err(error) = assign_child_to_job(&job, &child) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error);
        }
        if let Some(log_dir) = log_dir {
            if let Err(error) = start_service_log_capture(&mut child, &log_dir) {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error);
            }
        }
    }
    runtime.active = Some(ManagedLaunch {
        generation,
        child,
        #[cfg(windows)]
        _job: job,
        config,
        endpoint: None,
        started_at: Instant::now(),
    });
    Ok(launch_token(
        runtime
            .active
            .as_ref()
            .expect("managed launch was registered"),
        preferred_port,
    ))
}

fn spawn_managed_service_with(
    state: &ServiceState,
    build_command: impl FnOnce(u16, &ManagedLaunchConfig) -> Result<Command, String>,
) -> Result<LaunchToken, String> {
    let mut runtime = state.runtime.lock().map_err(|error| error.to_string())?;
    if runtime.shutdown_started {
        return Err("Managed service shutdown is already in progress".to_string());
    }
    runtime.desired_running = true;
    let active_is_running = match runtime.active.as_mut() {
        Some(launch) => managed_launch_is_running(launch)?,
        None => false,
    };
    if active_is_running {
        return Ok(launch_token(
            runtime
                .active
                .as_ref()
                .expect("running launch remains registered"),
            state.preferred_port,
        ));
    }
    if let Some(launch) = runtime.active.take() {
        remove_launch_ready_file(&launch.config.ready_path);
    }
    spawn_locked(&mut runtime, state.preferred_port, build_command)
}

pub(crate) fn stop_service_sync(state: &ServiceState) -> Result<(), String> {
    let mut runtime = state.runtime.lock().map_err(|error| error.to_string())?;
    runtime.desired_running = false;
    if let Some(mut launch) = runtime.active.take() {
        let _ = launch.child.kill();
        let _ = launch.child.wait();
        remove_launch_ready_file(&launch.config.ready_path);
    }
    Ok(())
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum ServiceStopOutcome {
    AlreadyStopped,
    Graceful,
    Forced,
}

fn begin_service_shutdown(state: &ServiceState) -> Result<Option<LaunchToken>, String> {
    let mut runtime = state.runtime.lock().map_err(|error| error.to_string())?;
    runtime.desired_running = false;
    runtime.shutdown_started = true;

    let exited = match runtime.active.as_mut() {
        Some(launch) => !managed_launch_is_running(launch)?,
        None => return Ok(None),
    };
    if exited {
        if let Some(launch) = runtime.active.take() {
            remove_launch_ready_file(&launch.config.ready_path);
        }
        return Ok(None);
    }

    Ok(runtime
        .active
        .as_ref()
        .map(|launch| launch_token(launch, state.preferred_port)))
}

async fn request_desktop_shutdown(endpoint: &ServiceEndpoint) -> Result<(), String> {
    let client = build_loopback_client(reqwest::Client::builder())?;
    let session_token = bootstrap_session_token(&client, endpoint).await?;
    let url = format!(
        "http://127.0.0.1:{}/api/auth/desktop-shutdown",
        endpoint.port
    );
    let response = with_desktop_bootstrap(
        with_session_bearer(client.post(url), &session_token),
        &endpoint.bootstrap_token,
    )
    .timeout(Duration::from_secs(3))
    .send()
    .await
    .map_err(|error| format!("Managed desktop shutdown request failed: {error}"))?;
    if response.status() != reqwest::StatusCode::ACCEPTED {
        return Err(format!(
            "Managed desktop shutdown returned {}",
            response.status()
        ));
    }
    Ok(())
}

async fn wait_for_exact_launch_exit(
    state: &ServiceState,
    token: &LaunchToken,
) -> Result<(), String> {
    loop {
        let exited = {
            let mut runtime = state.runtime.lock().map_err(|error| error.to_string())?;
            let Some(active) = runtime.active.as_mut() else {
                return Ok(());
            };
            if active.generation != token.generation
                || active.child.id() != token.pid
                || active.config.instance_id != token.instance_id
            {
                return Err("Managed service launch changed during shutdown".to_string());
            }
            if !managed_launch_is_running(active)? {
                let launch = runtime
                    .active
                    .take()
                    .expect("verified active launch remains registered");
                remove_launch_ready_file(&launch.config.ready_path);
                true
            } else {
                false
            }
        };
        if exited {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
}

fn force_stop_exact_launch(state: &ServiceState, token: &LaunchToken) -> Result<(), String> {
    let mut runtime = state.runtime.lock().map_err(|error| error.to_string())?;
    let Some(active) = runtime.active.as_ref() else {
        return Ok(());
    };
    if active.generation != token.generation
        || active.child.id() != token.pid
        || active.config.instance_id != token.instance_id
    {
        return Err("Refusing to stop a replacement managed service launch".to_string());
    }
    let mut launch = runtime
        .active
        .take()
        .expect("verified active launch remains registered");
    let _ = launch.child.kill();
    let _ = launch.child.wait();
    remove_launch_ready_file(&launch.config.ready_path);
    Ok(())
}

async fn stop_service_bounded_with_timeout(
    state: &ServiceState,
    timeout: Duration,
) -> Result<ServiceStopOutcome, String> {
    let Some(token) = begin_service_shutdown(state)? else {
        return Ok(ServiceStopOutcome::AlreadyStopped);
    };

    let graceful = tokio::time::timeout(timeout, async {
        let endpoint = discover_owned_endpoint(state, &token)
            .await?
            .ok_or_else(|| "Managed service endpoint is not ready".to_string())?;
        request_desktop_shutdown(&endpoint).await?;
        wait_for_exact_launch_exit(state, &token).await
    })
    .await;

    match graceful {
        Ok(Ok(())) => Ok(ServiceStopOutcome::Graceful),
        Ok(Err(_)) | Err(_) => {
            force_stop_exact_launch(state, &token)?;
            Ok(ServiceStopOutcome::Forced)
        }
    }
}

pub(crate) async fn stop_service_bounded(
    state: &ServiceState,
) -> Result<ServiceStopOutcome, String> {
    stop_service_bounded_with_timeout(state, GRACEFUL_SHUTDOWN_TIMEOUT).await
}

fn watchdog_should_restart(
    has_ever_been_healthy: bool,
    child_is_running: bool,
    initial_startup_elapsed: Duration,
    consecutive_failures: u32,
) -> bool {
    if !child_is_running {
        return true;
    }

    consecutive_failures >= WATCHDOG_FAILURE_THRESHOLD
        && (has_ever_been_healthy || initial_startup_elapsed >= WATCHDOG_INITIAL_STARTUP_GRACE)
}

#[derive(Debug, PartialEq, Eq)]
enum WatchdogRecovery {
    Deferred,
    Restarted,
    RestartLimitReached,
    Suppressed,
}

fn recover_service_with(
    state: &ServiceState,
    has_ever_been_healthy: bool,
    initial_startup_elapsed: Duration,
    consecutive_failures: u32,
    restart_allowed: bool,
    build_command: impl FnOnce(u16, &ManagedLaunchConfig) -> Result<Command, String>,
) -> Result<WatchdogRecovery, String> {
    let mut runtime = state.runtime.lock().map_err(|error| error.to_string())?;
    if !runtime.desired_running {
        return Ok(WatchdogRecovery::Suppressed);
    }
    let child_is_running = match runtime.active.as_mut() {
        Some(launch) => managed_launch_is_running(launch)?,
        None => false,
    };
    if !child_is_running {
        if let Some(launch) = runtime.active.take() {
            remove_launch_ready_file(&launch.config.ready_path);
        }
    }
    if !watchdog_should_restart(
        has_ever_been_healthy,
        child_is_running,
        initial_startup_elapsed,
        consecutive_failures,
    ) {
        return Ok(WatchdogRecovery::Deferred);
    }
    if !restart_allowed {
        return Ok(WatchdogRecovery::RestartLimitReached);
    }

    if let Some(mut launch) = runtime.active.take() {
        let _ = launch.child.kill();
        let _ = launch.child.wait();
        remove_launch_ready_file(&launch.config.ready_path);
    }

    spawn_locked(&mut runtime, state.preferred_port, build_command)
        .map_err(|error| format!("Failed to restart service: {error}"))?;
    Ok(WatchdogRecovery::Restarted)
}

fn read_ready_endpoint(token: &LaunchToken) -> Result<Option<ServiceEndpoint>, String> {
    let metadata = match std::fs::symlink_metadata(&token.ready_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "Unable to inspect managed service ready record: {error}"
            ))
        }
    };
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err("Managed service ready record is not a regular file".to_string());
    }
    if metadata.len() > READY_RECORD_MAX_BYTES {
        return Err("Managed service ready record is too large".to_string());
    }
    let bytes = std::fs::read(&token.ready_path)
        .map_err(|error| format!("Unable to read managed service ready record: {error}"))?;
    parse_ready_record(
        &bytes,
        &token.instance_id,
        token.pid,
        token.preferred_port,
        &token.bootstrap_token,
    )
    .map(Some)
}

async fn probe_owned_endpoint(endpoint: &ServiceEndpoint) -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|error| format!("Unable to build service health client: {error}"))?;
    let url = format!("http://127.0.0.1:{}/health", endpoint.port);
    let response = match client.get(url).send().await {
        Ok(response) => response,
        Err(_) => return Ok(false),
    };
    if !response.status().is_success() {
        return Ok(false);
    }
    if response
        .content_length()
        .is_some_and(|length| length > READY_RECORD_MAX_BYTES)
    {
        return Err("Managed service health response is too large".to_string());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("Unable to read managed service health response: {error}"))?;
    if bytes.len() as u64 > READY_RECORD_MAX_BYTES {
        return Err("Managed service health response is too large".to_string());
    }
    if !health_payload_matches(&bytes, endpoint) {
        return Err("Managed service health identity does not match the owned launch".to_string());
    }
    Ok(true)
}

fn commit_endpoint_if_current(
    state: &ServiceState,
    token: &LaunchToken,
    endpoint: ServiceEndpoint,
) -> Result<bool, String> {
    if endpoint.port == 0 || endpoint.instance_id != token.instance_id {
        return Ok(false);
    }
    let mut runtime = state.runtime.lock().map_err(|error| error.to_string())?;
    let Some(active) = runtime.active.as_mut() else {
        return Ok(false);
    };
    if active.generation != token.generation
        || active.child.id() != token.pid
        || active.config.instance_id != token.instance_id
        || !managed_launch_is_running(active)?
    {
        return Ok(false);
    }
    active.endpoint = Some(endpoint);
    Ok(true)
}

async fn discover_owned_endpoint(
    state: &ServiceState,
    token: &LaunchToken,
) -> Result<Option<ServiceEndpoint>, String> {
    let current = current_launch_token(state)?
        .ok_or_else(|| "Managed service process exited before becoming ready".to_string())?;
    if current.generation != token.generation
        || current.pid != token.pid
        || current.instance_id != token.instance_id
    {
        return Err("Managed service launch changed during readiness validation".to_string());
    }
    let endpoint_was_verified = current.endpoint.is_some();
    let endpoint = match current.endpoint.clone() {
        Some(endpoint) => endpoint,
        None => match read_ready_endpoint(&current)? {
            Some(endpoint) => endpoint,
            None => return Ok(None),
        },
    };
    if !probe_owned_endpoint(&endpoint).await? {
        return Ok(None);
    }
    if !endpoint_was_verified && !listener_is_owned_by_pid(endpoint.port, current.pid)? {
        return Err(
            "Managed service endpoint is not owned by the spawned child process".to_string(),
        );
    }
    if !commit_endpoint_if_current(state, &current, endpoint.clone())? {
        return Err("Managed service launch changed before endpoint commit".to_string());
    }
    Ok(Some(endpoint))
}

/// Synchronously spawn the sidecar process if not already running. Does not wait
/// for the owned ready record. Safe to call from Tauri's synchronous `.setup()` callback.
pub fn spawn_service_sync(state: &ServiceState) -> Result<(), String> {
    spawn_managed_service_with(state, build_service_command).map(|_| ())
}

#[tauri::command]
pub async fn ensure_service(state: State<'_, ServiceState>) -> Result<ServiceEndpoint, String> {
    let token = spawn_managed_service_with(&state, build_service_command)?;
    for _ in 0..600 {
        if let Some(endpoint) = discover_owned_endpoint(&state, &token).await? {
            return Ok(endpoint);
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    Err("Managed service failed to publish an owned endpoint within 600 seconds".to_string())
}

#[tauri::command]
pub async fn stop_service(state: State<'_, ServiceState>) -> Result<String, String> {
    let outcome = stop_service_bounded(&state).await?;
    Ok(match outcome {
        ServiceStopOutcome::AlreadyStopped => "Service already stopped",
        ServiceStopOutcome::Graceful => "Service stopped gracefully",
        ServiceStopOutcome::Forced => "Service stopped after graceful timeout",
    }
    .to_string())
}

#[tauri::command]
pub async fn get_service_port(state: State<'_, ServiceState>) -> Result<u16, String> {
    state.verified_port()
}

pub fn start_watchdog(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut consecutive_failures: u32 = 0;
        let mut has_ever_been_healthy = false;
        let mut initial_startup_started = Instant::now();
        let mut tracked_generation: Option<u64> = None;
        let mut restart_count: u32 = 0;
        let mut restart_window_start = Instant::now();
        const MAX_RESTARTS: u32 = 5;
        const RESTART_WINDOW: Duration = Duration::from_secs(600);

        // Wait for initial startup
        tokio::time::sleep(Duration::from_secs(15)).await;

        loop {
            tokio::time::sleep(Duration::from_secs(10)).await;

            let Some(state) = app.try_state::<ServiceState>() else {
                eprintln!("[waggle] Watchdog: service state is unavailable");
                break;
            };
            let token = match current_launch_token(&state) {
                Ok(token) => token,
                Err(error) => {
                    eprintln!("[waggle] Watchdog: process inspection failed: {error}");
                    None
                }
            };
            if let Some(ref token) = token {
                if tracked_generation != Some(token.generation) {
                    tracked_generation = Some(token.generation);
                    consecutive_failures = 0;
                    has_ever_been_healthy = false;
                    initial_startup_started = token.started_at;
                }
            }

            let endpoint = match token.as_ref() {
                Some(token) => match discover_owned_endpoint(&state, token).await {
                    Ok(endpoint) => endpoint,
                    Err(error) => {
                        eprintln!("[waggle] Watchdog: ownership validation failed: {error}");
                        None
                    }
                },
                None => None,
            };
            if let Some(endpoint) = endpoint {
                if !has_ever_been_healthy {
                    let _ = app.emit(
                        "waggle://service-status",
                        serde_json::json!({ "status": "ready", "endpoint": endpoint }),
                    );
                }
                has_ever_been_healthy = true;
                consecutive_failures = 0;
                continue;
            }

            consecutive_failures = consecutive_failures.saturating_add(1);
            if restart_window_start.elapsed() > RESTART_WINDOW {
                restart_count = 0;
                restart_window_start = Instant::now();
            }
            let recovery = recover_service_with(
                &state,
                has_ever_been_healthy,
                initial_startup_started.elapsed(),
                consecutive_failures,
                restart_count < MAX_RESTARTS,
                build_service_command,
            );
            match recovery {
                Ok(WatchdogRecovery::Deferred) => continue,
                Ok(WatchdogRecovery::Suppressed) => {
                    consecutive_failures = 0;
                    tracked_generation = None;
                    continue;
                }
                Ok(WatchdogRecovery::RestartLimitReached) => {
                    let _ = app.emit(
                        "waggle://service-status",
                        serde_json::json!({ "status": "failed" }),
                    );
                    eprintln!("[waggle] Watchdog: max restarts exceeded, giving up");
                    break;
                }
                Ok(WatchdogRecovery::Restarted) => {
                    let _ = app.emit(
                        "waggle://service-status",
                        serde_json::json!({ "status": "restarting" }),
                    );
                    let _ = app.emit("waggle://service-restart-needed", ());
                    restart_count += 1;
                    consecutive_failures = 0;
                    has_ever_been_healthy = false;
                    tracked_generation = None;
                    initial_startup_started = Instant::now();
                }
                Err(error) => {
                    eprintln!("[waggle] Watchdog: respawn failed: {error}");
                    let _ = app.emit("waggle://service-restart-needed", ());
                    restart_count += 1;
                    consecutive_failures = 0;
                    has_ever_been_healthy = false;
                    tracked_generation = None;
                    initial_startup_started = Instant::now();
                }
            }
            tokio::time::sleep(Duration::from_secs(10)).await;
        }
    });
}
