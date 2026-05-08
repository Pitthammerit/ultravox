//! Local on-device Whisper transcription via whisper-rs (whisper.cpp + Metal).
//!
//! Three Tauri commands matching the TS bridge in `tauri-bridge.ts`:
//!   - `local_whisper_status`         → which model (if any) is downloaded
//!   - `local_whisper_transcribe`     → decode audio bytes, run whisper, return text
//!   - `local_whisper_download_model` → fetch GGML .bin from HuggingFace
//!
//! Mirrors the "local-tool fallback to cloud" pattern from `claude_code.rs`:
//! TS calls `local_whisper_status`, only takes the local path when `available`
//! is true, otherwise falls through to the managed Cloudflare worker.
//!
//! For v0.10 the model is NOT bundled in the DMG — users must explicitly
//! trigger a download (UI for that ships in a follow-up). Until then,
//! `local_whisper_status` always returns `available: false`, the TS routing
//! falls back to the cloud, and existing behavior is unchanged.

#![cfg(target_os = "macos")]

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use once_cell::sync::Lazy;
use serde::Serialize;
use tauri::Emitter;

use std::io::Cursor;
use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

const TARGET_SR: u32 = 16_000;
const MODEL_BUNDLE_ID: &str = "com.ultravox.dev";

struct CachedModel {
    path: PathBuf,
    variant: String,
    ctx: WhisperContext,
}

