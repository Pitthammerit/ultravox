#![cfg(target_os = "macos")]

use objc2::rc::autoreleasepool;
use objc2_app_kit::NSWorkspace;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct FrontmostApp {
    pub bundle_id: Option<String>,
    pub localized_name: Option<String>,
}

#[tauri::command]
pub fn get_frontmost_app() -> Result<FrontmostApp, String> {
    autoreleasepool(|_| unsafe {
        let workspace = NSWorkspace::sharedWorkspace();
        let Some(app) = workspace.frontmostApplication() else {
            return Ok(FrontmostApp {
                bundle_id: None,
                localized_name: None,
            });
        };

        let bundle_id = app.bundleIdentifier().map(|s| s.to_string());
        let localized_name = app.localizedName().map(|s| s.to_string());

        Ok(FrontmostApp {
            bundle_id,
            localized_name,
        })
    })
}
