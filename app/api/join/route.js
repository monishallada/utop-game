import { NextResponse } from "next/server";
import { savePlayer, playerCount, getPhase } from "@/lib/store";
import { TEAM_MAP } from "@/lib/teams";

export const dynamic = "force-dynamic";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const name = String(body.name || "").trim().slice(0, 20);
  const team = String(body.team || "");

  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  if (!TEAM_MAP[team]) {
    return NextResponse.json({ error: "Unknown team" }, { status: 400 });
  }
  if ((await playerCount()) >= 300) {
    return NextResponse.json({ error: "Lobby is full" }, { status: 403 });
  }

  const player = {
    id: crypto.randomUUID(),
    name,
    team,
    attempts: 0,
    yards: 0,
    touchdowns: 0,
    totalYards: 0,
    joinedAt: Date.now(),
  };
  await savePlayer(player);

  return NextResponse.json({ id: player.id, phase: await getPhase() });
}
