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
fn test_only_mock_commands_are_never_registered() {
    let registered = registered_commands();
    for mock in TEST_ONLY_COMMANDS {
        assert!(
            !registered.contains(mock),
            "{mock} is a test-only mock command and must not be registered"
        );
    }
}
