import { NextResponse } from "next/server";
import { getPhase, getPlayer, savePlayer } from "@/lib/store";
import { MAX_ATTEMPTS, TD_YARDS, YARDS_PER_GATE } from "@/lib/teams";

export const dynamic = "force-dynamic";

// POST { id, gates } — gates = goalpost gates cleared this attempt.
// The server converts gates to yards, adds them onto the player's current
// drive, and awards a touchdown for every TD_YARDS reached (leftover yards
// start the next drive).
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { id } = body;
  const gates = Math.max(0, Math.min(999, Math.floor(Number(body.gates ?? body.score) || 0)));
  const gained = gates * YARDS_PER_GATE;

  const player = await getPlayer(id);
  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }
  if ((await getPhase()) !== "playing") {
    return NextResponse.json({ error: "Game is not running" }, { status: 403 });
  }
  if (player.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json(
      {
        error: "No attempts left",
        attempts: player.attempts,
        yards: player.yards || 0,
        touchdowns: player.touchdowns || 0,
        totalYards: player.totalYards || 0,
      },
      { status: 403 }
    );
  }

  player.attempts += 1;
  player.totalYards = (player.totalYards || 0) + gained;
  player.yards = (player.yards || 0) + gained;

  const tds = Math.floor(player.yards / TD_YARDS);
  if (tds > 0) {
    player.touchdowns = (player.touchdowns || 0) + tds;
    player.yards = player.yards % TD_YARDS;
  }

  await savePlayer(player);

  return NextResponse.json({
    attempts: player.attempts,
    yards: player.yards,
    touchdowns: player.touchdowns || 0,
    totalYards: player.totalYards,
    scoredTd: tds > 0,
  });
}
