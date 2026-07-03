use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 13,
        description: "add_comment_publishing_metadata",
        sql: "ALTER TABLE target_posts ADD COLUMN platform_resource_urn TEXT NOT NULL DEFAULT '';
        ALTER TABLE comment_attempts ADD COLUMN idempotency_key TEXT NOT NULL DEFAULT '';
        CREATE INDEX IF NOT EXISTS idx_target_posts_platform_resource_urn ON target_posts(platform_resource_urn);
        CREATE INDEX IF NOT EXISTS idx_comment_attempts_idempotency_key ON comment_attempts(idempotency_key);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_comment_attempts_unique_idempotency_key
            ON comment_attempts(idempotency_key)
            WHERE idempotency_key <> '';",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn comment_publishing_migration_declares_metadata_columns_and_indexes() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 13);
        assert_eq!(migration.description, "add_comment_publishing_metadata");
        assert!(migration
            .sql
            .contains("ALTER TABLE target_posts ADD COLUMN platform_resource_urn"));
        assert!(migration
            .sql
            .contains("ALTER TABLE comment_attempts ADD COLUMN idempotency_key"));
        assert!(migration
            .sql
            .contains("idx_target_posts_platform_resource_urn"));
        assert!(migration
            .sql
            .contains("idx_comment_attempts_idempotency_key"));
        assert!(migration
            .sql
            .contains("idx_comment_attempts_unique_idempotency_key"));
        assert!(migration.sql.contains("WHERE idempotency_key <> ''"));
    }
}
