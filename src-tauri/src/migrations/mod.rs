pub mod campaigns;
pub mod candidate_queue;
pub mod drafts;

use tauri_plugin_sql::Migration;

pub fn get_migrations() -> Vec<Migration> {
    let mut migrations = campaigns::migrations();
    migrations.extend(candidate_queue::migrations());
    migrations.extend(drafts::migrations());
    migrations
}
