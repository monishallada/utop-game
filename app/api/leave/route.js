import { NextResponse } from "next/server";
import { getPhase, removePlayer } from "@/lib/store";

export const dynamic = "force-dynamic";

// POST { id } — remove the player from the roster and free their device so
// they can rejoin (e.g. picked the wrong squad). Lobby only: leaving during a
// live round would let players reset their attempts by rejoining.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const id = String(body.id || "");
  if (!id) {
    return NextResponse.json({ error: "Id required" }, { status: 400 });
  }

  const phase = await getPhase();
  if (phase !== "lobby") {
    return NextResponse.json(
      { error: "Can't leave once the game has started" },
      { status: 403 }
    );
  }

  await removePlayer(id);
  return NextResponse.json({ ok: true });
}
