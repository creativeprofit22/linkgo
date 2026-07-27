use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 19,
        description: "create_content_calendar_slots",
        sql: "CREATE TABLE IF NOT EXISTS content_calendar_slots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            approval_id INTEGER NOT NULL,
            purpose TEXT NOT NULL CHECK(purpose IN ('reach', 'trust', 'proof', 'conversion', 'community')),
            slot_for TEXT NOT NULL,
            timezone TEXT NOT NULL DEFAULT 'local',
            format TEXT NOT NULL CHECK(format IN ('text', 'image', 'carousel', 'document', 'video', 'poll', 'event')),
            angle TEXT NOT NULL CHECK(length(trim(angle)) > 0),
            visual_direction TEXT NOT NULL CHECK(length(trim(visual_direction)) > 0),
            cta TEXT NOT NULL CHECK(length(trim(cta)) > 0),
            notes TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'archived')),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
            FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE CASCADE,
            UNIQUE(approval_id)
        );
        CREATE INDEX IF NOT EXISTS idx_content_calendar_slots_campaign_id ON content_calendar_slots(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_content_calendar_slots_approval_id ON content_calendar_slots(approval_id);
        CREATE INDEX IF NOT EXISTS idx_content_calendar_slots_slot_for ON content_calendar_slots(slot_for);
        CREATE INDEX IF NOT EXISTS idx_content_calendar_slots_purpose ON content_calendar_slots(purpose);
        CREATE INDEX IF NOT EXISTS idx_content_calendar_slots_status ON content_calendar_slots(status);",
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use super::migrations;

    #[test]
    fn content_calendar_migration_declares_slots_table_constraints_and_indexes() {
        let migration = &migrations()[0];

        assert_eq!(migration.version, 19);
        assert_eq!(migration.description, "create_content_calendar_slots");
        assert!(migration
            .sql
            .contains("CREATE TABLE IF NOT EXISTS content_calendar_slots"));
        assert!(migration.sql.contains("campaign_id INTEGER NOT NULL"));
        assert!(migration.sql.contains("approval_id INTEGER NOT NULL"));
        assert!(migration
            .sql
            .contains("CHECK(purpose IN ('reach', 'trust', 'proof', 'conversion', 'community'))"));
        assert!(migration.sql.contains("slot_for TEXT NOT NULL"));
        assert!(migration
            .sql
            .contains("timezone TEXT NOT NULL DEFAULT 'local'"));
        assert!(migration.sql.contains(
            "CHECK(format IN ('text', 'image', 'carousel', 'document', 'video', 'poll', 'event'))"
        ));
        assert!(migration
            .sql
            .contains("angle TEXT NOT NULL CHECK(length(trim(angle)) > 0)"));
        assert!(migration
            .sql
            .contains("visual_direction TEXT NOT NULL CHECK(length(trim(visual_direction)) > 0)"));
        assert!(migration
            .sql
            .contains("cta TEXT NOT NULL CHECK(length(trim(cta)) > 0)"));
        assert!(migration.sql.contains("notes TEXT NOT NULL DEFAULT ''"));
        assert!(migration.sql.contains(
            "status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'archived'))"
        ));
        assert!(migration
            .sql
            .contains("FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE"));
        assert!(migration
            .sql
            .contains("FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE CASCADE"));
        assert!(migration.sql.contains("UNIQUE(approval_id)"));
        assert!(migration
            .sql
            .contains("idx_content_calendar_slots_campaign_id"));
        assert!(migration
            .sql
            .contains("idx_content_calendar_slots_approval_id"));
        assert!(migration
            .sql
            .contains("idx_content_calendar_slots_slot_for"));
        assert!(migration.sql.contains("idx_content_calendar_slots_purpose"));
        assert!(migration.sql.contains("idx_content_calendar_slots_status"));
    }
}
