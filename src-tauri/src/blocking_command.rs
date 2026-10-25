//! Runs a native command's blocking body on Tauri's blocking pool.
//!
//! Tauri v2 runs synchronous `#[tauri::command]` functions on the main (UI)
//! thread, so a command that does network, keychain or database work there
//! freezes the window until it finishes. Commands are `async` instead and hand
//! their blocking body to [`run_blocking`]. `command_registry_tests` fails if a
//! synchronous command is added again.

/// Runs `work` on the blocking pool and returns its result. Blocking HTTP and
/// `tauri::async_runtime::block_on` are both allowed inside `work`.
pub async fn run_blocking<T, F>(work: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|_| "The operation stopped unexpectedly".to_string())?
}

#[cfg(test)]
mod tests {
    use super::run_blocking;

    #[test]
    fn runs_work_off_the_calling_thread_and_allows_nested_block_on() {
        let caller = std::thread::current().id();
        let (worker, value) = tauri::async_runtime::block_on(run_blocking(move || {
            let value = tauri::async_runtime::block_on(async { 41 + 1 });
            Ok((std::thread::current().id(), value))
        }))
        .expect("blocking work should finish");
        assert_ne!(worker, caller);
        assert_eq!(value, 42);
    }

    #[test]
    fn passes_errors_through() {
        let result: Result<(), String> =
            tauri::async_runtime::block_on(run_blocking(|| Err("nope".to_string())));
        assert_eq!(result, Err("nope".to_string()));
    }
}