static CACHE: Lazy<Mutex<Option<CachedModel>>> = Lazy::new(|| Mutex::new(None));

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalWhisperStatus {
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
pub struct LocalWhisperModelInfo {
    pub variant: String,
    pub size_bytes: u64,
}

fn models_dir() -> Result<PathBuf, String> {
    let base = dirs::data_dir().ok_or_else(|| "no data_dir".to_string())?;
    let dir = base.join(MODEL_BUNDLE_ID).join("whisper-models");
    std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir whisper-models: {e}"))?;
    Ok(dir)
}

/// Find a model in the models dir.
///
/// Priority:
/// 1. If `preferred_variant` is Some and the file exists, use it.
/// 2. Auto-route based on `language` and `audio_quality`:
///    - en + low quality:  large-v3 → large-v3-turbo → medium.en → medium → small → base.en → base → tiny
///    - en + normal:       medium.en → base.en → base → large-v3-turbo → large-v3 → medium → small → tiny
///    - multilingual + low quality:  large-v3 → large-v3-turbo → medium → small → base → tiny
///    - multilingual + normal:       large-v3-turbo → large-v3 → medium → small → base → tiny
/// 3. Fall back to the first alphabetically if nothing from the priority lists is found.
fn find_existing_model(preferred_variant: Option<&str>, language: Option<&str>, audio_quality: Option<&str>) -> Result<Option<(PathBuf, String)>, String> {
    let dir = models_dir()?;
    if let Ok(entries) = std::fs::read_dir(&dir) {
        let mut candidates: Vec<PathBuf> = entries
            .flatten()
            .filter_map(|e| {
                let p = e.path();
                if p.extension().and_then(|s| s.to_str()) == Some("bin") {
                    Some(p)
                } else {
                    None
                }
            })
            .collect();
        candidates.sort();

        // 1. Explicit preferred variant takes priority.
        if let Some(pref) = preferred_variant {
            let preferred_path = dir.join(format!("ggml-{pref}.bin"));
            if candidates.contains(&preferred_path) {
                return Ok(Some((preferred_path, pref.to_string())));
            }
        }

        // 2. Auto-route based on language + audio quality when no explicit variant.
        if preferred_variant.is_none() {
            let is_en = language.map(|l| l.trim().eq_ignore_ascii_case("en")).unwrap_or(false);
            let is_low = audio_quality.map(|q| q.eq_ignore_ascii_case("low")).unwrap_or(false);

            let priority: &[&str] = match (is_en, is_low) {
                // English + low quality: biggest model first (ultra beats turbo for hard audio)
                (true, true)  => &["large-v3", "large-v3-turbo", "medium.en", "medium", "small", "base.en", "base", "tiny"],
                // English + normal quality: prefer english-tuned, then turbo (faster), then ultra
                (true, false) => &["medium.en", "base.en", "base", "large-v3-turbo", "large-v3", "medium", "small", "tiny"],
                // Multilingual + low quality: ultra first (max accuracy for hard audio)
                (false, true)  => &["large-v3", "large-v3-turbo", "medium", "small", "base", "tiny"],
                // Multilingual + normal quality: turbo first (good balance of speed + accuracy)
                (false, false) => &["large-v3-turbo", "large-v3", "medium", "small", "base", "tiny"],
            };
            for variant in priority {
                let p = dir.join(format!("ggml-{variant}.bin"));
                if candidates.contains(&p) {
                    return Ok(Some((p, variant.to_string())));
                }
            }
        }

        // 3. Fallback: first installed alphabetically.
        if let Some(p) = candidates.into_iter().next() {
            let variant = variant_from_path(&p);
            return Ok(Some((p, variant)));
        }
    }
    Ok(None)
}

fn variant_from_path(p: &Path) -> String {
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    stem.strip_prefix("ggml-").unwrap_or(stem).to_string()
}

#[tauri::command]
pub fn local_whisper_status(preferred_variant: Option<String>, language: Option<String>, audio_quality: Option<String>) -> Result<LocalWhisperStatus, String> {
    if let Some(cached) = CACHE.lock().map_err(|e| format!("lock: {e}"))?.as_ref() {
        return Ok(LocalWhisperStatus {
            available: true,
            model_path: Some(cached.path.to_string_lossy().to_string()),
            model_variant: Some(cached.variant.clone()),
        });
    }
    match find_existing_model(preferred_variant.as_deref(), language.as_deref(), audio_quality.as_deref())? {
        Some((path, variant)) => Ok(LocalWhisperStatus {
            available: true,
            model_path: Some(path.to_string_lossy().to_string()),
            model_variant: Some(variant),
        }),
        None => Ok(LocalWhisperStatus {
            available: false,
            model_path: None,
            model_variant: None,
        }),
    }
}

fn ensure_loaded(preferred_variant: Option<&str>, routing_language: Option<&str>, audio_quality: Option<&str>) -> Result<(), String> {
    let mut guard = CACHE.lock().map_err(|e| format!("lock: {e}"))?;
    if let Some(cached) = guard.as_ref() {
        // If the cached model matches the preferred variant (or no preference), keep it.
        if preferred_variant.is_none() || preferred_variant == Some(cached.variant.as_str()) {
            return Ok(());
        }
        // Preferred variant differs from what's cached — check if it's actually installed.
        let dir = dirs::data_dir()
            .ok_or_else(|| "no data_dir".to_string())?
            .join(MODEL_BUNDLE_ID)
            .join("whisper-models");
        if let Some(pref) = preferred_variant {
            let preferred_path = dir.join(format!("ggml-{pref}.bin"));
            if !preferred_path.exists() {
                // Preferred not installed; keep using the cached one.
                return Ok(());
            }
        }
        // Clear cache so we reload with the preferred model below.
        *guard = None;
    }
    let (path, variant) = find_existing_model(preferred_variant, routing_language, audio_quality)?
        .ok_or_else(|| "no whisper model installed".to_string())?;
    let path_str = path.to_str().ok_or("non-utf8 model path")?;
    let ctx = WhisperContext::new_with_params(path_str, WhisperContextParameters::default())
        .map_err(|e| format!("load whisper model: {e}"))?;
    *guard = Some(CachedModel { path, variant, ctx });
    Ok(())
}

#[tauri::command]
pub fn local_whisper_transcribe(
    audio_bytes: Vec<u8>,
    language: Option<String>,
    preferred_variant: Option<String>,
    routing_language: Option<String>,
    audio_quality: Option<String>,
) -> Result<String, String> {
    ensure_loaded(preferred_variant.as_deref(), routing_language.as_deref(), audio_quality.as_deref())?;

    let pcm = decode_to_mono_16k(audio_bytes)?;
    if pcm.is_empty() {
        return Err("decoded audio empty".into());
    }

    let guard = CACHE.lock().map_err(|e| format!("lock: {e}"))?;
    let cached = guard.as_ref().ok_or("model not loaded")?;
    let mut state = cached
        .ctx
        .create_state()
        .map_err(|e| format!("whisper state: {e}"))?;

    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    let n_threads = std::thread::available_parallelism()
        .map(|n| n.get() as i32)
        .unwrap_or(4);
    params.set_n_threads(n_threads);
    params.set_translate(false);
    params.set_no_context(true);
    params.set_single_segment(false);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    let lang_param = language.as_deref().and_then(|l| {
        let trimmed = l.trim();
        if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("auto") {
            None
        } else {
            Some(trimmed)
        }
    });
    params.set_language(lang_param);

    state
        .full(params, &pcm)
        .map_err(|e| format!("whisper full: {e}"))?;

    let n_segments = state
        .full_n_segments()
        .map_err(|e| format!("n_segments: {e}"))?;
    let mut text = String::new();
    for i in 0..n_segments {
        let seg = state
            .full_get_segment_text(i)
            .map_err(|e| format!("segment {i}: {e}"))?;
        text.push_str(&seg);
    }
    Ok(text.trim().to_string())
}

#[tauri::command]
pub async fn local_whisper_download_model(
    app_handle: tauri::AppHandle,
    variant: String,
) -> Result<(), String> {
    let v = variant.trim().to_string();
    let result = download_model_inner(&app_handle, &v).await;
    match &result {
        Ok(model_path) => {
            let _ = app_handle.emit(
                "local_whisper:download-complete",
                DownloadComplete {
                    variant: &v,
                    model_path: model_path.clone(),
                },
            );
        }
        Err(e) => {
            let _ = app_handle.emit(
                "local_whisper:download-error",
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
    use std::io::Write as _;

    if v.is_empty() {
        return Err("empty variant".into());
    }
    if !v
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
    {
        return Err(format!("invalid variant: {v}"));
    }

    let url =
        format!("https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{v}.bin");
    let dir = models_dir()?;
    let final_path = dir.join(format!("ggml-{v}.bin"));
    let tmp_path = dir.join(format!("ggml-{v}.bin.part"));

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60 * 30))
        .build()
        .map_err(|e| format!("client: {e}"))?;
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("get: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("http {} downloading {url}", res.status()));
    }

    let total = res.content_length().unwrap_or(0);

    let mut file = std::fs::File::create(&tmp_path).map_err(|e| format!("create tmp: {e}"))?;
    let mut stream = res.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_emit: u64 = 0;
    const EMIT_EVERY: u64 = 256 * 1024;

    let _ = app.emit(
        "local_whisper:download-progress",
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
                "local_whisper:download-progress",
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
        "local_whisper:download-progress",
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
pub fn local_whisper_delete_model(variant: String) -> Result<(), String> {
    let v = variant.trim();
    if v.is_empty() {
        return Err("empty variant".into());
    }
    if !v
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
    {
        return Err(format!("invalid variant: {v}"));
    }
    let dir = models_dir()?;
    let path = dir.join(format!("ggml-{v}.bin"));
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
pub fn local_whisper_list_models() -> Result<Vec<LocalWhisperModelInfo>, String> {
    let dir = match dirs::data_dir() {
        Some(b) => b.join(MODEL_BUNDLE_ID).join("whisper-models"),
        None => return Ok(Vec::new()),
    };
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out: Vec<LocalWhisperModelInfo> = Vec::new();
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Ok(Vec::new()),
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) != Some("bin") {
            continue;
        }
        let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
        out.push(LocalWhisperModelInfo {
            variant: variant_from_path(&p),
            size_bytes,
        });
    }
    out.sort_by(|a, b| a.variant.cmp(&b.variant));
    Ok(out)
}

/// Decode arbitrary recorder bytes (mp4/aac/ogg/wav) to 16 kHz mono f32 PCM.
/// macOS WKWebView's MediaRecorder typically yields audio/mp4 (AAC) — that's
/// the well-trodden path. webm/Opus is not demuxable by symphonia 0.5.x;
/// returns Err in that case so the caller falls back to the cloud worker.
fn decode_to_mono_16k(bytes: Vec<u8>) -> Result<Vec<f32>, String> {
    if bytes.is_empty() {
        return Err("empty audio bytes".into());
    }

    let cursor = Cursor::new(bytes);
    let mss = MediaSourceStream::new(Box::new(cursor), Default::default());
    let hint = Hint::new();

    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| format!("probe (likely webm/unsupported container): {e}"))?;

    let mut format = probed.format;
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or("no audio track")?;
    let track_id = track.id;
    let src_sr = track
        .codec_params
        .sample_rate
        .ok_or("missing sample_rate")?;
    let channels = track.codec_params.channels.map(|c| c.count()).unwrap_or(1);

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("make decoder: {e}"))?;

    let mut mono: Vec<f32> = Vec::new();
    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(_)) => break,
            Err(e) => return Err(format!("packet: {e}")),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(symphonia::core::errors::Error::DecodeError(_)) => continue,
            Err(e) => return Err(format!("decode: {e}")),
        };
        push_downmix(&decoded, channels, &mut mono);
    }

    if src_sr == TARGET_SR {
        return Ok(mono);
    }
    Ok(resample_to_16k(&mono, src_sr))
}

