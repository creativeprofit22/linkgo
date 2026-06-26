pub mod approvals;
pub mod campaigns;
pub mod candidate_queue;
pub mod drafts;
pub mod metrics;
pub mod workflows;

use tauri_plugin_sql::Migration;

pub fn get_migrations() -> Vec<Migration> {
    let mut migrations = campaigns::migrations();
    migrations.extend(candidate_queue::migrations());
    migrations.extend(drafts::migrations());
    migrations.extend(approvals::migrations());
    migrations.extend(metrics::migrations());
    migrations.extend(workflows::migrations());
    migrations
}
