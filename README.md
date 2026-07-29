# 🐤 UTOP Flappybird

A classroom multiplayer Flappy Bird showdown. The big screen shows a QR code —
students scan it on their phones, enter their name, pick their squad, and when
everyone's in, the host starts the game. Each player gets **5 attempts**; their
**best score** counts toward their team's total. Ends with a podium + confetti
leaderboard.

## Screens

| URL | Who | What |
| --- | --- | --- |
| `/` | Projector / big screen | Title, QR code, live lobby, START button, live team standings, final podium |
| `/play` | Students' phones | Name → pick squad → lobby → flappy bird (5 tries) → results |

## Deploy (one time, ~5 minutes)

1. Push this repo to GitHub.
2. On [vercel.com](https://vercel.com) → **Add New Project** → import the repo → **Deploy** (no settings needed).
3. **Add shared storage** (required so all 160 phones see the same game):
   - In the Vercel project, go to the **Storage** tab → **Create Database** → **Upstash Redis** (free tier is plenty).
   - Connect it to the project (env vars are added automatically) → **Redeploy**.
4. Open `https://your-app.vercel.app/` on the projector. Done!

> Without Redis the app still runs, but on Vercel each request may hit a
> different server, so players won't sync. The host screen shows a ⚠️ warning
> if Redis isn't connected. Local `npm run dev` works fine without it.

## Game day

1. Put `/` on the projector — kids scan the QR code.
2. Watch the 12 team cards fill up (counter shows x/160).
3. Hit **🚀 START GAME** — every phone flips into the game.
4. Watch live team standings while they play (5 attempts each, best counts).
5. Hit **🏁 END GAME** — podium, confetti, MVP top-10 everywhere.
6. **🔄 NEW GAME** resets everything for the next class.

## The 12 squads

Dynasty 👑 · No Fly Zone ⛔ · Primetime 🌟 · The Franchise 🏆 · Pressure Unit 💥 ·
Team Lockdown 🔒 · The Playbook 📖 · Underdogs 🐾 · X-Factor ✖️ · Redzone 🚨 ·
The Blueprint 📐 · Blitz Squad ⚡

## Optional: protect the host controls

Kids could technically open `/` and press START themselves. To prevent that,
set a `HOST_KEY` environment variable on Vercel (any secret word), then open
the host screen as `/?key=yourword`. Start/End/Reset then require the key.

## Local development

```bash
npm install
npm run dev
```

Host screen at `http://localhost:3000`, player at `http://localhost:3000/play`
(open several browser tabs to simulate players).

## Notes

- Scores are validated server-side: 5-attempt cap, scores clamped to 0–999,
  submissions only accepted while the game is running.
- Players are remembered via `localStorage`, so a phone refresh doesn't lose
  their attempts or team.
- Polling keeps everything in sync (every 2s on the host, 2.5–6s on phones) —
  well within Upstash's free tier for a 160-player class session.
