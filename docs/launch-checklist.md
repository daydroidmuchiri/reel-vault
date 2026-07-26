# Reel Vault Launch Checklist

Everything code-side is built. These are the manual steps only Daniel can do (accounts, credentials, spend).

## 1. Supabase + edge function

- [ ] Follow `docs/supabase-setup.md` end to end.
- [ ] Confirm `src/config.js` has real values (no `REPLACE_WITH_...` placeholders left).

## 2. Local end-to-end check (with real credentials)

- [ ] `npm run dev`, unlock with your chosen passcode, paste a real Instagram reel URL **with a quick note about what it's about**, submit.
- [ ] Confirm the reel appears in the feed with a summary and a viability score within a few seconds, and that it's NOT flagged "Needs review" (a note-backed analysis should succeed cleanly).
- [ ] Submit another reel with the note field left blank — confirm it still saves, with an honest "couldn't determine" summary and a "Needs review" badge (Instagram's caption fetch doesn't work in practice; this is expected, not a bug).
- [ ] Confirm the Tools tab shows any tools mentioned in that reel, and that searching by name/category filters correctly.
- [ ] Paste an obviously-wrong URL (e.g. a TikTok link) and confirm you get a clear inline error, not a crash.

## 3. Deploy the frontend

- [ ] `npm run build`, then deploy `dist/` to Netlify or Vercel (same flow as `video-to-food`).
- [ ] Open the production URL on your phone, confirm the passcode screen appears, and "Add to Home Screen" works (manifest is wired).

## 4. Ongoing use

- [ ] Save a batch of real reels from your Saved collection to confirm the flow holds up across different content types (business ideas vs. tool roundups vs. neither).
