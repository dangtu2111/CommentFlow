import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  exportLeads,
  LEAD_EXPORT_HARD_MAX_ROWS,
  type LeadExportConfig,
  LeadExportError,
  type LeadExportPageSource,
  type LeadExportRow,
  maskLeadEmail,
  readLeadExportConfig,
  sanitizeExportText,
} from './lead-export';
import { readXlsx } from './product-import/xlsx';

const CONFIG: LeadExportConfig = { enabled: true, phoneMode: 'masked', maxRows: 100 };
const NOW = new Date('2026-11-06T03:00:00Z');
const decode = (b: Uint8Array) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(b);
const HEADER = 'created_at,stage,source,name,phone,email,note,assigned_to';

// Fixture: dữ liệu giả, không phải khách thật.
const row = (over: Partial<LeadExportRow> = {}): LeadExportRow => ({
  id: 'lead-1',
  createdAt: new Date('2026-11-01T01:02:03Z'),
  stage: 'new',
  sourceType: 'comment',
  name: 'Khách Thử',
  phoneLast4: '1234',
  phone: '0912341234',
  email: 'thu@example.test',
  hasEmail: true,
  note: null,
  assignedTo: null,
  ...over,
});

function source(
  rows: LeadExportRow[],
  pageSize = 2,
): LeadExportPageSource & { reveals: boolean[] } {
  const reveals: boolean[] = [];
  return {
    reveals,
    async readPage(cursor, limit, opts) {
      reveals.push(opts.revealContacts);
      const start = cursor === null ? 0 : Number(cursor);
      const size = Math.min(limit, pageSize);
      const page = rows.slice(start, start + size);
      const next = start + size;
      return { rows: page, nextCursor: next < rows.length ? String(next) : null };
    },
  };
}

const owner = { role: 'owner' as const };
const staff = { role: 'staff' as const };
const base = { config: CONFIG, format: 'csv' as const, now: NOW };

describe('FR-082 xuất khách tiềm năng — CSV', () => {
  it('có BOM UTF-8, tiêu đề cố định, CRLF; SĐT/email che mặc định', async () => {
    const src = source([row()]);
    const out = await exportLeads({ ...base, source: src, viewer: owner });
    const text = decode(out.bytes);
    expect(text.startsWith('﻿')).toBe(true);
    const lines = text.slice(1).split('\r\n');
    expect(lines[0]).toBe(HEADER);
    expect(lines[1]).toBe(
      '2026-11-01T01:02:03.000Z,new,comment,Khách Thử,••••••1234,t***@example.test,,',
    );
    expect(text).not.toContain('0912341234');
    expect(out.rowCount).toBe(1);
    expect(out.filename).toBe('leads-20261106.csv');
    expect(src.reveals.every((r) => r === false)).toBe(true);
  });

  it('đóng ngoặc ô có dấu phẩy, nháy kép, xuống dòng (RFC 4180)', async () => {
    const out = await exportLeads({
      ...base,
      source: source([row({ note: 'a,"b"\nc' })]),
      viewer: owner,
    });
    expect(decode(out.bytes)).toContain('"a,""b""\nc"');
  });

  it('có email nhưng nguồn không giải mã (hasEmail) → ô che ***', async () => {
    const out = await exportLeads({
      ...base,
      source: source([row({ email: null, hasEmail: true })]),
      viewer: owner,
    });
    expect(decode(out.bytes)).toContain('••••••1234,***,');
  });

  it('chế độ hidden bỏ cột phone và email', async () => {
    const out = await exportLeads({
      ...base,
      source: source([row()]),
      viewer: owner,
      phoneMode: 'hidden',
    });
    const header = decode(out.bytes).slice(1).split('\r\n')[0];
    expect(header).toBe('created_at,stage,source,name,note,assigned_to');
    expect(decode(out.bytes)).not.toContain('1234');
  });

  it('thiếu SĐT/email → ô rỗng', async () => {
    const out = await exportLeads({
      ...base,
      source: source([row({ phoneLast4: null, phone: null, email: null, hasEmail: false })]),
      viewer: owner,
    });
    expect(decode(out.bytes)).toContain('Khách Thử,,,,');
  });
});

