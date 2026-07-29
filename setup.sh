#!/usr/bin/env bash
# One-command deploy for UTOP Flappybird:
#   ./setup.sh
# Logs you into Vercel, deploys the app, provisions a free Upstash Redis
# database (the shared storage all the phones sync through), and redeploys.
set -e

step() { printf "\n\033[1;33m🏈 %s\033[0m\n" "$1"; }

cd "$(dirname "$0")"

step "Step 1/5 — Vercel login (a browser window may open)"
if npx -y vercel@latest whoami >/dev/null 2>&1; then
  echo "Already logged in as: $(npx -y vercel@latest whoami 2>/dev/null)"
else
  npx -y vercel@latest login
fi

step "Step 2/5 — Linking this folder to a Vercel project"
npx -y vercel@latest link --yes

step "Step 3/5 — First deploy"
npx -y vercel@latest deploy --prod --yes

step "Step 4/5 — Creating the free Upstash Redis database"
echo "In the prompts: choose the Redis product, the FREE plan, and any region/name."
if npx -y vercel@latest integration add upstash; then
  echo "Redis created and connected. ✅"
else
  cat <<'EOF'
Automatic setup didn't finish — no problem, it's 3 clicks in the dashboard:
  1. Open your project on vercel.com → "Storage" tab
  2. Create Database → "Upstash Redis" → free plan
  3. Connect it to this project, then re-run ./setup.sh
EOF
  exit 1
fi

step "Step 5/5 — Redeploying with the database connected"
npx -y vercel@latest deploy --prod --yes

printf "\n\033[1;32m🎉 DONE! The URL above is your game — open it on the projector.\033[0m\n"
printf "Kids scan the QR code on screen (it points to <your-url>/play).\n"
