import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { buildPolicyFactsView, type PolicyFactRowView } from '../../lib/kb-policy-view';

// Dịch giả: trả khóa + giá trị để kiểm nội dung không phụ thuộc bản dịch.
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}|${JSON.stringify(values)}` : key,
}));

import { PolicyFactsPanel } from './policy-facts-panel';

const ship = {
  kind: 'nationwide',
  label: 'Toàn quốc',
  feeMinor: 30000,
  currency: 'VND',
  daysMin: 2,
  daysMax: 4,
  cod: true,
  feeMode: 'fixed',
};
const row = (over: Partial<PolicyFactRowView>): PolicyFactRowView => ({
  id: 'r',
  kind: 'ship_region',
  slot: 'toan quoc',
  data: ship,
  status: 'approved',
  origin: 'manual',
  evidence: null,
  sourceRef: null,
  rev: 1,
  ...over,
});
const html = async (rows: PolicyFactRowView[], isOwner: boolean) =>
  renderToStaticMarkup(await PolicyFactsPanel({ view: buildPolicyFactsView(rows), isOwner }));

describe('PolicyFactsPanel', () => {
  it('chưa có dữ liệu: 4 thẻ trống, không banner AI, Owner thấy nút thêm bị khóa', async () => {
    const out = await html([], true);
    expect(out).toContain('cards.ship.title');
    expect(out).toContain('cards.payment.title');
    expect(out.match(/empty\.title/g)).toHaveLength(4);
    expect(out).not.toContain('banner.title');
    expect(out).toContain('actions.addRegion');
    expect(out).toContain('disabled');
    expect(out).toContain('roleOwner');
  });

  it('Staff: chỉ xem — không có nút thao tác, có ghi chú khóa', async () => {
    const out = await html([row({})], false);
    expect(out).toContain('roleStaff');
    expect(out).not.toContain('actions.edit');
    expect(out).not.toContain('actions.addRegion');
  });

  it('bản đã duyệt hiện phí/thời gian thật; mức phí định dạng theo tiền tệ; chip Nhập tay + Đã duyệt', async () => {
    const out = await html([row({})], true);
    expect(out).toContain('ship.fee_fixed');
    expect(out).toContain('30.000');
    expect(out).toContain('ship.days_range');
    expect(out).toContain('chips.approved');
    expect(out).toContain('chips.manual');
  });

  it('nháp do máy đề xuất: banner đếm đúng, khối trích dẫn nguyên văn, giá trị hiện duyệt, chip nguồn', async () => {
    const out = await html(
      [
        row({
          id: 'd',
          kind: 'returns',
          slot: 'returns',
          data: { days: 7, conditions: ['còn tem mác'], needsReview: true },
          status: 'draft',
          origin: 'text_suggested',
          evidence: 'Đổi trả trong 7 ngày nếu còn tem mác',
        }),
      ],
      true,
    );
    expect(out).toContain('banner.title|{&quot;count&quot;:1}');
    expect(out).toContain('evidence.title');
    expect(out).toContain('Đổi trả trong 7 ngày nếu còn tem mác');
    expect(out).toContain('current.none');
    expect(out).toContain('chips.text_suggested');
    expect(out).toContain('chips.needsReview');
    expect(out).toContain('confirm');
    expect(out).toContain('returns.daysValue');
  });

  it('nháp Owner đã sửa tay: chip "Đã sửa tay"; bảo hành/thanh toán hiển thị đúng giá trị', async () => {
    const out = await html(
      [
        row({
          id: 'e',
          kind: 'warranty',
          slot: 'warranty',
          data: { months: 3, scope: 'đường may' },
          status: 'draft',
          origin: 'manual',
          evidence: 'Bảo hành 3 tháng',
        }),
        row({
          id: 'p',
          kind: 'payment',
          slot: 'payment',
          data: { methods: ['cod', 'bank_transfer'] },
        }),
      ],
      true,
    );
    expect(out).toContain('chips.editedByOwner');
    expect(out).toContain('warranty.monthsValue');
    expect(out).toContain('payment.cod');
    expect(out).toContain('payment.bank_transfer');
  });

  it('mốc cập nhật theo giờ Việt Nam khi có; thiếu hoặc sai thì không hiện', async () => {
    const ok = await html([row({ updatedAt: '2026-11-09 13:12:14.0018+00' })], true);
    expect(ok).toContain('updatedAt|{&quot;time&quot;:&quot;');
    expect(ok).toContain('20:12:14');
    expect(await html([row({ updatedAt: 'khong-phai-ngay' })], true)).not.toContain('updatedAt|');
    expect(await html([row({})], true)).not.toContain('updatedAt|');
  });

  it('các chế độ phí/thời gian khác: miễn phí, miễn phí từ ngưỡng, tính khi thanh toán, chưa nêu', async () => {
    const mk = (id: string, label: string, over: object) =>
      row({ id, slot: label, data: { ...ship, label, ...over } });
    const out = await html(
      [
        mk('1', 'a', { feeMode: 'free' }),
        mk('2', 'b', { feeMode: 'free_over', freeOverMinor: 500000 }),
        mk('3', 'c', { feeMode: 'at_checkout', daysMode: 'at_checkout' }),
        mk('4', 'd', {
          feeMode: undefined,
          feeMinor: null,
          daysMin: null,
          daysMax: null,
          cod: null,
        }),
        mk('5', 'e', { daysMin: 1, daysMax: 1, cod: false, kind: 'city', city: 'Hà Nội' }),
        mk('6', 'f', {
          kind: 'region',
          places: ['Hà Nội', 'Hải Phòng'],
          destinations: ['VN', 'US'],
        }),
      ],
      true,
    );
    for (const key of [
      'ship.fee_free"',
      'ship.fee_free_over',
      'ship.fee_at_checkout',
      'ship.days_at_checkout',
      'ship.fee_unknown',
      'ship.days_unknown',
      'ship.cod_unknown',
      'ship.days_same',
      'ship.cod_no',
      'ship.areaCity',
      'ship.areaRegion',
      'ship.dest_VN',
    ]) {
      expect(out, key).toContain(key.replace('"', ''));
    }
    expect(out).toContain('US');
  });

  it('phí ngoại tệ định dạng theo tiền tệ (USD)', async () => {
    const out = await html([row({ data: { ...ship, currency: 'USD', feeMinor: 1000 } })], true);
    expect(out).toMatch(/10[.,]00/);
  });

  it('đổi trả "không áp dụng", bảo hành "không bảo hành", COD chung, đủ điều kiện/phí/hoàn tiền', async () => {
    const out = await html(
      [
        row({ id: 'r1', kind: 'returns', slot: 'returns', data: { days: null, none: true } }),
        row({ id: 'w1', kind: 'warranty', slot: 'warranty', data: { months: null, none: true } }),
        row({ id: 'c1', kind: 'cod', slot: 'cod', data: { value: true } }),
      ],
      true,
    );
    expect(out).toContain('returns.none');
    expect(out).toContain('warranty.none');
    expect(out).toContain('COD: ship.cod_yes');
    const full = await html(
      [
        row({
          id: 'r2',
          kind: 'returns',
          slot: 'returns',
          data: {
            days: 14,
            conditions: ['chưa giặt'],
            refundTo: 'original_payment',
            returnShippingPaidBy: 'shop',
            eligibility: 'varies_by_item',
          },
        }),
        row({
          id: 'w2',
          kind: 'warranty',
          slot: 'warranty',
          data: { months: null, none: false, scope: undefined },
        }),
      ],
      true,
    );
    expect(full).toContain('returns.refund_original_payment');
    expect(full).toContain('returns.paid_shop');
    expect(full).toContain('returns.elig_varies_by_item');
    expect(full).toContain('chưa giặt');
  });

  describe('có Server Action (Owner)', () => {
    const actions = {
      approve: async () => {},
      discard: async () => {},
      remove: async () => {},
      analyze: async () => {},
    };
    const draftRow = (needs: boolean) =>
      row({
        id: 'd1',
        rev: 5,
        kind: 'returns',
        slot: 'returns',
        data: needs ? { days: 7, needsReview: true } : { days: 7 },
        status: 'draft',
        origin: 'text_suggested',
        evidence: 'Đổi trả 7 ngày',
      });
    const withActions = async (
      rows: PolicyFactRowView[],
      isOwner: boolean,
      notice: 'approved' | 'stale' | null = null,
    ) =>
      renderToStaticMarkup(
        await PolicyFactsPanel({ view: buildPolicyFactsView(rows), isOwner, actions, notice }),
      );

    it('form có id + rev ẩn; nút Duyệt/Bỏ hoạt động; đề xuất cần xác nhận → ô tick bắt buộc', async () => {
      const out = await withActions([draftRow(true)], true);
      expect(out).toContain('name="id" value="d1"');
      expect(out).toContain('name="rev" value="5"');
      expect(out).toMatch(/<input type="checkbox"[^>]*name="confirm"/);
      expect(out).toMatch(/<input type="checkbox" required=""[^>]*name="confirm"/);
      expect(out).toContain('actions.approve');
      expect(out).toContain('actions.discard');
    });

    it('liên kết Sửa tay / Thêm trỏ đúng biểu mẫu (kind + id); Staff không có liên kết', async () => {
      const out = await withActions([row({ id: 'a1' }), draftRow(false)], true);
      expect(out).toContain('href="/app/kb/policies/edit?kind=ship_region&amp;id=a1"');
      expect(out).toContain('href="/app/kb/policies/edit?kind=returns&amp;id=d1"');
      expect(out).toContain('href="/app/kb/policies/edit?kind=ship_region"');
      expect(out).toContain('href="/app/kb/policies/edit?kind=payment"');
      expect(await withActions([row({ id: 'a1' })], false)).not.toContain('/app/kb/policies/edit');
    });

    it('bản đã duyệt có nút Xóa hai bước (id + rev ẩn); Staff không có; thông báo deleted là status', async () => {
      const out = await withActions([row({ id: 'a9', rev: 7 })], true);
      expect(out).toContain('actions.delete');
      expect(out).toContain('actions.deleteConfirm');
      expect(out).toContain('name="id" value="a9"');
      expect(out).toContain('name="rev" value="7"');
      const staff = await withActions([row({ id: 'a9' })], false);
      expect(staff).not.toContain('actions.deleteConfirm');
      const done = renderToStaticMarkup(
        await PolicyFactsPanel({
          view: buildPolicyFactsView([]),
          isOwner: true,
          actions,
          notice: 'deleted',
        }),
      );
      expect(done).toContain('role="status"');
      expect(done).toContain('notice.deleted');
    });

    it('khối dữ liệu thô: có văn bản → nút Phân tách tự động hoạt động; chưa có → nút khóa; Staff không có nút; thông báo analyzed kèm số', async () => {
      const render = async (
        raw: { count: number } | undefined,
        isOwner: boolean,
        notice: 'analyzed' | 'no_raw' | null = null,
      ) =>
        renderToStaticMarkup(
          await PolicyFactsPanel({
            view: buildPolicyFactsView([]),
            isOwner,
            actions,
            notice,
            noticeCount: 3,
            ...(raw ? { raw } : {}),
          }),
        );
      const some = await render({ count: 4 }, true);
      expect(some).toContain('raw.title');
      expect(some).toContain('raw.count|{&quot;count&quot;:4}');
      expect(some).toMatch(/<button type="submit"[^>]*>raw\.analyze/);
      const none = await render({ count: 0 }, true);
      expect(none).toContain('raw.empty');
      expect(none).toMatch(/<button type="button" disabled[^>]*>raw\.analyze/);
      const staff = await render({ count: 4 }, false);
      expect(staff).toContain('raw.count');
      expect(staff).not.toContain('raw.analyze');
      expect(await render(undefined, false)).not.toContain('raw.title');
      const analyzed = await render({ count: 4 }, true, 'analyzed');
      expect(analyzed).toContain('role="status"');
      expect(analyzed).toContain('notice.analyzed|{&quot;count&quot;:3}');
      expect(await render({ count: 0 }, true, 'no_raw')).toContain('role="alert"');
    });

    it('danh sách văn bản thô: Owner thấy loại, tiêu đề, đoạn đầu; Staff và danh sách rỗng thì không', async () => {
      const raw = {
        count: 2,
        items: [
          { kind: 'shipping', title: 'Chính sách vận chuyển', excerpt: 'Giao toàn quốc 2-4 ngày' },
          { kind: 'return', title: 'Chính sách đổi trả', excerpt: 'Đổi trả trong 7 ngày' },
        ],
      };
      const render = async (r: typeof raw | { count: number }, isOwner: boolean) =>
        renderToStaticMarkup(
          await PolicyFactsPanel({ view: buildPolicyFactsView([]), isOwner, actions, raw: r }),
        );
      const owner = await render(raw, true);
      expect(owner).toContain('raw.list');
      expect(owner).toContain('Chính sách vận chuyển');
      expect(owner).toContain('Giao toàn quốc 2-4 ngày');
      expect(owner).toContain('raw.kinds.shipping');
      expect(owner).toContain('raw.kinds.return');
      expect(await render(raw, false)).not.toContain('Giao toàn quốc 2-4 ngày');
      expect(await render({ count: 3 }, true)).not.toContain('raw.list');
    });

    it('thông báo analyzed_none (không có giá trị mới) là status', async () => {
      const out = renderToStaticMarkup(
        await PolicyFactsPanel({
          view: buildPolicyFactsView([]),
          isOwner: true,
          actions,
          notice: 'analyzed_none',
        }),
      );
      expect(out).toContain('role="status"');
      expect(out).toContain('notice.analyzed_none');
    });

    it('đề xuất đã rõ điều kiện → không có ô tick; Staff không có form', async () => {
      const out = await withActions([draftRow(false)], true);
      expect(out).not.toContain('name="confirm"');
      const staff = await withActions([draftRow(false)], false);
      expect(staff).not.toContain('name="rev"');
    });

    it('thông báo: thành công dùng role=status, lỗi dùng role=alert', async () => {
      expect(await withActions([], true, 'approved')).toContain('role="status"');
      expect(await withActions([], true, 'approved')).toContain('notice.approved');
      const stale = await withActions([], true, 'stale');
      expect(stale).toContain('role="alert"');
      expect(stale).toContain('notice.stale');
    });
  });

  it('câu chưa phân tách: mỗi thẻ có khối gập đúng số câu; mục "Thông tin khác" khi có câu ngoài 4 chủ đề; không có thì không hiện', async () => {
    const entry = (sentence: string) => ({ title: 'Chính sách vận chuyển', sentence });
    const leftover = {
      byCard: {
        ship: [entry('Phí giao hàng nội thành là 20.000đ.'), entry('Shop giao hàng cả cuối tuần.')],
        returns: [],
        warranty: [entry('Sản phẩm được bảo hành tại cửa hàng.')],
        payment: [],
        other: [entry('Shop mở cửa từ 8 giờ sáng.')],
      },
      total: 4,
    };
    const out = renderToStaticMarkup(
      await PolicyFactsPanel({ view: buildPolicyFactsView([]), isOwner: true, leftover }),
    );
    expect(out).toContain('leftover.title|{&quot;count&quot;:2}');
    expect(out).toContain('leftover.title|{&quot;count&quot;:1}');
    expect(out).toContain('Phí giao hàng nội thành là 20.000đ.');
    expect(out).toContain('Sản phẩm được bảo hành tại cửa hàng.');
    expect(out).toContain('leftover.otherTitle');
    expect(out).toContain('Shop mở cửa từ 8 giờ sáng.');
    const none = renderToStaticMarkup(
      await PolicyFactsPanel({
        view: buildPolicyFactsView([]),
        isOwner: true,
        leftover: {
          byCard: { ship: [], returns: [], warranty: [], payment: [], other: [] },
          total: 0,
        },
      }),
    );
    expect(none).not.toContain('leftover.title');
    expect(none).not.toContain('leftover.otherTitle');
    expect(
      renderToStaticMarkup(
        await PolicyFactsPanel({ view: buildPolicyFactsView([]), isOwner: false }),
      ),
    ).not.toContain('leftover.');
  });
});
