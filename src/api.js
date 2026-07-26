import { CONFIG } from "./config.js";
import { getStoredPasscode } from "./auth.js";

export async function fetchReels() {
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/reels?select=*&order=created_at.desc`, {
    headers: { apikey: CONFIG.supabaseAnonKey, Authorization: `Bearer ${CONFIG.supabaseAnonKey}` },
  });
  if (!res.ok) throw new Error(`Failed to load reels: ${res.status}`);
  return res.json();
}

export async function fetchTools() {
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/tools?select=*,reel_tools(reel_id)&order=name.asc`, {
    headers: { apikey: CONFIG.supabaseAnonKey, Authorization: `Bearer ${CONFIG.supabaseAnonKey}` },
  });
  if (!res.ok) throw new Error(`Failed to load tools: ${res.status}`);
  return res.json();
}

export async function submitReel(url) {
  const passcode = getStoredPasscode();
  let res;
  try {
    res = await fetch(CONFIG.submitReelUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, passcode }),
    });
  } catch (err) {
    return { ok: false, error: `Network error: ${err.message}` };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: body.error || `Request failed: ${res.status}` };
  }
  return { ok: true, reel: body.reel };
}
