//! Native window creation. The renderer no longer holds
//! `core:webview:allow-create-webview-window`, so it cannot open arbitrary
//! webviews or URLs; it may only ask for the fixed Settings window.
//!
//! Every window registers `deny_and_open_external` as its new-window handler,
//! so `target="_blank"` links never open in-app and only allowlisted https
//! links are handed to the default browser.

use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::{AppHandle, Manager, Runtime, Url, WebviewUrl, WebviewWindowBuilder};

use crate::auth::external_browser;

pub const SETTINGS_WINDOW_LABEL: &str = "settings";
const SETTINGS_WINDOW_ROUTE: &str = "settings";
const MAIN_WINDOW_LABEL: &str = "main";

/// New-window handler: never lets the WebView open a window; opens the URL in
/// the default browser only when it passes the external-link allowlist.
fn deny_and_open_external<R: Runtime>(
    url: Url,
    _features: NewWindowFeatures,
) -> NewWindowResponse<R> {
    // Refused or failed opens are intentionally silent: the link simply does
    // nothing, matching the previous behavior for non-allowlisted URLs.
    let _ = external_browser::open_external_url(url.as_str());
    NewWindowResponse::Deny
}

/// Builds the main window from its `tauri.conf.json` entry (marked
/// `create: false`) so it gets the external-link handler.
pub fn create_main_window<R: Runtime, M: Manager<R>>(manager: &M) -> tauri::Result<()> {
    let config = manager
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_WINDOW_LABEL)
        .cloned()
        .ok_or_else(|| tauri::Error::WindowNotFound)?;
    WebviewWindowBuilder::from_config(manager, &config)?
        .on_new_window(deny_and_open_external)
        .build()?;
    Ok(())
}

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
    .center()
    .on_new_window(deny_and_open_external);
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
