# ClueBugle

## Latest clue-engine revision (November 10, 2026)

### v5.0 beta review and safety fixes

- Spymaster candidate evaluation now refuses to describe an opponent or bystander as an intended target in ordinary turns. Desperate last-chance predictions are explicitly separated from friendly targets in the review.
- Earlier rounds receive greater preference for clues covering multiple safe words. The game still permits singles when the board offers no sufficiently connected group.
- Fixed misleading associations: BREAKFAST outranks DESSERT for MUFFIN; GROUND/LEVEL/FLOORING link to FLOOR instead of the vague SHAPE connection.
- Postgame report now shows numerical match scores for the intended friendly cards **and every actual guess, including wrong choices**.
- Solo selection opens a beta warning with Proceed anyway / Go back choices.
- Bumped all script version parameters to 5.0 to avoid browsers reusing cached older AI logic.

- Added a broad cross-domain association vocabulary so the spymaster can connect **actions to materials**, **materials to products**, **objects to uses**, **sciences to concepts**, **places to activities**, and other connections that don't share the same category. For example, DIG + NICKEL now supports MINE/MINING for 2.
- Association lists now distinguish central, direct meanings from weaker contextual meanings instead of treating every related word as an equally strong 93/100 connection. Clue selection still ranks *all unrevealed cards* and penalizes dangerous distractions.
- More actively evaluates safe two-card bridges when a team has had consecutive one-card clues. It does not promise a second card merely to inflate the clue number.
- Added the mining case to regression tests. Existing technology-trap, animal, fabric, pottery, and human-guessing tests continue to run, as does the full-game simulation.

This is an expanded offline knowledge graph and heuristic guesser, not a conversational language model; rare associations and difficult boards can still be missed.

A standalone browser game inspired by the classic rules of Codenames. Contains solo play against three AI agents and multiplayer rooms using a **separate** Supabase project. No npm packages are needed for the frontend.

## Play locally

Open `index.html` in a browser for Solo mode. For online multiplayer, serve the folder with `python3 -m http.server 8000` and open `http://localhost:8000`.

## Set up a separate Supabase project

