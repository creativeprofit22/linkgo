use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 8,
        description: "create_safety_observability",
        sql: "CREATE TABLE IF NOT EXISTS safety_settings (
            id INTEGER PRIMARY KEY CHECK(id = 1),
            global_kill_switch INTEGER NOT NULL DEFAULT 0 CHECK(global_kill_switch IN (0, 1)),
            kill_switch_reason TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT OR IGNORE INTO safety_settings (id) VALUES (1);
        CREATE TABLE IF NOT EXISTS safety_audit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER,
            subject_type TEXT NOT NULL CHECK(subject_type IN ('campaign', 'approval', 'schedule_job', 'publish_attempt', 'agent_run', 'workflow_run', 'error_queue_item', 'safety_settings')),
            subject_id INTEGER,
            event_type TEXT NOT NULL CHECK(event_type IN ('kill_switch_enabled', 'kill_switch_disabled', 'schedule_allowed', 'schedule_blocked', 'schedule_cancelled', 'publish_succeeded', 'publish_failed', 'approval_rejected', 'agent_run_started', 'agent_run_failed', 'error_item_created', 'error_item_updated')),
            severity TEXT NOT NULL DEFAULT 'info' CHECK(severity IN ('info', 'warning', 'block')),
            summary TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS rate_limit_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            action TEXT NOT NULL CHECK(action IN ('schedule_post', 'publish_post', 'comment', 'agent_run')),
            window_key TEXT NOT NULL,
            limit_value INTEGER NOT NULL CHECK(limit_value >= 0),
            current_count INTEGER NOT NULL CHECK(current_count >= 0),
            decision TEXT NOT NULL CHECK(decision IN ('allowed', 'blocked')),
            summary TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS error_queue_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER,
            source_type TEXT NOT NULL CHECK(source_type IN ('approval', 'publish_attempt', 'schedule_job', 'agent_run', 'workflow_run', 'manual')),
            source_id INTEGER,
            title TEXT NOT NULL,
            detail TEXT NOT NULL DEFAULT '',
            severity TEXT NOT NULL DEFAULT 'error' CHECK(severity IN ('warning', 'error', 'critical')),
            status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'awaiting_review', 'resolved', 'failed')),
            resolution_notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_safety_audit_events_campaign_id ON safety_audit_events(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_safety_audit_events_subject ON safety_audit_events(subject_type, subject_id);
        CREATE INDEX IF NOT EXISTS idx_safety_audit_events_event_type ON safety_audit_events(event_type);
        CREATE INDEX IF NOT EXISTS idx_safety_audit_events_severity ON safety_audit_events(severity);
        CREATE INDEX IF NOT EXISTS idx_safety_audit_events_created_at ON safety_audit_events(created_at);
        CREATE INDEX IF NOT EXISTS idx_rate_limit_events_campaign_id ON rate_limit_events(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_rate_limit_events_action ON rate_limit_events(action);
        CREATE INDEX IF NOT EXISTS idx_rate_limit_events_window_key ON rate_limit_events(window_key);
        CREATE INDEX IF NOT EXISTS idx_rate_limit_events_decision ON rate_limit_events(decision);
        CREATE INDEX IF NOT EXISTS idx_rate_limit_events_created_at ON rate_limit_events(created_at);
        CREATE INDEX IF NOT EXISTS idx_error_queue_items_campaign_id ON error_queue_items(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_error_queue_items_source ON error_queue_items(source_type, source_id);
        CREATE INDEX IF NOT EXISTS idx_error_queue_items_status ON error_queue_items(status);
        CREATE INDEX IF NOT EXISTS idx_error_queue_items_severity ON error_queue_items(severity);
        CREATE INDEX IF NOT EXISTS idx_error_queue_items_updated_at ON error_queue_items(updated_at);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_error_queue_items_active_source ON error_queue_items(source_type, source_id) WHERE source_id IS NOT NULL AND status IN ('open', 'in_progress', 'awaiting_review');",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn safety_migration_declares_expected_tables_constraints_and_indexes() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 8);
        assert_eq!(migration.description, "create_safety_observability");
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS safety_settings"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS safety_audit_events"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS rate_limit_events"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS error_queue_items"));
        assert!(migration.sql.contains("CHECK(id = 1)"));
        assert!(migration
            .sql
            .contains("CHECK(global_kill_switch IN (0, 1))"));
        assert!(migration
            .sql
            .contains("INSERT OR IGNORE INTO safety_settings (id) VALUES (1)"));
        assert!(migration.sql.contains("CHECK(subject_type IN ('campaign', 'approval', 'schedule_job', 'publish_attempt', 'agent_run', 'workflow_run', 'error_queue_item', 'safety_settings'))"));
        assert!(migration.sql.contains("CHECK(event_type IN ('kill_switch_enabled', 'kill_switch_disabled', 'schedule_allowed', 'schedule_blocked', 'schedule_cancelled', 'publish_succeeded', 'publish_failed', 'approval_rejected', 'agent_run_started', 'agent_run_failed', 'error_item_created', 'error_item_updated'))"));
        assert!(migration
            .sql
            .contains("CHECK(severity IN ('info', 'warning', 'block'))"));
        assert!(migration.sql.contains(
            "CHECK(action IN ('schedule_post', 'publish_post', 'comment', 'agent_run'))"
        ));
        assert!(migration
            .sql
            .contains("CHECK(decision IN ('allowed', 'blocked'))"));
        assert!(migration.sql.contains("CHECK(source_type IN ('approval', 'publish_attempt', 'schedule_job', 'agent_run', 'workflow_run', 'manual'))"));
        assert!(migration.sql.contains(
            "CHECK(status IN ('open', 'in_progress', 'awaiting_review', 'resolved', 'failed'))"
        ));
        assert!(migration
            .sql
            .contains("REFERENCES campaigns(id) ON DELETE SET NULL"));
        assert!(migration
            .sql
            .contains("REFERENCES campaigns(id) ON DELETE CASCADE"));
        assert!(migration
            .sql
            .contains("idx_safety_audit_events_campaign_id"));
        assert!(migration.sql.contains("idx_safety_audit_events_subject"));
        assert!(migration.sql.contains("idx_safety_audit_events_event_type"));
        assert!(migration.sql.contains("idx_safety_audit_events_severity"));
        assert!(migration.sql.contains("idx_safety_audit_events_created_at"));
        assert!(migration.sql.contains("idx_rate_limit_events_campaign_id"));
        assert!(migration.sql.contains("idx_rate_limit_events_action"));
        assert!(migration.sql.contains("idx_rate_limit_events_window_key"));
        assert!(migration.sql.contains("idx_rate_limit_events_decision"));
        assert!(migration.sql.contains("idx_rate_limit_events_created_at"));
        assert!(migration.sql.contains("idx_error_queue_items_campaign_id"));
        assert!(migration.sql.contains("idx_error_queue_items_source"));
        assert!(migration.sql.contains("idx_error_queue_items_status"));
        assert!(migration.sql.contains("idx_error_queue_items_severity"));
        assert!(migration.sql.contains("idx_error_queue_items_updated_at"));
        assert!(migration.sql.contains("idx_error_queue_items_active_source ON error_queue_items(source_type, source_id) WHERE source_id IS NOT NULL AND status IN ('open', 'in_progress', 'awaiting_review')"));
    }
}
