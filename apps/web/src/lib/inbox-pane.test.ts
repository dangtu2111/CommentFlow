import { describe, expect, it } from 'vitest';
import { buildInboxBackHref, inboxMobilePane } from './inbox-pane';

const uuid = '11111111-1111-4111-8111-111111111111';

describe('FR-040 inboxMobilePane — ngăn hiển thị trên mobile 390px', () => {
  it('FR-040 chưa chọn bình luận → hiện danh sách', () => {
    expect(inboxMobilePane({ tab: 'pending_review', sort: 'oldest', cursor: null })).toBe('list');
  });

  it('FR-040 đã chọn bình luận (?c=) → hiện chi tiết toàn màn hình', () => {
    expect(
      inboxMobilePane({ tab: 'pending_review', sort: 'oldest', cursor: null, selected: uuid }),
    ).toBe('detail');
  });
});

describe('FR-040 buildInboxBackHref — nút Quay lại danh sách', () => {
  it('FR-040 giữ tab/lọc/sắp xếp, chỉ bỏ bình luận đang chọn', () => {
    const href = buildInboxBackHref({
      tab: 'needs_human',
      platform: 'instagram',
      search: 'giá',
      sort: 'newest',
      cursor: null,
      selected: uuid,
    });
    expect(href).toContain('tab=needs_human');
    expect(href).toContain('platform=instagram');
    expect(href).toContain('sort=newest');
    expect(href).not.toContain('c=');
  });

  it('FR-040 mặc định → về đường dẫn gốc', () => {
    expect(
      buildInboxBackHref({ tab: 'pending_review', sort: 'oldest', cursor: null, selected: uuid }),
    ).toBe('/app/comments');
  });
});
