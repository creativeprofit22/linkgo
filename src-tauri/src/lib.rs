mod agent_continuations;
mod agent_providers;
mod agent_run_store;
mod agent_runtime;
mod approval_reads;
mod approval_review;
mod approval_scheduling;
mod approval_transaction;
mod approvals;
mod auth;
mod autopilot_planner;
mod campaign_backlog;
mod campaigns;
mod candidate_policy;
mod candidate_queue;
mod candidate_queue_store;
#[cfg(test)]
mod command_registry_tests;
mod comment_audit;
mod comment_reads;
mod comment_threads;
mod comments;
mod content_calendar;
mod db_transaction;
mod draft_ai_audits;
mod draft_generation;
mod draft_generation_links;
mod draft_quality;
mod drafts_core;
mod drafts_reads;
mod js_text;
mod js_url;
mod metric_refresh;
mod metrics;
mod metrics_reads;
mod migrations;
mod net;
mod planner_draft_audits;
mod planning_reads;
mod playbooks;
mod plugins;
mod publishing;
#[cfg(test)]
mod release_fixtures;
mod relevance_scoring;
mod row_json;
mod safety;
mod safety_dashboard;
mod scheduler;
mod scheduler_store;
mod settings;
mod source_import_reads;
mod source_imports;
#[cfg(test)]
mod test_support;
mod window_commands;
mod workflow_store;
mod workflows;

use tauri::Manager;

#[tauri::command]
fn update_tray_menu(
    app: tauri::AppHandle,
    show_text: String,
    quit_text: String,
) -> Result<(), String> {
    plugins::system_tray::update_tray_menu(&app, &show_text, &quit_text)
}

pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(plugins::system_tray::init())
        .setup(|app| {
            window_commands::create_main_window(app.handle())?;
            let pool =
                tauri::async_runtime::block_on(autopilot_planner::managed_pool(app.handle()))
                    .map_err(std::io::Error::other)?;
            let recovery_pool = pool.clone();
            app.manage(pool);
            // Recover executions left open by a crash, independent of the
            // scheduler worker. Best effort: the reconciliation list and every
            // manual publish run the same sweep again, so a failure here is
            // retried there. The sweep never contacts LinkedIn.
            tauri::async_runtime::spawn(async move {
                let _ = publishing::recovery::sweep_with_saved_settings(
                    &recovery_pool,
                    publishing::recovery::now_epoch(),
                )
                .await;
            });
            app.manage(autopilot_planner::AutopilotPlannerWorkerState::default());
            app.manage(source_imports::SourceImportActivity::default());
            app.manage(auth::refresh::OAuthRefreshLocks::default());
            app.manage(auth::ai_signin::AiSignInSessions::default());
            app.manage(auth::claude_code_version::ClaudeCodeVersionCache::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            update_tray_menu,
            window_commands::linkgo_window_open_settings,
            agent_continuations::linkgo_agent_settle_approved_continuation,
            approval_review::linkgo_approval_create,
            approval_review::linkgo_approval_set_status,
            approval_reads::linkgo_approval_list,
            approval_reads::linkgo_approval_eligible_drafts,
            approval_reads::linkgo_approval_publish_preflight,
            approval_scheduling::linkgo_approval_schedule,
            approval_scheduling::linkgo_approval_cancel_schedule,
            approvals::linkgo_approval_record_publish_attempt,
            auth::commands::linkgo_auth_status,
            auth::commands::linkgo_auth_api_key,
            auth::commands::linkgo_auth_oauth_start,
            auth::commands::linkgo_auth_oauth_cancel,
            auth::commands::linkgo_auth_oauth_code,
            auth::commands::linkgo_auth_logout,
            auth::commands::linkgo_auth_check,
            auth::commands::linkgo_linkedin_publish_post,
            auth::commands::linkgo_linkedin_publish_comment,
            publishing::recovery::linkgo_publish_execution_list_open,
            publishing::recovery::linkgo_publish_execution_reconcile,
            agent_runtime::linkgo_agent_provider_stream,
            agent_run_store::linkgo_agent_run_create,
            agent_run_store::linkgo_agent_run_start,
            agent_run_store::linkgo_agent_run_record_event,
            agent_run_store::linkgo_agent_run_persist_result,
            agent_run_store::linkgo_agent_run_fail_after_persistence_error,
            agent_run_store::linkgo_agent_run_cancel,
            campaign_backlog::linkgo_campaign_backlog_create,
            campaign_backlog::linkgo_campaign_backlog_update,
            campaign_backlog::linkgo_campaign_backlog_set_status,
            planning_reads::linkgo_campaign_backlog_dashboard,
            planning_reads::linkgo_autopilot_planner_dashboard,
            comments::linkgo_comment_record_attempt,
            comment_threads::linkgo_comment_thread_create,
            comment_reads::linkgo_comment_thread_list,
            comment_reads::linkgo_comment_eligible_candidates,
            comment_threads::linkgo_comment_thread_update,
            comment_threads::linkgo_comment_variant_update,
            comment_threads::linkgo_comment_variant_set_status,
            comment_threads::linkgo_comment_thread_set_status,
            comment_threads::linkgo_comment_assert_can_publish,
            safety::linkgo_safety_set_global_kill_switch,
            candidate_policy::linkgo_candidate_policy_update,
            candidate_policy::linkgo_candidate_policy_get,
            safety_dashboard::linkgo_safety_settings_get,
            safety_dashboard::linkgo_safety_dashboard_get,
            campaigns::linkgo_campaign_create,
            campaigns::linkgo_campaign_update,
            campaigns::linkgo_campaign_status_set,
            campaigns::linkgo_campaign_list,
            content_calendar::linkgo_content_calendar_list,
            content_calendar::linkgo_content_calendar_eligible_approvals,
            content_calendar::linkgo_content_calendar_create_slot,
            content_calendar::linkgo_content_calendar_update_slot,
            content_calendar::linkgo_content_calendar_archive_slot,
            content_calendar::linkgo_content_calendar_schedule_preflight,
            playbooks::linkgo_playbook_override_upsert,
            playbooks::linkgo_playbook_override_list,
            settings::linkgo_settings_launch_on_login_sync,
            settings::linkgo_settings_launch_on_login_error_record,
            candidate_queue::linkgo_candidate_create,
            candidate_queue::linkgo_candidate_delete,
            candidate_queue_store::linkgo_candidate_list,
            candidate_queue_store::linkgo_candidate_discovery_list,
            candidate_queue_store::linkgo_candidate_agent_run_context,
            candidate_queue_store::linkgo_candidate_update,
            candidate_queue_store::linkgo_candidate_dismiss_discovery_item,
            candidate_queue_store::linkgo_candidate_discovery_insert,
            candidate_queue::linkgo_candidate_promote_discovery_item,
            source_imports::linkgo_source_import_write_batch,
            source_imports::linkgo_source_import_recover_interrupted,
            source_import_reads::linkgo_source_import_dashboard,
            workflows::linkgo_workflow_create_run,
            workflows::linkgo_workflow_start_run,
            workflows::linkgo_workflow_resume_run,
            workflows::linkgo_workflow_set_step_status,
            workflows::linkgo_workflow_cancel_run,
            workflows::linkgo_workflow_add_note,
            workflows::linkgo_workflow_create_artifact,
            workflow_store::linkgo_workflow_run_list,
            workflow_store::linkgo_workflow_run_validation,
            workflow_store::linkgo_workflow_step_execution_create,
            workflow_store::linkgo_workflow_step_execution_update,
            workflow_store::linkgo_workflow_planner_scoring_scope,
            workflow_store::linkgo_workflow_planner_draft_audit_scope,
            workflow_store::linkgo_agent_run_list,
            workflow_store::linkgo_agent_run_validation,
            metrics::linkgo_metrics_record_post_metric,
            metrics::linkgo_metrics_create_campaign_memory,
            metrics::linkgo_metrics_set_campaign_memory_status,
            metrics_reads::linkgo_metrics_eligible_approvals,
            metrics_reads::linkgo_metrics_post_metrics_list,
            metrics_reads::linkgo_metrics_campaign_memory_list,
            metrics_reads::linkgo_metrics_learning_events_list,
            metrics_reads::linkgo_metrics_refresh_dashboard,
            safety::linkgo_safety_set_error_queue_item_status,
            drafts_core::linkgo_draft_create,
            drafts_reads::linkgo_draft_list,
            drafts_reads::linkgo_draft_generation_request_list,
            drafts_reads::linkgo_draft_workflow_options,
            drafts_reads::linkgo_draft_update,
            draft_ai_audits::linkgo_draft_ai_audit_start,
            draft_ai_audits::linkgo_draft_ai_audit_link_agent_run,
            draft_ai_audits::linkgo_draft_ai_audit_complete,
            draft_ai_audits::linkgo_draft_ai_audit_fail,
            draft_ai_audits::linkgo_draft_ai_audit_reconcile,
            draft_generation::linkgo_draft_generation_claim,
            draft_generation::linkgo_draft_generation_link_agent_run,
            draft_generation::linkgo_draft_generation_settle,
            draft_generation::linkgo_draft_generation_save,
            draft_generation::linkgo_draft_generation_dismiss,
            drafts_core::linkgo_draft_variant_update,
            drafts_core::linkgo_draft_variant_set_status,
            draft_quality::linkgo_draft_quality_claim,
            draft_quality::linkgo_draft_quality_apply_score,
            draft_quality::linkgo_draft_quality_continue,
            draft_quality::linkgo_draft_quality_fail,
            draft_quality::linkgo_draft_quality_reconcile_stale,
            draft_quality::linkgo_draft_quality_resume,
            autopilot_planner::linkgo_autopilot_planner_status,
            autopilot_planner::linkgo_autopilot_planner_start,
            autopilot_planner::linkgo_autopilot_planner_stop,
            autopilot_planner::linkgo_autopilot_planner_tick,
            relevance_scoring::linkgo_relevance_scoring_claim,
            relevance_scoring::linkgo_relevance_scoring_start,
            relevance_scoring::linkgo_relevance_scoring_apply_scores,
            relevance_scoring::linkgo_relevance_scoring_settle,
            relevance_scoring::linkgo_relevance_scoring_fail,
            relevance_scoring::linkgo_relevance_scoring_reconcile,
            relevance_scoring::linkgo_relevance_scoring_fail_agent,
            planner_draft_audits::linkgo_planner_draft_audit_claim,
            planner_draft_audits::linkgo_planner_draft_audit_complete,
            planner_draft_audits::linkgo_planner_draft_audit_fail,
            planner_draft_audits::linkgo_planner_draft_audit_reconcile_stale,
            scheduler::linkgo_scheduler_status,
            scheduler::linkgo_scheduler_start,
            scheduler::linkgo_scheduler_stop,
            scheduler::linkgo_scheduler_tick,
            scheduler_store::linkgo_scheduler_dashboard_get,
            metric_refresh::linkgo_metric_refresh_status,
            metric_refresh::linkgo_metric_refresh_start,
            metric_refresh::linkgo_metric_refresh_stop,
            metric_refresh::linkgo_metric_refresh_tick
        ]);

    #[cfg(any(target_os = "macos", windows, target_os = "linux"))]
    let builder = builder.plugin(tauri_plugin_autostart::init(
        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
        None,
    ));

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));

    builder
        .run(tauri::generate_context!())
        .expect("error while running Linkgo");
}
