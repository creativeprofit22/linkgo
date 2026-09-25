//! Native candidate intake policy: the policy mutation and the intake
//! evaluator used by source imports.
//!
//! Topics are NFKC-normalised, trimmed and single-spaced natively (the same
//! transform as the renderer `bannedTopicSchema`), so native never trusts the
//! renderer's normalisation. The evaluator is a port of the renderer
//! `evaluateCandidateIntakePolicy`; parity tests pin it to recorded Node
//! outputs.

use regex::Regex;
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqliteConnection, SqlitePool};
use tauri::State;
use unicode_normalization::UnicodeNormalization;

use crate::db_transaction::{settle, Settlement};
use crate::js_text::{js_collapse_whitespace, js_trim, utf16_len, utf16_prefix};
use crate::js_url::{is_allowed_linkedin_url, normalize_profile_url};

const STORAGE_ERROR: &str = "Could not save candidate intake policy";
pub(crate) const DEFAULT_MAX_POST_AGE_DAYS: i64 = 30;
const MIN_MAX_POST_AGE_DAYS: i64 = 1;
const MAX_MAX_POST_AGE_DAYS: i64 = 365;
const MAX_BANNED_TOPICS: usize = 25;
const MAX_BANNED_TOPIC_LENGTH: usize = 80;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateCandidateIntakePolicyInput {
    pub campaign_id: i64,
    pub max_post_age_days: i64,
    pub banned_topics: Vec<String>,
}

/// Mirrors the renderer `CandidateIntakePolicy` row shape.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct CandidateIntakePolicy {
    pub campaign_id: i64,
    pub max_post_age_days: i64,
    pub banned_topics: Vec<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

fn storage_error(_: sqlx::Error) -> String {
    STORAGE_ERROR.to_string()
}

/// `value.normalize("NFKC").trim().replace(/\s+/gu, " ")` (the stored topic).
fn canonical_topic(value: &str) -> String {
    js_collapse_whitespace(&value.nfkc().collect::<String>())
}

/// Port of the renderer `normalizeBannedTopic`.
pub(crate) fn normalize_banned_topic(value: &str) -> String {
    canonical_topic(value).to_lowercase()
}

struct ValidTopic {
    topic: String,
    normalized: String,
}

fn validate(input: &UpdateCandidateIntakePolicyInput) -> Result<Vec<ValidTopic>, String> {
    if input.campaign_id <= 0 {
        return Err("Campaign id must be a positive integer".to_string());
    }
    if input.max_post_age_days < MIN_MAX_POST_AGE_DAYS {
        return Err(format!(
            "Maximum post age must be at least {MIN_MAX_POST_AGE_DAYS} day"
        ));
    }
    if input.max_post_age_days > MAX_MAX_POST_AGE_DAYS {
        return Err(format!(
            "Maximum post age must be {MAX_MAX_POST_AGE_DAYS} days or fewer"
        ));
    }
    if input.banned_topics.len() > MAX_BANNED_TOPICS {
        return Err(format!(
            "Use no more than {MAX_BANNED_TOPICS} banned topics"
        ));
    }
    let mut topics: Vec<ValidTopic> = Vec::with_capacity(input.banned_topics.len());
    for raw in &input.banned_topics {
        let topic = canonical_topic(raw);
        let length = utf16_len(&topic);
        if length == 0 {
            return Err("Remove empty banned-topic lines".to_string());
        }
        if length > MAX_BANNED_TOPIC_LENGTH {
            return Err(format!(
                "Banned topics must be {MAX_BANNED_TOPIC_LENGTH} characters or fewer"
            ));
        }
        let normalized = topic.to_lowercase();
        if normalized.chars().count() > MAX_BANNED_TOPIC_LENGTH {
            return Err(format!(
                "Banned topics must be {MAX_BANNED_TOPIC_LENGTH} characters or fewer"
            ));
        }
        if topics
            .iter()
            .any(|existing| existing.normalized == normalized)
        {
            return Err(format!("Duplicate banned topic: {topic}"));
        }
        topics.push(ValidTopic { topic, normalized });
    }
    Ok(topics)
}