fn push_downmix(buf: &AudioBufferRef<'_>, channels: usize, out: &mut Vec<f32>) {
    let inv = if channels > 0 { 1.0 / channels as f32 } else { 1.0 };
    match buf {
        AudioBufferRef::F32(b) => {
            let frames = b.frames();
            for f in 0..frames {
                let mut acc = 0.0f32;
                for ch in 0..channels {
                    acc += b.chan(ch)[f];
                }
                out.push(acc * inv);
            }
        }
        AudioBufferRef::S16(b) => {
            let frames = b.frames();
            for f in 0..frames {
                let mut acc = 0.0f32;
                for ch in 0..channels {
                    acc += b.chan(ch)[f] as f32 / 32768.0;
                }
                out.push(acc * inv);
            }
        }
        AudioBufferRef::S32(b) => {
            let frames = b.frames();
            for f in 0..frames {
                let mut acc = 0.0f32;
                for ch in 0..channels {
                    acc += b.chan(ch)[f] as f32 / 2_147_483_648.0;
                }
                out.push(acc * inv);
            }
        }
        AudioBufferRef::U8(b) => {
            let frames = b.frames();
            for f in 0..frames {
                let mut acc = 0.0f32;
                for ch in 0..channels {
                    acc += (b.chan(ch)[f] as f32 - 128.0) / 128.0;
                }
                out.push(acc * inv);
            }
        }
        _ => {}
    }
}

