# Draft quality settlement contract

Scope: attended draft quality score settlement only. No publishing, scheduling, approval-lifecycle, or native evidence-validation changes.

## Wire contract

`DraftQualityScoreInput` remains the provider-facing tool input. It contains the exact draft identity/content, threshold, rewrite permission, prior feedback, five category scores, and an optional rewrite. Existing provider validation and claim-identity checks remain in place.

`ApplyDraftQualityScoreInput` is a separate native DTO containing only `qualityRunId`, `draftVariantId`, `attemptId`, `contentRevision`, `agentRunId`, `categoryScores`, optional `rewrite`, and required `summary`.

The quality loop calls `toDraftQualitySettlement` after validating the completed provider tool input and claim identities. The mapper explicitly selects native fields; it does not spread provider context into IPC. The data wrapper strictly validates the settlement DTO before invocation. Rust retains `deny_unknown_fields`, category validation, and existing durable identity/revision checks.

The summary is deterministic, not a placeholder or an additional model claim: it records the revision, rounded mean score, threshold, and each category's numeric score. Detailed feedback remains in `categoryScores`. Summaries must be nonblank and at most 1,000 characters; native validation runs before writes. The browser mock rejects extra/missing DTO fields and malformed nested score/rewrite shapes before mutating state, validates the summary, and stores it on final settlement.

No database migration is needed: the existing quality-run summary column already has the 1,000-character bound.

## Regression evidence

- `tests/fixtures/draft-quality-settlement.json` is shared by TypeScript and Rust. Playwright compares the actual mapper's JSON serialization with this fixture.
- Rust deserializes that same fixture, rejects every formerly leaked provider field and every missing required native field, and rejects the original combined malformed shape.
- A Tokio integration test uses the existing production migration harness and a temporary SQLite database, claims quality work, deserializes the frontend fixture, and calls native `apply_with_pool`. It checks persisted status, summary, score rows, and rejection of invalid summaries, stale revisions, and replay.
- Playwright checks browser mock rejection of malformed DTOs, dry-run rewrite/re-score mapping, and the existing narrow-viewport check.

## Coordination: native evidence-validation task `aa882b97`

This task remains separate and pending. It must restore native validation of completed provider evidence; this contract fix does not establish evidence authenticity. Preserve the strict settlement DTO and summary contract above. Extend the native integration fixture to include whatever completed agent/tool evidence the new validation requires; do not weaken those checks to keep this test green. Provider-only content remains in the durable claim/tool evidence, not in the native settlement DTO.

The integration test reaches the native transaction function, not a running desktop WebView/IPC transport. Full desktop IPC was not exercised.
