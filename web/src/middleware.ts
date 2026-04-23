import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Routes that require authentication (student-facing) */
const PROTECTED_PREFIXES = [
  "/study",
  "/api/dashboard",
  "/api/quiz",
  "/api/flashcards",
  "/api/session",
  "/api/study-plan/today",
  "/api/study-plan/[id]/student-update",
  "/api/exam/",
  "/api/mastery",
  "/api/suggestions",
  "/api/exam-calendar",
  "/api/weekly-summary",
  "/api/papers/exposure",
];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip non-protected routes
  if (!isProtectedRoute(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // Refresh session (important: prevents token expiry)
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // API routes: return 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Not authenticated", code: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }
    // Page routes: let through — client-side auth context handles redirect
    return response;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image (static files)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
