-- Replace only the read predicate; retain all checks, approvals and history.
-- Migration execution is transactional, so dependent guards never see a missing view.
DROP VIEW approval_ready_variants;
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
        WHERE qr.id = (SELECT latest.id FROM draft_quality_runs latest
            WHERE latest.draft_variant_id = dv.id AND latest.current_content_revision = dv.content_revision
            ORDER BY latest.id DESC LIMIT 1)
        AND qr.status = 'passed' AND qr.final_score >= 70);
