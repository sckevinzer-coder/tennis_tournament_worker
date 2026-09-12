-- 0003: add notes column to registration_requests (schema drift fix)
-- The Drizzle schema has `notes` text column but the original migration omitted it.
-- Without this, POST /registration-requests fails with DrizzleQueryError (no such column: notes).
ALTER TABLE registration_requests ADD COLUMN notes TEXT;