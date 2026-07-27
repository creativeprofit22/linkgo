use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 22,
        description: "create_source_imports",
        sql: "CREATE TABLE IF NOT EXISTS source_import_batches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL,
            source_type TEXT NOT NULL DEFAULT 'local_json' CHECK(source_type IN ('local_json')),
            status TEXT NOT NULL DEFAULT 'processing' CHECK(status IN ('processing', 'completed', 'completed_with_errors', 'failed')),
            total_count INTEGER NOT NULL DEFAULT 0 CHECK(total_count >= 0),
            accepted_count INTEGER NOT NULL DEFAULT 0 CHECK(accepted_count >= 0),
            duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK(duplicate_count >= 0),
            rejected_count INTEGER NOT NULL DEFAULT 0 CHECK(rejected_count >= 0),
            error_message TEXT NOT NULL DEFAULT '' CHECK(length(error_message) <= 1000),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS source_import_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_import_batch_id INTEGER NOT NULL,
            row_number INTEGER NOT NULL CHECK(row_number > 0),
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'duplicate', 'rejected')),
            input_json TEXT NOT NULL CHECK(length(input_json) <= 20000),
            candidate_post_id INTEGER,
            reason TEXT NOT NULL DEFAULT '' CHECK(length(reason) <= 2000),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (source_import_batch_id) REFERENCES source_import_batches(id) ON DELETE CASCADE,
            FOREIGN KEY (candidate_post_id) REFERENCES candidate_posts(id) ON DELETE SET NULL,
            UNIQUE(source_import_batch_id, row_number)
        );
        CREATE INDEX IF NOT EXISTS idx_source_import_batches_campaign_id ON source_import_batches(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_source_import_batches_status ON source_import_batches(status);
        CREATE INDEX IF NOT EXISTS idx_source_import_batches_created_at ON source_import_batches(created_at);
        CREATE INDEX IF NOT EXISTS idx_source_import_items_batch_id ON source_import_items(source_import_batch_id);
        CREATE INDEX IF NOT EXISTS idx_source_import_items_status ON source_import_items(status);
        CREATE INDEX IF NOT EXISTS idx_source_import_items_candidate_id ON source_import_items(candidate_post_id);",
        kind: MigrationKind::Up,
    }]
}
