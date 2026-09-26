//! Guards against drift between the native commands the renderer invokes and
//! the commands registered in `tauri::generate_handler!` in `lib.rs`.
//!
//! The renderer calls commands through `invoke`, `invokeCommand`, and
//! feature-local wrappers or exported constants, so every `"linkgo_*"` string
//! literal in non-test renderer sources is treated as a command name.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

/// Mock-only commands handled by the Playwright Tauri mocks. They must never
/// be registered natively.
const TEST_ONLY_COMMANDS: [&str; 1] = ["linkgo_test_record_auditor_output"];

const COMMAND_PREFIX: &str = "linkgo_";

/// Commands removed for security reasons. They must never be registered or
/// invoked by the renderer again (e.g. provider secrets stay native).
const FORBIDDEN_COMMANDS: [&str; 1] = ["linkgo_auth_provider_secret"];

fn registered_commands() -> BTreeSet<String> {
    let lib = include_str!("lib.rs");
    let marker = "tauri::generate_handler![";
    let start = lib.find(marker).expect("generate_handler! list in lib.rs") + marker.len();
    let end = start
        + lib[start..]
            .find(']')
            .expect("closing bracket of generate_handler! list");
    lib[start..end]
        .split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .filter_map(|entry| entry.rsplit("::").next())
        .filter(|name| name.starts_with(COMMAND_PREFIX))
        .map(str::to_owned)
        .collect()
}

fn is_command_char(byte: u8) -> bool {
    byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_'
}

/// Collects every `"linkgo_[a-z0-9_]+"` double-quoted string literal.
fn command_literals(source: &str, into: &mut BTreeSet<String>) {
    let bytes = source.as_bytes();
    let needle = format!("\"{COMMAND_PREFIX}");
    let mut offset = 0;
    while let Some(found) = source[offset..].find(&needle) {
        let name_start = offset + found + 1;
        let mut cursor = name_start + COMMAND_PREFIX.len();
        while cursor < bytes.len() && is_command_char(bytes[cursor]) {
            cursor += 1;
        }
        if cursor > name_start + COMMAND_PREFIX.len()
            && cursor < bytes.len()
            && bytes[cursor] == b'"'
        {
            into.insert(source[name_start..cursor].to_owned());
        }
        offset = name_start;
    }
}

fn renderer_sources(dir: &Path, into: &mut Vec<PathBuf>) {
    let entries =
        fs::read_dir(dir).unwrap_or_else(|error| panic!("read {}: {error}", dir.display()));
    for entry in entries {
        let path = entry.expect("renderer directory entry").path();
        if path.is_dir() {
            renderer_sources(&path, into);
            continue;
        }
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        let is_source = name.ends_with(".ts") || name.ends_with(".tsx");
        let is_test = name.ends_with(".test.ts") || name.ends_with(".test.tsx");
        if is_source && !is_test {
            into.push(path);
        }
    }
}

fn renderer_commands() -> BTreeSet<String> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../src");
    let mut files = Vec::new();
    renderer_sources(&root, &mut files);
    files.sort();
    let mut commands = BTreeSet::new();
    for file in files {
        let source = fs::read_to_string(&file)
            .unwrap_or_else(|error| panic!("read {}: {error}", file.display()));
        command_literals(&source, &mut commands);
    }
    for mock in TEST_ONLY_COMMANDS {
        commands.remove(mock);
    }
    commands
}

#[test]
fn scanner_collects_invoke_and_invoke_command_literals() {
    let mut found = BTreeSet::new();
    command_literals(
        r#"invoke<Row>("linkgo_a_b"); invokeCommand<T>("linkgo_c2", x);
        invokeCommand("linkgo_d"); const X = "linkgo_e"; `linkgo_skip` "linkgo_" "linkgo_Up""#,
        &mut found,
    );
    let expected: BTreeSet<String> = ["linkgo_a_b", "linkgo_c2", "linkgo_d", "linkgo_e"]
        .into_iter()
        .map(str::to_owned)
        .collect();
    assert_eq!(found, expected);
}

