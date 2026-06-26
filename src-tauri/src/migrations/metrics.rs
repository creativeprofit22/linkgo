use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 5,
        description: "create_metrics_learning",
        sql: "CREATE TABLE IF NOT EXISTS post_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            approval_id INTEGER NOT NULL,
            publish_attempt_id INTEGER,
            platform TEXT NOT NULL DEFAULT 'linkedin' CHECK(platform IN ('linkedin')),
            measured_at TEXT NOT NULL,
            impressions INTEGER NOT NULL DEFAULT 0 CHECK(impressions >= 0),
            reactions INTEGER NOT NULL DEFAULT 0 CHECK(reactions >= 0),
            comments INTEGER NOT NULL DEFAULT 0 CHECK(comments >= 0),
            reposts INTEGER NOT NULL DEFAULT 0 CHECK(reposts >= 0),
            profile_visits INTEGER NOT NULL DEFAULT 0 CHECK(profile_visits >= 0),
            link_clicks INTEGER NOT NULL DEFAULT 0 CHECK(link_clicks >= 0),
            ctr REAL CHECK(ctr IS NULL OR (ctr >= 0 AND ctr <= 100)),
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
            FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE CASCADE,
            FOREIGN KEY (publish_attempt_id) REFERENCES publish_attempts(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS campaign_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            post_metric_id INTEGER,
            signal TEXT NOT NULL CHECK(signal IN ('winner', 'underperformer', 'insight', 'avoid')),
            summary TEXT NOT NULL,
            evidence TEXT NOT NULL DEFAULT '',
            confidence INTEGER NOT NULL DEFAULT 50 CHECK(confidence >= 0 AND confidence <= 100),
            status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
            FOREIGN KEY (post_metric_id) REFERENCES post_metrics(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS learning_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            post_metric_id INTEGER,
            campaign_memory_id INTEGER,
            event_type TEXT NOT NULL CHECK(event_type IN ('metric_recorded', 'memory_created', 'memory_archived', 'memory_restored')),
            summary TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
            FOREIGN KEY (post_metric_id) REFERENCES post_metrics(id) ON DELETE SET NULL,
            FOREIGN KEY (campaign_memory_id) REFERENCES campaign_memory(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_post_metrics_campaign_id ON post_metrics(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_post_metrics_approval_id ON post_metrics(approval_id);
        CREATE INDEX IF NOT EXISTS idx_post_metrics_publish_attempt_id ON post_metrics(publish_attempt_id);
        CREATE INDEX IF NOT EXISTS idx_post_metrics_measured_at ON post_metrics(measured_at);
        CREATE INDEX IF NOT EXISTS idx_campaign_memory_campaign_id ON campaign_memory(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_campaign_memory_post_metric_id ON campaign_memory(post_metric_id);
        CREATE INDEX IF NOT EXISTS idx_campaign_memory_signal ON campaign_memory(signal);
        CREATE INDEX IF NOT EXISTS idx_campaign_memory_status ON campaign_memory(status);
        CREATE INDEX IF NOT EXISTS idx_learning_events_campaign_id ON learning_events(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_learning_events_metric_id ON learning_events(post_metric_id);
        CREATE INDEX IF NOT EXISTS idx_learning_events_memory_id ON learning_events(campaign_memory_id);
        CREATE INDEX IF NOT EXISTS idx_learning_events_event_type ON learning_events(event_type);
        CREATE INDEX IF NOT EXISTS idx_learning_events_created_at ON learning_events(created_at);",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn metrics_migration_declares_expected_tables_constraints_and_indexes() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 5);
        assert_eq!(migration.description, "create_metrics_learning");
        assert!(migration.sql.contains("CREATE TABLE IF NOT EXISTS post_metrics"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS campaign_memory"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS learning_events"));
        assert!(migration.sql.contains("CHECK(platform IN ('linkedin'))"));
        assert!(migration.sql.contains("CHECK(impressions >= 0)"));
        assert!(migration.sql.contains("CHECK(reactions >= 0)"));
        assert!(migration.sql.contains("CHECK(comments >= 0)"));
        assert!(migration.sql.contains("CHECK(reposts >= 0)"));
        assert!(migration.sql.contains("CHECK(profile_visits >= 0)"));
        assert!(migration.sql.contains("CHECK(link_clicks >= 0)"));
        assert!(migration
            .sql
            .contains("CHECK(ctr IS NULL OR (ctr >= 0 AND ctr <= 100))"));
        assert!(migration.sql.contains(
            "CHECK(signal IN ('winner', 'underperformer', 'insight', 'avoid'))"
        ));
        assert!(migration
            .sql
            .contains("CHECK(status IN ('active', 'archived'))"));
        assert!(migration.sql.contains("CHECK(event_type IN ('metric_recorded', 'memory_created', 'memory_archived', 'memory_restored'))"));
        assert!(migration.sql.contains("idx_post_metrics_campaign_id"));
        assert!(migration.sql.contains("idx_post_metrics_approval_id"));
        assert!(migration
            .sql
            .contains("idx_post_metrics_publish_attempt_id"));
        assert!(migration.sql.contains("idx_post_metrics_measured_at"));
        assert!(migration.sql.contains("idx_campaign_memory_campaign_id"));
        assert!(migration
            .sql
            .contains("idx_campaign_memory_post_metric_id"));
        assert!(migration.sql.contains("idx_campaign_memory_signal"));
        assert!(migration.sql.contains("idx_campaign_memory_status"));
        assert!(migration.sql.contains("idx_learning_events_campaign_id"));
        assert!(migration.sql.contains("idx_learning_events_metric_id"));
        assert!(migration.sql.contains("idx_learning_events_memory_id"));
        assert!(migration.sql.contains("idx_learning_events_event_type"));
        assert!(migration.sql.contains("idx_learning_events_created_at"));
    }
}