1. Sign in to https://supabase.com/dashboard and choose **New project** in your existing organization. Call it `cluebugle`. It will have its own database, API URL and keys, independently of Sneaky Stalin.
2. In **SQL Editor**, paste and run `supabase/schema.sql`. The table has row-level security and no direct browser permissions.
3. Install the Supabase CLI if necessary. From the `cluebugle` folder:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_NEW_PROJECT_REF
   npx supabase functions deploy cluebugle --no-verify-jwt
   ```

   `--no-verify-jwt` is required because this game intentionally uses room-specific secret tokens instead of Supabase user accounts. **Never** put the service-role key into the browser. The Edge Function uses its server-side environment variable.

4. In your Supabase project's **Project Settings → API Keys**, copy the *publishable* key (or legacy `anon` key). In **Project Settings → Data API**, copy the project URL. In ClueBugle's Online mode, open **Supabase connection settings**, enter both, and save. These two browser credentials are public by design.
5. Test with two teams of at least two human browsers (four players minimum). Each team needs exactly one Spymaster and at least one Guesser. The room creator is Red Spymaster by default. Other players join as spectators and select seats in the lobby.

## Publish the frontend for friends

Supabase supplies the database and server function, **not static web-page hosting**. The easiest public site is Netlify, as with Sneaky Stalin:

1. Go to https://app.netlify.com/drop
2. Drag in the **`cluebugle` folder**, containing `index.html`, `app.js`, `style.css`, and `words.js` (not the zip itself). Netlify gives you a standalone public URL.
3. Open that URL, configure your Supabase Project URL and publishable key, and start playing. Each friend will need the same project URL and key in their browser unless you put the two public values into the frontend as defaults before deploying.

For friendlier joining, set your project's *public* Supabase URL and *publishable* key as the `serverURL` and `serverKey` defaults at the top of `app.js` before deploying. They are safe to expose. Never expose the `service_role` key.

## Game details

- The 5×5 board contains 9 cards for the starting team, 8 for the other, 7 bystanders, and an assassin.
- **Every finished match** displays a full-width, easy-to-read postgame report immediately beneath the board, including assassin endings. The report explains the outcome, shows remaining agents, and records AI clues, intended top guesses, danger cards and actual guesses. Expand any clue to see why the AI took that risk. Online games have human spymasters, so their report provides a match recap rather than invented AI motives.
- Teams alternate one-word clues and guesses; correct guesses allow continuation up to number+1, except a clue of zero allows unlimited guesses. A wrong guess ends the turn.
- Revealing the assassin ends the game immediately. Clearing all of a team's cards wins the game.
- Spymasters receive their private key from the server; guessers never receive unrevealed secret colors. The game server validates turns and prevents duplicate guesses.
- The curated **solo** board vocabulary now contains **900 distinct cards** across everyday subjects and themes. Solo games randomly shuffle 25 words and 9/8/7/1 secret identities, without engineering favorable associations. Online rooms use the separate server's vocabulary and require an Edge Function redeploy to change server rules.
- `semantic.js` supplies multi-sense semantic features and pretrained vectors; `clue-concepts.js` contains a larger hand-curated association graph, and `strategist.js` provides the offline group-first spymaster/guesser strategy. The included `embeddings.js` already contains MiniLM vectors for the prior vocabulary; uncovered words retain their curated semantic categories, so no Python installation is needed to play.

## Generate real semantic embeddings (one-time development step)

The public game needs no live AI API. On a development computer with internet access and Python, run from this folder:

```bash
python3 -m pip install sentence-transformers
python3 scripts/build_embeddings.py
```

This downloads the free `sentence-transformers/all-MiniLM-L6-v2` model once and produces `embeddings.js`, containing normalized 384-dimensional vectors for the current board vocabulary and possible clue words. Multiple annotated senses are embedded separately and compared with cosine similarity. The generated JS file is served with the rest of the static site; players do not download or execute the language model. Regeneration is optional, but is useful after major vocabulary expansions.

**Note:** This release already includes generated vectors. Running the build again is optional. The strategy combines curated category associations, a broadened clue inventory, centered pretrained embeddings, explicit assassin/neutral penalties, and guess-sequence simulation. Because the 25 cards and secret identities remain random, the bot cannot guarantee human-level clues or any fixed distribution of clue lengths.

To run AI smoke tests locally (Node.js required):

```bash
node scripts/test_ai.cjs 100
node scripts/test_games.cjs 20
node scripts/test_regressions.cjs
```
- At the end of a game, all previously unrevealed cards are color-coded and marked with a hollow circle so players can inspect the remaining words on both teams (and the assassin).
- Solo setup now offers **Carry missed clues forward**, enabled by default. Uncollected clue targets increase the allowed guesses next turn; earlier clues remain visible for reference. Disable this option to keep the classic number-plus-one rule. Online multiplayer remains strictly classic.
- When the other team has just one agent left, AI spymasters announce all their remaining agents in a comeback clue, even if the association is risky. AI guessers take the necessary risks instead of automatically passing.
- Solo boards draw randomly from a shuffled bag so words do not recur across nearby games. `SERVO` is omitted from new boards and from computer-generated clues.
- In solo play, **your AI teammate always uses the strongest setting**; the difficulty menu changes only the opposing team. Spymasters search candidate connections for friendly pairs and groups, estimate the full guessing sequence under different interpretations, and weigh the score gap, nearby victory, opponent cards, and assassin danger. Trailing teams accept more ambiguity and are more willing to use an extra guess. Guessers remember past clues. Human Spymasters can use any valid one-word clue, but an offline AI will not recognize every human metaphor.
- The AI accepts strictly one-word clues without spaces or hyphens in solo play. `CROSS-COUNTRY` is a useful human association for HIGHWAY and SKI, but a hyphenated phrase is not an ordinary one-word clue; candidates such as `TOURING` connect both while keeping the rule.
- Material-to-product associations are also supported. For example, `FABRIC` now connects `WOOL`, `COTTON`, and `CLOTHES`, while similar links cover wood/furniture, paper/books, flour/baking and other familiar uses of materials.
- Single remaining cards now favor clear, distinctive categories instead of loose sibling associations. For example, `FERRET` favors `PET` or `MAMMAL` over `DOG` or `CAT`, especially with `WAG` on the board. `FERRET` is not categorized as a rodent.
- The endgame review now lists **every locally recorded round with an incorrect guess**, whether a human or bot guessed it, including the guesser's model rank and relative match score. For each AI clue, expanded numerical analysis shows candidate clue utility, expected card rankings, friendly words deliberately left out, and runner-up clues. Match scores are relative associations, **not calibrated probabilities**. Online matches show mistakes available from their match logs, which may not include complete turn-by-turn history.
- A critical technology-clue scoring bug was corrected: sharing the broad `technology` tag no longer automatically gives two cards an 83/100 association. Direct everyday associations such as `KEYBOARD`→`ALPHABET` and `CAMERA`→`FOCUS` are now stronger than vague category overlap, while `COMPUTER`, `COMPUTING` and `NETWORK` clearly connect `PORT` and `SERVER`. A regression specifically tests the exact `PORT`/`SERVER` with `ALPHABET`/`FOCUS` trap scenario. Wrong-round recaps show the wrong card's match score prominently.
- **v4.5 semantic overhaul:** Association strengths now depend on the evidence type across *every* topic. Specific category words, broad multi-category concepts, and concrete analogies have different reliability and vector contributions; an indiscriminate category match is no longer scored as an almost certain clue. Curated direct relationships still take priority. Run `node scripts/test_semantic_stress.cjs` for cross-domain contrasts spanning nature, culture, medicine, travel, sports, animals, science, and technology. These semantic scores are heuristics, not a guarantee of human interpretation; novel meanings still need richer language knowledge.
- **v4.6 early multi-card clues:** The spymaster now investigates plausible second and third cards with a lower semantic floor, gives safe groups a substantial early-game reward, and more strongly penalizes nearby opponent/assassin risks. One-card clues remain available when the board offers no defensible group, especially late. The postgame analysis shows only the human team's bot clues; each collapsed clue round is labeled **All intended cards**, **Friendly swap**, or **Missed target** according to the cards actually selected. Wrong guesses still display their match scores.
- **v4.7 repeated-single correction:** The game log is newest-first, and the AI now reads it correctly to detect consecutive one-card clues. After two consecutive single-card clues while at least two friendly cards remain, it explicitly searches weaker-but-plausible safe two-card stretches before giving another single. LOCKET and SAPPHIRE now share a jewelry association; POTTERY strongly connects to VASE/CLAY/CERAMIC, and DISCOVERY strongly flags BINOCULARS as a competing guess. Regression tests cover both complaints and consecutive-clue history. This reduces streaks but cannot produce a genuinely meaningful two-card clue on every possible board.
- **v4.8 human-clue guessing:** GRAVITY now has its correct additional physics sense; PHYSICS links FORCE and GRAVITY, while RODENT points strongly to actual rodents such as GERBIL and moderately to near-neighbor SKUNK without misclassifying it as a rodent. EDIBLE/FOOD distinguish actual edible items like TOAST from cooking actions like STEAM. The guesser is less inclined to quit partway through a numbered clue when another credible distinct association remains. Dedicated regression tests reproduce all three reported human-clue failures.
- Online state refreshes approximately every 1.6 seconds. The game's server-side state is authoritative. Room tokens are saved for this tab session only; the lobby has a 30-person cap.
- The new name is **ClueBugle** throughout the frontend, project folder, server function and database schema. If you already deployed a previous server, re-deploy the new `cluebugle` function and apply the revised schema before using online mode; existing rooms on the old function are not automatically transferred. Solo mode needs no deployment.

## Known limitations

- Rules like verbal clue semantics (whether a clue is conceptually related, a compound word, or contains a disguised visible word) require ordinary player honor, as in the physical game. The program rejects exact visible-word clues and simple plurals.
- Room data is kept until manually cleaned up; for a heavily used public deployment, set a scheduled deletion policy for stale rows.
- This is classic *team gameplay*, not Codenames Duet. The AI is a rule-based local opponent, not a cloud language model.
