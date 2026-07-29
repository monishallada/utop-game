"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { TEAMS, CLASS_SIZE } from "@/lib/teams";
import { TeamBars, FinalBoard } from "@/components/Scoreboard";

const POLL_MS = 2000;

export default function HostPage() {
  const [state, setState] = useState(null); // { phase, count, players, redis }
  const [qr, setQr] = useState(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const hostKey = useRef("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    hostKey.current = params.get("key") || "";
    const url = `${window.location.origin}/play`;
    setJoinUrl(url);
    QRCode.toDataURL(url, {
      width: 560,
      margin: 1,
      color: { dark: "#0b1023", light: "#ffffff" },
    }).then(setQr);
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/state?full=1", { cache: "no-store" });
        const data = await res.json();
        if (alive) setState(data);
      } catch {
        /* transient network error — next poll will recover */
      }
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const doAction = useCallback(async (action, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    try {
      await fetch("/api/phase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, key: hostKey.current }),
      });
      const res = await fetch("/api/state?full=1", { cache: "no-store" });
      setState(await res.json());
    } finally {
      setBusy(false);
    }
  }, []);

  const players = state?.players || [];
  const phase = state?.phase || "lobby";
  const byTeam = useMemo(() => {
    const map = {};
    for (const t of TEAMS) map[t.id] = [];
    for (const p of players) map[p.team]?.push(p);
    return map;
  }, [players]);

  return (
    <main className="host">
      <h1 className="title">
        <span className="utop">✦ UTOP ✦</span>
        <span className="flappy">FLAPPYBIRD</span>
      </h1>

      {phase === "lobby" && (
        <>
          <p className="title-sub">
            🐤 Scan the code · pick your squad · flap for glory 🐤
          </p>

          <div className="host-lobby">
            <div className="qr-card panel">
              <div className="qr-label">SCAN TO JOIN</div>
              {qr ? (
                <img src={qr} alt={`QR code for ${joinUrl}`} />
              ) : (
                <div className="hint">
                  <span className="spin">🐤</span> generating code…
                </div>
              )}
              <div className="join-url">{joinUrl.replace(/^https?:\/\//, "")}</div>
              <div className="player-count">
                <span className="big">{state ? state.count : "…"}</span>
                / {CLASS_SIZE} joined
              </div>
            </div>

            <div className="team-grid">
              {TEAMS.map((t) => (
                <div
                  key={t.id}
                  className="team-card panel"
                  style={{ "--team": t.color }}
                >
                  <div className="team-head">
                    <span className="team-emoji">{t.emoji}</span>
                    <span className="team-name">{t.name}</span>
                    <span className="team-count">{byTeam[t.id].length}</span>
                  </div>
                  <div className="member-chips">
                    {byTeam[t.id].map((p) => (
                      <span key={p.id} className="member-chip">
                        {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="host-actions">
            <button
              className="btn"
              disabled={busy || players.length === 0}
              onClick={() =>
                doAction(
                  "start",
                  `Start the game with ${players.length} players?`
                )
              }
            >
              🚀 START GAME
            </button>
            <button
              className="btn danger small"
              disabled={busy}
              onClick={() =>
                doAction("reset", "Reset the lobby? This removes ALL players.")
              }
            >
              RESET
            </button>
          </div>

          {state && state.redis === false && (
            <p className="hint" style={{ marginTop: 24 }}>
              ⚠️ Running on in-memory storage (no Redis connected). Fine for
              local testing — add Upstash Redis on Vercel before class!
            </p>
          )}
        </>
      )}

      {phase === "playing" && (
        <>
          <p className="title-sub">
            🎮 GAME ON! Live team standings — each player&apos;s best score
            counts toward the squad total.
          </p>
          <TeamBars players={players} showProgress />
          <div className="host-actions">
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() =>
                doAction(
                  "end",
                  "End the game and show the final leaderboard?"
                )
              }
            >
              🏁 END GAME → LEADERBOARD
            </button>
          </div>
        </>
      )}

      {phase === "ended" && (
        <>
          <p className="title-sub">🏆 FINAL RESULTS 🏆</p>
          <FinalBoard players={players} />
          <div className="host-actions">
            <button
              className="btn danger small"
              disabled={busy}
              onClick={() =>
                doAction(
                  "reset",
                  "Start a brand new game? This clears everything."
                )
              }
            >
              🔄 NEW GAME
            </button>
          </div>
        </>
      )}
    </main>
  );
}
