import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  buildReport,
  csvCell,
  median,
  REPORT_FAST_REPLY_MS,
  type ReportCommentRow,
  type ReportOptions,
  reportToCsv,
} from './reports';

const MIN = 60_000;
const T0 = new Date('2026-11-02T00:00:00.000Z');
const OPTS: ReportOptions = { from: T0, to: new Date('2026-11-09T00:00:00.000Z') };
const OWNER = { role: 'owner', userId: 'u-owner' } as const;
const STAFF = { role: 'staff', userId: 'u-staff' } as const;

let seq = 0;
/** Fixture: bình luận nhận lúc `at` (phút từ T0), trả lời sau `afterMin` phút (null = chưa trả lời). */
function row(
  over: Partial<ReportCommentRow> & { atMin?: number; afterMin?: number | null } = {},
): ReportCommentRow {
  const { atMin = 60, afterMin = null, ...rest } = over;
  const createdTime = new Date(T0.getTime() + atMin * MIN);
  return {
    id: `c-${++seq}`,
    channelId: 'ch-1',
    createdTime,
    repliedAt: afterMin === null ? null : new Date(createdTime.getTime() + afterMin * MIN),
    repliedBy: afterMin === null ? null : 'u-staff',
    status: afterMin === null ? 'new' : 'replied',
    isOwn: false,
    deletedAt: null,
    ...rest,
  };
}

describe('FR-083 median', () => {
  it('rỗng → null; lẻ → giữa; chẵn → trung bình hai số giữa; không đổi mảng gốc', () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    const xs = [9, 1, 5];
    expect(median(xs)).toBe(5);
    expect(xs).toEqual([9, 1, 5]);
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });

  it('FR-083 property: trung vị nằm trong [min, max] và không phụ thuộc thứ tự', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1e9 }), { minLength: 1, maxLength: 50 }),
        (xs) => {
          const m = median(xs) as number;
          expect(m).toBeGreaterThanOrEqual(Math.min(...xs));
          expect(m).toBeLessThanOrEqual(Math.max(...xs));
          expect(median([...xs].reverse())).toBe(m);
        },
      ),
    );
  });
});

describe('FR-083 chỉ số phản hồi', () => {
  it('ngưỡng 15 phút: đúng 15:00 đạt, hơn 1 ms thì không', () => {
    expect(REPORT_FAST_REPLY_MS).toBe(15 * MIN);
    const exact = row({ afterMin: 15 });
    const late = row({ afterMin: 15 });
    late.repliedAt = new Date(late.repliedAt!.getTime() + 1);
    const r = buildReport([exact, late], OWNER, OPTS);
    expect(r.within15Rate).toBe(0.5);
  });

  it('trung vị thời gian phản hồi (ms) chỉ trên bình luận đã trả lời', () => {
    const r = buildReport(
      [row({ afterMin: 2 }), row({ afterMin: 10 }), row({ afterMin: 60 }), row()],
      OWNER,
      OPTS,
    );
    expect(r.medianResponseMs).toBe(10 * MIN);
    expect(r.received).toBe(4);
    expect(r.answered).toBe(3);
    expect(r.answerRate).toBeCloseTo(0.75);
  });

  it('không có dữ liệu → null, không NaN', () => {
    const r = buildReport([], OWNER, OPTS);
    expect(r).toMatchObject({
      received: 0,
      answered: 0,
      answerRate: null,
      within15Rate: null,
      medianResponseMs: null,
      hoursSaved: 0,
      peakHours: [],
    });
  });

  it('loại bình luận của chính Page, đã xóa, thiếu giờ, trạng thái spam/bỏ qua', () => {
    const r = buildReport(
      [
        row({ afterMin: 1 }),
        row({ isOwn: true, afterMin: 1 }),
        row({ deletedAt: T0, afterMin: 1 }),
        row({ createdTime: null }),
        row({ status: 'spam_suspected' }),
        row({ status: 'skipped' }),
      ],
      OWNER,
      OPTS,
    );
    expect(r.received).toBe(1);
  });

  it('thời gian trả lời âm (lệch đồng hồ) tính là đã trả lời nhưng không vào trung vị/% 15 phút', () => {
    const bad = row({ afterMin: -5 });
    const r = buildReport([bad, row({ afterMin: 4 })], OWNER, OPTS);
    expect(r.answered).toBe(2);
    expect(r.medianResponseMs).toBe(4 * MIN);
    expect(r.within15Rate).toBe(1);
  });

  it('lọc theo khoảng [from, to) và theo kênh', () => {
    const r = buildReport(
      [
        row({ atMin: 0, afterMin: 1 }), // đúng from → vào
        row({ atMin: -1, afterMin: 1 }), // trước from
        row({ atMin: 7 * 24 * 60, afterMin: 1 }), // đúng to → ra
        row({ atMin: 10, channelId: 'ch-2', afterMin: 1 }),
      ],
      OWNER,
      { ...OPTS, channelId: 'ch-1' },
    );
    expect(r.received).toBe(1);
  });
});

