import type { PipelineGate } from './run-pipeline';

/**
 * Cổng lượt của job `pipeline` (PIPE-ORCHESTRATOR lát C, Q-POR3): chạy SAU lọc quy tắc/che PII/chuẩn hóa và TRƯỚC mọi lời gọi LLM.
 * Thứ tự: (1) dừng khẩn cấp (đang dừng → chặn, KHÔNG giành quyền, KHÔNG trừ lượt); (2) `begin` = MỘT giao dịch ngắn do nơi gọi hiện thực
 * (worker): giành quyền xử lý bình luận + ghi khóa duy nhất theo `comment_id` + trừ lượt cùng giao dịch (idempotent), commit TRƯỚC khi
 * gọi LLM. Hàm này chỉ ghép thứ tự và quy lỗi về kết quả chặn; logic trừ lượt nằm ở DB (khóa UNIQUE) nên đúng cả khi job chạy đồng thời
 * hoặc crash giữa chừng. Lỗi bất kỳ → chặn `gate_error` (đóng khi lỗi, không "mở khi lỗi"); nơi gọi quyết định ném để pg-boss thử lại.
 */
export type TurnBegin =
  /** Được chạy tiếp. `charged` = lần này vừa trừ lượt (false = đã trừ từ lần chạy trước, KHÔNG trừ thêm). */
  | { outcome: 'proceed'; charged: boolean }
  /** Có job khác ĐANG xử lý bình luận này: bỏ qua (không tăng lần thử, không gọi LLM trùng, không trừ lượt). */
  | { outcome: 'busy' }
  /** Hết hạn mức (100%): KHÔNG trừ, KHÔNG gọi LLM. */
  | { outcome: 'quota_exhausted' }
  /** Quá số lần thử: bình luận đã sang `needs_human`, không kẹt `processing`. */
  | { outcome: 'attempts_exhausted' }
  /** Bình luận không còn ở trạng thái xử lý được (đã có người/lượt khác xử lý xong, đã xóa, của Page). */
  | { outcome: 'not_claimable' };

export type TurnPorts = {
  /** Workspace đang dừng khẩn cấp? (`workspaces.emergency_stopped_at`). Ném → chặn `gate_error`. */
  emergencyStopped(): Promise<boolean>;
  /** Giành quyền + khóa + trừ lượt trong MỘT giao dịch đã commit khi trả về. Ném → chặn `gate_error`. */
  begin(): Promise<TurnBegin>;
};

/** Lý do chặn do cổng lượt trả (nơi ghi bản nháp dùng để ghi `reason` "Cần nhân viên"). */
export type TurnBlockReason =
  | 'emergency_stop'
  | 'quota_exhausted'
  | 'attempts_exhausted'
  | 'already_handled'
  | 'busy'
  | 'gate_error';

export function createTurnGate(ports: TurnPorts): PipelineGate {
  return async () => {
    try {
      if (await ports.emergencyStopped()) return { allow: false, reason: 'emergency_stop' };
      const turn = await ports.begin();
      switch (turn.outcome) {
        case 'proceed':
          return { allow: true };
        case 'quota_exhausted':
          return { allow: false, reason: 'quota_exhausted' };
        case 'attempts_exhausted':
          return { allow: false, reason: 'attempts_exhausted' };
        case 'not_claimable':
          return { allow: false, reason: 'already_handled' };
        case 'busy':
          return { allow: false, reason: 'busy' };
      }
    } catch {
      return { allow: false, reason: 'gate_error' };
    }
  };
}
