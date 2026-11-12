ClueBugle Gemini JSON parsing fix

Fixes the fallback triggered by:
Unexpected non-whitespace character after JSON at position ...

Extract contents into the root of the existing ClueBugle v6 folder, preserving
supabase/functions/cluebugle-ai/index.ts, then redeploy that one function.

From WSL:
cd ~/cluebugle-v6/cluebugle
unzip -o /mnt/c/Users/hveec/Downloads/ClueBugle_Gemini_JSON_Fix.zip
npx supabase functions deploy cluebugle-ai --remote=joqypdrkojtinlflbvur --no-verify-jwt

Also copy the updated index.ts into the portfolio repo source tree:
cp supabase/functions/cluebugle-ai/index.ts /mnt/c/Users/hveec/OneDrive/Desktop/portfolio/MyGames/ClueBugle/supabase/functions/cluebugle-ai/index.ts

No browser script needs changing. The server remains responsible for validating
model output. Do not expose GEMINI_API_KEY to the frontend.
