# ClueBugle v6.2 — Gemini postgame review and release sequence

## This update

- After **every completed solo game**, Gemini reviews every RED-team round, including the human's clue-giving turns and their AI teammate's guesses, or the AI's clues and the human's guesses.
- Each round identifies likely/recorded targets, how strong each connection was, mistakes, misleading alternatives, and a specific suggestion. Wrong guesses are called out explicitly.
- Ratings out of 100 are **subjective model judgements**, not calibrated probabilities. If the human supplied the clue, intended targets are *inferred* since they were not recorded.
- Gemini only receives the full hidden key for this postgame request **after the game ends**; regular guesser decisions still exclude hidden colors.
- Adds one Gemini call per finished solo match (more free-tier quota consumption). If the call fails, the original local postgame report remains.

## Deploy the new Gemini function (do this FIRST)

From the extracted `cluebugle` folder in Ubuntu:

```bash
npx supabase functions deploy cluebugle-ai --remote=joqypdrkojtinlflbvur --no-verify-jwt
```

Then copy the updated browser files (`index.html`, `app.js`, `analysis.js`, `gemini-client.js`) into your portfolio's `MyGames/ClueBugle/`. Use a new browser hard refresh. Do not overwrite unrelated changes to Sneaky Stalin.

## Verify ClueBugle multiplayer BEFORE publishing an invitation link

**Gemini AI being live does NOT mean multiplayer is configured.** Multiplayer needs `public.cluebugle_rooms` and a separate `cluebugle` function.

1. In the **Games** project's SQL Editor, inspect whether `public.cluebugle_rooms` exists. If not, run `supabase/schema.sql` from this package. This only creates the ClueBugle table and its policy.
2. Deploy the separate function:

   ```bash
   npx supabase functions deploy cluebugle --remote=joqypdrkojtinlflbvur --no-verify-jwt
   ```
3. Run `python3 scripts/verify_multiplayer.py` (uses the live production endpoint and creates a disposable test room). It tests room creation, joining, private Spymaster keys, clue submission and guesses. It leaves a small test room record in the database.
4. In your deployed site, open **Play Online → Supabase connection settings**. Enter **Project URL** `https://joqypdrkojtinlflbvur.supabase.co` and the **publishable/anon key** from the Supabase Games dashboard. This is the public client key, **never** a service-role key or Gemini key. Each browser needs configuration unless you later embed the public connection settings.
5. Test in two separate browsers/devices with a full four-player setup and a complete match. The server requires one Spymaster and one Guesser on each team. Its simple polling is not yet a load test.

**Caution:** The current multiplayer code uses unauthenticated room codes and bearer session tokens; it is functional for casual rooms, but deserves further security and abuse review before a large public launch. The solo house-rule "carry missed guesses" is not standard multiplayer gameplay.

## Coordinated portfolio release — DO NOT PUSH UNTIL ALL THREE ARE VERIFIED

- **ClueBugle:** Deploy Gemini review function and browser update; finish multiplayer smoke test.
- **Sneaky Stalin:** Confirm the newest local `MyGames/SneakyStalin` code and matching `match` function are the versions you intend to ship. Do not overwrite local changes with an older archive.
- **Senior Assassin:** Use the latest `SeniorAssassin.zip`. Its `supabase/schema.sql` and `senior-assassin` Edge Function must be deployed separately, and its sensitive organizer secret and invite code set in Supabase. Its published URL is intended to be `/GameSite/SeniorAssassin/`. Registration cutoff from that package: **November 13, 2026 at 8 AM Eastern**. Test registration and login before the cutoff.
- **Homepage layout:** Make Senior Assassin a **full-width feature card spanning all 3 columns** at the top, then retain your chosen 3-column game order below it (A House Divided, Sneaky Stalin, TallyGrid, ClueBugle, 1805, Somme, Games of History, MuggerHugger, Budget Slasher, then centered Cribbage and Trivia). Keep the featured card responsive to 1-column mobile layouts. Do not move the first three games out of their relative order.
- Only stage/commit the intended files, run `git diff --check`, test all target links, and then push once.

The archived Assassin site and Sneaky Stalin code are not automatically deployed by this ZIP. A successful ClueBugle test is **not** confirmation either of those backends is live.
