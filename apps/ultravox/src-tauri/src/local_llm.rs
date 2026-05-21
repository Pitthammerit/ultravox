//! Local on-device LLM cleanup via llama.cpp (llama-cpp-2 + Metal).
//!
//! Five Tauri commands matching the TS bridge in `tauri-bridge.ts`:
//!   - `local_llm_status`         -> which model (if any) is downloaded
//!   - `local_llm_cleanup`        -> run single-shot inference on prompt
//!   - `local_llm_download_model` -> fetch GGUF from HuggingFace
//!   - `local_llm_delete_model`   -> remove model file
//!   - `local_llm_list_models`    -> list installed models
//!
//! Mirrors the "local-tool fallback to cloud" pattern from `claude_code.rs`:
//! TS calls `local_llm_status`, only takes the local path when `available`
//! is true, otherwise falls through to the managed Cloudflare worker.

#![cfg(target_os = "macos")]

use std::collections::VecDeque;
use std::io::Write;
use std::num::NonZeroU32;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use once_cell::sync::{Lazy, OnceCell};
use llama_cpp_2::context::params::LlamaContextParams;
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::llama_batch::LlamaBatch;
use llama_cpp_2::model::params::LlamaModelParams;
#[allow(deprecated)]
use llama_cpp_2::model::{AddBos, LlamaModel, Special};
use llama_cpp_2::sampling::LlamaSampler;
use llama_cpp_2::{send_logs_to_tracing, LogOptions};
use serde::Serialize;
use tauri::Emitter;
use tracing::{Event, Subscriber};
use tracing_subscriber::layer::{Context, Layer};
use tracing_subscriber::prelude::*;

const MODEL_BUNDLE_ID: &str = "com.ultravox.dev";
const INFERENCE_TIMEOUT_SEC: u64 = 30;
const LLAMA_LOG_RING_CAP: usize = 200;

struct CachedModel {
    path: PathBuf,
    variant: String,
    model: Arc<LlamaModel>,
}

static BACKEND: OnceCell<LlamaBackend> = OnceCell::new();

/// Ring buffer of recent llama.cpp/ggml log lines. Populated by
/// `LlamaLogLayer` (registered as a tracing subscriber once when the
/// backend is first initialized), drained around each load attempt by
/// `drain_recent_llama_logs` so the real diagnostic ends up in the
/// error string returned to JS.
static LLAMA_LOGS: Lazy<Mutex<VecDeque<String>>> = Lazy::new(|| Mutex::new(VecDeque::new()));

/// Tracing layer that captures llama.cpp + ggml events. llama-cpp-2's
/// `send_logs_to_tracing` routes the C-side log callback through Rust
/// `tracing` events with target="llama-cpp-2" and a `message` field.
/// Without this layer those events are silently dropped — and the user
/// sees only the opaque "null result from llama cpp" surface error.
struct LlamaLogLayer;

impl<S: Subscriber> Layer<S> for LlamaLogLayer {
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        struct MsgVisitor(String);
        impl tracing::field::Visit for MsgVisitor {
            fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
                if field.name() == "message" {
                    self.0.push_str(value);
                }
            }
            fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
                if field.name() == "message" {
                    use std::fmt::Write as _;
                    let _ = write!(self.0, "{value:?}");
                }
            }
        }
        let target = event.metadata().target();
        if target != "llama-cpp-2" && target != "llama-cpp-2::ggml" {
            return;
        }
        let mut v = MsgVisitor(String::new());
        event.record(&mut v);
        let msg = v.0.trim().to_string();
        if msg.is_empty() {
            return;
        }
        if let Ok(mut g) = LLAMA_LOGS.lock() {
            g.push_back(msg);
            while g.len() > LLAMA_LOG_RING_CAP {
                g.pop_front();
            }
        }
    }
}

/// Clear the ring buffer. Call before a load attempt so the resulting
/// drain contains only events from that attempt.
fn clear_llama_log_buffer() {
    if let Ok(mut g) = LLAMA_LOGS.lock() {
        g.clear();
    }
}

