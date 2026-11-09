/**
 * Texting through SignalWire's Compatibility API.
 * No SDK: sending is one HTTP call, and signature checks match SignalWire's own validator
 * (HMAC-SHA1 over the webhook URL + sorted form params, base64; header X-SignalWire-Signature).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const env = () => ({
  project: process.env.SIGNALWIRE_PROJECT_ID,
  token: process.env.SIGNALWIRE_API_TOKEN,
  space: process.env.SIGNALWIRE_SPACE_URL?.replace(/^https?:\/\//, "").replace(/\/$/, ""),
  signingKey: process.env.SIGNALWIRE_SIGNING_KEY,
  number: process.env.SIGNALWIRE_PHONE_NUMBER,
});

/** The number people text, for showing in Settings. */
export function smsNumber(): string | null {
  return env().number ?? null;
}

/** True when we can send texts. */
export function canSend(): boolean {
  const e = env();
  return !!(e.project && e.token && e.space && e.number);
}

/** Send one text. Returns true when SignalWire accepted it. */
export async function sendSms(to: string, body: string): Promise<boolean> {
  const e = env();
  if (!e.project || !e.token || !e.space || !e.number) return false;
  try {
    const res = await fetch(
      `https://${e.space}/api/laml/2010-04-01/Accounts/${encodeURIComponent(e.project)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${e.project}:${e.token}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ From: e.number, To: to, Body: body }),
      }
    );
    if (!res.ok) console.error("SignalWire send failed", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (err) {
    console.error("SignalWire send error", err);
    return false;
  }
}

/** A reply to an incoming text, in the XML format SignalWire expects back. */
export function replyXml(message: string): Response {
  const esc = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${esc}</Message></Response>`;
  return new Response(xml, { headers: { "Content-Type": "text/xml" } });
}

function expectedSignature(key: string, url: string, params: Record<string, string>) {
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", key).update(Buffer.from(data, "utf-8")).digest("base64");
}

/** SignalWire may sign the URL with or without the default port, so check both. */
function urlVariants(url: string) {
  const u = new URL(url);
  const without = u.toString();
  if (u.port) return [without];
  const port = u.protocol === "https:" ? "443" : "80";
  const withPort = `${u.protocol}//${u.host}:${port}${u.pathname}${u.search}${u.hash}`;
  return [without, withPort];
}

function same(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Check an incoming webhook really came from SignalWire.
 * Uses the project's Signing Key (Dashboard → API Credentials). Older projects sign with the
 * API token instead, so that is accepted as a fallback.
 */
export function verifySignature(signature: string, url: string, params: Record<string, string>): boolean {
  const e = env();
  const keys = [e.signingKey, e.token].filter(Boolean) as string[];
  if (!signature || !keys.length) return false;
  return keys.some((k) => urlVariants(url).some((v) => same(signature, expectedSignature(k, v, params))));
}

export function canReceive(): boolean {
  const e = env();
  return !!((e.signingKey || e.token) && process.env.NEXT_PUBLIC_SITE_URL);
}
