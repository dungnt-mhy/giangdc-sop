-- Migration 0013: D-21 — từ chối theo bước.
-- execution_reviews.step_ids: JSON array các execution_step id bị trả làm lại;
-- NULL = từ chối toàn bộ lượt (hành vi cũ, tương thích).

ALTER TABLE execution_reviews ADD COLUMN step_ids TEXT;
