import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Where the sign-in email link lands. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    const db = await createClient();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/garden", url.origin));
  }
  return NextResponse.redirect(new URL("/?error=link", url.origin));
}
