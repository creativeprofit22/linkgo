//! Converts SQLite rows from fixed, feature-owned read queries into JSON
//! objects keyed by column name. This is an internal mapping helper only:
//! every command that uses it still owns its SQL, bounds and validation, and
//! the renderer parses each shape with a strict schema. It is not a generic
//! query surface.

use serde_json::{Map, Number, Value};
use sqlx::{sqlite::SqliteRow, Column, Row, TypeInfo, ValueRef};

/// Maps one row using each value's runtime SQLite type (NULL, INTEGER, REAL,
/// TEXT). BLOB columns are not used by these reads and map to `null`.
pub(crate) fn row_to_json(row: &SqliteRow) -> Value {
    let mut object = Map::new();
    for (index, column) in row.columns().iter().enumerate() {
        let value = match row.try_get_raw(index) {
            Ok(raw) if raw.is_null() => Value::Null,
            Ok(raw) => match raw.type_info().name() {
                "INTEGER" => row
                    .try_get::<i64, _>(index)
                    .map_or(Value::Null, |number| Value::Number(number.into())),
                "REAL" => row
                    .try_get::<f64, _>(index)
                    .ok()
                    .and_then(Number::from_f64)
                    .map_or(Value::Null, Value::Number),
                "TEXT" => row
                    .try_get::<String, _>(index)
                    .map_or(Value::Null, Value::String),
                _ => Value::Null,
            },
            Err(_) => Value::Null,
        };
        object.insert(column.name().to_string(), value);
    }
    Value::Object(object)
}

pub(crate) fn rows_to_json(rows: &[SqliteRow]) -> Vec<Value> {
    rows.iter().map(row_to_json).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::migrated;

    #[tokio::test]
    async fn maps_each_sqlite_storage_class() {
        let f = migrated().await;
        let row = sqlx::query("SELECT 7 AS i, 2.5 AS r, 'x' AS t, NULL AS n")
            .fetch_one(&f.pool)
            .await
            .unwrap();
        assert_eq!(
            row_to_json(&row),
            serde_json::json!({ "i": 7, "r": 2.5, "t": "x", "n": null })
        );
    }
}
