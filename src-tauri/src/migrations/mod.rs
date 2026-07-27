pub mod agent_approval_resume;
pub mod agent_runtime;
pub mod app_settings;
pub mod approvals;
pub mod campaigns;
pub mod candidate_discovery;
pub mod candidate_queue;
pub mod comment_publishing;
pub mod comments;
pub mod content_calendar;
pub mod draft_generation;
pub mod drafts;
pub mod integrations;
pub mod metric_refresh;
pub mod metrics;
pub mod playbooks;
pub mod provider_parity;
pub mod safety;
pub mod scheduler;
pub mod workflow_artifacts;
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
    migrations.extend(scheduler::migrations());
    migrations.extend(comment_publishing::migrations());
    migrations.extend(metric_refresh::migrations());
    migrations.extend(playbooks::migrations());
    migrations.extend(candidate_discovery::migrations());
    migrations.extend(app_settings::migrations());
    migrations.extend(draft_generation::migrations());
    migrations.extend(content_calendar::migrations());
    migrations.extend(workflow_artifacts::migrations());
    migrations.extend(agent_approval_resume::migrations());
    migrations
}
