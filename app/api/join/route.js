import { NextResponse } from "next/server";
import {
  savePlayer,
  playerCount,
  getPhase,
  getPlayer,
  getPlayerIdByDevice,
  linkDevice,
} from "@/lib/store";
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
  const deviceId = String(body.deviceId || "").slice(0, 64);

  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }
  if (!TEAM_MAP[team]) {
    return NextResponse.json({ error: "Unknown team" }, { status: 400 });
  }

  // This phone already joined (double-tap, retry after a network blip, or a
  // QR re-scan) — hand back the existing player instead of creating a
  // duplicate. They keep their team until they leave or the host resets.
  if (deviceId) {
    const existingId = await getPlayerIdByDevice(deviceId);
    if (existingId) {
      const existing = await getPlayer(existingId);
      if (existing) {
        return NextResponse.json({
          id: existing.id,
          team: existing.team,
          name: existing.name,
          phase: await getPhase(),
          rejoined: true,
        });
      }
    }
  }

  if ((await playerCount()) >= 300) {
    return NextResponse.json({ error: "Lobby is full" }, { status: 403 });
  }

  const player = {
    id: crypto.randomUUID(),
    name,
    team,
    deviceId: deviceId || null,
    attempts: 0,
    yards: 0,
    touchdowns: 0,
    totalYards: 0,
    joinedAt: Date.now(),
  };
  await savePlayer(player);
  await linkDevice(deviceId, player.id);

  return NextResponse.json({ id: player.id, phase: await getPhase() });
}
