import { NextResponse } from "next/server";
import { getPhase, getPlayers, getPlayer, playerCount } from "@/lib/store";

export const dynamic = "force-dynamic";

// GET /api/state          -> { phase, count }
// GET /api/state?id=xyz   -> { phase, count, me }
// GET /api/state?full=1   -> { phase, count, players, redis }
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const full = searchParams.get("full");

  const phase = await getPhase();

  if (full) {
    const players = await getPlayers();
    return NextResponse.json({
      phase,
      count: players.length,
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        team: p.team,
        best: p.best,
        attempts: p.attempts,
      })),
      redis: true,
    });
  }

  const result = { phase, count: await playerCount() };
  if (id) {
    const me = await getPlayer(id);
    result.me = me
      ? { id: me.id, name: me.name, team: me.team, best: me.best, attempts: me.attempts }
      : null;
  }
  return NextResponse.json(result);
}
