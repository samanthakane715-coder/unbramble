import Link from "next/link";

export function TopBar({ current }: { current?: "garden" | "album" | "settings" }) {
  return (
    <header className="topbar">
      <Link href={current ? "/garden" : "/"} className="wordmark">Unbramble</Link>
      {current && (
        <nav className="nav" aria-label="Main">
          <Link href="/garden" aria-current={current === "garden" ? "page" : undefined}>Garden</Link>
          <Link href="/album" aria-current={current === "album" ? "page" : undefined}>Album</Link>
          <Link href="/settings" aria-current={current === "settings" ? "page" : undefined}>Settings</Link>
        </nav>
      )}
    </header>
  );
}
