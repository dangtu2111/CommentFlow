import { describe, expect, it } from 'vitest';
import { getMessages } from '../i18n/messages';
import { noticeVariant, PUBLISH_NOTICES, parsePublishNotice } from './publish-notice';

describe('parsePublishNotice', () => {
  it('chỉ nhận mã đã biết; mảng lấy phần tử đầu; còn lại → null (không bao giờ in chuỗi tự do)', () => {
    expect(parsePublishNotice('saved')).toBe('saved');
    expect(parsePublishNotice(['scheduled', 'x'])).toBe('scheduled');
    for (const bad of [undefined, '', 'hack', '<script>', 'SAVED']) {
      expect(parsePublishNotice(bad), String(bad)).toBeNull();
    }
  });
});

describe('noticeVariant', () => {
  it('thành công → success; thao tác bị từ chối do dữ liệu/cờ → warning; lỗi hệ thống/quyền → danger', () => {
    expect(noticeVariant('scheduled')).toBe('success');
    expect(noticeVariant('publish_disabled')).toBe('warning');
    expect(noticeVariant('invalid_schedule')).toBe('warning');
    expect(noticeVariant('forbidden')).toBe('danger');
    expect(noticeVariant('unavailable')).toBe('danger');
  });
});

describe('mọi mã thông báo đều có chữ ở vi và en', () => {
  it('composer.notice.<mã> không rỗng', () => {
    for (const locale of ['vi', 'en'] as const) {
      const notice = (getMessages(locale) as { composer: { notice: Record<string, string> } })
        .composer.notice;
      for (const code of PUBLISH_NOTICES) expect(notice[code], `${locale}:${code}`).toBeTruthy();
    }
  });
});

describe('isSuccessNotice (lỗi ở lại trang, giữ dữ liệu)', () => {
  it('thành công → chuyển trang; lỗi/cảnh báo → ở lại', async () => {
    const { isSuccessNotice } = await import('./publish-notice');
    for (const ok of ['saved', 'scheduled', 'publishing'] as const)
      expect(isSuccessNotice(ok)).toBe(true);
    for (const bad of [
      'unavailable',
      'forbidden',
      'invalid_schedule',
      'rate_limited',
      'publish_disabled',
    ] as const)
      expect(isSuccessNotice(bad)).toBe(false);
  });
});
