import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Check if Clerk keys are properly configured
const hasClerkKeys =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_') &&
  process.env.CLERK_SECRET_KEY?.startsWith('sk_') &&
  !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.includes('placeholder');

// Rate limiting (per-user when authenticated, per-IP when not)
const WINDOW_MS = 60_000;
const MAX_REQUESTS_FREE = 200;
const MAX_REQUESTS_AUTHENTICATED = 600;

const hits = new Map<string, { count: number; resetAt: number }>();

let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < WINDOW_MS) return;
  lastCleanup = now;
  for (const [key, entry] of hits) {
    if (now > entry.resetAt) {
      hits.delete(key);
    }
  }
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function rateLimit(key: string, maxRequests: number): NextResponse | null {
  cleanup();

  const now = Date.now();
  let entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    hits.set(key, entry);
  }

  entry.count++;

  if (entry.count > maxRequests) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      },
    );
  }

  return null;
}

// Dev-mode middleware (no Clerk)
function devMiddleware(request: NextRequest): NextResponse {
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/mind') ||
    request.nextUrl.pathname.startsWith('/api/user');

  if (isApiRoute) {
    const rateLimitKey = `ip:${getClientIp(request)}`;
    const rateLimitResponse = rateLimit(rateLimitKey, MAX_REQUESTS_FREE);
    if (rateLimitResponse) return rateLimitResponse;
  }

  return NextResponse.next();
}

// Dynamically export middleware based on Clerk availability
let middleware: (request: NextRequest) => NextResponse | Promise<NextResponse>;

if (hasClerkKeys) {
  // Use dynamic import pattern — Clerk middleware loaded only when keys exist
  const { clerkMiddleware, createRouteMatcher } = await import('@clerk/nextjs/server');

  const isPublicRoute = createRouteMatcher([
    '/',
    '/thoughts',
    '/system',
    '/openclaw',
    '/sign-in(.*)',
    '/sign-up(.*)',
    '/api(.*)',
  ]);

  const isApiRoute = createRouteMatcher(['/api/mind(.*)', '/api/user(.*)']);

  middleware = clerkMiddleware(async (auth, request) => {
    const { userId } = await auth();

    // Rate limit API routes (auth handled by route handlers themselves)
    if (isApiRoute(request)) {
      const rateLimitKey = userId ?? `ip:${getClientIp(request as NextRequest)}`;
      const maxRequests = userId ? MAX_REQUESTS_AUTHENTICATED : MAX_REQUESTS_FREE;
      const rateLimitResponse = rateLimit(rateLimitKey, maxRequests);
      if (rateLimitResponse) return rateLimitResponse;
    }

    // Only protect page routes — API routes handle their own auth
    if (!isPublicRoute(request)) {
      await auth.protect();
    }
  }) as unknown as typeof middleware;
} else {
  middleware = devMiddleware;
}

export default middleware;

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
