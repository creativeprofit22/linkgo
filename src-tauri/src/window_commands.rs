//! Native window creation. The renderer does not hold
//! `core:webview:allow-create-webview-window` and has no window-opening
//! command, so it cannot open webviews or URLs. Linkgo has one window, `main`;
//! Settings is a screen inside it.
//!
//! Every window registers `deny_and_open_external` as its new-window handler,
//! so `target="_blank"` links never open in-app and only allowlisted https
//! links are handed to the default browser.

use tauri::webview::{NewWindowFeatures, NewWindowResponse};
use tauri::{Manager, Runtime, Url, WebviewWindowBuilder};

use crate::auth::external_browser;

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
