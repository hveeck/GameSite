# ClueBugle v6.0 — Gemini setup

The user has already saved `GEMINI_API_KEY` in the Supabase Games project
`joqypdrkojtinlflbvur`. **Never put the key in the HTML or commit it.**

## Deploy AI endpoint (once)

From a terminal with Node/npm and Supabase CLI access:

1. Extract the ZIP. `cd` into the extracted `cluebugle` folder.
2. Run `npx supabase login` if necessary.
3. Run `npx supabase init` only if your folder does not already contain `supabase/config.toml`.
4. Run:

   ```bash
   npx supabase functions deploy cluebugle-ai --project-ref joqypdrkojtinlflbvur --no-verify-jwt
   ```

   This function accepts anonymous calls because the solo GitHub Pages game
   does not require players to log in. Free Gemini quota limits costs; the
   function also has best-effort worker-local request throttling. If you ever
   enable paid Gemini billing or promote this to a popular public site, add
   persistent rate limiting and authorization before doing so.

5. In Supabase, check **Edge Functions → cluebugle-ai → Logs** for errors.

## Publish site

Deploy the updated static `cluebugle` directory as the site's game files,
including new `gemini-client.js`. Do not copy `supabase/` into the public
site unless you deliberately need to publish source code. The new browser
adapter already points at the existing Games project URL.

## Smoke test

- Start solo as a guesser. The bot should generate a clue through Gemini.
- Start solo as spymaster and give `PHYSICS 2` on a board with FORCE and GRAVITY.
  The guesser should request one ranked plan, then follow it over its turn.
- Disconnect your network or exhaust your Gemini free quota. Solo should fall
  back to the old heuristic engine and show a brief notification.
- Check Supabase Edge Function logs if Gemini calls fail. A 429 generally
  indicates your free-tier request limit has been reached.

## Local tests

```bash
node scripts/test_gemini_client.cjs
node scripts/test_regressions.cjs
node scripts/test_semantic_stress.cjs
```

No actual Gemini model calls were made by the automated offline tests. Live
quality and model compatibility must be checked after function deployment.
