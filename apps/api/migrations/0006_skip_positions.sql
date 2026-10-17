-- Migration 0006: PRC-007 "vai trò được bỏ qua" chuyển sang chức vụ (D-10, theo ý kiến chủ sản phẩm).
-- Đổi khóa allowedRoles -> allowedPositions trong skip_json, giữ nguyên giá trị (id chức vụ).
-- Các dòng đã có allowedPositions thì giữ nguyên.

UPDATE process_steps
SET skip_json = json_set(
  json_remove(skip_json, '$.allowedRoles'),
  '$.allowedPositions',
  COALESCE(json_extract(skip_json, '$.allowedRoles'), json('[]'))
)
WHERE json_extract(skip_json, '$.allowedRoles') IS NOT NULL
  AND json_extract(skip_json, '$.allowedPositions') IS NULL;
