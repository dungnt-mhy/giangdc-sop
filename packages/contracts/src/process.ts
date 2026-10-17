/**
 * Wire contract cho Process Catalog + Authoring & Governance (T2).
 * Nguồn duy nhất cho DTO dùng chung giữa API và web (AGENTS.md §2, §5).
 * SRS v1.6: PRC-001..009, GOV-001..007.
 */

export type ProcessVersionState =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'SCHEDULED'
  | 'ACTIVE'
  | 'SUPERSEDED'
  | 'RETIRED';

export type ChangeSize = 'MINOR' | 'MAJOR';
export type CompletionKind = 'FIELD' | 'FORM' | 'PHOTO' | 'FILE' | 'CONFIRM' | 'SCAN' | 'NOTE';
export type FailurePolicy = 'STOP' | 'RETRY' | 'ESCALATE' | 'CANCEL';
export type ExceptionSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKING';
export type ApprovalDecision = 'APPROVED' | 'REJECTED';

export interface CompletionRequirementDto {
  kind: CompletionKind;
  label: string;
  required: boolean;
}

export interface SkipPolicyDto {
  allowed: boolean;
  allowedRoles: string[];
  reasonRequired: boolean;
  approvalLevel: ExceptionSeverity | null;
}

export interface ProcessDto {
  id: string;
  code: string;
  name: string;
  purpose: string | null;
  scope: string | null;
  applicableTo: string | null;
  startCondition: string | null;
  endCondition: string | null;
  ownerId: string | null;
  orgUnitId: string | null;
  reviewTrigger: string | null;
  processGroup: string;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  /** Tên hiển thị của người tạo (JOIN users qua created_by). */
  createdByName: string | null;
}

export interface ProcessVersionDto {
  id: string;
  processId: string;
  versionNo: number;
  state: ProcessVersionState;
  changeSummary: string | null;
  changeSize: ChangeSize | null;
  impactAssessment: string | null;
  effectiveFrom: string | null;
  createdBy: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessStepDto {
  id: string;
  versionId: string;
  code: string;
  title: string;
  prerequisites: string | null;
  inputs: string | null;
  instructions: string | null;
  expectedResult: string | null;
  outputs: string | null;
  notes: string | null;
  /** Chức vụ thực hiện bước — nhiều chọn (D-09: chức vụ, không phải vai trò hệ thống). */
  performerPositions: PositionDto[];
  /** Chức vụ giám sát bước — nhiều chọn (D-09). */
  supervisorPositions: PositionDto[];
  required: boolean;
  targetDurationMin: number | null;
  warnings: string | null;
  sortOrder: number;
  completion: CompletionRequirementDto[];
  skip: SkipPolicyDto;
  failurePolicy: FailurePolicy;
}

/**
 * Chức vụ (D-09): khái niệm riêng với vai trò hệ thống.
 * Vai trò hệ thống (7 role) chỉ dùng phân quyền; chức vụ (thủ kho, thủ quỹ...)
 * gắn vào từng bước của quy trình và gán cho người dùng qua user_positions.
 */
export interface PositionDto {
  id: string;
  code: string;
  name: string;
}

export interface CreatePositionBody {
  code: string;
  name: string;
}

export interface ReviewCommentDto {
  id: string;
  versionId: string;
  stepId: string | null;
  stepCode: string | null;
  authorId: string;
  authorName: string;
  body: string;
  resolvedAt: string | null;
  createdAt: string;
}

export interface ApprovalRecordDto {
  id: string;
  versionId: string;
  approverId: string;
  approverName: string;
  approverRole: string;
  decision: 'APPROVED' | 'REJECTED' | 'RETURNED';
  reason: string | null;
  selfApproved: boolean;
  flagged: boolean;
  createdAt: string;
}

export interface ValidationIssueDto {
  stepCode: string | null;
  field: string;
  code: string;
  message: string;
}

/* ---------- Request bodies ---------- */

export interface CreateProcessBody {
  code: string;
  name: string;
  purpose?: string;
  scope?: string;
  applicableTo?: string;
  startCondition?: string;
  endCondition?: string;
  ownerId?: string;
  orgUnitId?: string;
  reviewTrigger?: string;
  processGroup?: string;
}

export interface UpdateProcessBody {
  name?: string;
  purpose?: string | null;
  scope?: string | null;
  applicableTo?: string | null;
  startCondition?: string | null;
  endCondition?: string | null;
  ownerId?: string | null;
  orgUnitId?: string | null;
  reviewTrigger?: string | null;
  processGroup?: string;
}

export interface UpdateVersionBody {
  changeSummary?: string;
  changeSize?: ChangeSize;
  impactAssessment?: string | null;
  expectedRevision: number;
}

export interface UpsertStepBody {
  code: string;
  title: string;
  prerequisites?: string | null;
  inputs?: string | null;
  instructions?: string | null;
  expectedResult?: string | null;
  outputs?: string | null;
  notes?: string | null;
  /** Chức vụ thực hiện bước — nhiều chọn, id tham chiếu bảng positions (D-09). */
  performerPositionIds?: string[];
  /** Chức vụ giám sát bước — nhiều chọn, id tham chiếu bảng positions (D-09). */
  supervisorPositionIds?: string[];
  required?: boolean;
  targetDurationMin?: number | null;
  warnings?: string | null;
  completion?: CompletionRequirementDto[];
  skip?: SkipPolicyDto;
  failurePolicy?: FailurePolicy;
}

export interface ReorderStepsBody {
  order: string[];
}

export interface SubmitVersionBody {
  changeSummary: string;
  changeSize: ChangeSize;
  impactAssessment?: string | null;
  expectedRevision: number;
}

export interface CommentBody {
  stepId?: string | null;
  body: string;
}

export interface ReturnVersionBody {
  reason: string;
  expectedRevision: number;
}

export interface ApproveVersionBody {
  decision: ApprovalDecision;
  severity?: ExceptionSeverity;
  reason?: string;
  expectedRevision: number;
}

export interface ReleaseVersionBody {
  /** ISO datetime; nếu trong tương lai -> SCHEDULED, ngược lại ACTIVE ngay. */
  effectiveFrom?: string | null;
  expectedRevision: number;
}

export interface VersionDetailDto extends ProcessVersionDto {
  steps: ProcessStepDto[];
}
