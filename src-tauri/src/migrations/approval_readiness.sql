-- Expand only: retain content, evidence, notes, timestamps and linked history.
-- Historical revision bindings are deliberately unknown, never guessed.
ALTER TABLE approvals ADD COLUMN reviewed_content_revision INTEGER
    CHECK(reviewed_content_revision IS NULL OR reviewed_content_revision >= 1);
ALTER TABLE draft_audits ADD COLUMN content_revision INTEGER
    CHECK(content_revision IS NULL OR content_revision >= 1);

UPDATE approvals SET status = 'changes_requested'
WHERE status IN ('needs_review', 'approved', 'scheduled');
UPDATE schedule_jobs SET status = 'cancelled', updated_at = datetime('now')
WHERE status = 'scheduled' AND approval_id IN (
    SELECT id FROM approvals WHERE reviewed_content_revision IS NULL
);

CREATE TRIGGER draft_audits_bind_revision
AFTER INSERT ON draft_audits
WHEN NEW.content_revision IS NULL
BEGIN
    UPDATE draft_audits SET content_revision = (
        SELECT content_revision FROM draft_variants WHERE id = NEW.draft_variant_id
    ) WHERE id = NEW.id;
END;

CREATE TRIGGER draft_variants_revision_monotonic
BEFORE UPDATE OF content_revision ON draft_variants
WHEN NEW.content_revision < OLD.content_revision
BEGIN
    SELECT RAISE(ABORT, 'Draft content revision cannot move backwards');
END;

-- This single predicate is shared by creation, transition guards and the UI.
-- Deterministic findings must be complete and bound to the current revision;
-- an old pass, a missing audit, or a rewrite marker is not evidence.
CREATE VIEW approval_ready_variants AS
SELECT dv.id AS draft_variant_id, dv.draft_id, d.campaign_id, dv.content_revision
FROM draft_variants dv
JOIN drafts d ON d.id = dv.draft_id
JOIN campaigns c ON c.id = d.campaign_id
WHERE c.status <> 'archived'
    AND d.status IN ('ready_for_review', 'needs_revision')
    AND dv.status = 'selected'
    AND (SELECT COUNT(*) FROM draft_variants selected
        WHERE selected.draft_id = d.id AND selected.status = 'selected') = 1
    AND (SELECT COUNT(DISTINCT da.rule_key) FROM draft_audits da
        WHERE da.draft_variant_id = dv.id AND da.content_revision = dv.content_revision
        AND da.rule_key IN ('required_text', 'total_length', 'external_link', 'hashtag_limit')) = 4
    AND NOT EXISTS (SELECT 1 FROM draft_audits da
        WHERE da.draft_variant_id = dv.id AND da.content_revision = dv.content_revision
        AND da.severity = 'block')
    AND EXISTS (
        SELECT 1 FROM draft_ai_audit_runs ar
        WHERE ar.id = (SELECT latest.id FROM draft_ai_audit_runs latest
            WHERE latest.draft_variant_id = dv.id AND latest.content_revision = dv.content_revision
            ORDER BY latest.id DESC LIMIT 1)
        AND ar.status = 'completed'
        AND (SELECT COUNT(*) FROM draft_ai_audit_findings f WHERE f.audit_run_id = ar.id) = 6
        AND (SELECT COUNT(*) FROM draft_ai_audit_findings f WHERE f.audit_run_id = ar.id
            AND f.rule_key IN ('hook', 'specificity', 'generic_language', 'authenticity', 'clarity', 'safety')) = 6
        AND NOT EXISTS (SELECT 1 FROM draft_ai_audit_findings f
            WHERE f.audit_run_id = ar.id AND f.severity = 'block')
    )
    AND EXISTS (SELECT 1 FROM draft_quality_runs qr
        WHERE qr.draft_variant_id = dv.id AND qr.current_content_revision = dv.content_revision
        AND qr.status = 'passed' AND qr.final_score >= 70);

CREATE TRIGGER approvals_validate_insert
BEFORE INSERT ON approvals
WHEN NOT EXISTS (
    SELECT 1 FROM approval_ready_variants ready JOIN drafts d ON d.id = ready.draft_id
    WHERE ready.draft_variant_id = NEW.draft_variant_id
        AND ready.draft_id = NEW.draft_id AND ready.campaign_id = NEW.campaign_id
        AND d.status = 'ready_for_review'
        AND (NEW.reviewed_content_revision IS NULL OR NEW.reviewed_content_revision = ready.content_revision)
)
BEGIN
    SELECT RAISE(ABORT, 'Approval requires current revision deterministic, AI audit and quality checks');
END;

CREATE TRIGGER approvals_bind_insert
AFTER INSERT ON approvals
WHEN NEW.reviewed_content_revision IS NULL
BEGIN
    UPDATE approvals SET reviewed_content_revision = (
        SELECT content_revision FROM draft_variants WHERE id = NEW.draft_variant_id
    ) WHERE id = NEW.id;
END;

CREATE TRIGGER approvals_immutable_scope
BEFORE UPDATE OF campaign_id, draft_id, draft_variant_id ON approvals
WHEN NEW.campaign_id IS NOT OLD.campaign_id OR NEW.draft_id IS NOT OLD.draft_id
    OR NEW.draft_variant_id IS NOT OLD.draft_variant_id
BEGIN
    SELECT RAISE(ABORT, 'Approval draft and variant cannot be replaced');
END;

CREATE TRIGGER approvals_validate_transition
BEFORE UPDATE OF status, reviewed_content_revision ON approvals
WHEN NEW.status IN ('needs_review', 'approved', 'scheduled', 'published')
    AND NOT EXISTS (
        SELECT 1 FROM approval_ready_variants ready
        WHERE ready.draft_variant_id = NEW.draft_variant_id
            AND ready.draft_id = NEW.draft_id AND ready.campaign_id = NEW.campaign_id
            AND ready.content_revision = NEW.reviewed_content_revision
    )
BEGIN
    SELECT RAISE(ABORT, 'Approval is stale or not ready: run current revision deterministic, AI audit and quality checks');
END;

-- The revision increment trigger covers renderer edits and native rewrites.
-- Do not clear the old revision/timestamp: they describe historical review,
-- never approval of the newly edited content.
CREATE TRIGGER approvals_revoke_on_revision_change
AFTER UPDATE OF content_revision ON draft_variants
WHEN NEW.content_revision IS NOT OLD.content_revision
BEGIN
    UPDATE approvals SET status = 'changes_requested', updated_at = datetime('now')
    WHERE draft_variant_id = NEW.id AND status IN ('needs_review', 'approved', 'scheduled');
    UPDATE schedule_jobs SET status = 'cancelled', updated_at = datetime('now')
    WHERE status = 'scheduled' AND approval_id IN (
        SELECT id FROM approvals WHERE draft_variant_id = NEW.id AND status = 'changes_requested'
    );
END;
