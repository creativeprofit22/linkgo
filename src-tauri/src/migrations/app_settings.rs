use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 17,
        description: "create_app_settings",
        sql: "CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            launch_on_login_enabled INTEGER NOT NULL DEFAULT 0 CHECK(launch_on_login_enabled IN (0, 1)),
            launch_on_login_last_synced_at TEXT,
            launch_on_login_last_error TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT OR IGNORE INTO app_settings (id) VALUES (1);",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn app_settings_migration_declares_singleton_launch_on_login_settings() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 17);
        assert_eq!(migration.description, "create_app_settings");
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS app_settings"));
        assert!(migration
            .sql
            .contains("id INTEGER PRIMARY KEY CHECK(id = 1)"));
        assert!(migration.sql.contains(
            "launch_on_login_enabled INTEGER NOT NULL DEFAULT 0 CHECK(launch_on_login_enabled IN (0, 1))"
        ));
        assert!(migration
            .sql
            .contains("launch_on_login_last_synced_at TEXT"));
        assert!(migration
            .sql
            .contains("launch_on_login_last_error TEXT NOT NULL DEFAULT ''"));
        assert!(migration
            .sql
            .contains("INSERT OR IGNORE INTO app_settings (id) VALUES (1)"));
    }
}
