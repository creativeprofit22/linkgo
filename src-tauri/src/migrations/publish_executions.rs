use tauri_plugin_sql::{Migration, MigrationKind};

/// Durable publish/comment execution ledger plus its append-only lifecycle
/// log. Only new tables are created; existing attempt, schedule and audit
/// tables are not rebuilt and no rows are touched.
pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 37,
        description: "create_publish_executions",
        // The event_type CHECK allows 'remote_recorded', but it is reserved and
        // currently unused: the LinkedIn answer lives on the execution row
        // (remote_outcome, remote_status_code, remote_recorded_at). This note
        // stays outside the SQL string so the applied migration is unchanged.
        sql: "
        CREATE TABLE IF NOT EXISTS publish_executions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL CHECK(kind IN ('post', 'comment')),
            subject_id INTEGER NOT NULL CHECK(subject_id > 0),
            campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
            schedule_job_id INTEGER,
            caller TEXT NOT NULL CHECK(caller IN ('manual', 'scheduler')),
            status TEXT NOT NULL CHECK(status IN (
                'reserved', 'in_flight', 'succeeded', 'failed', 'outcome_unknown',
                'abandoned', 'reconciled_posted', 'reconciled_not_posted'
            )),
            owner_token TEXT NOT NULL,
            fence INTEGER NOT NULL DEFAULT 1 CHECK(fence >= 1),
            idempotency_key TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            remote_outcome TEXT NOT NULL DEFAULT ''
                CHECK(remote_outcome IN ('', 'created', 'rejected', 'ambiguous')),
            remote_status_code INTEGER,
            remote_platform_id TEXT NOT NULL DEFAULT '',
            remote_urn TEXT NOT NULL DEFAULT '',
            remote_url TEXT NOT NULL DEFAULT '',
            error_message TEXT NOT NULL DEFAULT '',
            attempt_id INTEGER,
            reserved_at TEXT NOT NULL DEFAULT (datetime('now')),
            sent_at TEXT,
            remote_recorded_at TEXT,
            settled_at TEXT,
            reconciliation_note TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_publish_executions_one_open_per_subject
            ON publish_executions(kind, subject_id)
            WHERE status IN ('reserved', 'in_flight', 'outcome_unknown');
        CREATE INDEX IF NOT EXISTS idx_publish_executions_status
            ON publish_executions(status, updated_at);
        CREATE INDEX IF NOT EXISTS idx_publish_executions_campaign
            ON publish_executions(campaign_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_publish_executions_schedule_job
            ON publish_executions(schedule_job_id);
        CREATE TABLE IF NOT EXISTS publish_execution_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            execution_id INTEGER NOT NULL REFERENCES publish_executions(id) ON DELETE CASCADE,
            event_type TEXT NOT NULL CHECK(event_type IN (
                'reserved', 'sent', 'remote_recorded', 'settled', 'outcome_unknown',
                'abandoned', 'recovered', 'stale_owner', 'reconciled'
            )),
            fence INTEGER NOT NULL,
            summary TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_publish_execution_events_execution
            ON publish_execution_events(execution_id, id);",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;
    use crate::test_support::{migrated, seed};

    #[test]
    fn migration_is_version_37_and_only_creates_new_table() {
        let migration = migrations().into_iter().next().unwrap();
        assert_eq!(migration.version, 37);
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS publish_executions"));
        assert!(!migration.sql.contains("DROP "));
        assert!(!migration.sql.contains("ALTER TABLE"));
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS publish_execution_events"));
    }

    #[tokio::test]
    async fn partial_unique_index_allows_one_open_execution_per_subject() {
        let fixture = migrated().await;
        seed(
            &fixture.pool,
            "INSERT INTO campaigns (id, name) VALUES (1, 'c');
             INSERT INTO publish_executions (kind, subject_id, campaign_id, caller, status, owner_token, idempotency_key, content_hash)
             VALUES ('post', 7, 1, 'manual', 'failed', 'a', 'k', 'h'),
                    ('post', 7, 1, 'manual', 'in_flight', 'b', 'k', 'h'),
                    ('comment', 7, 1, 'manual', 'reserved', 'c', 'k', 'h');",
        )
        .await;
        let duplicate = sqlx::query(
            "INSERT INTO publish_executions (kind, subject_id, campaign_id, caller, status, owner_token, idempotency_key, content_hash)
             VALUES ('post', 7, 1, 'scheduler', 'reserved', 'd', 'k', 'h')",
        )
        .execute(&fixture.pool)
        .await;
        assert!(
            duplicate.is_err(),
            "second open post execution must be rejected"
        );

        let bad_status = sqlx::query(
            "INSERT INTO publish_executions (kind, subject_id, campaign_id, caller, status, owner_token, idempotency_key, content_hash)
             VALUES ('post', 8, 1, 'manual', 'retrying', 'e', 'k', 'h')",
        )
        .execute(&fixture.pool)
        .await;
        assert!(bad_status.is_err(), "unknown status must fail the CHECK");
    }
}
