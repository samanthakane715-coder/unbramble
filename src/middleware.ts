import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isApp = path.startsWith("/garden") || path.startsWith("/settings");

  if (isApp && !data.user) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (path === "/" && data.user) {
    return NextResponse.redirect(new URL("/garden", request.url));
  }
  return response;
}

export const config = {
  // Skip static files and the webhook/cron APIs (they authenticate themselves)
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/sms|api/cron).*)"],
};
