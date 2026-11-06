import { describe, expect, it } from 'vitest';
import {
  DATA_EXPORT_QUEUE,
  DATA_EXPORT_TTL_DAYS,
  dataExportJobSchema,
  exportExpiresAt,
  exportFileKey,
  exportLine,
  shapeAutomationSettingsRow,
  shapeCommentRow,
  shapeKbChunkRow,
  shapeLeadRow,
  shapeRuleRow,
} from './data-export';

const WS = '11111111-1111-4111-8111-111111111111';
const EX = '22222222-2222-4222-8222-222222222222';
const pseudonym = (v: string) => `kh_${v.length}`;
const D = new Date('2026-11-06T01:02:03.000Z');

describe('FR-094 xuất dữ liệu: hằng số và job', () => {
  it('FR-094 tên hàng đợi và hạn tải 7 ngày', () => {
    expect(DATA_EXPORT_QUEUE).toBe('data-export');
    expect(DATA_EXPORT_TTL_DAYS).toBe(7);
  });

  it('FR-094 job chỉ chứa id, từ chối trường lạ/thiếu', () => {
    const ok = { workspaceId: WS, exportId: EX, requestedBy: WS };
    expect(dataExportJobSchema.safeParse(ok).success).toBe(true);
    expect(dataExportJobSchema.safeParse({ ...ok, exportId: 'x' }).success).toBe(false);
    expect(dataExportJobSchema.safeParse({ workspaceId: WS }).success).toBe(false);
  });

  it('FR-094 khóa tệp theo workspace + id, không chứa dữ liệu khách', () => {
    expect(exportFileKey(WS, EX)).toBe(`exports/${WS}/${EX}.jsonl`);
  });

  it('FR-094 hạn dùng = bây giờ + 7 ngày', () => {
    expect(exportExpiresAt(D).toISOString()).toBe('2026-11-13T01:02:03.000Z');
  });
});

describe('FR-094 xuất dữ liệu: dòng JSON Lines', () => {
  it('FR-094 mỗi dòng là JSON hợp lệ kết thúc bằng xuống dòng, có section', () => {
    const line = exportLine('comments', { a: 1, text: 'xin chào\nbạn' });
    expect(line.endsWith('\n')).toBe(true);
    expect(line.slice(0, -1)).not.toContain('\n');
    expect(JSON.parse(line)).toEqual({ section: 'comments', row: { a: 1, text: 'xin chào\nbạn' } });
  });
});

describe('FR-094 che PII: bình luận', () => {
  const base = {
    id: 'c1',
    channelId: 'ch1',
    postId: 'p1',
    externalId: 'ext_1',
    authorExternalId: '1234567890',
    text: 'Gọi 0912 345 678 hoặc mail a.b@shop.vn nhé',
    lang: 'vi',
    createdTime: D,
    label: 'order',
    status: 'replied',
    isHidden: false,
    isOwn: false,
    repliedAt: null,
    deletedAt: null,
  };

  it('FR-094 che SĐT/email trong nội dung, thay id người dùng bằng mã giả, không có tên khách', () => {
    const row = shapeCommentRow(base, pseudonym);
    const json = JSON.stringify(row);
    expect(json).not.toContain('0912');
    expect(json).not.toContain('a.b@shop.vn');
    expect(json).not.toContain('1234567890');
    expect(row.text).toBe('Gọi [sđt] hoặc mail [email] nhé');
    expect(row.author).toBe('kh_10');
    expect(row).not.toHaveProperty('authorName');
    expect(row.created_time).toBe(D.toISOString());
  });

  it('FR-094 ngày rỗng giữ null; bình luận khách đã xóa đánh dấu deleted', () => {
    const row = shapeCommentRow({ ...base, createdTime: null, deletedAt: D, text: '' }, pseudonym);
    expect(row.created_time).toBeNull();
    expect(row.replied_at).toBeNull();
    expect(row.deleted).toBe(true);
    expect(shapeCommentRow({ ...base, repliedAt: D }, pseudonym).replied_at).toBe(D.toISOString());
  });
});

describe('FR-094 che PII: khách tiềm năng', () => {
  const base = {
    id: 'l1',
    channelId: 'ch1',
    sourceType: 'comment',
    stage: 'new',
    phoneLast4: '5678',
    hasEmail: true,
    note: 'Khách hẹn gọi 0987654321',
    createdAt: D,
    updatedAt: D,
  };

  it('FR-094 chỉ còn 4 số cuối + cờ có email, ghi chú đã che', () => {
    const row = shapeLeadRow(base);
    expect(row.phone_masked).toBe('***5678');
    expect(row.has_email).toBe(true);
    expect(row.note).toBe('Khách hẹn gọi [sđt]');
    expect(JSON.stringify(row)).not.toContain('0987654321');
    expect(row).not.toHaveProperty('name');
  });

  it('FR-094 không có SĐT/ghi chú → null', () => {
    const row = shapeLeadRow({ ...base, phoneLast4: null, note: null, hasEmail: false });
    expect(row.phone_masked).toBeNull();
    expect(row.note).toBeNull();
    expect(row.has_email).toBe(false);
  });
});

describe('FR-094 che PII: kiến thức và cấu hình', () => {
  it('FR-094 đoạn kiến thức được che, giữ cờ nháp', () => {
    const row = shapeKbChunkRow({
      id: 'k1',
      sourceId: 's1',
      versionId: null,
      content: 'Hotline 0901234567',
      lang: 'vi',
      isDraft: true,
      updatedAt: D,
    });
    expect(row.content).toBe('Hotline [sđt]');
    expect(row.is_draft).toBe(true);
    expect(row.version_id).toBeNull();
  });

  it('FR-094 cấu hình tự động: giữ số/giờ, che từ khóa chặn và chữ ký có SĐT', () => {
    const row = shapeAutomationSettingsRow({
      delaySeconds: 60,
      dailyCap: 50,
      activeHours: { from: '08:00', to: '22:00' },
      blockedKeywords: ['spam', 'zalo 0912345678'],
      signature: 'Shop A - 0912345678',
    });
    expect(row.delay_seconds).toBe(60);
    expect(row.daily_cap).toBe(50);
    expect(row.active_hours).toEqual({ from: '08:00', to: '22:00' });
    expect(row.blocked_keywords).toEqual(['spam', 'zalo [sđt]']);
    expect(row.signature).toBe('Shop A - [sđt]');
    expect(
      shapeAutomationSettingsRow({
        ...{
          delaySeconds: 1,
          dailyCap: 1,
          activeHours: null,
          blockedKeywords: [],
          signature: null,
        },
      }).signature,
    ).toBeNull();
  });

  it('FR-094 quy tắc lọc: che mẫu chứa liên hệ', () => {
    const row = shapeRuleRow({
      id: 'r1',
      name: 'Chặn số',
      type: 'keyword',
      pattern: 'a@b.vn',
      action: 'hide',
      enabled: true,
    });
    expect(row.pattern).toBe('[email]');
    expect(row.enabled).toBe(true);
  });
});
