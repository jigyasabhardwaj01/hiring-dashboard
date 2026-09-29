import { describe, expect, it } from 'vitest';
import { checkAuth } from '@/middleware';

const basic = (u: string, p: string) => 'Basic ' + btoa(`${u}:${p}`);

describe('password gate', () => {
  it('accepts the right password with any username', () => {
    expect(checkAuth(basic('anyone', 's3cret'), 's3cret', true).ok).toBe(true);
    expect(checkAuth(basic('', 's3cret'), 's3cret', true).ok).toBe(true);
  });
  it('accepts passwords containing colons', () => {
    expect(checkAuth(basic('u', 'a:b:c'), 'a:b:c', true).ok).toBe(true);
  });
  it('rejects wrong, prefix, longer, missing and malformed credentials with 401', () => {
    for (const h of [basic('u', 'wrong'), basic('u', 's3cre'), basic('u', 's3cret!'), null, 'Bearer x', 'Basic !!!notbase64']) {
      const r = checkAuth(h, 's3cret', true);
      expect(r.ok).toBe(false);
      expect(r.status).toBe(401);
    }
  });
  it('fails closed (503) in production when no password is configured', () => {
    const r = checkAuth(null, undefined, true);
    expect(r).toMatchObject({ ok: false, status: 503 });
  });
  it('is open in local development when no password is set', () => {
    expect(checkAuth(null, undefined, false).ok).toBe(true);
  });
});
