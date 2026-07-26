// UI-level gate only: hides the app until a value is entered. The real
// check happens server-side in the submit-reel edge function before any
// paid Claude call runs. See docs/superpowers/plans — Global Constraints.
const STORAGE_KEY = "reel-vault-passcode";

function resolveStorage(storage) {
  return storage ?? (typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null);
}

export function getStoredPasscode(storage) {
  const backend = resolveStorage(storage);
  return backend ? backend.getItem(STORAGE_KEY) : null;
}

export function setStoredPasscode(passcode, storage) {
  const backend = resolveStorage(storage);
  if (backend) backend.setItem(STORAGE_KEY, passcode);
}

export function clearStoredPasscode(storage) {
  const backend = resolveStorage(storage);
  if (backend) backend.removeItem(STORAGE_KEY);
}

export function isUnlocked(storage) {
  return Boolean(getStoredPasscode(storage));
}
