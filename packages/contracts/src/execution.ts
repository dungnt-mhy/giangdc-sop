/**
 * Wire contract cho Lượt thực hiện + Bằng chứng (T3, D-12).
 * Nguồn duy nhất cho DTO dùng chung giữa API và web (AGENTS.md §2, §5).
 * SRS v1.6: EXE-001..013, EVD-001..013 (phạm vi D-12: tạo lượt, chạy bước, chụp ảnh, phân quyền).
 */
import type {
  CompletionKind,
  CompletionRequirementDto,
  SkipPolicyDto,
} from './process.js';

export type ExecutionState =
  | 'CREATED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'CANCELLED';

export type ExecutionStepState = 'PENDING' | 'IN_PROGRESS' | 'DONE';

export interface EvidenceDto {
  id: string;
  executionId: string;
  executionStepId: string;
  kind: CompletionKind;
  /** URL tương đối để tải: GET /evidence/:id */
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedByName: string | null;
  uploadedAt: string;
}

export interface ExecutionStepDto {
  id: string;
  executionId: string;
  stepCode: string;
  title: string;
  sortOrder: number;
  state: ExecutionStepState;
  required: boolean;
  performerUserId: string | null;
  performerName: string | null;
  supervisorUserId: string | null;
  supervisorName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  /** Snapshot yêu cầu hoàn thành tại lúc tạo lượt (PRC-006). */
  completion: CompletionRequirementDto[];
  /** Snapshot chính sách bỏ qua tại lúc tạo lượt (PRC-007). */
  skip: SkipPolicyDto;
  evidence: EvidenceDto[];
}

export interface ExecutionDto {
  id: string;
  code: string;
  processId: string;
  processCode: string;
  processName: string;
  versionId: string;
  versionNo: number;
  state: ExecutionState;
  orgUnitId: string | null;
  orgUnitName: string | null;
  note: string | null;  /** D-14: tiêu đề lượt (tên gọi). */
  title: string | null;
  /** D-14: ngày thực hiện (YYYY-MM-DD). */
  executionDate: string | null;
  /** D-14: giờ thực hiện (HH:MM). */
  executionTime: string | null;
  /** D-14: ca làm việc. */
  shift: ExecutionShift | null;
  createdBy: string;
  createdByName: string | null;
  /** Chức vụ của người tạo (nối bằng ", ", null nếu chưa gán chức vụ). */
  createdByPositions: string | null;
  /** D-14: người thực hiện chính. */
  mainPerformerId: string | null;
  mainPerformerName: string | null;
  /** D-14: người giám sát. */
  supervisorId: string | null;
  supervisorName: string | null;
  /** D-15: người gửi duyệt + thời điểm. */
  approvalRequestedBy: string | null;
  approvalRequestedByName: string | null;
  approvalRequestedAt: string | null;
  /** D-15: người duyệt + thời điểm + ghi chú (lý do từ chối). */
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  /** D-18: thời điểm bấm Bắt đầu lượt (null nếu chưa bắt đầu). */
  startedAt: string | null;
  /** D-18: nhật ký duyệt — mới nhất trước. */
  reviews: ExecutionReviewDto[];
  createdAt: string;
  updatedAt: string;
  steps: ExecutionStepDto[];
}

/** D-18: hành động trong nhật ký duyệt lượt thực hiện. */
export type ExecutionReviewAction = 'submit' | 'approve' | 'reject' | 'cancel_submit';

/** D-18: một dòng nhật ký duyệt (người làm, thời gian, lý do). */
export interface ExecutionReviewDto {
  id: string;
  action: ExecutionReviewAction;
  actorId: string;
  actorName: string | null;
  reason: string | null;
  createdAt: string;
}

/** D-18: nhãn tiếng Việt cho hành động duyệt. */
export const REVIEW_ACTION_LABEL: Record<ExecutionReviewAction, string> = {
  submit: 'Báo hoàn thành',
  approve: 'Xác nhận hoàn thành',
  reject: 'Từ chối xác nhận',
  cancel_submit: 'Hủy báo hoàn thành',
};

/** D-14: ca làm việc. */
export type ExecutionShift = 'SANG' | 'CHIEU' | 'TOI';

/* ---------- Request bodies ---------- */

export interface StepAssignmentBody {
  /** id bước trong phiên bản quy trình (process_steps.id) — snapshot khi tạo lượt. */
  stepId: string;
  /** user được gán thực hiện (D-12: phải có chức vụ khớp "Vai trò thực hiện" nếu bước có định nghĩa). */
  performerUserId: string;
  supervisorUserId?: string | null;
}

export interface CreateExecutionBody {
  /** id phiên bản quy trình — phải ở trạng thái ACTIVE. */
  processVersionId: string;
  orgUnitId?: string | null;
  note?: string | null;
  /** D-14: phân công từng bước KHÔNG bắt buộc — bước thiếu gán = "chưa phân công". */
  assignments?: StepAssignmentBody[];
  /** D-14: tiêu đề lượt. */
  title?: string | null;
  /** D-14: ngày thực hiện YYYY-MM-DD (mặc định = hôm nay phía server). */
  executionDate?: string | null;
  /** D-14: giờ thực hiện HH:MM. */
  executionTime?: string | null;
  /** D-14: ca làm việc. */
  shift?: ExecutionShift | null;
  /** D-14: người chịu trách nhiệm tạo lượt (mặc định = người gọi API). */
  createdBy?: string | null;
  /** D-14: người thực hiện chính. */
  mainPerformerId?: string | null;
  /** D-14: người giám sát. */
  supervisorId?: string | null;
}

/** D-14: body phân công bước sau khi tạo lượt. */
export interface AssignStepBody {
  /** user được gán thực hiện (phải có chức vụ khớp "Vai trò thực hiện" nếu bước có định nghĩa). */
  performerUserId: string;
  supervisorUserId?: string | null;
}

/** D-15: body từ chối duyệt (lý do bắt buộc). */
export interface RejectApprovalBody {
  reason: string;
}

/* ---------- Notifications (D-15) ---------- */

/** D-15: loại thông báo trong app. */
export type NotificationType =
  | 'execution.submitted'
  | 'execution.approved'
  | 'execution.rejected'
  | 'step.assigned';

/** D-15: thông báo trong app (chuông + badge). */
export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  refType: string | null;
  refId: string | null;
  isRead: boolean;
  createdAt: string;
}
