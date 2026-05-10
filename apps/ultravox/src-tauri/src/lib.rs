use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};

mod claude_code;
mod hotkey;
mod paste;
mod permissions;
mod system;
mod tray;

#[cfg(target_os = "macos")]
mod frontmost;

#[cfg(target_os = "macos")]
mod media;

#[cfg(target_os = "macos")]
mod local_llm;
mod local_whisper;

mod pill_window;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // Single-instance: a second launch (double-click DMG / app icon while
        // app is already running) routes here instead of spawning another
        // process. We just bring the existing settings window to front.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(win) = app.get_webview_window("settings") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(tray::TrayMenuState::<tauri::Wry>::default())
        .setup(|app| {
            if let Err(e) = hotkey::register_default_hotkeys(app.handle()) {
                eprintln!("hotkey registration failed: {e}");
            }
            if let Err(e) = tray::create_tray(app.handle()) {
                eprintln!("tray creation failed: {e}");
            }

            pill_window::configure_overlay_windows(app.handle());

            // Replace Tauri's default 5-submenu app menu (File/Edit/View/
            // Window/Help with dozens of items) with a minimal Ultravox +
            // Edit pair. Edit is required for Cmd+C/V/X/Z/A in text inputs.
            if let Err(e) = install_minimal_menu(app.handle()) {
                eprintln!("menu install failed: {e}");
            }

            #[cfg(target_os = "macos")]
            {
                // Show Ultravox in the Dock and the Cmd-Tab app switcher.
                // The tray icon is still available for quick toggle/quit.
                // (If we ever want a hidden background mode again, swap back
                // to ActivationPolicy::Accessory — closing settings keeps
                // the global hotkey + tray + pill alive in either policy.)
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
            }

            // Settings window: closing it should hide instead of quit, so the
            // global hotkey + tray + pill keep working in the background.
            // Without this, macOS Tauri destroys the window on close and the
            // tray click can never reopen it.
            if let Some(settings_win) = app.get_webview_window("settings") {
                let win_clone = settings_win.clone();
                settings_win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win_clone.hide();
                    }
                });

                // Force the settings window in front of other apps on launch.
                // Without an explicit show+focus, switching from Accessory to
                // Regular activation can leave the window painted but behind
                // whatever app the user was last using.
                let _ = settings_win.show();
                let _ = settings_win.unminimize();
                let _ = settings_win.set_focus();
            }

            Ok(())
        });

    #[cfg(target_os = "macos")]
    let builder = builder.manage(media::MediaState::default());

    #[cfg(target_os = "macos")]
    let builder = builder.invoke_handler(tauri::generate_handler![
        paste::paste_to_frontmost,
        paste::copy_to_clipboard,
        frontmost::get_frontmost_app,
        hotkey::show_pill,
        hotkey::hide_pill,
        hotkey::show_mode_overlay,
        hotkey::hide_mode_overlay,
        hotkey::set_pill_height,
        hotkey::set_pill_size,
        hotkey::set_pill_position_top_center,
        hotkey::set_pill_size_at_position,
        hotkey::ultravox_register_hotkeys,
        hotkey::unregister_all_hotkeys,
        hotkey::register_recording_escape,
        hotkey::unregister_recording_escape,
        permissions::check_accessibility_permission,
        permissions::request_accessibility_permission,
        permissions::microphone_auth_status,
        media::media_pause,
        media::media_resume,
        media::media_duck,
        media::media_unduck,
        system::get_system_language,
        system::open_privacy_settings,
        system::set_traffic_lights_visible,
        claude_code::claude_code_check,
        claude_code::claude_code_cleanup,
        local_whisper::local_whisper_status,
        local_whisper::local_whisper_transcribe,
        local_whisper::local_whisper_download_model,
        local_whisper::local_whisper_delete_model,
        local_whisper::local_whisper_list_models,
        local_llm::local_llm_status,
        local_llm::local_llm_cleanup,
        local_llm::local_llm_download_model,
        local_llm::local_llm_delete_model,
        local_llm::local_llm_list_models,
        tray::update_mic_submenu,
        tray::update_mode_submenu,
    ]);

    #[cfg(not(target_os = "macos"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        paste::paste_to_frontmost,
        paste::copy_to_clipboard,
        hotkey::show_pill,
        hotkey::hide_pill,
        hotkey::show_mode_overlay,
        hotkey::hide_mode_overlay,
        hotkey::set_pill_height,
        hotkey::set_pill_size,
        hotkey::set_pill_position_top_center,
        hotkey::set_pill_size_at_position,
        hotkey::ultravox_register_hotkeys,
        hotkey::unregister_all_hotkeys,
        hotkey::register_recording_escape,
        hotkey::unregister_recording_escape,
        permissions::check_accessibility_permission,
        permissions::request_accessibility_permission,
        permissions::microphone_auth_status,
        system::get_system_language,
        system::open_privacy_settings,
        system::set_traffic_lights_visible,
        claude_code::claude_code_check,
        claude_code::claude_code_cleanup,
        tray::update_mic_submenu,
        tray::update_mode_submenu,
    ]);

    #[cfg(not(target_os = "macos"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        paste::paste_to_frontmost,
        paste::copy_to_clipboard,
        hotkey::show_pill,
        hotkey::hide_pill,
        hotkey::show_mode_overlay,
        hotkey::hide_mode_overlay,
        hotkey::set_pill_height,
        hotkey::set_pill_size,
        hotkey::set_pill_position_top_center,
        hotkey::set_pill_size_at_position,
        hotkey::ultravox_register_hotkeys,
        hotkey::unregister_all_hotkeys,
        hotkey::register_recording_escape,
        hotkey::unregister_recording_escape,
        permissions::check_accessibility_permission,
        permissions::request_accessibility_permission,
        permissions::microphone_auth_status,
        system::get_system_language,
        system::open_privacy_settings,
        system::set_traffic_lights_visible,
        claude_code::claude_code_check,
        claude_code::claude_code_cleanup,
        tray::update_mic_submenu,
        tray::update_mode_submenu,
        local_llm::local_llm_status,
        local_llm::local_llm_cleanup,
        local_llm::local_llm_download_model,
        local_llm::local_llm_delete_model,
        local_llm::local_llm_list_models,
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Build a minimal app menu: Ultravox app submenu (about, copy-last, hide,
/// quit) and an Edit submenu (cut/copy/paste/select-all/undo/redo).
///
/// We deliberately drop View/File/Window/Help. This is a tray-driven app —
/// the menu bar is only visible when the Settings window is focused, and
/// power users mostly need clipboard shortcuts to work in text fields.
///
/// Custom items:
///  - "Copy Last Transcription" (⌘⇧C) — emits `menu:copy-last` which the
///    Settings window listens for. Same handler as the tray "Copy Last
///    Transcription" item; the menu is just an additional surface so power
///    users can hit Cmd+Shift+C from the keyboard while the app menu has
///    focus, instead of clicking through the tray.
fn install_minimal_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let copy_last = MenuItem::with_id(
        app,
        "app_menu_copy_last",
        "Copy Last Transcription",
        true,
        Some("CmdOrCtrl+Shift+C"),
    )?;

    let app_menu = Submenu::with_items(
        app,
        "Ultravox",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("About Ultravox"), None)?,
            &PredefinedMenuItem::separator(app)?,
            &copy_last,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let menu = Menu::with_items(app, &[&app_menu, &edit_menu])?;
    app.set_menu(menu)?;

    // Route the custom items to frontend events. Predefined items (about,
    // hide, quit, undo/redo/cut/copy/paste/select-all) are handled by the
    // OS — only the Copy Last Transcription click reaches us.
    let app_handle = app.clone();
    app.on_menu_event(move |_, event| {
        let id = event.id().as_ref();
        if id == "app_menu_copy_last" {
            let _ = app_handle.emit("menu:copy-last", ());
        }
    });
    Ok(())
}
