import { describe, it, expect } from "vitest";
import { formatRelativeDate } from "../src/format.js";

describe("formatRelativeDate", () => {
  const now = new Date("2026-07-26T12:00:00Z");

  it("returns 'Today' for the same day", () => {
    expect(formatRelativeDate("2026-07-26T09:00:00Z", now)).toBe("Today");
  });

  it("returns 'Yesterday' for exactly one day ago", () => {
    expect(formatRelativeDate("2026-07-25T09:00:00Z", now)).toBe("Yesterday");
  });

  it("returns 'N days ago' for 2-29 days ago", () => {
    expect(formatRelativeDate("2026-07-20T09:00:00Z", now)).toBe("6 days ago");
  });

  it("returns a formatted date for 30+ days ago", () => {
    expect(formatRelativeDate("2026-05-01T09:00:00Z", now)).toBe("May 1, 2026");
  });
});
