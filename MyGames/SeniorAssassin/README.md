# Senior Assassin

Mobile-first clothespin elimination game for fewer than 30 players. Static frontend for GitHub Pages, Supabase SQL + Edge Function backend.

**The packaged `index.html` is self-contained:** its styles and frontend JavaScript are embedded, so opening or copying that file alone still displays the full visual design. The separate `style.css`, `app.css`, `game.js`, and `config.js` are editable source files. After making source changes, run `node build-single-file.mjs` to regenerate `index.html`.

The signed-in interface has four sections: **Home** (concealed target with a reveal/hide button and elimination submission), **Players** (complete roster with survival status and kills), **History** (confirmed photo feed and your pending claims), and **Rules**. On phones, navigation is fixed at the bottom.

## Deployment

1. In your existing **Games** Supabase project, open SQL Editor and run `supabase/schema.sql`. This creates only `sa_` prefixed tables and a `sa-photos` bucket.
2. Deploy the Edge Function `supabase/functions/senior-assassin/index.ts` under the name `senior-assassin` using the Supabase CLI with `--no-verify-jwt` (the custom session handling is implemented inside the function). Its runtime requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (normally provided by hosted Supabase) and a separately configured secret `SA_ADMIN_PASSWORD`. Choose a strong unique admin password. The special login name is `Game Master`. Never place it in the frontend.
3. Edit `config.js` to use your project URL and deployed function URL.
4. Copy the entire `SeniorAssassin` directory into the root of your existing `GameSite` repository, commit, and push. Link `/GameSite/SeniorAssassin/` from your homepage.
5. Set the private invitation code in the SQL Editor before distributing the link:

   ```sql
   update public.sa_settings set invite_code = 'REPLACE_WITH_YOUR_OWN_PRIVATE_CODE' where id = 1;
   ```

6. Registration is open until **Sunday, November 15, 2026 at 12:00 PM Eastern**. At the first website request at or after that time, the backend starts the game and assigns targets automatically (minimum 3 registered players). Registration then disappears from the website.

### Commands from your Windows/WSL terminal

Copy this project's `supabase` folder into a dedicated `~/senior-assassin-server` directory. From there:

```bash
npx supabase login
npx supabase link --project-ref joqypdrkojtinlflbvur
npx supabase secrets set SA_ADMIN_PASSWORD='CHOOSE_A_NEW_PRIVATE_ADMIN_PASSWORD'
npx supabase functions deploy senior-assassin --no-verify-jwt
```

Replace the example secret before running it. Do not reuse a password from another site. For extra privacy, set the secret interactively or remove the entered shell command from your shell history afterward. The Supabase CLI may ask to confirm the target project.

## Rules and caveats

- Players register using unique full names and a password. The chosen password is saved in `sa_players.password_plain` so the game master can export an account-recovery list. **This is intentionally insecure**. All participants must use throwaway passwords not used for any other service. Do not upload the export to GitHub. The table is not directly exposed to public clients; only the Edge Function uses the service-role key.
- A private invite code is required to register. Set it before you invite players.
- Log in from the ordinary Log in tab with full name `Game Master` and the `SA_ADMIN_PASSWORD` secret. The Home tab then becomes the organizer console: create/edit/pin/delete announcements, set the invitation code, resolve disputes and perform exceptional player removals. Click Unlock Game Data and re-enter your organizer password to reveal every assignment, who is targeting whom, and each player’s readable password; you can export a private `.txt` list. Lock it afterward. Do not share the file or commit it.
- No attempts in the Shrine, on the Shrine lawn or patio, or in CATS. No pursuing players into private homes, particularly opposite-gender residences, or other invasive/dangerous behavior.
- A successful elimination requires confirmation from the target or an admin. Only confirmed eliminations change the assignment chain.
- The 30-second chase is a real-world rule; the site can provide a local stopwatch, but cannot adjudicate physical events. The 30-minute cooldown is set when a target reports a failed attempt, or by an admin.
- A daily accusation can be made against another living player. Correct accusation disables the pursuer for 24 hours; incorrect accusation consumes the daily use. The accused assassin is revealed only to the accuser upon a correct accusation.
- Players must follow local rules, respect safe zones, never grab or restrain others, and stop on request.

## Security and privacy

- The site's JavaScript contains no service key. The server verifies session tokens and authorization for every sensitive operation.
- Password recovery export and admin actions require the game master's separate password/session.
- Images are stored in a private bucket and read using signed links issued by the server to authenticated participants.
- This is a small private-game implementation, not a production-grade public identity platform. If opening to the public, replace the custom login with managed Supabase Auth.

## Local test

Serve the `SeniorAssassin` directory with a static HTTP server (`python3 -m http.server 8080`) and open `http://localhost:8080`. Backend operations require a deployed Edge Function.

## Upgrade notes

This schema adds `sa_announcements` and moves a registering game to Sunday noon Eastern. Run the complete `schema.sql` in Supabase SQL Editor before deploying the updated function. Your existing `sa_` tables are preserved. Only the Senior Assassin Edge Function is replaced. Because the readable-password feature was explicitly requested, accounts carry a privacy risk despite being invite-only: tell players to use unique throwaway passwords, and keep the admin export offline.
