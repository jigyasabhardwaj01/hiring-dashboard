import { NextResponse, type NextRequest } from 'next/server';

// Password gate (HTTP Basic auth). The app holds candidate PII and can send email + spend AI quota,
// so it must never be publicly reachable without it. Username is ignored; the password is APP_PASSWORD.
export function checkAuth(header: string | null, password: string | undefined, isProd: boolean): { ok: boolean; status?: number; message?: string } {
  if (!password) {
    return isProd
      ? { ok: false, status: 503, message: 'APP_PASSWORD is not set. Set it in your environment variables to enable this app.' }
      : { ok: true }; // local dev: open
  }
  if (header?.startsWith('Basic ')) {
    try {
      const given = atob(header.slice(6)).split(':').slice(1).join(':');
      let diff = given.length ^ password.length;
      for (let i = 0; i < password.length; i++) diff |= (given.charCodeAt(i) || 0) ^ password.charCodeAt(i);
      if (diff === 0) return { ok: true };
    } catch {}
  }
  return { ok: false, status: 401, message: 'Password required.' };
}

export function middleware(req: NextRequest) {
  const r = checkAuth(req.headers.get('authorization'), process.env.APP_PASSWORD, process.env.NODE_ENV === 'production');
  if (r.ok) return NextResponse.next();
  return new NextResponse(r.message, {
    status: r.status,
    headers: r.status === 401 ? { 'WWW-Authenticate': 'Basic realm="Hiring Dashboard", charset="UTF-8"' } : {},
  });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
