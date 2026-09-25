//! Shared pinned-connection transaction settlement for native capability commands.
//!
//! Every mutation runs on one pooled connection inside `BEGIN IMMEDIATE`.
//! Accepted and rejected outcomes both commit so that durable rejection audits
//! survive; `Err` rolls back every write. A failed `COMMIT` is rolled back and
//! reported as the caller's storage error.

use sqlx::{SqliteConnection, SqlitePool};

pub(crate) enum Settlement<T> {
    Accepted(T),
    Rejected(String),
}

pub(crate) async fn settle<T>(
    pool: &SqlitePool,
    storage_error: &str,
    operation: impl for<'a> FnOnce(
        &'a mut SqliteConnection,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<Settlement<T>, String>> + Send + 'a>,
    >,
) -> Result<T, String> {
    let mut connection = pool
        .acquire()
        .await
        .map_err(|_| storage_error.to_string())?;
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *connection)
        .await
        .map_err(|_| storage_error.to_string())?;
    match operation(&mut connection).await {
        Ok(outcome) => {
            if sqlx::query("COMMIT")
                .execute(&mut *connection)
                .await
                .is_err()
            {
                let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
                return Err(storage_error.to_string());
            }
            match outcome {
                Settlement::Accepted(value) => Ok(value),
                Settlement::Rejected(error) => Err(error),
            }
        }
        Err(error) => {
            let _ = sqlx::query("ROLLBACK").execute(&mut *connection).await;
            Err(error)
        }
    }
}