/// Use rubato's FftFixedIn for high-quality 48k→16k. Fallback to a cheap
/// linear interpolation if the resampler can't be constructed for some reason.
fn resample_to_16k(input: &[f32], src_sr: u32) -> Vec<f32> {
    use rubato::{FftFixedIn, Resampler};

    if input.is_empty() {
        return Vec::new();
    }

    let chunk_in = 1024usize.min(input.len());
    let resampler = FftFixedIn::<f32>::new(
        src_sr as usize,
        TARGET_SR as usize,
        chunk_in,
        2,
        1,
    );

    match resampler {
        Ok(mut r) => {
            let mut out: Vec<f32> = Vec::with_capacity(
                (input.len() as f64 * TARGET_SR as f64 / src_sr as f64) as usize + 1024,
            );
            let mut pos = 0usize;
            while pos + chunk_in <= input.len() {
                let frame = vec![input[pos..pos + chunk_in].to_vec()];
                if let Ok(processed) = r.process(&frame, None) {
                    out.extend_from_slice(&processed[0]);
                }
                pos += chunk_in;
            }
            // Tail: zero-pad the remainder so the FFT resampler can flush.
            if pos < input.len() {
                let mut tail = vec![0.0f32; chunk_in];
                let remaining = input.len() - pos;
                tail[..remaining].copy_from_slice(&input[pos..]);
                let frame = vec![tail];
                if let Ok(processed) = r.process(&frame, None) {
                    let take =
                        (remaining as f64 * TARGET_SR as f64 / src_sr as f64).round() as usize;
                    let take = take.min(processed[0].len());
                    out.extend_from_slice(&processed[0][..take]);
                }
            }
            out
        }
        Err(_) => linear_resample(input, src_sr, TARGET_SR),
    }
}

