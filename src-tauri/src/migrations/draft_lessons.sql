-- Records which saved lessons (campaign_memory rows) a draft generation used.
-- Existing requests used none, so they default to an empty list.
ALTER TABLE draft_generation_requests ADD COLUMN applied_lessons_json TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(applied_lessons_json) AND json_type(applied_lessons_json) = 'array'
        AND length(applied_lessons_json) <= 4000);
