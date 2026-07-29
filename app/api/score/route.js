import { NextResponse } from "next/server";
import { getPhase, getPlayer, savePlayer } from "@/lib/store";
import { MAX_ATTEMPTS } from "@/lib/teams";

export const dynamic = "force-dynamic";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { id } = body;
  const score = Math.max(0, Math.min(999, Math.floor(Number(body.score) || 0)));

  const player = await getPlayer(id);
  if (!player) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }
  if ((await getPhase()) !== "playing") {
    return NextResponse.json({ error: "Game is not running" }, { status: 403 });
  }
  if (player.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "No attempts left", best: player.best, attempts: player.attempts },
      { status: 403 }
    );
  }

  player.attempts += 1;
  player.best = Math.max(player.best, score);
  await savePlayer(player);

  return NextResponse.json({ best: player.best, attempts: player.attempts });
}
