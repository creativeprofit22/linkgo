//! Declares an app ACL manifest so every app command is checked against the
//! window's capabilities. Without it, Tauri lets any local window invoke every
//! registered app command.
//!
//! The command list is derived from `tauri::generate_handler!` in `src/lib.rs`
//! so it cannot drift; which window may call which command is decided by the
//! permission sets in `permissions/*.toml` and `capabilities/*.json`.

use std::fs;

fn registered_commands(lib_source: &str) -> Vec<String> {
    let marker = "tauri::generate_handler![";
    let start = lib_source
        .find(marker)
        .expect("generate_handler! list in src/lib.rs")
        + marker.len();
    let end = start
        + lib_source[start..]
            .find(']')
            .expect("closing bracket of generate_handler! list");
    let mut commands: Vec<String> = lib_source[start..end]
        .split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .filter_map(|entry| entry.rsplit("::").next())
        .map(str::to_owned)
        .collect();
    commands.sort();
    commands.dedup();
    commands
}

fn main() {
    println!("cargo:rerun-if-changed=src/lib.rs");
    println!("cargo:rerun-if-changed=permissions");
    let lib_source = fs::read_to_string("src/lib.rs").expect("read src/lib.rs");
    let commands: Vec<&'static str> = registered_commands(&lib_source)
        .into_iter()
        .map(|command| &*Box::leak(command.into_boxed_str()))
        .collect();
    assert!(
        commands.len() > 20,
        "generate_handler! scan found only {} commands",
        commands.len()
    );
    let commands: &'static [&'static str] = Box::leak(commands.into_boxed_slice());

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(commands)),
    )
    .expect("failed to run tauri-build");
}
