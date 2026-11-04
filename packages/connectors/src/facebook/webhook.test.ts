import { createHmac } from 'node:crypto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  deserializeEvent,
  eventHashOf,
  parseMetaWebhook,
  serializeEvent,
  signMetaBody,
  verifyMetaSignature,
} from './webhook';
import {
  COMMENT_ID,
  commentChange,
  PAGE_ID,
  POST_ID,
  REPLY_ID,
  webhookBody,
} from './webhook.fixtures';

const SECRET = 'bi-mat-app-gia-0123456789abcdef';
const raw = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8');
const sign = (body: Buffer, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

describe('FR-020 verifyMetaSignature — X-Hub-Signature-256', () => {
  const body = raw(webhookBody([commentChange()]));

  it('FR-020 chữ ký đúng → true; signMetaBody tạo đúng định dạng', () => {
    expect(verifyMetaSignature(body, sign(body), SECRET)).toBe(true);
    expect(signMetaBody(body, SECRET)).toBe(sign(body));
  });

  it('FR-020 từ chối: sai khóa, sửa 1 byte thân, thiếu header, sai tiền tố, độ dài sai, không phải hex, khóa rỗng', () => {
    const good = sign(body);
    const tampered = Buffer.from(body);
    tampered[10] = (tampered[10] ?? 0) ^ 1;
    const cases: Array<[string, boolean]> = [
      ['sai khóa', verifyMetaSignature(body, sign(body, 'khoa-khac'), SECRET)],
      ['sửa thân', verifyMetaSignature(tampered, good, SECRET)],
      ['thiếu header', verifyMetaSignature(body, null, SECRET)],
      ['header rỗng', verifyMetaSignature(body, '', SECRET)],
      ['sai tiền tố', verifyMetaSignature(body, good.replace('sha256=', 'sha1='), SECRET)],
      ['không có tiền tố', verifyMetaSignature(body, good.slice(7), SECRET)],
      ['cụt', verifyMetaSignature(body, good.slice(0, -2), SECRET)],
      ['dài', verifyMetaSignature(body, `${good}00`, SECRET)],
      ['không hex', verifyMetaSignature(body, `sha256=${'z'.repeat(64)}`, SECRET)],
      ['khóa rỗng', verifyMetaSignature(body, sign(body, ''), '')],
    ];
    for (const [label, result] of cases) expect(result, label).toBe(false);
  });

  it('FR-020 chấp nhận hex chữ hoa (không phân biệt hoa/thường), nhưng vẫn đòi đúng nội dung', () => {
    const upper = `sha256=${sign(body).slice(7).toUpperCase()}`;
    expect(verifyMetaSignature(body, upper, SECRET)).toBe(true);
  });

  it('FR-020 thuộc tính: thân bất kỳ ký đúng thì qua; thân khác thì rớt; đầu vào bậy không ném lỗi', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ maxLength: 500 }),
        fc.string({ maxLength: 120 }),
        (bytes, header) => {
          const b = Buffer.from(bytes);
          expect(verifyMetaSignature(b, sign(b), SECRET)).toBe(true);
          expect(verifyMetaSignature(Buffer.concat([b, Buffer.from('x')]), sign(b), SECRET)).toBe(
            false,
          );
          expect(() => verifyMetaSignature(b, header, SECRET)).not.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('FR-020 parseMetaWebhook — chuẩn hóa sự kiện bình luận', () => {
  it('FR-020 bình luận mới cấp 1: parent_id == post_id → parentExternalId null; isFromPage false', () => {
    const events = parseMetaWebhook(webhookBody([commentChange()]));
    expect(events).toHaveLength(1);
    const event = events[0];
    if (event?.kind !== 'comment_created') throw new Error('kind');
    expect(event.channelExternalId).toBe(PAGE_ID);
    expect(event.comment).toMatchObject({
      externalId: COMMENT_ID,
      postExternalId: POST_ID,
      parentExternalId: null,
      authorExternalId: '4000000000004',
      authorName: 'Khách Thử',
      text: 'Áo này còn size M không shop?',
      isFromPage: false,
    });
    expect(event.comment.createdAt.getTime()).toBe(1_762_000_000 * 1000);
  });

  it('FR-020 trả lời lồng: parent_id là bình luận → parentExternalId = parent_id', () => {
    const [event] = parseMetaWebhook(
      webhookBody([commentChange({ comment_id: REPLY_ID, parent_id: COMMENT_ID })]),
    );
    if (event?.kind !== 'comment_created') throw new Error('kind');
    expect(event.comment.parentExternalId).toBe(COMMENT_ID);
  });

  it('FR-022 bình luận do chính Page viết (from.id == page id) → isFromPage true', () => {
    const [event] = parseMetaWebhook(
      webhookBody([commentChange({ from: { id: PAGE_ID, name: 'Shop' } })]),
    );
    if (event?.kind !== 'comment_created') throw new Error('kind');
    expect(event.comment.isFromPage).toBe(true);
  });

  it('FR-020 edited → comment_edited; remove → comment_deleted (chỉ cần id)', () => {
    const events = parseMetaWebhook(
      webhookBody([commentChange({ verb: 'edited' }), commentChange({ verb: 'remove' })]),
    );
    expect(events.map((e) => e.kind)).toEqual(['comment_edited', 'comment_deleted']);
    const deleted = events[1];
    if (deleted?.kind !== 'comment_deleted') throw new Error('kind');
    expect(deleted.commentExternalId).toBe(COMMENT_ID);
    expect(deleted.channelExternalId).toBe(PAGE_ID);
  });

  it('FR-020 nhiều entry/changes → mỗi bình luận một sự kiện, đúng Page', () => {
    const body = {
      object: 'page',
      entry: [
        { id: PAGE_ID, time: 1, changes: [commentChange(), commentChange({ comment_id: 'c2' })] },
        { id: 'page-2', time: 2, changes: [commentChange({ comment_id: 'c3' })] },
      ],
    };
    expect(parseMetaWebhook(body).map((e) => e.channelExternalId)).toEqual([
      PAGE_ID,
      PAGE_ID,
      'page-2',
    ]);
  });

  it('FR-020 bỏ qua thay đổi không phải bình luận (reaction, status, field khác) và bản ghi thiếu trường', () => {
    const events = parseMetaWebhook(
      webhookBody([
        commentChange({ item: 'reaction' }),
        { field: 'feed', value: { item: 'status', verb: 'add' } },
        { field: 'mention', value: commentChange().value },
        commentChange({ comment_id: undefined }),
        commentChange({ verb: 'hide' }),
        commentChange({ from: undefined }),
        commentChange({ post_id: undefined }),
        commentChange({ created_time: 'hom-qua' }),
      ]),
    );
    expect(events).toEqual([]);
  });

  it('FR-020 object khác page hoặc cấu trúc sai → [] (không ném, không lộ nội dung)', () => {
    const bads = [
      null,
      undefined,
      42,
      'x',
      [],
      {},
      { object: 'user', entry: [] },
      { object: 'page' },
      { object: 'page', entry: 'x' },
      { object: 'page', entry: [{ id: 1 }] },
      { object: 'page', entry: [{ id: PAGE_ID, changes: 'x' }] },
    ];
    for (const bad of bads) expect(parseMetaWebhook(bad)).toEqual([]);
  });

  it('FR-020 bình luận chỉ có ảnh/nhãn dán (không có message) vẫn được nhận với text rỗng', () => {
    const [event] = parseMetaWebhook(webhookBody([commentChange({ message: undefined })]));
    if (event?.kind !== 'comment_created') throw new Error('kind');
    expect(event.comment.text).toBe('');
  });
});

describe('FR-021 eventHashOf — khóa chống trùng', () => {
  it('FR-021 ổn định theo (Page, comment, verb, created_time); khác thành phần → khác hash; không lộ nội dung', () => {
    const [a] = parseMetaWebhook(webhookBody([commentChange()]));
    const [a2] = parseMetaWebhook(webhookBody([commentChange()]));
    const [edited] = parseMetaWebhook(webhookBody([commentChange({ verb: 'edited' })]));
    const [other] = parseMetaWebhook(webhookBody([commentChange({ comment_id: 'x_1' })]));
    const [otherPage] = parseMetaWebhook(webhookBody([commentChange()], 'page-9'));
    const [later] = parseMetaWebhook(webhookBody([commentChange({ created_time: 1_762_000_999 })]));
    if (!a || !a2 || !edited || !other || !otherPage || !later) throw new Error('parse');
    const h = (e: typeof a) => eventHashOf('facebook', e);
    expect(h(a)).toBe(h(a2));
    expect(new Set([h(a), h(edited), h(other), h(otherPage), h(later)]).size).toBe(5);
    expect(h(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('FR-021 serializeEvent/deserializeEvent — dạng lưu trong webhook_events.payload', () => {
  it('FR-021 khứ hồi giữ nguyên sự kiện (Date ↔ ISO), payload là JSON thuần và KHÔNG chứa trường thừa của Meta', () => {
    const events = parseMetaWebhook(
      webhookBody([
        commentChange(),
        commentChange({ verb: 'edited' }),
        commentChange({ verb: 'remove' }),
      ]),
    );
    for (const event of events) {
      const json = serializeEvent(event);
      expect(JSON.parse(JSON.stringify(json))).toEqual(json);
      expect(deserializeEvent(json)).toEqual(event);
    }
    const created = JSON.stringify(serializeEvent(events[0] as never));
    expect(created).not.toContain('status_type');
  });

  it('FR-021 deserialize dữ liệu hỏng/lạ → null (không ném)', () => {
    for (const bad of [
      null,
      1,
      'x',
      {},
      { kind: 'comment_created' },
      { kind: 'khac', channelExternalId: 'p' },
      {
        kind: 'comment_created',
        channelExternalId: 'p',
        comment: { externalId: 'c', createdAt: 'khong-phai-ngay' },
      },
    ]) {
      expect(deserializeEvent(bad)).toBeNull();
    }
  });
});

describe('FR-021 nhánh biên của chuẩn hóa/lưu trữ', () => {
  it('FR-021 người bình luận không có tên → không có authorName; khứ hồi vẫn đúng; thiếu parentExternalId khi đọc lại → null', () => {
    const [event] = parseMetaWebhook(webhookBody([commentChange({ from: { id: '77' } })]));
    if (event?.kind !== 'comment_created') throw new Error('kind');
    expect('authorName' in event.comment).toBe(false);
    const stored = serializeEvent(event) as { comment: Record<string, unknown> };
    delete stored.comment.parentExternalId;
    const back = deserializeEvent(stored);
    if (back?.kind !== 'comment_created') throw new Error('kind');
    expect(back.comment.parentExternalId).toBeNull();
    expect('authorName' in back.comment).toBe(false);
  });

  it('FR-021 hash sự kiện xóa ổn định và khác sự kiện tạo cùng bình luận', () => {
    const [created, , deleted] = parseMetaWebhook(
      webhookBody([
        commentChange(),
        commentChange({ verb: 'edited' }),
        commentChange({ verb: 'remove' }),
      ]),
    );
    if (!created || !deleted) throw new Error('parse');
    expect(eventHashOf('facebook', deleted)).toBe(eventHashOf('facebook', deleted));
    expect(eventHashOf('facebook', deleted)).not.toBe(eventHashOf('facebook', created));
  });
});

describe('FR-020 làm sạch dữ liệu bẩn để một sự kiện không làm hỏng cả lô', () => {
  it('FR-020 bỏ ký tự NUL và sửa surrogate lẻ trong tên/nội dung (Postgres jsonb từ chối chúng)', () => {
    const [event] = parseMetaWebhook(
      webhookBody([
        commentChange({
          message: 'chào\u0000 bạn \ud83d',
          from: { id: '9\u00001', name: 'Khách\u0000 \ude00' },
        }),
      ]),
    );
    if (event?.kind !== 'comment_created') throw new Error('kind');
    expect(event.comment.text).not.toContain('\u0000');
    expect(() => encodeURIComponent(event.comment.text)).not.toThrow();
    expect(event.comment.authorExternalId).toBe('91');
    expect(() => encodeURIComponent(event.comment.authorName ?? '')).not.toThrow();
    expect(() => JSON.stringify(serializeEvent(event))).not.toThrow();
  });

  it('FR-020 created_time ngoài khoảng hợp lệ (quá lớn) → bản ghi bị bỏ, không ném RangeError', () => {
    expect(
      parseMetaWebhook(webhookBody([commentChange({ created_time: 9_999_999_999_999 })])),
    ).toEqual([]);
    expect(() =>
      parseMetaWebhook(webhookBody([commentChange({ created_time: 1e308 })])),
    ).not.toThrow();
  });
});

describe('FR-048 sửa/xóa bình luận — occurredAt và khóa chống trùng', () => {
  const at = (time: number, verb: 'edited' | 'remove' | 'add') =>
    parseMetaWebhook({
      object: 'page',
      entry: [{ id: PAGE_ID, time, changes: [commentChange({ verb })] }],
    })[0];

  it('FR-048 edited/remove mang occurredAt = entry.time (giây → Date); thiếu entry.time → không có; created không có', () => {
    const edited = at(1_762_000_100, 'edited');
    const removed = at(1_762_000_200, 'remove');
    expect(edited?.kind).toBe('comment_edited');
    expect(edited && 'occurredAt' in edited ? edited.occurredAt?.getTime() : null).toBe(
      1_762_000_100_000,
    );
    expect(removed && 'occurredAt' in removed ? removed.occurredAt?.getTime() : null).toBe(
      1_762_000_200_000,
    );
    expect(at(1_762_000_300, 'add')).not.toHaveProperty('occurredAt');
    const [noTime] = parseMetaWebhook({
      object: 'page',
      entry: [{ id: PAGE_ID, changes: [commentChange({ verb: 'edited' })] }],
    });
    expect(noTime).not.toHaveProperty('occurredAt');
  });

  it('FR-048 hai lần sửa cùng bình luận (entry.time khác) → hash KHÁC; Meta gửi lại cùng payload → hash GIỐNG; xóa cũng vậy', () => {
    const e1 = at(1_762_000_100, 'edited');
    const e1again = at(1_762_000_100, 'edited');
    const e2 = at(1_762_000_500, 'edited');
    const d1 = at(1_762_000_100, 'remove');
    const d2 = at(1_762_000_500, 'remove');
    if (!e1 || !e1again || !e2 || !d1 || !d2) throw new Error('parse');
    const h = (e: typeof e1) => eventHashOf('facebook', e);
    expect(h(e1)).toBe(h(e1again));
    expect(h(e1)).not.toBe(h(e2));
    expect(h(d1)).not.toBe(h(d2));
    expect(h(e1)).not.toBe(h(d1));
  });

  it('FR-048 serialize/deserialize khứ hồi giữ occurredAt (sửa và xóa)', () => {
    for (const verb of ['edited', 'remove'] as const) {
      const event = at(1_762_000_100, verb);
      if (!event) throw new Error('parse');
      expect(deserializeEvent(JSON.parse(JSON.stringify(serializeEvent(event))))).toEqual(event);
    }
  });
});

describe('FR-048 chịu được entry.time lạ và hai lần sửa cùng giây', () => {
  it('FR-048 entry.time tính bằng MILI-GIÂY (Messenger dùng chung object=page) KHÔNG làm mất cả lô; entry feed cùng lô vẫn được xử lý', () => {
    const events = parseMetaWebhook({
      object: 'page',
      entry: [
        { id: PAGE_ID, time: 1_762_000_000_000, changes: [{ field: 'messages', value: {} }] },
        { id: PAGE_ID, time: 1_762_000_100, changes: [commentChange({ verb: 'edited' })] },
        {
          id: PAGE_ID,
          time: 1_762_000_200_000,
          changes: [commentChange({ verb: 'remove', comment_id: 'c-ms' })],
        },
        {
          id: PAGE_ID,
          time: 'hom-qua',
          changes: [commentChange({ verb: 'edited', comment_id: 'c-bad' })],
        },
      ],
    });
    expect(events.map((e) => e.kind)).toEqual([
      'comment_edited',
      'comment_deleted',
      'comment_edited',
    ]);
    const [first, second, third] = events;
    expect(first && 'occurredAt' in first ? first.occurredAt?.getTime() : null).toBe(
      1_762_000_100_000,
    );
    // mili-giây được nhận diện và chuẩn hóa về cùng đơn vị
    expect(second && 'occurredAt' in second ? second.occurredAt?.getTime() : null).toBe(
      1_762_000_200_000,
    );
    // time không phải số → bỏ occurredAt nhưng KHÔNG bỏ sự kiện
    expect(third).not.toHaveProperty('occurredAt');
  });

  it('FR-048 hai lần sửa cùng bình luận trong CÙNG giây nhưng nội dung khác → hash KHÁC; cùng nội dung → cùng hash; hash không chứa nội dung', () => {
    const edit = (message: string) =>
      parseMetaWebhook({
        object: 'page',
        entry: [
          {
            id: PAGE_ID,
            time: 1_762_000_100,
            changes: [commentChange({ verb: 'edited', message })],
          },
        ],
      })[0];
    const a = edit('Giá bao nhiêu?');
    const b = edit('Còn hàng không?');
    const a2 = edit('Giá bao nhiêu?');
    if (!a || !b || !a2) throw new Error('parse');
    expect(eventHashOf('facebook', a)).not.toBe(eventHashOf('facebook', b));
    expect(eventHashOf('facebook', a)).toBe(eventHashOf('facebook', a2));
    expect(eventHashOf('facebook', a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('FR-048 entry.time ngoài khoảng', () => {
  it('FR-048 time âm / quá lớn → bỏ occurredAt, KHÔNG bỏ sự kiện', () => {
    for (const time of [-5, 9e15, 1.5]) {
      const [event] = parseMetaWebhook({
        object: 'page',
        entry: [{ id: PAGE_ID, time, changes: [commentChange({ verb: 'edited' })] }],
      });
      expect(event?.kind).toBe('comment_edited');
      expect(event).not.toHaveProperty('occurredAt');
    }
  });
});