/// Drain the ring buffer and return all captured events joined by " | ".
/// Empty string if nothing was captured. Truncated to keep error strings
/// reasonable.
fn drain_llama_log_buffer() -> String {
    let joined = match LLAMA_LOGS.lock() {
        Ok(mut g) => g.drain(..).collect::<Vec<_>>().join(" | "),
        Err(_) => return String::new(),
    };
    const MAX_LEN: usize = 1500;
    if joined.len() > MAX_LEN {
        format!("{}…(truncated)", &joined[..MAX_LEN])
    } else {
        joined
    }
}

fn backend() -> Result<&'static LlamaBackend, String> {
    BACKEND.get_or_try_init(|| {
        // Install the capture layer + route llama.cpp logs into tracing.
        // Both calls are idempotent in practice: `try_init` returns Err
        // if a subscriber is already registered globally (which we treat
        // as success — capture is best-effort), and `send_logs_to_tracing`
        // has its own OnceLock-gated init.
        let _ = tracing_subscriber::registry().with(LlamaLogLayer).try_init();
        send_logs_to_tracing(LogOptions::default());
        LlamaBackend::init().map_err(|e| format!("llama backend init: {e}"))
    })
}

static CACHE: Lazy<Mutex<Option<CachedModel>>> = Lazy::new(|| Mutex::new(None));

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmStatus {
    pub available: bool,
    pub model_path: Option<String>,
    pub model_variant: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress<'a> {
    variant: &'a str,
    downloaded: u64,
    total: u64,
    percent: f32,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadComplete<'a> {
    variant: &'a str,
    model_path: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DownloadError<'a> {
    variant: &'a str,
    error: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmModelInfo {
    pub variant: String,
    pub size_bytes: u64,
}

fn models_dir() -> Result<PathBuf, String> {
    let base = dirs::data_dir().ok_or_else(|| "no data_dir".to_string())?;
    let dir = base.join(MODEL_BUNDLE_ID).join("llm-models");
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir llm-models: {e}"))?;
    Ok(dir)
}

fn variant_from_path(p: &Path) -> String {
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    stem.to_string()
}

fn find_existing_model(preferred_variant: Option<&str>) -> Result<Option<(PathBuf, String)>, String> {
    let dir = models_dir()?;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        let mut candidates: Vec<PathBuf> = entries
            .flatten()
            .filter_map(|e| {
                let p = e.path();
                if p.extension().and_then(|s| s.to_str()) == Some("gguf") {
                    Some(p)
                } else {
                    None
                }
            })
            .collect();
        candidates.sort();

        if let Some(pref) = preferred_variant {
            let preferred_path = dir.join(format!("{pref}.gguf"));
            if candidates.contains(&preferred_path) {
                return Ok(Some((preferred_path, pref.to_string())));
            }
        }

        if let Some(p) = candidates.into_iter().next() {
            let variant = variant_from_path(&p);
            return Ok(Some((p, variant)));
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn local_llm_status(preferred_variant: Option<String>) -> Result<LocalLlmStatus, String> {
    if let Some(cached) = CACHE.lock().map_err(|e| format!("lock: {e}"))?.as_ref() {
        return Ok(LocalLlmStatus {
            available: true,
            model_path: Some(cached.path.to_string_lossy().to_string()),
            model_variant: Some(cached.variant.clone()),
        });
    }
    match find_existing_model(preferred_variant.as_deref())? {
        Some((path, variant)) => Ok(LocalLlmStatus {
            available: true,
            model_path: Some(path.to_string_lossy().to_string()),
            model_variant: Some(variant),
        }),
        None => Ok(LocalLlmStatus {
            available: false,
            model_path: None,
            model_variant: None,
        }),
    }
}

/// Validate the GGUF magic bytes. llama.cpp's loader will fail with an
/// opaque "null result from llama cpp" if the file isn't a valid GGUF
/// (truncated download, HTML error page written under .gguf name, wrong
/// format). Catching it here lets us return an actionable message.
fn validate_gguf_magic(path: &Path) -> Result<(), String> {
    use std::io::Read as _;
    let mut f = std::fs::File::open(path).map_err(|e| format!("open: {e}"))?;
    let mut magic = [0u8; 4];
    f.read_exact(&mut magic).map_err(|e| format!("read magic: {e}"))?;
    if &magic != b"GGUF" {
        return Err(format!(
            "not a GGUF file (magic={:02x}{:02x}{:02x}{:02x}); the model file is corrupt or truncated, please re-download",
            magic[0], magic[1], magic[2], magic[3]
        ));
    }
    Ok(())
}

/// Load a llama model with three escalating fallback strategies.
///
/// 1. GPU offload + mmap (default, fastest)
/// 2. CPU only + mmap (covers GPU offload failures)
/// 3. CPU only + no-mmap (covers a class of bug seen in llama-cpp-2
///    0.1.146 on Apple Silicon M1 Pro where the loader's tensor
///    iteration spuriously reports duplicate tensors that don't exist
///    in the GGUF file — verified via a standalone GGUF parser. Disabling
///    mmap forces llama.cpp to read+parse the file conventionally
///    instead of mapping it, sidestepping whatever interaction with
///    Apple's Virtual Memory subsystem is corrupting tensor enumeration.)
///
/// All three attempts share the same "captured llama.cpp tracing logs
/// in the error message" pattern so the user-visible error covers every
/// attempted path's diagnostic.
fn load_model(backend: &LlamaBackend, path: &Path) -> Result<LlamaModel, String> {
    validate_gguf_magic(path)?;
    let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);

    clear_llama_log_buffer();
    let gpu_params = LlamaModelParams::default().with_n_gpu_layers(1_000_000);
    let gpu_err = match LlamaModel::load_from_file(backend, path, &gpu_params) {
        Ok(m) => return Ok(m),
        Err(e) => e,
    };
    let gpu_logs = drain_llama_log_buffer();

    clear_llama_log_buffer();
    let cpu_params = LlamaModelParams::default().with_n_gpu_layers(0);
    let cpu_err = match LlamaModel::load_from_file(backend, path, &cpu_params) {
        Ok(m) => return Ok(m),
        Err(e) => e,
    };
    let cpu_logs = drain_llama_log_buffer();

    clear_llama_log_buffer();
    let nommap_params = LlamaModelParams::default()
        .with_n_gpu_layers(0)
        .with_use_mmap(false);
    let nommap_err = match LlamaModel::load_from_file(backend, path, &nommap_params) {
        Ok(m) => return Ok(m),
        Err(e) => e,
    };
    let nommap_logs = drain_llama_log_buffer();

    let combined_logs = format!("{gpu_logs} {cpu_logs} {nommap_logs}");
    if combined_logs.contains("is duplicated") {
        return Err(format!(
            "this model file appears incompatible with the bundled llama.cpp on your Mac (Apple Silicon loader reports a spurious duplicated tensor that isn't actually in the file). Try the Plus model (Mistral 7B) instead — it uses a different architecture that sidesteps this bug. Diagnostic: GPU=({gpu_err}) [{gpu_logs}]; CPU=({cpu_err}) [{cpu_logs}]; CPU-nommap=({nommap_err}) [{nommap_logs}]; file={} size={}MB",
            path.display(),
            size / (1024 * 1024)
        ));
    }
    Err(format!(
        "load llama model: GPU=({gpu_err}) llama.cpp_logs=[{gpu_logs}]; CPU=({cpu_err}) llama.cpp_logs=[{cpu_logs}]; CPU-nommap=({nommap_err}) llama.cpp_logs=[{nommap_logs}]; file={} size={}MB",
        path.display(),
        size / (1024 * 1024)
    ))
}

fn ensure_loaded(preferred_variant: Option<&str>) -> Result<(), String> {
    let mut guard = CACHE.lock().map_err(|e| format!("lock: {e}"))?;
    if let Some(cached) = guard.as_ref() {
        if preferred_variant.is_none() || preferred_variant == Some(cached.variant.as_str()) {
            return Ok(());
        }
        *guard = None;
    }
    let (path, variant) = find_existing_model(preferred_variant)?
        .ok_or_else(|| "no llm model installed".to_string())?;

    let backend = backend()?;
    let model = load_model(backend, &path)?;

    *guard = Some(CachedModel {
        path,
        variant,
        model: Arc::new(model),
    });
    Ok(())
}

fn chat_template_for(variant: &str) -> &str {
    if variant.contains("phi") {
        return "<|user|>\n{prompt}<|end|>\n<|assistant|>";
    }
    if variant.contains("qwen") {
        return "<|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant\n";
    }
    if variant.contains("mistral") {
        return "[INST] {prompt} [/INST]";
    }
    "{prompt}"
}

fn strip_assistant_tag(variant: &str, output: &str) -> String {
    let trimmed = output.trim();
    if variant.contains("qwen") {
        trimmed.strip_suffix("<|im_end|>").unwrap_or(trimmed).trim().to_string()
    } else if variant.contains("phi") {
        trimmed.strip_suffix("<|end|>").unwrap_or(trimmed).trim().to_string()
    } else {
        trimmed.to_string()
    }
}

#[tauri::command]
pub async fn local_llm_cleanup(prompt: String, preferred_variant: Option<String>) -> Result<String, String> {
    // v0.19.9: mirror of v0.19.8 fix to local_whisper_transcribe. Llama
    // inference is CPU/GPU-bound and runs 5-30s. As a sync `tauri::command`
    // it blocked a tokio worker, starving Tauri's IPC layer → WebView main
    // thread stalled on pending invokes → beach ball. spawn_blocking moves
    // it to the dedicated blocking pool; tokio workers stay free for IPC.
    tauri::async_runtime::spawn_blocking(move || {
        ensure_loaded(preferred_variant.as_deref())?;

        let (model, variant) = {
            let guard = CACHE.lock().map_err(|e| format!("lock: {e}"))?;
            let cached = guard.as_ref().ok_or("model not loaded")?;
            (Arc::clone(&cached.model), cached.variant.clone())
        };

        let template = chat_template_for(&variant);
        let formatted = template.replace("{prompt}", &prompt);

        let backend = backend()?;
        let n_ctx: u32 = 2048;
        let n_threads = std::thread::available_parallelism()
            .map(|n| n.get() as i32)
            .unwrap_or(4);

        let ctx_params = LlamaContextParams::default()
            .with_n_ctx(NonZeroU32::new(n_ctx))
            .with_n_batch(n_ctx)
            .with_n_threads(n_threads)
            .with_n_threads_batch(n_threads);

        let mut ctx = model
            .new_context(backend, ctx_params)
            .map_err(|e| format!("create context: {e}"))?;

        let tokens = model
            .str_to_token(&formatted, AddBos::Always)
            .map_err(|e| format!("tokenize: {e}"))?;

        if tokens.len() as u32 >= n_ctx {
            return Err(format!(
                "prompt too long: {} tokens (limit {})",
                tokens.len(),
                n_ctx
            ));
        }

        let mut batch = LlamaBatch::new(n_ctx as usize, 1);
        let last_idx = tokens.len() as i32 - 1;
        for (i, tok) in tokens.iter().enumerate() {
            let i32_pos = i as i32;
            batch
                .add(*tok, i32_pos, &[0], i32_pos == last_idx)
                .map_err(|e| format!("batch add: {e}"))?;
        }
        ctx.decode(&mut batch).map_err(|e| format!("decode prompt: {e}"))?;

        let mut sampler = LlamaSampler::chain_simple([
            LlamaSampler::temp(0.7),
            LlamaSampler::top_p(0.95, 1),
            LlamaSampler::dist(0),
        ]);

        let max_new_tokens: u32 = 512;
        let start = std::time::Instant::now();
        let mut n_cur: i32 = tokens.len() as i32;
        let mut output = String::new();

        for _ in 0..max_new_tokens {
            if start.elapsed() > Duration::from_secs(INFERENCE_TIMEOUT_SEC) {
                break;
            }

            let new_token = sampler.sample(&ctx, batch.n_tokens() - 1);
            sampler.accept(new_token);

            if model.is_eog_token(new_token) {
                break;
            }

            let piece = {
                #[allow(deprecated)]
                let p = model
                    .token_to_str(new_token, Special::Tokenize)
                    .unwrap_or_default();
                p
            };
            output.push_str(&piece);

            batch.clear();
            batch
                .add(new_token, n_cur, &[0], true)
                .map_err(|e| format!("batch add gen: {e}"))?;
            n_cur += 1;
            ctx.decode(&mut batch).map_err(|e| format!("decode gen: {e}"))?;
        }

        Ok(strip_assistant_tag(&variant, &output))
    })
    .await
    .map_err(|e| format!("spawn_blocking join: {e}"))?
}

#[tauri::command]
pub async fn local_llm_download_model(
    app_handle: tauri::AppHandle,
    variant: String,
) -> Result<(), String> {
    let v = variant.trim().to_string();
    let result = download_model_inner(&app_handle, &v).await;
    match &result {
        Ok(model_path) => {
            let _ = app_handle.emit(
                "local_llm:download-complete",
                DownloadComplete {
                    variant: &v,
                    model_path: model_path.clone(),
                },
            );
        }
        Err(e) => {
            let _ = app_handle.emit(
                "local_llm:download-error",
                DownloadError {
                    variant: &v,
                    error: e.clone(),
                },
            );
        }
    }
    result.map(|_| ())
}

async fn download_model_inner(app: &tauri::AppHandle, v: &str) -> Result<String, String> {
    use futures_util::StreamExt;

    if v.is_empty() {
        return Err("empty variant".into());
    }
    if !v.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_') {
        return Err(format!("invalid variant: {v}"));
    }

    // v0.19.12: qwen2.5-3b URL changed from the official `Qwen/Qwen2.5-3B-Instruct-GGUF`
    // upload to bartowski's quant.
    //
    // The official Qwen upload was produced with a legacy converter that
    // writes the embedding tensor twice in the GGUF — once as
    // `token_embd.weight` for the input embedding, and once *also* named
    // `token_embd.weight` for the tied LM head (instead of the correct
    // `output.weight`). The bundled llama.cpp's loader has a strict
    // "no duplicate tensor names" check (llama-model-loader.cpp:574-578)
    // that throws BEFORE reaching the lenient handler at line 1090 that
    // would have treated the duplicate as tied embeddings. Result:
    // "invalid model: tensor 'token_embd.weight' is duplicated" → NULL
    // return → user-visible "load llama model: null result from llama cpp".
    //
    // Verified in v0.19.11 user debug-log: the captured llama.cpp tracing
    // output contained exactly this error message. bartowski's converter
    // emits `output.weight` correctly, dodging the strict check.
    //
    // phi-3.5 URL kept as bartowski — same converter family that produces
    // the clean qwen quant. If a user has an older broken phi-3.5.gguf on
    // disk from a previous bartowski revision, deleting + re-downloading
    // will fetch the current clean version.
    let url = match v {
        "phi-3.5" => "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf",
        "qwen2.5-3b" => "https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf",
        "mistral-7b" => "https://huggingface.co/MaziyarPanahi/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3.Q4_K_M.gguf",
        _ => return Err(format!("unknown variant: {v}")),
    };

    let dir = models_dir()?;
    let final_path = dir.join(format!("{v}.gguf"));
    let tmp_path = dir.join(format!("{v}.gguf.part"));

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60 * 30))
        .build()
        .map_err(|e| format!("client: {e}"))?;
    let res = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("get: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("http {} downloading {}", res.status(), url));
    }

    let total = res.content_length().unwrap_or(0);

    let mut file = std::fs::File::create(&tmp_path).map_err(|e| format!("create tmp: {e}"))?;
    let mut stream = res.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;
    const EMIT_EVERY: u64 = 256 * 1024;

    let _ = app.emit(
        "local_llm:download-progress",
        DownloadProgress { variant: v, downloaded: 0, total, percent: 0.0 },
    );

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| {
            let _ = std::fs::remove_file(&tmp_path);
            format!("chunk: {e}")
        })?;
        file.write_all(&bytes).map_err(|e| format!("write: {e}"))?;
        downloaded = downloaded.saturating_add(bytes.len() as u64);
        if downloaded - last_emit >= EMIT_EVERY {
            last_emit = downloaded;
            let percent = if total > 0 {
                (downloaded as f32 / total as f32 * 100.0).min(99.9)
            } else {
                0.0
            };
            let _ = app.emit(
                "local_llm:download-progress",
                DownloadProgress { variant: v, downloaded, total, percent },
            );
        }
    }
    drop(file);

    std::fs::rename(&tmp_path, &final_path).map_err(|e| format!("rename: {e}"))?;

    if let Ok(mut guard) = CACHE.lock() {
        *guard = None;
    }

    let final_total = if total > 0 { total } else { downloaded };
    let _ = app.emit(
        "local_llm:download-progress",
        DownloadProgress {
            variant: v,
            downloaded,
            total: final_total,
            percent: 100.0,
        },
    );

    Ok(final_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn local_llm_delete_model(variant: String) -> Result<(), String> {
    let v = variant.trim();
    if v.is_empty() {
        return Err("empty variant".into());
    }
    if !v.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_') {
        return Err(format!("invalid variant: {v}"));
    }
    let dir = models_dir()?;
    let path = dir.join(format!("{v}.gguf"));
    if !path.exists() {
        return Err(format!("model not found: {v}"));
    }
    std::fs::remove_file(&path).map_err(|e| format!("remove: {e}"))?;
    if let Ok(mut guard) = CACHE.lock() {
        if let Some(c) = guard.as_ref() {
            if c.path == path {
                *guard = None;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn local_llm_list_models() -> Result<Vec<LocalLlmModelInfo>, String> {
    let dir = match dirs::data_dir() {
        Some(b) => b.join(MODEL_BUNDLE_ID).join("llm-models"),
        None => return Ok(Vec::new()),
    };
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out: Vec<LocalLlmModelInfo> = Vec::new();
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Ok(Vec::new()),
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) != Some("gguf") {
            continue;
        }
        let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
        out.push(LocalLlmModelInfo {
            variant: variant_from_path(&p),
            size_bytes,
        });
    }
    out.sort_by(|a, b| a.variant.cmp(&b.variant));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chat_template_for_phi() {
        let t = chat_template_for("phi-3.5");
        assert!(t.contains("<|user|>"));
        assert!(t.contains("<|end|>"));
        assert!(t.contains("<|assistant|>"));
    }

    #[test]
    fn chat_template_for_qwen() {
        let t = chat_template_for("qwen2.5-3b");
        assert!(t.contains("<|im_start|>"));
        assert!(t.contains("<|im_end|>"));
    }

    #[test]
    fn chat_template_for_mistral() {
        let t = chat_template_for("mistral-7b");
        assert!(t.contains("[INST]"));
        assert!(t.contains("[/INST]"));
    }

    #[test]
    fn chat_template_fallback() {
        let t = chat_template_for("unknown");
        assert_eq!(t, "{prompt}");
    }

    #[test]
    fn strip_assistant_tag_qwen() {
        let out = strip_assistant_tag("qwen2.5-3b", "Hello world<|im_end|>");
        assert_eq!(out, "Hello world");
    }

    #[test]
    fn strip_assistant_tag_phi() {
        let out = strip_assistant_tag("phi-3.5", "Hello world<|end|>");
        assert_eq!(out, "Hello world");
    }

    #[test]
    fn strip_assistant_tag_mistral_no_change() {
        let out = strip_assistant_tag("mistral-7b", "Hello world");
        assert_eq!(out, "Hello world");
    }

    #[test]
    fn variant_from_path_strips_extension() {
        assert_eq!(variant_from_path(Path::new("/x/phi-3.5.gguf")), "phi-3.5");
        assert_eq!(variant_from_path(Path::new("/x/qwen2.5-3b.gguf")), "qwen2.5-3b");
    }

    #[test]
    fn strip_assistant_tag_handles_trailing_whitespace() {
        let out = strip_assistant_tag("qwen2.5-3b", "  Hello\n<|im_end|>  ");
        assert_eq!(out, "Hello");
    }

    #[test]
    fn strip_assistant_tag_idempotent_when_no_marker() {
        let out = strip_assistant_tag("phi-3.5", "Already clean");
        assert_eq!(out, "Already clean");
    }

    #[test]
    fn chat_template_substitutes_prompt() {
        let formatted = chat_template_for("phi-3.5").replace("{prompt}", "hi");
        assert!(formatted.contains("hi"));
        assert!(!formatted.contains("{prompt}"));
    }

    #[test]
    fn chat_template_mistral_substitutes_prompt() {
        let formatted = chat_template_for("mistral-7b").replace("{prompt}", "fix this");
        assert_eq!(formatted, "[INST] fix this [/INST]");
    }
}
