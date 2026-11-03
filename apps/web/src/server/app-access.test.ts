import type { AppPrincipal, WorkspaceMembership } from '@flow/saas-core';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES, type AppAccessOptions, decideAppAccess } from './app-access';

const principal = (over: Partial<AppPrincipal> = {}): AppPrincipal => ({
  id: 'u1',
  name: 'An',
  email: 'an@example.com',
  emailVerified: true,
  isAdmin: false,
  twoFactorEnabled: false,
  twoFactorRequired: false,
  ...over,
});
const ws = (role: 'owner' | 'staff'): WorkspaceMembership => ({
  id: 'w1',
  name: 'W',
  slug: 'w',
  role,
});

const decide = (
  p: AppPrincipal | null,
  w: WorkspaceMembership | null,
  options?: AppAccessOptions,
) => decideAppAccess({ principal: p, workspace: w, ...(options ? { options } : {}) });

describe('decideAppAccess', () => {
  it('không có phiên → /login', () => {
    expect(decide(null, null)).toEqual({ kind: 'redirect', to: APP_ROUTES.login });
  });

  it('email chưa xác minh → /login (kể cả khi mọi thứ khác ổn)', () => {
    expect(decide(principal({ emailVerified: false }), ws('staff'))).toEqual({
      kind: 'redirect',
      to: APP_ROUTES.login,
    });
  });

  it('Owner/Admin thiếu 2FA → /app/security; Staff không bị ép', () => {
    const needs = principal({ twoFactorRequired: true });
    expect(decide(needs, ws('owner'))).toEqual({ kind: 'redirect', to: APP_ROUTES.security });
    expect(
      decide(principal({ isAdmin: true, twoFactorRequired: true }), null, {
        workspace: 'optional',
      }),
    ).toEqual({ kind: 'redirect', to: APP_ROUTES.security });
    expect(decide(principal(), ws('staff'))).toEqual({ kind: 'allow' });
  });

  it('twoFactor: skip chỉ bỏ qua bước 2FA, không bỏ qua phiên/email', () => {
    const needs = principal({ twoFactorRequired: true });
    expect(decide(needs, ws('owner'), { twoFactor: 'skip' })).toEqual({ kind: 'allow' });
    expect(decide(null, null, { twoFactor: 'skip' }).kind).toBe('redirect');
    expect(decide(principal({ emailVerified: false }), null, { twoFactor: 'skip' }).kind).toBe(
      'redirect',
    );
  });

  it('Owner đã bật 2FA vào được', () => {
    expect(
      decide(principal({ twoFactorRequired: true, twoFactorEnabled: true }), ws('owner')),
    ).toEqual({ kind: 'allow' });
  });

  it('thiếu workspace: bắt buộc → màn tạo workspace; optional → cho qua', () => {
    expect(decide(principal(), null)).toEqual({ kind: 'redirect', to: APP_ROUTES.createWorkspace });
    expect(decide(principal(), null, { workspace: 'optional' })).toEqual({ kind: 'allow' });
  });

  it('sai vai trò → 404; đúng vai trò → cho qua', () => {
    expect(decide(principal(), ws('staff'), { role: 'owner' })).toEqual({ kind: 'not-found' });
    expect(decide(principal({ twoFactorEnabled: true }), ws('owner'), { role: 'owner' })).toEqual({
      kind: 'allow',
    });
  });

  it('đòi vai trò mà không có workspace (optional) → 404, không cho qua', () => {
    expect(decide(principal(), null, { workspace: 'optional', role: 'owner' })).toEqual({
      kind: 'not-found',
    });
  });

  it('thứ tự: 2FA được kiểm trước workspace', () => {
    expect(decide(principal({ twoFactorRequired: true }), null)).toEqual({
      kind: 'redirect',
      to: APP_ROUTES.security,
    });
  });
});
