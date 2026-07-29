import { NextResponse } from "next/server";
import { setPhase, resetGame } from "@/lib/store";

export const dynamic = "force-dynamic";

// POST { action: "start" | "end" | "reset", key?: string }
// If a HOST_KEY env var is set on the deployment, `key` must match it.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (process.env.HOST_KEY && body.key !== process.env.HOST_KEY) {
    return NextResponse.json({ error: "Wrong host key" }, { status: 401 });
  }

  const { action } = body;
  if (action === "start") {
    await setPhase("playing");
  } else if (action === "end") {
    await setPhase("ended");
  } else if (action === "reset") {
    await resetGame();
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