describe('FR-082 quyền xuất SĐT đầy đủ', () => {
  const full: LeadExportConfig = { ...CONFIG, phoneMode: 'full' };

  it('Owner + cấu hình full → ra số đầy đủ và nguồn được yêu cầu giải mã', async () => {
    const src = source([row()]);
    const out = await exportLeads({
      ...base,
      config: full,
      source: src,
      viewer: owner,
      phoneMode: 'full',
    });
    expect(decode(out.bytes)).toContain('0912341234');
    expect(decode(out.bytes)).toContain('thu@example.test');
    expect(src.reveals.every(Boolean)).toBe(true);
  });

  it.each([
    [staff, undefined],
    [staff, 'full' as const],
    [staff, 'hidden' as const],
    [{ role: 'admin' as const }, undefined],
    [{ role: 'admin' as const }, 'full' as const],
  ])(
    'docs/13 §3.1: chỉ Owner xuất — %o yêu cầu %s → FORBIDDEN, không đọc nguồn',
    async (viewer, phoneMode) => {
      const src = source([row()]);
      await expect(
        exportLeads({ ...base, config: full, source: src, viewer, phoneMode }),
      ).rejects.toMatchObject({ code: 'LEADS_EXPORT_FORBIDDEN' });
      expect(src.reveals).toHaveLength(0);
    },
  );

  it('PII trong tên/ghi chú bị che ở chế độ che/ẩn, giữ nguyên ở full', async () => {
    const r = row({ note: 'goi 0912341234 hoặc a@b.vn', name: 'Lan +84 912 341 234' });
    for (const phoneMode of ['masked', 'hidden'] as const) {
      const out = await exportLeads({ ...base, source: source([r]), viewer: owner, phoneMode });
      const text = decode(out.bytes);
      expect(text).not.toContain('0912341234');
      expect(text).not.toContain('a@b.vn');
      expect(text).not.toContain('912 341 234');
    }
    const out = await exportLeads({
      ...base,
      config: full,
      source: source([r]),
      viewer: owner,
      phoneMode: 'full',
    });
    expect(decode(out.bytes)).toContain('0912341234');
  });

  it('phoneLast4 sai dạng (nguồn lỡ đưa số đầy đủ) → chỉ lấy 4 số cuối', async () => {
    const out = await exportLeads({
      ...base,
      source: source([row({ phoneLast4: '0912341234' })]),
      viewer: owner,
    });
    expect(decode(out.bytes)).toContain('••••••1234');
    expect(decode(out.bytes)).not.toContain('0912341234');
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, LEAD_EXPORT_HARD_MAX_ROWS + 1, 1.5])(
    'maxRows=%s dựng tay không qua readLeadExportConfig → CONFIG_INVALID',
    async (maxRows) => {
      await expect(
        exportLeads({ ...base, config: { ...CONFIG, maxRows }, source: source([]), viewer: owner }),
      ).rejects.toMatchObject({ code: 'LEADS_EXPORT_CONFIG_INVALID' });
    },
  );

  it('Owner không nói gì với cấu hình full → vẫn che (phải yêu cầu rõ)', async () => {
    const out = await exportLeads({
      ...base,
      config: full,
      source: source([row()]),
      viewer: owner,
    });
    expect(decode(out.bytes)).not.toContain('0912341234');
  });

  it('Owner yêu cầu full khi cấu hình chỉ masked → bị từ chối', async () => {
    await expect(
      exportLeads({ ...base, source: source([row()]), viewer: owner, phoneMode: 'full' }),
    ).rejects.toMatchObject({ code: 'LEADS_EXPORT_FORBIDDEN' });
  });

  it('nguồn trả số đầy đủ dù không yêu cầu → vẫn không lọt ra tệp', async () => {
    const out = await exportLeads({ ...base, source: source([row()]), viewer: owner });
    expect(decode(out.bytes)).not.toContain('0912341234');
  });
});

