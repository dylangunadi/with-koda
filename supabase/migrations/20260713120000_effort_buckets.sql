-- Effort calibration: broad predicted buckets on generation, actual buckets
-- collected at completion. Both nullable so existing rows stay valid; the
-- free-text `effort` column remains for display copy.
--
-- Buckets: 'quick' (under 15 minutes) | 'focused' (15-45 minutes) |
--          'project' (multiple sessions)

alter table recruiting_moves
  add column if not exists effort_bucket text,
  add column if not exists actual_effort_bucket text;
