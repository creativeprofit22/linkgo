use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 39,
        description: "record_lessons_used_by_draft_generation",
        sql: include_str!("draft_lessons.sql"),
        kind: MigrationKind::Up,
    }]
}

#[cfg(test)]
mod tests {
    use crate::test_support::{migrated, seed};

    const SEED: &str = "
        INSERT INTO campaigns (id,name,status) VALUES (1,'Live','active');
        INSERT INTO target_posts (id,url,normalized_url,content,content_hash) VALUES (1,'https://e.com/1','https://e.com/1','Post','h1');
        INSERT INTO candidate_posts (id,campaign_id,target_post_id) VALUES (1,1,1);";

    async fn insert(pool: &sqlx::SqlitePool, lessons: Option<&str>) -> Result<i64, sqlx::Error> {
        let sql = match lessons {
            Some(_) => "INSERT INTO draft_generation_requests (campaign_id,candidate_post_id,provider_key,variant_count,applied_lessons_json) VALUES (1,1,'dry_run',3,?1) RETURNING id",
            None => "INSERT INTO draft_generation_requests (campaign_id,candidate_post_id,provider_key,variant_count) VALUES (1,1,'dry_run',3) RETURNING id",
        };
        sqlx::query_scalar(sql).bind(lessons).fetch_one(pool).await
    }

    #[tokio::test]
    async fn applied_lessons_default_to_empty_and_reject_bad_json() {
        let f = migrated().await;
        seed(&f.pool, SEED).await;
        let id = insert(&f.pool, None).await.unwrap();
        let stored: String = sqlx::query_scalar(
            "SELECT applied_lessons_json FROM draft_generation_requests WHERE id = ?1",
        )
        .bind(id)
        .fetch_one(&f.pool)
        .await
        .unwrap();
        assert_eq!(stored, "[]");
        assert!(insert(
            &f.pool,
            Some(r#"[{"id":1,"signal":"winner","summary":"x"}]"#)
        )
        .await
        .is_ok());
        let too_long = format!("[\"{}\"]", "x".repeat(4000));
        for bad in ["not json", "{}", too_long.as_str()] {
            assert!(insert(&f.pool, Some(bad)).await.is_err(), "{bad}");
        }
    }
}
