import { describe, it, expect } from "vitest";
import { getStoredPasscode, setStoredPasscode, clearStoredPasscode, isUnlocked } from "../src/auth.js";

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

describe("auth", () => {
  it("returns null when nothing is stored", () => {
    expect(getStoredPasscode(fakeStorage())).toBeNull();
  });

  it("round-trips a stored passcode", () => {
    const storage = fakeStorage();
    setStoredPasscode("1234", storage);
    expect(getStoredPasscode(storage)).toBe("1234");
  });

  it("clears a stored passcode", () => {
    const storage = fakeStorage();
    setStoredPasscode("1234", storage);
    clearStoredPasscode(storage);
    expect(getStoredPasscode(storage)).toBeNull();
  });

  it("isUnlocked reflects whether a passcode is stored", () => {
    const storage = fakeStorage();
    expect(isUnlocked(storage)).toBe(false);
    setStoredPasscode("1234", storage);
    expect(isUnlocked(storage)).toBe(true);
  });

  it("treats a missing storage backend as locked, without throwing", () => {
    expect(() => isUnlocked(undefined)).not.toThrow();
    expect(isUnlocked(undefined)).toBe(false);
  });
});