describe('FR-083 giờ tiết kiệm', () => {
  it('= số auto_replied × phút/lượt / 60, mặc định 2 phút', () => {
    const autos = Array.from({ length: 30 }, () =>
      row({ status: 'auto_replied', afterMin: 1, repliedBy: null }),
    );
    const r = buildReport([...autos, row({ afterMin: 3 })], OWNER, OPTS);
    expect(r.autoReplied).toBe(30);
    expect(r.hoursSaved).toBeCloseTo(1);
    const r3 = buildReport(autos, OWNER, { ...OPTS, minutesPerAutoReply: 6 });
    expect(r3.hoursSaved).toBeCloseTo(3);
  });

  it('auto_replied chưa có repliedAt thì không tính (chưa gửi xong)', () => {
    const pending = row({ status: 'auto_replied' });
    expect(buildReport([pending], OWNER, OPTS).autoReplied).toBe(0);
  });
});

describe('FR-083 giờ cao điểm', () => {
  it('đếm theo giờ địa phương UTC+7 mặc định; 24 ô; tổng = received', () => {
    // 00:30 UTC = 07:30 giờ VN; 17:10 UTC = 00:10 hôm sau VN
    const rows = [row({ atMin: 30 }), row({ atMin: 30 }), row({ atMin: 17 * 60 + 10 })];
    const r = buildReport(rows, OWNER, OPTS);
    expect(r.hourlyDistribution).toHaveLength(24);
    expect(r.hourlyDistribution[7]).toBe(2);
    expect(r.hourlyDistribution[0]).toBe(1);
    expect(r.hourlyDistribution.reduce((a, b) => a + b, 0)).toBe(r.received);
    expect(r.peakHours).toEqual([7, 0]);
  });

  it('múi giờ cấu hình (UTC+0) và âm (UTC-5)', () => {
    const rows = [row({ atMin: 30 })];
    expect(buildReport(rows, OWNER, { ...OPTS, tzOffsetMinutes: 0 }).hourlyDistribution[0]).toBe(1);
    expect(
      buildReport(rows, OWNER, { ...OPTS, tzOffsetMinutes: -300 }).hourlyDistribution[19],
    ).toBe(1);
  });

  it('tối đa 3 giờ cao điểm, hòa → giờ nhỏ trước, bỏ giờ 0 lượt', () => {
    const rows = [
      ...[1, 1, 1, 2, 2, 3, 3, 4].map((h) => row({ atMin: (h - 7) * 60 + 30 + 24 * 60 })),
    ];
    const r = buildReport(rows, OWNER, { ...OPTS, tzOffsetMinutes: 420 });
    expect(r.peakHours).toEqual([1, 2, 3]);
  });

  it('FR-083 property: tổng phân bố = received và không đổi theo thứ tự đầu vào', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 7 * 24 * 60 - 1 }), { maxLength: 60 }),
        fc.integer({ min: -720, max: 840 }),
        (mins, tz) => {
          const rows = mins.map((m) => row({ atMin: m }));
          const a = buildReport(rows, OWNER, { ...OPTS, tzOffsetMinutes: tz });
          const b = buildReport([...rows].reverse(), OWNER, { ...OPTS, tzOffsetMinutes: tz });
          expect(a.hourlyDistribution.reduce((x, y) => x + y, 0)).toBe(rows.length);
          expect(b.hourlyDistribution).toEqual(a.hourlyDistribution);
          expect(b.peakHours).toEqual(a.peakHours);
        },
      ),
    );
  });
});

