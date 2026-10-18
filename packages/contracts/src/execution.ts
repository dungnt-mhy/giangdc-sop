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
  note: string | null;
  /** D-14: tiêu đề lượt (tên gọi). */
  title: string | null;
  /** D-14: ngày thực hiện (YYYY-MM-DD). */
  executionDate: string | null;
  /** D-14: giờ thực hiện (HH:MM). */
  executionTime: string | null;
  /** D-14: ca làm việc. */
  shift: ExecutionShift | null;
  createdBy: string;
  createdByName: string | null;
  /** D-14: người thực hiện chính. */
  mainPerformerId: string | null;
  mainPerformerName: string | null;
  /** D-14: người giám sát. */
  supervisorId: string | null;
  supervisorName: string | null;
  createdAt: string;
  updatedAt: string;
  steps: ExecutionStepDto[];
}

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
