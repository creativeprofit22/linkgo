mod agent_runtime;
mod auth;
mod metric_refresh;
mod migrations;
mod plugins;
mod scheduler;

use tauri::Manager;

#[tauri::command]
fn update_tray_menu(
    app: tauri::AppHandle,
    show_text: String,
    quit_text: String,
) -> Result<(), String> {
    plugins::system_tray::update_tray_menu(&app, &show_text, &quit_text)
}

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:linkgo.db", migrations::get_migrations())
                .build(),
        )
        .plugin(plugins::system_tray::init())
        .invoke_handler(tauri::generate_handler![
            update_tray_menu,
            auth::commands::linkgo_auth_status,
            auth::commands::linkgo_auth_api_key,
            auth::commands::linkgo_auth_provider_secret,
            auth::commands::linkgo_auth_oauth_start,
            auth::commands::linkgo_auth_oauth_code,
            auth::commands::linkgo_auth_logout,
            auth::commands::linkgo_auth_check,
            auth::commands::linkgo_linkedin_publish_post,
            auth::commands::linkgo_linkedin_publish_comment,
            agent_runtime::linkgo_agent_provider_stream,
            scheduler::linkgo_scheduler_status,
            scheduler::linkgo_scheduler_start,
            scheduler::linkgo_scheduler_stop,
            scheduler::linkgo_scheduler_tick,
            metric_refresh::linkgo_metric_refresh_status,
            metric_refresh::linkgo_metric_refresh_start,
            metric_refresh::linkgo_metric_refresh_stop,
            metric_refresh::linkgo_metric_refresh_tick
        ]);

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    let builder = builder.plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        None,
    ));

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));

    builder
        .run(tauri::generate_context!())
        .expect("error while running Linkgo");
}
