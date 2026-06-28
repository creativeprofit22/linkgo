pub mod agent_runtime;
pub mod approvals;
pub mod campaigns;
pub mod candidate_queue;
pub mod comments;
pub mod drafts;
pub mod integrations;
pub mod metrics;
pub mod provider_parity;
pub mod safety;
pub mod workflows;

use tauri_plugin_sql::Migration;

pub fn get_migrations() -> Vec<Migration> {
    let mut migrations = campaigns::migrations();
    migrations.extend(candidate_queue::migrations());
    migrations.extend(drafts::migrations());
    migrations.extend(approvals::migrations());
    migrations.extend(metrics::migrations());
    migrations.extend(workflows::migrations());
    migrations.extend(agent_runtime::migrations());
    migrations.extend(safety::migrations());
    migrations.extend(comments::migrations());
    migrations.extend(integrations::migrations());
    migrations.extend(provider_parity::migrations());
    migrations
}
