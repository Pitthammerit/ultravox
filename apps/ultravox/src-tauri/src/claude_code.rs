/// Local Claude Code CLI integration.
///
/// When the user has the `claude` CLI installed (Anthropic's Claude Code,
/// authenticated against their Max plan), we can route the LLM cleanup
/// step locally instead of through the managed Cloudflare Voice Worker.
///
/// This is an opt-in, per-user setting (`settings.useClaudeCode`). The
/// transcribe.ts flow auto-falls-back to the Worker if the CLI isn't
/// installed, isn't logged in, or returns an error.
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;

use serde::Serialize;

/// Build a PATH string that includes common node/tool locations on top of
/// whatever the process inherited. Tauri apps launch with a minimal PATH
/// (/usr/bin:/bin only) that misses Homebrew, nvm, volta, fnm, and the
/// /usr/local/bin node that Claude Code's wrapper script needs to exec.
fn augmented_path() -> String {
    let existing = std::env::var("PATH").unwrap_or_default();
    let extra = [
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/sbin",
    ];
    let mut parts: Vec<&str> = extra.iter().copied().collect();
    if !existing.is_empty() {
        parts.push(&existing);
    }
    parts.join(":")
}

/// Search a small list of well-known install locations for the `claude`
/// binary. Tauri apps inherit a minimal PATH that often misses Homebrew,
/// asdf, bun, and similar — so $PATH alone is unreliable here.
fn find_claude_binary() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    let candidates = vec![
        format!("{home}/.claude/local/claude"),
        format!("{home}/.bun/bin/claude"),
        format!("{home}/.local/bin/claude"),
        format!("{home}/.npm/bin/claude"),
        "/opt/homebrew/bin/claude".to_string(),
        "/usr/local/bin/claude".to_string(),
    ];

    for path in candidates {
        let p = PathBuf::from(&path);
        if p.is_file() {
            return Some(p);
        }
    }

    // Last-resort: ask /bin/sh for `which claude` — it inherits the user's
    // login PATH whereas the Tauri app's PATH is sparse.
    if let Ok(out) = Command::new("/bin/sh").args(["-lc", "command -v claude"]).output() {
        if out.status.success() {
            let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !path.is_empty() {
                let p = PathBuf::from(&path);
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }
    None
}

#[derive(Serialize)]
pub struct ClaudeCodeStatus {
    pub available: bool,
    pub path: Option<String>,
    pub version: Option<String>,
}

/// Check whether the Claude Code CLI is installed and responsive. We don't
/// distinguish "not logged in" from "logged in" here — the actual
/// `claude_code_cleanup` call will surface auth errors if the user hasn't
/// run `claude /login`. UI just shows the toggle as available.
#[tauri::command]
pub fn claude_code_check() -> ClaudeCodeStatus {
    let Some(bin) = find_claude_binary() else {
        return ClaudeCodeStatus { available: false, path: None, version: None };
    };

    let version = Command::new(&bin)
        .arg("--version")
        .env("PATH", augmented_path())
        .output()
        .ok()
        .and_then(|o| if o.status.success() {
            Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
        } else {
            None
        });

    ClaudeCodeStatus {
        available: version.is_some(),
        path: Some(bin.to_string_lossy().to_string()),
        version,
    }
}

/// Run a one-shot Claude Code prompt and return the model's stdout.
/// Uses `claude -p "<prompt>"` (non-interactive print mode).
///
/// Hard timeout of 30 s — voice cleanup should never need longer than
/// that. If Claude Code hangs (network, auth dialog), we abort and the
/// caller falls back to the worker.
#[tauri::command]
pub fn claude_code_cleanup(prompt: String, model: Option<String>) -> Result<String, String> {
    let bin = find_claude_binary().ok_or("claude CLI not found")?;

    // --tools ""            disables all built-in tools (no file writes, no shell)
    // --strict-mcp-config   only load MCPs from --mcp-config, ignoring global config
    // --mcp-config {...}     empty server list → no MCPs at all (prevents Serena,
    //                        browser-based MCP servers, etc. from being loaded)
    let model_str = model.unwrap_or_else(|| "sonnet".to_string());
    let mut child = Command::new(&bin)
        .arg("-p")
        .arg(&prompt)
        .args(["--model", &model_str])
        .args(["--tools", ""])
        .args(["--strict-mcp-config", "--mcp-config", r#"{"mcpServers":{}}"#])
        .env("PATH", augmented_path())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn claude: {e}"))?;

    // Soft timeout via wait_timeout pattern. std::process doesn't have
    // wait_with_timeout natively; we poll briefly.
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(30);
    loop {
        if let Some(_status) = child.try_wait().map_err(|e| format!("try_wait: {e}"))? {
            break;
        }
        if start.elapsed() > timeout {
            let _ = child.kill();
            return Err("claude timed out after 30s".into());
        }
        std::thread::sleep(Duration::from_millis(120));
    }

    let output = child.wait_with_output().map_err(|e| format!("wait: {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("claude exit {}: {}", output.status, stderr.trim()));
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return Err("claude returned empty output".into());
    }
    Ok(stdout)
}

/// Helper used by the typed bridge — keeps the writing test fast in case
/// we ever want to unit-test the spawn pattern with a mock binary.
#[allow(dead_code)]
pub fn cleanup_with_stdin(prompt: &str, body: &str) -> Result<String, String> {
    let bin = find_claude_binary().ok_or("claude CLI not found")?;
    let mut child = Command::new(&bin)
        .arg("-p")
        .arg(prompt)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn claude: {e}"))?;
    if let Some(stdin) = child.stdin.as_mut() {
        stdin.write_all(body.as_bytes()).map_err(|e| format!("stdin write: {e}"))?;
    }
    let output = child.wait_with_output().map_err(|e| format!("wait: {e}"))?;
    if !output.status.success() {
        return Err(format!("claude exit {}", output.status));
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
