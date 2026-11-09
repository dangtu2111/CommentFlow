import { describe, expect, it } from 'vitest';
import { parsePolicyActionForm, policyNoticeOf } from './kb-policy-notice';

const ID = '11111111-1111-4111-8111-111111111111';
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

describe('policyNoticeOf', () => {
  it('nhận mã hợp lệ (kể cả dạng mảng), bỏ mã lạ', () => {
    expect(policyNoticeOf('approved')).toBe('approved');
    expect(policyNoticeOf(['stale', 'x'])).toBe('stale');
    expect(policyNoticeOf('hack')).toBeNull();
    expect(policyNoticeOf(undefined)).toBeNull();
  });
});

describe('parsePolicyActionForm', () => {
  it('id uuid + rev số nguyên ≥ 1; confirm chỉ khi "on"', () => {
    expect(parsePolicyActionForm(form({ id: ID, rev: '3', confirm: 'on' }))).toEqual({
      ok: true,
      id: ID,
      rev: 3,
      confirm: true,
    });
    expect(parsePolicyActionForm(form({ id: ID, rev: '1' }))).toMatchObject({ confirm: false });
  });
  it.each([
    { id: 'abc', rev: '1' },
    { id: ID, rev: '0' },
    { id: ID, rev: '1.5' },
    { id: ID, rev: 'x' },
    { rev: '1' },
  ])('form sai %j → ok=false', (fields) => {
    expect(parsePolicyActionForm(form(fields as Record<string, string>))).toEqual({ ok: false });
  });
});
