import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchReels, fetchTools, submitReel } from "../src/api.js";
import { CONFIG } from "../src/config.js";

describe("api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("localStorage", {
      getItem: () => "1234",
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  it("fetchReels requests the reels table ordered newest-first", async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => [{ id: "1" }] });
    const reels = await fetchReels();
    expect(reels).toEqual([{ id: "1" }]);
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(`${CONFIG.supabaseUrl}/rest/v1/reels?select=*&order=created_at.desc`);
    expect(opts.headers.apikey).toBe(CONFIG.supabaseAnonKey);
  });

  it("fetchReels throws on a non-ok response", async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(fetchReels()).rejects.toThrow("Failed to load reels: 500");
  });

  it("fetchTools requests the tools table with linked reel ids and urls", async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await fetchTools();
    const [url] = fetch.mock.calls[0];
    expect(url).toBe(
      `${CONFIG.supabaseUrl}/rest/v1/tools?select=*,reel_tools(reel_id,reels(url))&order=name.asc`,
    );
  });

  it("submitReel posts the url, stored passcode, and an empty note by default", async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ reel: { id: "1" } }) });
    const result = await submitReel("https://www.instagram.com/reel/abc");
    expect(result).toEqual({ ok: true, reel: { id: "1" } });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(CONFIG.submitReelUrl);
    const body = JSON.parse(opts.body);
    expect(body).toEqual({ url: "https://www.instagram.com/reel/abc", passcode: "1234", note: "" });
  });

  it("submitReel posts a manually-provided note when given", async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ reel: { id: "1" } }) });
    await submitReel("https://www.instagram.com/reel/abc", "5 tools every founder needs");
    const [, opts] = fetch.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.note).toBe("5 tools every founder needs");
  });

  it("submitReel returns the server error message on failure", async () => {
    fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Invalid passcode" }) });
    const result = await submitReel("https://www.instagram.com/reel/abc");
    expect(result).toEqual({ ok: false, error: "Invalid passcode" });
  });

  it("submitReel returns a network error on fetch failure", async () => {
    fetch.mockRejectedValueOnce(new Error("offline"));
    const result = await submitReel("https://www.instagram.com/reel/abc");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("offline") });
  });
});