pub(crate) async fn load_policy(
    connection: &mut SqliteConnection,
    campaign_id: i64,
) -> Result<CandidateIntakePolicy, sqlx::Error> {
    let row = sqlx::query(
        "SELECT max_post_age_days, created_at, updated_at
         FROM candidate_intake_policies WHERE campaign_id = ?1 LIMIT 1",
    )
    .bind(campaign_id)
    .fetch_optional(&mut *connection)
    .await?;
    let banned_topics: Vec<String> = sqlx::query_scalar(
        "SELECT topic FROM candidate_policy_banned_topics
         WHERE campaign_id = ?1 ORDER BY id ASC",
    )
    .bind(campaign_id)
    .fetch_all(&mut *connection)
    .await?;
    Ok(CandidateIntakePolicy {
        campaign_id,
        max_post_age_days: row
            .as_ref()
            .map_or(DEFAULT_MAX_POST_AGE_DAYS, |r| r.get("max_post_age_days")),
        banned_topics,
        created_at: row.as_ref().map(|r| r.get("created_at")),
        updated_at: row.as_ref().map(|r| r.get("updated_at")),
    })
}

pub(crate) async fn update_policy(
    pool: &SqlitePool,
    input: UpdateCandidateIntakePolicyInput,
) -> Result<CandidateIntakePolicy, String> {
    let topics = validate(&input)?;
    let campaign_id = input.campaign_id;
    let max_age = input.max_post_age_days;
    settle(pool, STORAGE_ERROR, move |connection| {
        Box::pin(async move {
            let status: Option<String> =
                sqlx::query_scalar("SELECT status FROM campaigns WHERE id = ?1")
                    .bind(campaign_id)
                    .fetch_optional(&mut *connection)
                    .await
                    .map_err(storage_error)?;
            match status.as_deref() {
                None => return Err("Campaign was not found".to_string()),
                Some("archived") => return Err("Campaign is archived".to_string()),
                Some(_) => {}
            }
            sqlx::query(
                "INSERT INTO candidate_intake_policies (campaign_id, max_post_age_days, updated_at)
                 VALUES (?1, ?2, datetime('now'))
                 ON CONFLICT(campaign_id) DO UPDATE SET
                   max_post_age_days = excluded.max_post_age_days,
                   updated_at = datetime('now')",
            )
            .bind(campaign_id)
            .bind(max_age)
            .execute(&mut *connection)
            .await
            .map_err(storage_error)?;
            sqlx::query("DELETE FROM candidate_policy_banned_topics WHERE campaign_id = ?1")
                .bind(campaign_id)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
            for topic in &topics {
                sqlx::query(
                    "INSERT INTO candidate_policy_banned_topics (campaign_id, topic, normalized_topic)
                     VALUES (?1, ?2, ?3)",
                )
                .bind(campaign_id)
                .bind(&topic.topic)
                .bind(&topic.normalized)
                .execute(&mut *connection)
                .await
                .map_err(storage_error)?;
            }
            let policy = load_policy(connection, campaign_id)
                .await
                .map_err(storage_error)?;
            Ok(Settlement::Accepted(policy))
        })
    })
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GetCandidateIntakePolicyInput {
    pub campaign_id: i64,
}

/// Reads a campaign's policy (defaults when none is saved) inside one
/// deferred read transaction, so the policy row and its topic set come from
/// the same snapshot even while an update is settling.
pub(crate) async fn get_policy(
    pool: &SqlitePool,
    input: GetCandidateIntakePolicyInput,
) -> Result<CandidateIntakePolicy, String> {
    const READ_ERROR: &str = "Could not load candidate intake policy";
    if input.campaign_id <= 0 {
        return Err("Campaign id must be a positive integer".to_string());
    }
    let mut transaction = pool.begin().await.map_err(|_| READ_ERROR.to_string())?;
    let policy = load_policy(&mut transaction, input.campaign_id)
        .await
        .map_err(|_| READ_ERROR.to_string())?;
    transaction
        .commit()
        .await
        .map_err(|_| READ_ERROR.to_string())?;
    Ok(policy)
}

#[tauri::command]
pub async fn linkgo_candidate_policy_get(
    pool: State<'_, SqlitePool>,
    input: GetCandidateIntakePolicyInput,
) -> Result<CandidateIntakePolicy, String> {
    get_policy(pool.inner(), input).await
}

#[tauri::command]
pub async fn linkgo_candidate_policy_update(
    pool: State<'_, SqlitePool>,
    input: UpdateCandidateIntakePolicyInput,
) -> Result<CandidateIntakePolicy, String> {
    update_policy(pool.inner(), input).await
}

const MAX_FINDING_MESSAGE_UTF16: usize = 300;
const FUTURE_TOLERANCE_MS: i64 = 5 * 60 * 1000;
const DAY_MS: i64 = 24 * 60 * 60 * 1000;
/// JS `\s` (ECMAScript WhiteSpace + LineTerminator) as a regex class.
const JS_SPACE_CLASS: &str = r"[\t\n\x0B\x0C\r \xA0\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PolicyRule {
    Source,
    Age,
    BannedTopic,
    AlreadyContacted,
}