describe('FR-082 cờ và giới hạn', () => {
  it('cờ tắt → LEADS_EXPORT_DISABLED', async () => {
    await expect(
      exportLeads({
        ...base,
        config: { ...CONFIG, enabled: false },
        source: source([]),
        viewer: owner,
      }),
    ).rejects.toMatchObject({ code: 'LEADS_EXPORT_DISABLED' });
  });

  it('đúng ngưỡng maxRows → được; thêm một dòng → TOO_LARGE', async () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => row({ id: `l${i}` }));
    const config = { ...CONFIG, maxRows: 5 };
    const ok = await exportLeads({ ...base, config, source: source(mk(5)), viewer: owner });
    expect(ok.rowCount).toBe(5);
    await expect(
      exportLeads({ ...base, config, source: source(mk(6)), viewer: owner }),
    ).rejects.toMatchObject({ code: 'LEADS_EXPORT_TOO_LARGE' });
  });

  it('danh sách rỗng → chỉ có tiêu đề', async () => {
    const out = await exportLeads({ ...base, source: source([]), viewer: owner });
    expect(out.rowCount).toBe(0);
    expect(decode(out.bytes).slice(1).split('\r\n').filter(Boolean)).toHaveLength(1);
  });

  it('vượt dung lượng tối đa → TOO_LARGE, không trả tệp cắt dở', async () => {
    const rows = Array.from({ length: 20 }, (_, i) =>
      row({ id: `b${i}`, note: 'x'.repeat(400_000) }),
    );
    const err = await exportLeads({ ...base, source: source(rows), viewer: owner }).catch((e) => e);
    expect(err).toBeInstanceOf(LeadExportError);
    expect(err).toMatchObject({ code: 'LEADS_EXPORT_TOO_LARGE' });
  });

  it('lỗi nguồn → LEADS_EXPORT_SOURCE_FAILED, không lộ nội dung lỗi', async () => {
    const failing: LeadExportPageSource = {
      async readPage() {
        throw new Error('db down 0912341234');
      },
    };
    const err = await exportLeads({ ...base, source: failing, viewer: owner }).catch((e) => e);
    expect(err).toMatchObject({ code: 'LEADS_EXPORT_SOURCE_FAILED' });
    expect(String(err.message)).not.toContain('0912341234');
  });

  it('nguồn lặp con trỏ mãi → bị chặn (không treo)', async () => {
    const loop: LeadExportPageSource = {
      async readPage() {
        return { rows: [], nextCursor: '0' };
      },
    };
    await expect(exportLeads({ ...base, source: loop, viewer: owner })).rejects.toMatchObject({
      code: 'LEADS_EXPORT_SOURCE_FAILED',
    });
  });
});

describe('FR-082 cấu hình môi trường', () => {
  it('mặc định TẮT, che SĐT, 5000 dòng', () => {
    expect(readLeadExportConfig({})).toEqual({
      enabled: false,
      phoneMode: 'masked',
      maxRows: 5000,
    });
  });
  it('đọc giá trị hợp lệ; maxRows bị chặn ở trần cứng', () => {
    expect(
      readLeadExportConfig({
        LEADS_EXPORT_ENABLED: 'true',
        LEADS_EXPORT_PHONE_MODE: 'hidden',
        LEADS_EXPORT_MAX_ROWS: '999999',
      }),
    ).toEqual({ enabled: true, phoneMode: 'hidden', maxRows: LEAD_EXPORT_HARD_MAX_ROWS });
  });
  it.each([
    { LEADS_EXPORT_ENABLED: 'yes' },
    { LEADS_EXPORT_PHONE_MODE: 'raw' },
    { LEADS_EXPORT_MAX_ROWS: '0' },
    { LEADS_EXPORT_MAX_ROWS: 'abc' },
  ])('giá trị lạ %o → LEADS_EXPORT_CONFIG_INVALID', (env) => {
    expect(() => readLeadExportConfig(env)).toThrowError(/LEADS_EXPORT_CONFIG_INVALID/);
  });
});

