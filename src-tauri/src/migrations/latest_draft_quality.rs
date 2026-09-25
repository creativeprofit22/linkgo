use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 36,
        description: "use_latest_current_revision_quality_for_approval",
        sql: include_str!("latest_draft_quality.sql"),
        kind: MigrationKind::Up,
    }]
}
