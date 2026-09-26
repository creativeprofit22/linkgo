use serde::{Deserialize, Serialize};

/// What a publishing execution creates on LinkedIn.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecutionKind {
    Post,
    Comment,
}

impl ExecutionKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Post => "post",
            Self::Comment => "comment",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "post" => Some(Self::Post),
            "comment" => Some(Self::Comment),
            _ => None,
        }
    }
}

/// Who started the execution. Both go through the same service.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecutionCaller {
    Manual,
    Scheduler,
}

impl ExecutionCaller {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Scheduler => "scheduler",
        }
    }
}

/// Classified result of one LinkedIn create call.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TransportOutcome {
    /// LinkedIn created the entity and returned its identity.
    Created {
        platform_id: String,
        urn: String,
        url: String,
    },
    /// LinkedIn definitely did not create the entity.
    Rejected {
        status_code: Option<u16>,
        message: String,
    },
    /// LinkedIn may or may not have created the entity.
    Ambiguous {
        status_code: Option<u16>,
        message: String,
    },
}

impl TransportOutcome {
    pub fn remote_outcome(&self) -> &'static str {
        match self {
            Self::Created { .. } => "created",
            Self::Rejected { .. } => "rejected",
            Self::Ambiguous { .. } => "ambiguous",
        }
    }
}

/// Typed result returned to manual callers and the scheduler.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ExecutionOutcome {
    /// Published and every local record settled.
    #[serde(rename_all = "camelCase")]
    Succeeded {
        execution_id: i64,
        platform_id: String,
        external_url: String,
    },
    /// LinkedIn definitely did not create the entity; local state restored.
    #[serde(rename_all = "camelCase")]
    Failed { execution_id: i64, message: String },
    /// LinkedIn may have created the entity. Never retried automatically;
    /// an operator must check LinkedIn and reconcile.
    #[serde(rename_all = "camelCase")]
    OutcomeUnknown { execution_id: i64, message: String },
    /// Refused before any LinkedIn call (kill switch, readiness, limits,
    /// another open execution, missing credentials).
    #[serde(rename_all = "camelCase")]
    Blocked { message: String },
    /// This owner was fenced out by recovery; its evidence was kept on the
    /// execution row but it did not settle local state.
    #[serde(rename_all = "camelCase")]
    StaleOwner { execution_id: i64, message: String },
}

/// Reserved execution identity the owner must present on every write.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExecutionLease {
    pub execution_id: i64,
    pub owner_token: String,
    pub fence: i64,
}

/// Open execution projection for the operator reconciliation UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenPublishExecution {
    pub id: i64,
    pub kind: String,
    pub subject_id: i64,
    pub campaign_id: i64,
    pub campaign_name: String,
    pub schedule_job_id: Option<i64>,
    pub caller: String,
    pub status: String,
    pub fence: i64,
    pub remote_outcome: String,
    pub remote_status_code: Option<i64>,
    pub error_message: String,
    pub reserved_at: String,
    pub sent_at: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReconcileResolution {
    Posted,
    NotPosted,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileExecutionInput {
    pub execution_id: i64,
    pub fence: i64,
    pub resolution: ReconcileResolution,
    /// LinkedIn URL or URN of the entity when `resolution` is `posted`.
    pub external_url: Option<String>,
    pub note: Option<String>,
    /// Must equal `RECONCILE_CONFIRMATION` exactly.
    pub confirmation: String,
}

pub const RECONCILE_CONFIRMATION: &str = "RECONCILE";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileExecutionResult {
    pub execution_id: i64,
    pub status: String,
}

/// Counts from one recovery sweep.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySweepReport {
    pub abandoned: i64,
    pub settled_from_evidence: i64,
    pub marked_unknown: i64,
}