// biome-ignore lint/suspicious/noControlCharactersInRegex: kiểm đúng ký tự điều khiển
const FORMULA_START = /^[\t\r]|^[\s\u0000-\u001f]*[=+\-@]/;
// biome-ignore lint/suspicious/noControlCharactersInRegex: kiểm đúng ký tự điều khiển
const BAD_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;

describe('FR-082 chống chèn công thức', () => {
  it.each(['=1+1', '+84912', '-2', '@SUM(A1)', '\tx', '\rx', '  =cmd', '\u0001=x'])(
    'ví dụ %j được thêm dấu nháy',
    (value) => {
      expect(sanitizeExportText(value).startsWith("'")).toBe(true);
    },
  );
  it('chuỗi thường không đổi', () => {
    expect(sanitizeExportText('Khách ạ 100k')).toBe('Khách ạ 100k');
  });
  it('property: không chuỗi nào sau xử lý bắt đầu bằng ký tự công thức', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (s) => {
        const out = sanitizeExportText(s);
        expect(FORMULA_START.test(out)).toBe(false);
        expect(BAD_CONTROL.test(out)).toBe(false);
      }),
      { numRuns: 300 },
    );
  });
  it('property: lũy đẳng — xử lý hai lần = một lần', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), (s) => {
        const once = sanitizeExportText(s);
        expect(sanitizeExportText(once)).toBe(once);
      }),
      { numRuns: 300 },
    );
  });
  it('tên/ghi chú độc hại ra CSV với dấu nháy', async () => {
    const out = await exportLeads({
      ...base,
      source: source([row({ name: '=HYPERLINK("http://x")', note: '@evil' })]),
      viewer: owner,
    });
    const text = decode(out.bytes);
    expect(text).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(text).toContain("'@evil");
  });
});

describe('FR-082 che email', () => {
  it.each([
    ['thu@example.test', 't***@example.test'],
    ['a@b.co', 'a***@b.co'],
    ['khong-co-a-cong', '***'],
    ['', '***'],
  ])('maskLeadEmail(%j) = %j', (input, expected) => {
    expect(maskLeadEmail(input)).toBe(expected);
  });
  it('property: không chứa phần cục bộ sau ký tự đầu', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z]{4,12}$/), (local) => {
        const masked = maskLeadEmail(`${local}@mien.test`);
        expect(masked.includes(local.slice(1))).toBe(false);
      }),
    );
  });
});

describe('FR-082 xuất XLSX', () => {
  const xlsx = { ...base, format: 'xlsx' as const };

  it('đọc lại được bằng readXlsx, giữ tiếng Việt và ký tự đặc biệt XML', async () => {
    const out = await exportLeads({
      ...xlsx,
      source: source([row({ name: 'Nguyễn & <Lan> "Hoa"', note: 'dòng 1\ndòng 2' })]),
      viewer: owner,
    });
    expect(out.filename).toBe('leads-20261106.xlsx');
    expect(out.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const table = readXlsx(out.bytes);
    expect(table[0]).toEqual(HEADER.split(','));
    expect(table[1]?.[3]).toBe('Nguyễn & <Lan> "Hoa"');
    expect(table[1]?.[4]).toBe('••••••1234');
    expect(table[1]?.[6]).toBe('dòng 1\ndòng 2');
  });
  it('ô độc hại thành chuỗi có dấu nháy, không thành công thức', async () => {
    const out = await exportLeads({
      ...xlsx,
      source: source([row({ name: '=1+1', note: '+cmd' })]),
      viewer: owner,
    });
    const table = readXlsx(out.bytes);
    expect(table[1]?.[3]).toBe("'=1+1");
    expect(table[1]?.[6]).toBe("'+cmd");
  });
  it('rỗng → chỉ có tiêu đề', async () => {
    const out = await exportLeads({ ...xlsx, source: source([]), viewer: owner });
    expect(readXlsx(out.bytes)).toHaveLength(1);
  });
});
