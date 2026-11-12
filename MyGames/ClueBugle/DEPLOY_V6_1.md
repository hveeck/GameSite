# ClueBugle v6.1 — Gemini Risk Check

This update changes only ClueBugle's solo front end and its `cluebugle-ai` function. It does **not** modify Sneaky Stalin or other games.

## Improvements

- Removes the solo beta pop-up entirely.
- Adds Conservative / Balanced / Aggressive strategies to the solo setup screen (Balanced by default). The strategy is saved in the current browser.
- The Gemini spymaster proposes multiple legal clues. A *second, color-blind Gemini request* ranks visible card guesses for those clues. The spymaster uses secret colors **only after** that second opinion to select the best option. The verifier never sees hidden colors, intended target identities, or the secret key.
- Conservative avoids candidates whose predicted intended guesses include non-team cards. Balanced weighs safe multi-card opportunities against risk. Aggressive stretches more when appropriate. The assassin has a heavy penalty in every setting.
- Remembers the last 25 outcomes of Gemini AI clues *in this browser*, sending up to eight short examples of successes and errors with future requests. This is in-context feedback, **not** training or persistent model memory on Google's servers. Clear ClueBugle site data to reset it.
- Postgame analysis includes independent guesser rankings and risks when available.
- Retries once on certain invalid Gemini responses, but not on quota/permission errors.

## Deploy to your already-working Games Supabase project

1. Extract the ZIP, then enter `cluebugle`.
2. Ensure `GEMINI_API_KEY` is already saved as an Edge Function secret. Your previously configured `GEMINI_MODEL` remains unchanged.
3. Run:

```bash
npx supabase functions deploy cluebugle-ai --remote=joqypdrkojtinlflbvur --no-verify-jwt
```

That command deploys **only** the solo Gemini function. It does not deploy multiplayer.

## Update GitHub Pages

Copy these files into `portfolio/MyGames/ClueBugle/`:

- `index.html`
- `app.js`
- `gemini-client.js`
- `analysis.js`

Then, from the portfolio Git repository:

```bash
git add MyGames/ClueBugle/index.html MyGames/ClueBugle/app.js MyGames/ClueBugle/gemini-client.js MyGames/ClueBugle/analysis.js MyGames/ClueBugle/supabase/functions/cluebugle-ai/index.ts
git commit -m "Improve ClueBugle Gemini clue safety and solo setup"
git push origin main
```

Make sure the updated `index.ts` is copied into the portfolio backend source path before the commit. Do not publish your `GEMINI_API_KEY`.

## Testing notes

Local JS, TypeScript syntax checks and existing solo regressions passed. This package has NOT been tested with live Gemini after deploying; live behavior depends on Google's model and free-tier quota. The second opinion costs an extra Gemini request for each AI clue and can consume the free quota faster. If it fails, the game falls back to the offline AI.

## Multiplayer is separate; status not confirmed

The existing online game uses the **different** Edge Function `cluebugle` and SQL table `public.cluebugle_rooms`. Deploying `cluebugle-ai` does not deploy them. Multiplayer has not been verified live. The current browser's Online page still requires a Supabase project URL and publishable/anon key entered by the user.

To set up separately (check existing tables first, don't overwrite unrelated projects):

1. In the intended Supabase project, run the `supabase/schema.sql` SQL in the SQL Editor. The SQL creates only `cluebugle_rooms`.
2. Deploy `npx supabase functions deploy cluebugle --remote=joqypdrkojtinlflbvur --no-verify-jwt` only if you intend to use your existing Games project. It uses separate names and does not overwrite Sneaky Stalin.
3. Open the Online screen and enter the project's URL and *public publishable/anon key*, NOT any secret/service-role key.
4. Verify multiplayer by creating a room in one browser and joining in another, assigning four players (one spymaster and one guesser per team), starting a game, making a clue and a guess, and confirming synchronized state.

Security caution: the online room function uses participant tokens and server-side stored colors, but should be security-reviewed before broad public use. The Gemini AI endpoint is anonymous, with best-effort worker-local limits; durable quotas and abuse protection are recommended before increased public traffic or paid Gemini billing.