#[test]
fn every_renderer_command_is_registered() {
    let registered = registered_commands();
    let renderer = renderer_commands();
    assert!(
        registered.len() > 20,
        "generate_handler! scan found only {} commands",
        registered.len()
    );
    assert!(
        renderer.len() > 20,
        "renderer scan found only {} commands: {renderer:?}",
        renderer.len()
    );
    let missing: Vec<&String> = renderer.difference(&registered).collect();
    assert!(
        missing.is_empty(),
        "renderer invokes commands missing from generate_handler!: {missing:?}"
    );
}

#[test]
fn forbidden_secret_commands_are_not_registered_or_invoked() {
    let registered = registered_commands();
    let renderer = renderer_commands();
    for forbidden in FORBIDDEN_COMMANDS {
        assert!(
            !registered.contains(forbidden),
            "{forbidden} exposes credentials to the renderer and must not be registered"
        );
        assert!(
            !renderer.contains(forbidden),
            "{forbidden} must not be invoked by the renderer"
        );
    }
}

/// Commands the settings window may call. Everything else is main-only.
const SETTINGS_COMMANDS: [&str; 2] = [
    "linkgo_settings_launch_on_login_sync",
    "linkgo_settings_launch_on_login_error_record",
];

/// Registered commands that no window may call (native-only helpers).
const UNGRANTED_COMMANDS: [&str; 1] = ["update_tray_menu"];

/// Permissions that must never be granted to a renderer window.
const FORBIDDEN_PERMISSION_PREFIXES: [&str; 5] = [
    "sql:",
    "core:default",
    "core:webview:allow-create-webview-window",
    "core:event:allow-emit",
    "core:event:default",
];
const FORBIDDEN_PERMISSIONS: [&str; 4] = [
    "global-shortcut:default",
    "global-shortcut:allow-register-all",
    "global-shortcut:allow-unregister-all",
    "global-shortcut:allow-is-registered",
];

fn manifest_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

/// All registered command names, including non-`linkgo_` ones, exactly as
/// `build.rs` feeds them to the app ACL manifest.
fn build_manifest_commands() -> BTreeSet<String> {
    let lib = include_str!("lib.rs");
    let marker = "tauri::generate_handler![";
    let start = lib.find(marker).expect("generate_handler! list") + marker.len();
    let end = start + lib[start..].find(']').expect("closing bracket");
    lib[start..end]
        .split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .filter_map(|entry| entry.rsplit("::").next())
        .map(str::to_owned)
        .collect()
}

fn allow_identifier(command: &str) -> String {
    format!("allow-{}", command.replace('_', "-"))
}

fn command_from_allow(identifier: &str) -> Option<String> {
    identifier
        .strip_prefix("allow-")
        .map(|slug| slug.replace('-', "_"))
}

/// Parses `permissions = [ "allow-…", … ]` of a single-set permission file.
fn permission_set(file: &str) -> BTreeSet<String> {
    let path = manifest_dir().join("permissions").join(file);
    let source = fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("read {}: {error}", path.display()));
    let start = source.find("permissions = [").expect("permissions list") + 15;
    let end = start + source[start..].find(']').expect("closing bracket");
    source[start..end]
        .split(',')
        .map(|entry| entry.trim().trim_matches('"'))
        .filter(|entry| !entry.is_empty())
        .map(str::to_owned)
        .collect()
}

fn capability(file: &str) -> serde_json::Value {
    let path = manifest_dir().join("capabilities").join(file);
    let source = fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("read {}: {error}", path.display()));
    serde_json::from_str(&source).expect("capability JSON")
}

fn capability_permissions(capability: &serde_json::Value) -> Vec<String> {
    capability["permissions"]
        .as_array()
        .expect("permissions array")
        .iter()
        .map(|permission| {
            permission
                .as_str()
                .or_else(|| permission["identifier"].as_str())
                .expect("permission identifier")
                .to_owned()
        })
        .collect()
}

fn granted_commands(set_file: &str) -> BTreeSet<String> {
    permission_set(set_file)
        .iter()
        .map(|identifier| {
            command_from_allow(identifier)
                .unwrap_or_else(|| panic!("{set_file}: {identifier} is not an allow- permission"))
        })
        .collect()
}