impl PolicyRule {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Source => "source",
            Self::Age => "age",
            Self::BannedTopic => "banned_topic",
            Self::AlreadyContacted => "already_contacted",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PolicyFinding {
    pub rule: PolicyRule,
    pub message: String,
}

/// Candidate fields the evaluator reads (port of `CandidatePolicySubject`).
pub(crate) struct PolicySubject<'a> {
    pub campaign_id: i64,
    pub url: &'a str,
    pub normalized_url: &'a str,
    pub author_profile_url: &'a str,
    pub platform_resource_urn: &'a str,
    pub posted_at: Option<&'a str>,
    pub content: &'a str,
    pub source_keyword: &'a str,
}

fn finding(rule: PolicyRule, message: &str) -> PolicyFinding {
    PolicyFinding {
        rule,
        message: utf16_prefix(message, MAX_FINDING_MESSAGE_UTF16).to_string(),
    }
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    // Howard Hinnant's algorithm; exact for the proleptic Gregorian calendar.
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn absolute_timestamp_pattern() -> &'static Regex {
    static PATTERN: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(
            r"^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\.([0-9]{1,9}))?)?(Z|([+-])([0-9]{2}):([0-9]{2}))$",
        )
        .expect("valid timestamp regex")
    })
}

/// Port of `parseAbsoluteTimestamp` followed by V8's `new Date()`: epoch
/// milliseconds, or `None` when the renderer would have rejected it. V8
/// additionally rejects offsets above 23:59 and truncates fractions to ms.
pub(crate) fn parse_absolute_timestamp_ms(value: &str) -> Option<i64> {
    let trimmed = js_trim(value);
    let captures = absolute_timestamp_pattern().captures(trimmed)?;
    let number = |index: usize| -> Option<i64> {
        captures
            .get(index)
            .map(|m| m.as_str().parse::<i64>().ok())
            .unwrap_or(Some(0))
    };
    let (year, month, day) = (number(1)?, number(2)?, number(3)?);
    let (hour, minute, second) = (number(4)?, number(5)?, number(6)?);
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return None,
    };
    if day < 1 || day > days_in_month || hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    let millis = captures.get(7).map_or(0, |fraction| {
        let digits: String = fraction
            .as_str()
            .chars()
            .chain("00".chars())
            .take(3)
            .collect();
        digits.parse::<i64>().unwrap_or(0)
    });
    let offset_ms = match captures.get(9) {
        None => 0,
        Some(sign) => {
            let (offset_hour, offset_minute) = (number(10)?, number(11)?);
            if offset_hour > 23 || offset_minute > 59 {
                return None;
            }
            let magnitude = (offset_hour * 60 + offset_minute) * 60_000;
            if sign.as_str() == "-" {
                -magnitude
            } else {
                magnitude
            }
        }
    };
    Some(
        days_from_civil(year, month, day) * DAY_MS
            + ((hour * 60 + minute) * 60 + second) * 1000
            + millis
            - offset_ms,
    )
}

fn is_word_char(c: char) -> bool {
    static WORD: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let word = WORD.get_or_init(|| Regex::new(r"^[\p{L}\p{N}]$").expect("valid word regex"));
    let mut buffer = [0u8; 4];
    word.is_match(c.encode_utf8(&mut buffer))
}

/// Port of `containsNormalizedTopic`: NFKC + lowercase both sides, match the
/// phrase (any JS whitespace run between words) bounded by non-letter,
/// non-number characters or the text edges. JS tries every start position,
/// so this does too.
pub(crate) fn contains_normalized_topic(text: &str, topic: &str) -> bool {
    let normalized_text = text.nfkc().collect::<String>().to_lowercase();
    let normalized_topic = normalize_banned_topic(topic);
    if normalized_topic.is_empty() {
        return false;
    }
    let pattern = normalized_topic
        .split(' ')
        .map(regex::escape)
        .collect::<Vec<_>>()
        .join(&format!("{JS_SPACE_CLASS}+"));
    let Ok(phrase) = Regex::new(&pattern) else {
        return false;
    };
    let mut position = 0;
    while let Some(found) = phrase.find_at(&normalized_text, position) {
        let before_ok = normalized_text[..found.start()]
            .chars()
            .next_back()
            .is_none_or(|c| !is_word_char(c));
        let after_ok = normalized_text[found.end()..]
            .chars()
            .next()
            .is_none_or(|c| !is_word_char(c));
        if before_ok && after_ok {
            return true;
        }
        let step = normalized_text[found.start()..]
            .chars()
            .next()
            .map_or(1, char::len_utf8);
        position = found.start() + step;
    }
    false
}

