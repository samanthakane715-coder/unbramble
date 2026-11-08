"use client";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { Profile, Theme } from "@/lib/types";

const THEMES: { id: Theme; name: string; about: string; swatches: string[] }[] = [
  { id: "earth", name: "Earth", about: "Lichen, moss and lilac", swatches: ["#eaeee3", "#5b7a4a", "#b48cc8", "#e3be45"] },
  { id: "dusk", name: "Dusk", about: "A night garden with fireflies", swatches: ["#17211c", "#8fb07a", "#d2b4e6", "#f2d86b"] },
  { id: "dazzle", name: "Dazzle", about: "Blush, magenta, gold and glitter", swatches: ["#fbe9f1", "#d6338a", "#e9b949", "#b892ff"] },
];

const ZONES = [
  "America/Los_Angeles", "America/Denver", "America/Phoenix", "America/Chicago", "America/New_York",
  "America/Anchorage", "Pacific/Honolulu", "Europe/London", "Europe/Lisbon", "Europe/Paris", "Asia/Bangkok", "Asia/Tokyo",
];

export function SettingsForm({ profile, email, smsNumber }: { profile: Profile; email: string; smsNumber: string | null }) {
  const db = useMemo(() => createClient(), []);
  const [theme, setTheme] = useState(profile.theme);
  const [tz, setTz] = useState(profile.timezone);
  const [code, setCode] = useState(profile.link_code);
  const [phone, setPhone] = useState(profile.phone);
  const [saved, setSaved] = useState<string | null>(null);

  async function chooseTheme(t: Theme) {
    setTheme(t);
    document.documentElement.dataset.theme = t;
    const { error } = await db.from("profiles").update({ theme: t }).eq("id", profile.id);
    setSaved(error ? "Couldn't save your theme. Try again." : `${THEMES.find((x) => x.id === t)?.name} saved.`);
  }

  async function chooseZone(z: string) {
    setTz(z);
    const { error } = await db.from("profiles").update({ timezone: z }).eq("id", profile.id);
    setSaved(error ? "Couldn't save your time zone." : "Time zone saved.");
  }

  async function newCode() {
    const { data } = await db.rpc("new_link_code");
    if (data) setCode(data as string);
  }

  async function unlink() {
    await db.rpc("unlink_phone");
    setPhone(null);
    setSaved("Phone disconnected.");
  }

  return (
    <div className="panel">
      <section aria-labelledby="h-look">
        <h2 id="h-look">Look</h2>
        <div className="themes">
          {THEMES.map((t) => (
            <button key={t.id} className="theme-opt" aria-pressed={theme === t.id} onClick={() => chooseTheme(t.id)}>
              <span className="swatches" aria-hidden="true">{t.swatches.map((s) => <span key={s} style={{ background: s }} />)}</span>
              <strong>{t.name}</strong>
              <span className="hint" style={{ margin: 0 }}>{t.about}</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="h-text">
        <h2 id="h-text">Text to capture</h2>
        {phone ? (
          <>
            <p>Texts from {phone} go straight into your garden{smsNumber ? <> when you send them to <strong>{smsNumber}</strong></> : null}.</p>
            <button className="btn quiet" style={{ justifySelf: "start" }} onClick={unlink}>Disconnect this phone</button>
          </>
        ) : smsNumber ? (
          <>
            <p>From your phone, text this to <strong>{smsNumber}</strong>:</p>
            <span className="code">JOIN {code}</span>
            <button className="linklike" style={{ justifySelf: "start" }} onClick={newCode}>Get a new code</button>
          </>
        ) : (
          <p>Texting in isn&apos;t switched on yet. Once a Twilio number is added, your connect code appears here.</p>
        )}
      </section>

      <section aria-labelledby="h-time">
        <h2 id="h-time">Time zone</h2>
        <p>Used to work out when “tomorrow at 9” is.</p>
        <label className="field">
          <span className="visually-hidden">Time zone</span>
          <select value={tz} onChange={(e) => chooseZone(e.target.value)}>
            {(ZONES.includes(tz) ? ZONES : [tz, ...ZONES]).map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </select>
        </label>
      </section>

      <section aria-labelledby="h-acct">
        <h2 id="h-acct">Account</h2>
        <p>Signed in as {email}.</p>
        <form action="/auth/signout" method="post">
          <button className="btn quiet">Sign out</button>
        </form>
      </section>

      <p aria-live="polite" className="hint">{saved}</p>
    </div>
  );
}
