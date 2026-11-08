/**
 * Lõi cờ rủi ro MỘT LƯỢT dùng chung (ô Thử AI hôm nay, worker xử lý bình luận thật sau này): gom các luật `DA-RULES-*`
 * thành đúng cái `decideAction` cần (`risks`), để hai nơi không tự chép luật. Hàm thuần, 0 chi phí, không gọi LLM.
 *  - pháp lý/uy tín (FR-160): khách hỏi nhóm nào mà các nguồn không nhắc → `legalUnsourced`;
 *  - chèn lệnh (docs/09 §3.4, `scanInjection`): nghi → `injectionSuspected` (chuyển người);
 *  - mạo danh (FR-155): CHỈ kiểm khi nơi gọi cấp danh tính (tên người viết + tên Page); cấp mà hỏng → nghi (kiểu đóng);
 *  - giá lệch caption (FR-150) và tồn cũ (FR-151) cần dữ liệu bài/sản phẩm nên do nơi gọi tính bằng `price-rules`/`stock-rules`
 *    rồi truyền vào; không truyền = tắt.
 * `text` là bình luận ĐÃ che PII (nguyên tắc #6).
 */
import { type InjectionReason, scanInjection } from '../injection/injection-scan';
import type { DecideActionInput } from './decide-action';
import { evaluateImpersonation, type ImpersonationReason } from './impersonation-rules';
import { evaluateLegalRules, type LegalSource, type LegalTopic } from './legal-rules';

export type TurnRiskInput = {
  /** Bình luận đã che PII. */
  text: string;
  /** Các đoạn nguồn đủ điểm liên quan (để biết nhóm pháp lý nào đã có nguồn). */
  sources: readonly LegalSource[];
  /** Danh tính để kiểm mạo danh; thiếu = không kiểm (ô Thử AI không có Page). */
  impersonation?: { authorName: string; pageNames: readonly string[]; authorIsPage?: boolean };
  priceConflict?: boolean;
  stockStale?: boolean;
};

export type TurnRisks = {
  risks: DecideActionInput['risks'];
  /** Lý do thấy được, để hiển thị cho nhân viên/Owner và để chẩn đoán. */
  reasons: {
    legal: LegalTopic[];
    injection: InjectionReason[];
    impersonation: ImpersonationReason[];
  };
};

export function evaluateTurnRisks(input: TurnRiskInput): TurnRisks {
  const legal = evaluateLegalRules({ customerText: input.text, sources: [...input.sources] });
  const injection = scanInjection(input.text, { source: 'customer' });
  const impersonation = input.impersonation
    ? evaluateImpersonation({
        text: input.text,
        authorName: input.impersonation.authorName,
        pageNames: [...input.impersonation.pageNames],
        ...(input.impersonation.authorIsPage === undefined
          ? {}
          : { authorIsPage: input.impersonation.authorIsPage }),
      })
    : null;
  return {
    risks: {
      priceConflict: input.priceConflict === true,
      legalUnsourced: legal.legalUnsourced,
      impersonation: impersonation?.suspected ?? false,
      stockStale: input.stockStale === true,
      injectionSuspected: injection.suspected,
    },
    reasons: {
      legal: legal.unsourced,
      injection: injection.reasons,
      impersonation: impersonation?.reasons ?? [],
    },
  };
}
