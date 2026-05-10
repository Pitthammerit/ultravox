use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime, State,
};

/// Holds runtime handles to menu pieces we need to mutate after creation.
/// The mic submenu is rebuilt every time the frontend reports new device
/// enumeration results from `navigator.mediaDevices.enumerateDevices()`.
/// The mode submenu is rebuilt whenever settings.modes or activeModeId
/// changes so the tray always reflects the user's current mode list.
pub struct TrayMenuState<R: Runtime> {
    pub mic_submenu: Mutex<Option<Submenu<R>>>,
    pub mode_submenu: Mutex<Option<Submenu<R>>>,
}

impl<R: Runtime> Default for TrayMenuState<R> {
    fn default() -> Self {
        Self {
            mic_submenu: Mutex::new(None),
            mode_submenu: Mutex::new(None),
        }
    }
}

#[derive(serde::Deserialize)]
pub struct MicDevice {
    pub id: String,
    pub label: String,
}

#[derive(serde::Deserialize)]
pub struct ModeEntry {
    pub id: String,
    pub label: String,
}

fn show_settings<R: Runtime>(app: &AppHandle<R>) {
    if let Some(win) = app.get_webview_window("settings") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// Rebuild the contents of the mic submenu from a fresh device list.
/// Layout:
///   • Open System Settings…
///   • ─────────────
///   • Default (system)
///   • <device 1>
///   • <device 2>
///   • …
/// `selected_id` is `None` for "system default" or a specific deviceId.
#[tauri::command]
pub fn update_mic_submenu<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, TrayMenuState<R>>,
    devices: Vec<MicDevice>,
    selected_id: Option<String>,
) -> Result<(), String> {
    let guard = state.mic_submenu.lock().map_err(|e| e.to_string())?;
    let Some(submenu) = guard.as_ref() else { return Ok(()); };

    while submenu
        .remove_at(0)
        .map_err(|e| e.to_string())?
        .is_some()
    {}

    let open_sys = MenuItem::with_id(
        &app,
        "mic_settings",
        "Open System Settings…",
        true,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;
    submenu.append(&open_sys).map_err(|e| e.to_string())?;
    submenu
        .append(&PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;

    let default_label = if selected_id.is_none() {
        "✓  Default (system)"
    } else {
        "    Default (system)"
    };
    let default_item = MenuItem::with_id(
        &app,
        "mic_dev:__default__",
        default_label,
        true,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;
    submenu.append(&default_item).map_err(|e| e.to_string())?;

    for d in devices {
        let is_sel = selected_id.as_deref() == Some(d.id.as_str());
        let prefix = if is_sel { "✓  " } else { "    " };
        let label = format!("{prefix}{}", d.label);
        let id = format!("mic_dev:{}", d.id);
        let item = MenuItem::with_id(&app, id, label, true, None::<&str>)
            .map_err(|e| e.to_string())?;
        submenu.append(&item).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Rebuild the contents of the Mode submenu from the current settings.modes
/// list. Each entry's id becomes `mode:<id>` so the on-menu-event handler can
/// route generic clicks back to the frontend via the `tray:set-mode` event.
/// `active_id` controls which row gets the ✓ checkmark.
#[tauri::command]
pub fn update_mode_submenu<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, TrayMenuState<R>>,
    modes: Vec<ModeEntry>,
    active_id: Option<String>,
) -> Result<(), String> {
    let guard = state.mode_submenu.lock().map_err(|e| e.to_string())?;
    let Some(submenu) = guard.as_ref() else { return Ok(()); };

    while submenu
        .remove_at(0)
        .map_err(|e| e.to_string())?
        .is_some()
    {}

    if modes.is_empty() {
        let placeholder = MenuItem::with_id(
            &app,
            "mode_loading",
            "    (no modes configured)",
            false,
            None::<&str>,
        )
        .map_err(|e| e.to_string())?;
        submenu.append(&placeholder).map_err(|e| e.to_string())?;
        return Ok(());
    }

    for m in modes {
        let is_active = active_id.as_deref() == Some(m.id.as_str());
        let prefix = if is_active { "✓  " } else { "    " };
        let label = format!("{prefix}{}", m.label);
        let id = format!("mode:{}", m.id);
        let item = MenuItem::with_id(&app, id, label, true, None::<&str>)
            .map_err(|e| e.to_string())?;
        submenu.append(&item).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let toggle_record =
        MenuItem::with_id(app, "toggle_record", "Toggle Recording", true, None::<&str>)?;
    // Safety net for the focus-loss / wrong-paste-target case: the user's
    // most-recent transcription stays available from the tray. Frontend
    // copies settings.history[0].text into the clipboard on this click.
    let copy_last = MenuItem::with_id(
        app,
        "copy_last_transcription",
        "Copy Last Transcription",
        true,
        None::<&str>,
    )?;
    let settings_item = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;

    let sep1 = PredefinedMenuItem::separator(app)?;

    let mic_open = MenuItem::with_id(
        app,
        "mic_settings",
        "Open System Settings…",
        true,
        None::<&str>,
    )?;
    let mic_loading = MenuItem::with_id(
        app,
        "mic_loading",
        "    (loading devices…)",
        false,
        None::<&str>,
    )?;
    let mic_submenu = Submenu::with_items(
        app,
        "Microphone Settings",
        true,
        &[&mic_open, &PredefinedMenuItem::separator(app)?, &mic_loading],
    )?;

    let ax_settings = MenuItem::with_id(
        app,
        "ax_settings",
        "Accessibility Settings…",
        true,
        None::<&str>,
    )?;

    // Placeholder; the frontend pushes the real mode list via update_mode_submenu
    // as soon as settings load and on every settings.modes / activeModeId change.
    let mode_loading = MenuItem::with_id(
        app,
        "mode_loading",
        "    (loading modes…)",
        false,
        None::<&str>,
    )?;
    let mode_submenu = Submenu::with_items(app, "Mode", true, &[&mode_loading])?;

    let sep2 = PredefinedMenuItem::separator(app)?;

    let version_label = MenuItem::with_id(
        app,
        "version_label",
        &format!("Version {}", env!("CARGO_PKG_VERSION")),
        false,
        None::<&str>,
    )?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit Ultravox", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &toggle_record,
            &copy_last,
            &settings_item,
            &sep1,
            &mic_submenu,
            &ax_settings,
            &mode_submenu,
            &sep2,
            &version_label,
            &quit_item,
        ],
    )?;

    if let Some(state) = app.try_state::<TrayMenuState<R>>() {
        if let Ok(mut g) = state.mic_submenu.lock() {
            *g = Some(mic_submenu.clone());
        }
        if let Ok(mut g) = state.mode_submenu.lock() {
            *g = Some(mode_submenu.clone());
        }
    }

    let _tray = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .icon(
            app.default_window_icon()
                .cloned()
                .unwrap_or_else(|| tauri::image::Image::new_owned(vec![0, 0, 0, 0], 1, 1)),
        )
        .on_menu_event(|app, event| {
            let id = event.id.as_ref();
            match id {
                "toggle_record" => {
                    if let Some(win) = app.get_webview_window("pill") {
                        let _ = win.show();
                        crate::pill_window::reapply_overlay_flags(app, "pill");
                    }
                    let _ = app.emit("hotkey:toggle-record", ());
                }
                "copy_last_transcription" => {
                    let _ = app.emit("tray:copy-last", ());
                }
                "settings" => show_settings(app),
                "mic_settings" => {
                    std::thread::spawn(|| {
                        let _ = crate::system::open_privacy_settings("microphone".into());
                    });
                }
                "ax_settings" => {
                    std::thread::spawn(|| {
                        let _ = crate::system::open_privacy_settings("accessibility".into());
                    });
                }
                "quit" => app.exit(0),
                other if other.starts_with("mic_dev:") => {
                    let dev_id = &other["mic_dev:".len()..];
                    let payload = if dev_id == "__default__" { "" } else { dev_id };
                    let _ = app.emit("tray:set-mic-device", payload.to_string());
                }
                other if other.starts_with("mode:") => {
                    let mode_id = &other["mode:".len()..];
                    let _ = app.emit("tray:set-mode", mode_id.to_string());
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("pill") {
                    let _ = win.show();
                    crate::pill_window::reapply_overlay_flags(app, "pill");
                }
                let _ = app.emit("hotkey:toggle-record", ());
            }
        })
        .build(app)?;

    Ok(())
}
