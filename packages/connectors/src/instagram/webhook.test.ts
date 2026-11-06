import { describe, expect, it } from 'vitest';
import { signMetaBody } from '../facebook/webhook';
import { APP_SECRET, COMMENT_ID, IG_ID, MEDIA_ID, WEBHOOK_COMMENT } from './fixtures';
import { parseInstagramWebhook } from './webhook';

const clone = <T>(v: T): T => structuredClone(v);

describe('FR-013 parseInstagramWebhook', () => {
  it('bình luận mới → comment_created, thời điểm lấy từ entry.time, cấp 1 (không cha)', () => {
    const [event] = parseInstagramWebhook(WEBHOOK_COMMENT);
    expect(event).toMatchObject({ kind: 'comment_created', channelExternalId: IG_ID });
    if (event?.kind !== 'comment_created') throw new Error('sai loại');
    expect(event.comment).toMatchObject({
      externalId: COMMENT_ID,
      postExternalId: MEDIA_ID,
      parentExternalId: null,
      authorExternalId: '17841411111111111',
      authorName: 'khach_a',
      isFromPage: false,
    });
    expect(event.comment.createdAt.toISOString()).toBe('2025-11-05T03:00:00.000Z');
  });

  it('có parent_id → trả lời lồng; từ chính tài khoản IG → isFromPage (chống vòng lặp)', () => {
    const body = clone(WEBHOOK_COMMENT);
    const value = body.entry[0]?.changes[0]?.value as Record<string, unknown>;
    value.parent_id = '17800000000000777';
    value.from = { id: IG_ID, username: 'shop_demo' };
    const [event] = parseInstagramWebhook(body);
    if (event?.kind !== 'comment_created') throw new Error('sai loại');
    expect(event.comment.parentExternalId).toBe('17800000000000777');
    expect(event.comment.isFromPage).toBe(true);
  });

  it('bỏ: sai object, field khác, thiếu id/from/text, thiếu entry.time, cấu trúc sai', () => {
    const wrongObject = { ...clone(WEBHOOK_COMMENT), object: 'page' };
    const otherField = clone(WEBHOOK_COMMENT);
    (otherField.entry[0] as { changes: { field: string }[] }).changes[0]!.field = 'mentions';
    const noTime = clone(WEBHOOK_COMMENT);
    delete (noTime.entry[0] as { time?: number }).time;
    const noFrom = clone(WEBHOOK_COMMENT);
    const noFromValue = noFrom.entry[0]?.changes[0]?.value as { from?: unknown } | undefined;
    if (noFromValue) delete noFromValue.from;
    for (const body of [
      wrongObject,
      otherField,
      noTime,
      noFrom,
      null,
      'x',
      {},
      { object: 'instagram' },
    ]) {
      expect(parseInstagramWebhook(body)).toEqual([]);
    }
  });

  it('thiếu username/text vẫn nhận (text rỗng, không authorName)', () => {
    const body = clone(WEBHOOK_COMMENT);
    const value = body.entry[0]?.changes[0]?.value as Record<string, unknown>;
    value.from = { id: '17841411111111111' };
    delete value.text;
    const [event] = parseInstagramWebhook(body);
    if (event?.kind !== 'comment_created') throw new Error('sai loại');
    expect(event.comment.text).toBe('');
    expect(event.comment).not.toHaveProperty('authorName');
  });

  it('chữ ký webhook Meta dùng chung (X-Hub-Signature-256) — chữ ký đúng khớp thân thô', () => {
    const raw = Buffer.from(JSON.stringify(WEBHOOK_COMMENT));
    expect(signMetaBody(raw, APP_SECRET)).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});