#[test]
fn capability_files_are_exactly_main_and_settings() {
    let mut files: Vec<String> = fs::read_dir(manifest_dir().join("capabilities"))
        .expect("capabilities dir")
        .map(|entry| {
            entry
                .expect("entry")
                .file_name()
                .to_string_lossy()
                .into_owned()
        })
        .collect();
    files.sort();
    assert_eq!(files, ["main.json", "settings.json"]);
    assert_eq!(
        capability("main.json")["windows"],
        serde_json::json!(["main"])
    );
    assert_eq!(
        capability("settings.json")["windows"],
        serde_json::json!(["settings"])
    );
}

#[test]
fn every_callable_command_is_granted_and_nothing_else() {
    let manifest = build_manifest_commands();
    let main = granted_commands("main-commands.toml");
    let settings = granted_commands("settings-commands.toml");

    for command in main.iter().chain(settings.iter()) {
        assert!(
            manifest.contains(command),
            "{command} is granted but not registered in generate_handler!"
        );
    }
    let granted: BTreeSet<String> = main.union(&settings).cloned().collect();
    let expected: BTreeSet<String> = manifest
        .iter()
        .filter(|command| !UNGRANTED_COMMANDS.contains(&command.as_str()))
        .cloned()
        .collect();
    let missing: Vec<&String> = expected.difference(&granted).collect();
    assert!(
        missing.is_empty(),
        "registered commands not granted to any window (add to permissions/*.toml): {missing:?}"
    );
    for command in UNGRANTED_COMMANDS {
        assert!(
            !granted.contains(command),
            "{command} must stay native-only"
        );
    }
}

#[test]
fn settings_window_grants_exactly_its_allowlist() {
    let settings = granted_commands("settings-commands.toml");
    let expected: BTreeSet<String> = SETTINGS_COMMANDS.iter().map(|c| c.to_string()).collect();
    assert_eq!(settings, expected);

    let main = granted_commands("main-commands.toml");
    for command in SETTINGS_COMMANDS {
        assert!(!main.contains(command), "{command} is settings-only");
    }
    // Sensitive commands stay main-only: the settings window cannot publish,
    // save credentials or drive providers even if its renderer is compromised.
    for sensitive in [
        "linkgo_linkedin_publish_post",
        "linkgo_linkedin_publish_comment",
        "linkgo_auth_api_key",
        "linkgo_agent_provider_stream",
        "linkgo_window_open_settings",
    ] {
        assert!(main.contains(sensitive), "main window needs {sensitive}");
        assert!(
            !settings.contains(sensitive),
            "settings must not get {sensitive}"
        );
    }

    let permissions = capability_permissions(&capability("settings.json"));
    assert!(permissions.contains(&"settings-commands".to_string()));
    assert!(!permissions.contains(&"main-commands".to_string()));
    assert!(
        permissions
            .iter()
            .all(|permission| !permission.starts_with("global-shortcut:")),
        "settings window must not register global shortcuts"
    );
    let main_permissions = capability_permissions(&capability("main.json"));
    assert!(main_permissions.contains(&"main-commands".to_string()));
    assert!(
        main_permissions
            .iter()
            .all(|permission| !permission.starts_with("autostart:")),
        "main window must not toggle autostart"
    );
}

#[test]
fn capabilities_exclude_forbidden_permissions() {
    for file in ["main.json", "settings.json"] {
        for permission in capability_permissions(&capability(file)) {
            for prefix in FORBIDDEN_PERMISSION_PREFIXES {
                assert!(
                    !permission.starts_with(prefix),
                    "{file} grants forbidden permission {permission}"
                );
            }
            assert!(
                !FORBIDDEN_PERMISSIONS.contains(&permission.as_str()),
                "{file} grants forbidden permission {permission}"
            );
            for forbidden in FORBIDDEN_COMMANDS {
                assert_ne!(permission, allow_identifier(forbidden));
            }
        }
    }
}

#[test]
fn test_only_mock_commands_are_never_registered() {
    let registered = registered_commands();
    for mock in TEST_ONLY_COMMANDS {
        assert!(
            !registered.contains(mock),
            "{mock} is a test-only mock command and must not be registered"
        );
    }
}
