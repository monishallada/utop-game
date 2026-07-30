import { NextResponse } from "next/server";
import {
  getPhase,
  getPlayers,
  getPlayer,
  playerCount,
  usingRedis,
} from "@/lib/store";

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
        attempts: p.attempts,
        yards: p.yards || 0,
        touchdowns: p.touchdowns || 0,
        totalYards: p.totalYards || 0,
      })),
      redis: usingRedis(),
    });
  }

  const result = { phase, count: await playerCount() };
  if (id) {
    const me = await getPlayer(id);
    result.me = me
      ? {
          id: me.id,
          name: me.name,
          team: me.team,
          attempts: me.attempts,
          yards: me.yards || 0,
          touchdowns: me.touchdowns || 0,
          totalYards: me.totalYards || 0,
        }
      : null;
  }
  return NextResponse.json(result);
}
