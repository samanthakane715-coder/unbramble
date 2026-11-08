import type { Metadata, Viewport } from "next";
import { createClient } from "@/lib/supabase/server";
import "@fontsource/young-serif/400.css";
import "@fontsource-variable/figtree/index.css";
import "@fontsource/playfair-display/400-italic.css";
import "@fontsource/playfair-display/400.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Unbramble",
  description: "Text what's on your mind. Unbramble sorts it, and your garden grows as you tend it.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  let theme: string | undefined;
  if (user) {
    const { data } = await db.from("profiles").select("theme").eq("id", user.id).single();
    theme = data?.theme ?? "earth";
  }

  return (
    <html lang="en" data-theme={theme}>
      <body>{children}</body>
    </html>
  );
}