fn linear_resample(input: &[f32], src_sr: u32, dst_sr: u32) -> Vec<f32> {
    if input.is_empty() {
        return Vec::new();
    }
    let ratio = dst_sr as f64 / src_sr as f64;
    let out_len = (input.len() as f64 * ratio) as usize;
    let mut out = Vec::with_capacity(out_len);
    let last = input.len() - 1;
    for i in 0..out_len {
        let src_pos = i as f64 / ratio;
        let idx = src_pos.floor() as usize;
        let frac = (src_pos - idx as f64) as f32;
        let s0 = input[idx.min(last)];
        let s1 = input[(idx + 1).min(last)];
        out.push(s0 + (s1 - s0) * frac);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_returns_unavailable_when_no_model() {
        // Reset cache to ensure we're testing the cold path.
        if let Ok(mut g) = CACHE.lock() {
            *g = None;
        }
        // We can't fully sandbox the user's data_dir without env hacking, but
        // on a CI machine where the dev models dir is absent (or empty), this
        // returns unavailable. If a developer has dropped a real .bin into
        // ~/Library/Application Support/com.ultravox.dev/whisper-models the
        // assertion below is permissive — only checks the shape.
        let st = local_whisper_status(None, None, None).expect("status ok");
        if !st.available {
            assert!(st.model_path.is_none());
            assert!(st.model_variant.is_none());
        } else {
            assert!(st.model_path.is_some());
            assert!(st.model_variant.is_some());
        }
    }

    #[test]
    fn linear_resample_halves_correctly() {
        let input: Vec<f32> = (0..32).map(|i| i as f32).collect();
        let out = linear_resample(&input, 32_000, 16_000);
        assert_eq!(out.len(), 16);
    }

    #[test]
    fn variant_from_path_strips_ggml_prefix() {
        assert_eq!(variant_from_path(Path::new("/x/ggml-base.en.bin")), "base.en");
        assert_eq!(variant_from_path(Path::new("/x/ggml-large-v3-turbo.bin")), "large-v3-turbo");
        assert_eq!(variant_from_path(Path::new("/x/foo.bin")), "foo");
    }

    #[test]
    fn list_models_handles_missing_or_empty_dir() {
        // When the models dir is missing or empty, we expect an empty Vec
        // rather than a hard error. We don't sandbox the actual data_dir,
        // so we accept either an empty list or whatever real models the
        // developer happens to have downloaded — only the type is asserted.
        let list = local_whisper_list_models().expect("list ok");
        for m in &list {
            assert!(!m.variant.is_empty());
        }
    }

    #[test]
    fn empty_audio_rejected() {
        let err = decode_to_mono_16k(Vec::new()).unwrap_err();
        assert!(err.contains("empty"));
    }

    /// Helper: resolve the auto-routing priority given a set of installed variants.
    /// Mirrors the priority logic inside find_existing_model without touching the filesystem.
    fn resolve_priority(installed: &[&str], language: Option<&str>, audio_quality: Option<&str>) -> Option<String> {
        let is_en = language.map(|l| l.trim().eq_ignore_ascii_case("en")).unwrap_or(false);
        let is_low = audio_quality.map(|q| q.eq_ignore_ascii_case("low")).unwrap_or(false);

        let priority: &[&str] = match (is_en, is_low) {
            (true, true)  => &["large-v3", "large-v3-turbo", "medium.en", "medium", "small", "base.en", "base", "tiny"],
            (true, false) => &["medium.en", "base.en", "base", "large-v3-turbo", "large-v3", "medium", "small", "tiny"],
            (false, true)  => &["large-v3", "large-v3-turbo", "medium", "small", "base", "tiny"],
            (false, false) => &["large-v3-turbo", "large-v3", "medium", "small", "base", "tiny"],
        };
        for variant in priority {
            if installed.contains(variant) {
                return Some(variant.to_string());
            }
        }
        None
    }

    #[test]
    fn routing_en_normal_prefers_medium_en_over_large_turbo() {
        let picked = resolve_priority(&["large-v3-turbo", "medium.en", "base.en"], Some("en"), Some("normal"));
        assert_eq!(picked.as_deref(), Some("medium.en"));
    }

    #[test]
    fn routing_en_normal_falls_back_to_base_en_when_no_medium_en() {
        let picked = resolve_priority(&["base.en", "base", "large-v3-turbo"], Some("en"), Some("normal"));
        assert_eq!(picked.as_deref(), Some("base.en"));
    }

    #[test]
    fn routing_en_low_quality_prefers_large_turbo() {
        let picked = resolve_priority(&["large-v3-turbo", "medium.en", "base.en"], Some("en"), Some("low"));
        assert_eq!(picked.as_deref(), Some("large-v3-turbo"));
    }

    #[test]
    fn routing_en_low_quality_falls_back_to_medium_en_when_no_large_turbo() {
        let picked = resolve_priority(&["medium.en", "base.en", "base"], Some("en"), Some("low"));
        assert_eq!(picked.as_deref(), Some("medium.en"));
    }

    #[test]
    fn routing_multilingual_prefers_large_turbo_over_large_v3_for_normal() {
        let picked = resolve_priority(&["large-v3", "large-v3-turbo", "medium", "small"], None, Some("normal"));
        assert_eq!(picked.as_deref(), Some("large-v3-turbo"));
    }

    #[test]
    fn routing_multilingual_low_quality_prefers_large_v3_over_turbo() {
        let picked = resolve_priority(&["large-v3", "large-v3-turbo", "medium", "base"], None, Some("low"));
        assert_eq!(picked.as_deref(), Some("large-v3"));
    }

    #[test]
    fn routing_multilingual_falls_back_to_medium_without_large_models() {
        let picked = resolve_priority(&["medium", "small", "base"], None, Some("low"));
        assert_eq!(picked.as_deref(), Some("medium"));
    }

    #[test]
    fn routing_en_low_quality_prefers_large_v3_over_turbo() {
        let picked = resolve_priority(&["large-v3", "large-v3-turbo", "medium.en"], Some("en"), Some("low"));
        assert_eq!(picked.as_deref(), Some("large-v3"));
    }

    #[test]
    fn routing_multilingual_normal_falls_back_to_large_v3_when_no_turbo() {
        let picked = resolve_priority(&["large-v3", "medium", "small"], None, Some("normal"));
        assert_eq!(picked.as_deref(), Some("large-v3"));
    }

    #[test]
    fn routing_en_normal_fallback_chain_to_large_turbo() {
        // Only large-v3-turbo and tiny installed; en+normal should skip to large-v3-turbo
        // (position 4 in the en-normal priority list).
        let picked = resolve_priority(&["large-v3-turbo", "tiny"], Some("en"), Some("normal"));
        assert_eq!(picked.as_deref(), Some("large-v3-turbo"));
    }
}
