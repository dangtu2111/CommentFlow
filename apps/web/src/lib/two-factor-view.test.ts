import { describe, expect, it } from 'vitest';
import { showEnableFlow } from './two-factor-view';

describe('showEnableFlow', () => {
  it('chưa bật → luồng bật', () => {
    expect(showEnableFlow({ enabled: false, enrolling: false })).toBe(true);
  });
  it('đã bật và không trong phiên bật → màn quản lý', () => {
    expect(showEnableFlow({ enabled: true, enrolling: false })).toBe(false);
  });
  it('hồi quy: vừa bật xong (enabled=true) nhưng còn trong phiên bật → giữ luồng bật để hiện mã dự phòng', () => {
    expect(showEnableFlow({ enabled: true, enrolling: true })).toBe(true);
  });
});