describe('FR-083 năng suất theo nhân viên và phạm vi Staff', () => {
  const rows = [
    row({ afterMin: 5, repliedBy: 'u-a' }),
    row({ afterMin: 30, repliedBy: 'u-a' }),
    row({ afterMin: 10, repliedBy: 'u-b' }),
    row({ status: 'auto_replied', afterMin: 1, repliedBy: null }),
    row(),
  ];

  it('Owner/Admin: một dòng mỗi nhân viên (chỉ id), sắp theo số đã trả lời giảm dần; AI tự gửi không thuộc ai', () => {
    for (const role of ['owner', 'admin'] as const) {
      const r = buildReport(rows, { role, userId: 'x' }, OPTS);
      expect(r.scope).toBe('workspace');
      expect(r.perStaff).toEqual([
        { userId: 'u-a', answered: 2, within15Rate: 0.5, medianResponseMs: 17.5 * MIN },
        { userId: 'u-b', answered: 1, within15Rate: 1, medianResponseMs: 10 * MIN },
      ]);
    }
  });

  it('Staff: chỉ số cá nhân — không thấy người khác, không giờ tiết kiệm/answerRate', () => {
    const r = buildReport(rows, { role: 'staff', userId: 'u-a' }, OPTS);
    expect(r.scope).toBe('personal');
    expect(r.perStaff.map((s) => s.userId)).toEqual(['u-a']);
    expect(r.received).toBe(2);
    expect(r.answered).toBe(2);
    expect(r.medianResponseMs).toBe(17.5 * MIN);
    expect(r.autoReplied).toBeNull();
    expect(r.hoursSaved).toBeNull();
    expect(r.answerRate).toBeNull();
    expect(JSON.stringify(r)).not.toContain('u-b');
  });

  it('Staff không có bình luận nào → số 0, không lỗi', () => {
    const r = buildReport(rows, STAFF, OPTS);
    expect(r.received).toBe(0);
    expect(r.perStaff).toEqual([]);
  });

  it('FR-083 property: Staff không bao giờ thấy số của người khác', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('u-a', 'u-b', 'u-c', null), { maxLength: 40 }),
        (owners) => {
          const rs = owners.map((o) => row({ afterMin: 3, repliedBy: o }));
          const r = buildReport(rs, { role: 'staff', userId: 'u-a' }, OPTS);
          expect(r.answered).toBe(owners.filter((o) => o === 'u-a').length);
          expect(r.perStaff.every((s) => s.userId === 'u-a')).toBe(true);
          const w = buildReport(rs, OWNER, OPTS);
          expect(w.perStaff.reduce((n, s) => n + s.answered, 0)).toBeLessThanOrEqual(w.answered);
        },
      ),
    );
  });
});

describe('FR-083 xuất CSV', () => {
  it('csvCell: trích dẫn dấu phẩy/ngoặc kép/xuống dòng, chống chèn công thức', () => {
    expect(csvCell('abc')).toBe('abc');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('@x')).toBe("'@x");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-1')).toBe("'-1");
    expect(csvCell(null)).toBe('');
    expect(csvCell(0.5)).toBe('0.5');
  });

  it('FR-083 property: ô không bao giờ bắt đầu bằng ký tự công thức; ô có ký tự đặc biệt luôn được bao ngoặc', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const c = csvCell(s);
        expect(/^[=+\-@\t\r]/.test(c)).toBe(false);
        if (/[",\n\r]/.test(s)) expect(c.startsWith('"') && c.endsWith('"')).toBe(true);
      }),
    );
  });

  it('báo cáo → CSV có tiêu đề section,key,value, 24 dòng giờ, dòng nhân viên, kết thúc xuống dòng', () => {
    const r = buildReport(
      [
        row({ afterMin: 5, repliedBy: 'u-a' }),
        row({ status: 'auto_replied', afterMin: 1, repliedBy: null }),
      ],
      OWNER,
      OPTS,
    );
    const csv = reportToCsv(r);
    const lines = csv.trimEnd().split('\n');
    expect(lines[0]).toBe('section,key,value');
    expect(csv.endsWith('\n')).toBe(true);
    expect(lines).toContain('summary,scope,workspace');
    expect(lines).toContain('summary,received,2');
    expect(lines).toContain('summary,hours_saved,0.0333');
    expect(lines.filter((l) => l.startsWith('hourly,'))).toHaveLength(24);
    expect(lines).toContain('staff,u-a.answered,1');
    expect(lines).toContain('staff,u-a.median_response_ms,300000');
  });

  it('số null → ô rỗng; Staff không có dòng giờ tiết kiệm bằng số', () => {
    const csv = reportToCsv(buildReport([], STAFF, OPTS));
    expect(csv).toContain('summary,scope,personal');
    expect(csv).toContain('summary,hours_saved,\n');
    expect(csv).toContain('summary,median_response_ms,\n');
  });
});
