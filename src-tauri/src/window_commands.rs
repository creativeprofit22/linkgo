//! Native window creation. The renderer no longer holds
//! `core:webview:allow-create-webview-window`, so it cannot open arbitrary
//! webviews or URLs; it may only ask for the fixed Settings window.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

pub const SETTINGS_WINDOW_LABEL: &str = "settings";
const SETTINGS_WINDOW_ROUTE: &str = "settings";
const MAIN_WINDOW_LABEL: &str = "main";

/// Opens (or focuses) the Settings window with a fixed label, route and size.
/// Async so window creation does not deadlock the Windows event loop.
#[tauri::command]
pub async fn linkgo_window_open_settings(app: AppHandle) -> Result<(), String> {
    if let Some(existing) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        existing.show().map_err(|error| error.to_string())?;
        existing.unminimize().map_err(|error| error.to_string())?;
        existing.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }

    let mut builder = WebviewWindowBuilder::new(
        &app,
        SETTINGS_WINDOW_LABEL,
        WebviewUrl::App(SETTINGS_WINDOW_ROUTE.into()),
    )
    .title("Settings")
    .inner_size(640.0, 520.0)
    .resizable(true)
    .maximizable(true)
    .minimizable(false)
    .decorations(false)
    .shadow(false)
    .center();
    #[cfg(not(target_os = "macos"))]
    {
        builder = builder.transparent(true);
    }
    if let Some(main) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        builder = builder.parent(&main).map_err(|error| error.to_string())?;
    }
    builder.build().map_err(|error| error.to_string())?;
    Ok(())
}
