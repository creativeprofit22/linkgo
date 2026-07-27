use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 21,
        description: "create_agent_approval_resume_checkpoints",
        sql: "CREATE TABLE IF NOT EXISTS agent_run_approval_checkpoints (
            agent_run_id INTEGER PRIMARY KEY,
            pending_tool_call_id INTEGER NOT NULL UNIQUE,
            approval_id INTEGER NOT NULL,
            phase TEXT NOT NULL CHECK(phase IN ('waiting_approval', 'continuation_ready')),
            messages_json TEXT NOT NULL CHECK(json_valid(messages_json)),
            iteration_count INTEGER NOT NULL CHECK(iteration_count >= 0 AND iteration_count <= 20),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
            FOREIGN KEY (pending_tool_call_id) REFERENCES agent_tool_calls(id) ON DELETE CASCADE,
            FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_agent_run_approval_checkpoints_approval_id
            ON agent_run_approval_checkpoints(approval_id);
        CREATE INDEX IF NOT EXISTS idx_agent_run_approval_checkpoints_phase
            ON agent_run_approval_checkpoints(phase);

        INSERT INTO agent_run_events (agent_run_id, event_type, summary)
        SELECT id, 'run_failed', 'Approval continuation checkpoint is unavailable after upgrade. Restart the agent run.'
        FROM agent_runs
        WHERE status = 'waiting_approval';

        UPDATE agent_tool_calls
        SET status = 'failed',
            error_message = 'Approval continuation checkpoint is unavailable after upgrade. Restart the agent run.',
            completed_at = datetime('now')
        WHERE status = 'waiting_approval'
          AND agent_run_id IN (
              SELECT id FROM agent_runs WHERE status = 'waiting_approval'
          );

        UPDATE workflow_step_executions
        SET status = 'failed',
            error_summary = 'Approval continuation checkpoint is unavailable after upgrade. Restart the agent run.',
            completed_at = datetime('now'),
            updated_at = datetime('now')
        WHERE agent_run_id IN (
            SELECT id FROM agent_runs
            WHERE status = 'waiting_approval'
              AND workflow_run_id IS NOT NULL
              AND workflow_step_id IS NOT NULL
        );

        INSERT INTO workflow_events (workflow_run_id, workflow_step_id, event_type, summary)
        SELECT DISTINCT ar.workflow_run_id, ar.workflow_step_id, 'step_failed', ws.title || ' failed'
        FROM agent_runs ar
        INNER JOIN workflow_steps ws ON ws.id = ar.workflow_step_id
        WHERE ar.status = 'waiting_approval'
          AND ar.workflow_run_id IS NOT NULL
          AND ar.workflow_step_id IS NOT NULL
          AND ws.status IN ('running', 'waiting_approval');

        UPDATE workflow_steps
        SET status = 'failed',
            error_message = 'Approval continuation checkpoint is unavailable after upgrade. Restart the agent run.',
            completed_at = NULL,
            updated_at = datetime('now')
        WHERE id IN (
            SELECT workflow_step_id FROM agent_runs
            WHERE status = 'waiting_approval'
              AND workflow_run_id IS NOT NULL
              AND workflow_step_id IS NOT NULL
        )
          AND status IN ('running', 'waiting_approval');

        UPDATE workflow_runs
        SET status = 'failed',
            current_step_key = COALESCE((
                SELECT ws.step_key
                FROM workflow_steps ws
                INNER JOIN agent_runs ar ON ar.workflow_step_id = ws.id
                WHERE ar.workflow_run_id = workflow_runs.id
                  AND ar.status = 'waiting_approval'
                ORDER BY ws.sort_order ASC
                LIMIT 1
            ), current_step_key),
            completed_at = NULL,
            updated_at = datetime('now')
        WHERE id IN (
            SELECT workflow_run_id FROM agent_runs
            WHERE status = 'waiting_approval'
              AND workflow_run_id IS NOT NULL
              AND workflow_step_id IS NOT NULL
        )
          AND status <> 'cancelled';

        UPDATE agent_runs
        SET status = 'failed',
            error_message = 'Approval continuation checkpoint is unavailable after upgrade. Restart the agent run.',
            completed_at = datetime('now'),
            updated_at = datetime('now')
        WHERE status = 'waiting_approval';",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    const CHECKPOINT_UNAVAILABLE_MESSAGE: &str =
        "Approval continuation checkpoint is unavailable after upgrade. Restart the agent run.";

    #[test]
    fn checkpoint_migration_declares_expected_constraints_and_indexes() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 21);
        assert_eq!(
            migration.description,
            "create_agent_approval_resume_checkpoints"
        );
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS agent_run_approval_checkpoints"));
        assert!(migration.sql.contains("agent_run_id INTEGER PRIMARY KEY"));
        assert!(migration
            .sql
            .contains("pending_tool_call_id INTEGER NOT NULL UNIQUE"));
        assert!(migration
            .sql
            .contains("CHECK(phase IN ('waiting_approval', 'continuation_ready'))"));
        assert!(migration.sql.contains("CHECK(json_valid(messages_json))"));
        assert!(migration
            .sql
            .contains("CHECK(iteration_count >= 0 AND iteration_count <= 20)"));
        assert!(migration
            .sql
            .contains("REFERENCES agent_runs(id) ON DELETE CASCADE"));
        assert!(migration
            .sql
            .contains("REFERENCES agent_tool_calls(id) ON DELETE CASCADE"));
        assert!(migration
            .sql
            .contains("REFERENCES approvals(id) ON DELETE CASCADE"));
        assert!(migration
            .sql
            .contains("idx_agent_run_approval_checkpoints_approval_id"));
        assert!(migration
            .sql
            .contains("idx_agent_run_approval_checkpoints_phase"));
    }

    #[test]
    fn checkpoint_migration_fails_legacy_waiting_runs_closed() {
        let sql = migrations()[0].sql;

        assert!(sql.contains("INSERT INTO agent_run_events"));
        assert!(sql.contains("SELECT id, 'run_failed'"));
        assert!(sql.contains("UPDATE agent_tool_calls"));
        assert!(sql.contains("UPDATE workflow_step_executions"));
        assert!(sql.contains("INSERT INTO workflow_events"));
        assert!(sql.contains("UPDATE workflow_steps"));
        assert!(sql.contains("UPDATE workflow_runs"));
        assert!(sql.contains("UPDATE agent_runs"));
        assert!(sql.contains("WHERE status = 'waiting_approval'"));
        assert!(sql.contains(CHECKPOINT_UNAVAILABLE_MESSAGE));
    }
}