async fn was_already_contacted(
    connection: &mut SqliteConnection,
    subject: &PolicySubject<'_>,
) -> Result<bool, sqlx::Error> {
    let normalized_profile = normalize_profile_url(subject.author_profile_url);
    let platform_urn = js_trim(subject.platform_resource_urn);
    let contacts = sqlx::query(
        "SELECT tp.normalized_url, tp.platform_resource_urn, tp.author_profile_url
         FROM comment_attempts ca
         INNER JOIN comment_threads ct ON ct.id = ca.comment_thread_id
         INNER JOIN candidate_posts cp ON cp.id = ct.candidate_post_id
         INNER JOIN target_posts tp ON tp.id = cp.target_post_id
         WHERE ca.status = 'succeeded'
           AND (
             tp.normalized_url = ?1
             OR (?2 <> '' AND tp.platform_resource_urn = ?2)
             OR (?3 <> '' AND TRIM(tp.author_profile_url) <> '')
           )",
    )
    .bind(subject.normalized_url)
    .bind(platform_urn)
    .bind(&normalized_profile)
    .fetch_all(&mut *connection)
    .await?;
    Ok(contacts.iter().any(|contact| {
        contact.get::<String, _>("normalized_url") == subject.normalized_url
            || (!platform_urn.is_empty()
                && contact.get::<String, _>("platform_resource_urn") == platform_urn)
            || (!normalized_profile.is_empty()
                && normalize_profile_url(&contact.get::<String, _>("author_profile_url"))
                    == normalized_profile)
    }))
}

/// Port of `evaluateCandidateIntakePolicy`. Findings keep the renderer's
/// order (source, age, banned topic, already contacted); the first is the
/// primary rule. `now_ms` is injected so tests are deterministic.
pub(crate) async fn evaluate_intake_policy(
    connection: &mut SqliteConnection,
    subject: &PolicySubject<'_>,
    now_ms: i64,
) -> Result<Vec<PolicyFinding>, sqlx::Error> {
    let policy = load_policy(connection, subject.campaign_id).await?;
    let mut findings = Vec::new();

    if !is_allowed_linkedin_url(subject.url) {
        findings.push(finding(
            PolicyRule::Source,
            "Source must be an HTTPS linkedin.com URL or LinkedIn subdomain.",
        ));
    }

    match subject.posted_at.and_then(parse_absolute_timestamp_ms) {
        None => findings.push(finding(
            PolicyRule::Age,
            "Post timestamp must be an absolute ISO-8601 value with a timezone.",
        )),
        Some(posted_ms) => {
            let age_ms = now_ms - posted_ms;
            if age_ms < -FUTURE_TOLERANCE_MS {
                findings.push(finding(
                    PolicyRule::Age,
                    "Post timestamp is materially in the future.",
                ));
            } else if age_ms > policy.max_post_age_days * DAY_MS {
                findings.push(finding(
                    PolicyRule::Age,
                    &format!(
                        "Post is older than the {}-day campaign limit.",
                        policy.max_post_age_days
                    ),
                ));
            }
        }
    }

    let searchable = format!("{}\n{}", subject.content, subject.source_keyword);
    let matched: Vec<&str> = policy
        .banned_topics
        .iter()
        .filter(|topic| contains_normalized_topic(&searchable, topic))
        .map(String::as_str)
        .collect();
    if !matched.is_empty() {
        findings.push(finding(
            PolicyRule::BannedTopic,
            &format!("Post matches banned topic: {}.", matched.join(", ")),
        ));
    }

    if was_already_contacted(connection, subject).await? {
        findings.push(finding(
            PolicyRule::AlreadyContacted,
            "A successful Linkgo comment already contacted this target or author profile.",
        ));
    }
    Ok(findings)
}

#[cfg(test)]
#[path = "candidate_policy_tests.rs"]
mod tests;
