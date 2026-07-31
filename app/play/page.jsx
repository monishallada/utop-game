"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TEAMS, TEAM_MAP, MAX_ATTEMPTS, TD_YARDS } from "@/lib/teams";
import FlappyGame from "@/components/FlappyGame";
import { FinalBoard } from "@/components/Scoreboard";

const STORAGE_KEY = "utop_player_id";
const DEVICE_KEY = "utop_device_id";

// Stable per-phone id so the server can recognize a device that already
// joined and hand back the same player instead of creating a duplicate.
function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export default function PlayPage() {
  const [step, setStep] = useState("boot"); // boot|name|team|lobby|game|done|final
  const [name, setName] = useState("");
  const [teamPick, setTeamPick] = useState(null);
  const [me, setMe] = useState(null);
  const [phase, setPhase] = useState("lobby");
  const [count, setCount] = useState(0);
  const [teamCounts, setTeamCounts] = useState({});
  const [finalPlayers, setFinalPlayers] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const stepRef = useRef(step);
  stepRef.current = step;
  const joinInFlight = useRef(false);
  const missesRef = useRef(0);

  const clearIdentity = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setMe(null);
    setTeamPick(null);
    setStep("name");
  }, []);

  const routeFromState = useCallback((data) => {
    setPhase(data.phase);
    setCount(data.count ?? 0);
    if (data.me === null) {
      // The server didn't recognize us — usually a host reset, but it can
      // also be one flaky response. Only give up our spot after several
      // misses in a row so a single bad poll never kicks anyone out.
      missesRef.current += 1;
      if (missesRef.current >= 3) {
        missesRef.current = 0;
        clearIdentity();
      }
      return;
    }
    const p = data.me;
    if (p) {
      missesRef.current = 0;
      setMe(p);
    }
    if (data.phase === "ended") {
      setStep("final");
    } else if (data.phase === "playing" && p) {
      setStep(p.attempts >= MAX_ATTEMPTS ? "done" : "game");
    } else if (p) {
      setStep("lobby");
    }
  }, [clearIdentity]);

  // boot: restore identity if we have one
  useEffect(() => {
    const id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      setStep("name");
      return;
    }
    fetch(`/api/state?id=${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.me === null) {
          // fresh page load and the server doesn't know us — start over
          // (rejoining reclaims our old spot via the device id anyway)
          clearIdentity();
          return;
        }
        routeFromState(data);
      })
      .catch(() => setStep("name"));
  }, [routeFromState, clearIdentity]);

  // polling — cadence depends on the step
  useEffect(() => {
    if (!["lobby", "game", "done", "team"].includes(step)) return;
    const id = localStorage.getItem(STORAGE_KEY);
    const interval = step === "lobby" ? 2500 : step === "game" ? 6000 : 3000;

    const tick = async () => {
      try {
        if (step === "team") {
          const res = await fetch("/api/state?full=1", { cache: "no-store" });
          const data = await res.json();
          setPhase(data.phase);
          if (data.phase === "ended") {
            // game finished while they were still picking — show the winners
            setStep("final");
            return;
          }
          setCount(data.count);
          const counts = {};
          for (const p of data.players) counts[p.team] = (counts[p.team] || 0) + 1;
          setTeamCounts(counts);
          return;
        }
        const res = await fetch(id ? `/api/state?id=${id}` : "/api/state", {
          cache: "no-store",
        });
        const data = await res.json();
        // during a live run, only yank the player out for reset/ended
        if (stepRef.current === "game") {
          if (data.me === null) {
            missesRef.current += 1;
            if (missesRef.current >= 3) {
              missesRef.current = 0;
              clearIdentity();
            }
          } else if (data.phase === "ended") setStep("final");
          else {
            missesRef.current = 0;
            setPhase(data.phase);
            setCount(data.count ?? 0);
          }
          return;
        }
        routeFromState(data);
      } catch {
        /* transient error — next poll recovers */
      }
    };

    tick();
    const t = setInterval(tick, interval);
    return () => clearInterval(t);
  }, [step, routeFromState, clearIdentity]);

  // load the full roster for the final board
  useEffect(() => {
    if (step !== "final" || finalPlayers) return;
    fetch("/api/state?full=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => setFinalPlayers(data.players))
      .catch(() => {});
  }, [step, finalPlayers]);

  const join = async () => {
    if (!teamPick || busy || joinInFlight.current) return;
    joinInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          team: teamPick,
          deviceId: getDeviceId(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not join — try again!");
        return;
      }
      localStorage.setItem(STORAGE_KEY, data.id);
      missesRef.current = 0;
      if (data.rejoined) {
        // this phone was already on the roster — sync to the server's record
        const s = await fetch(`/api/state?id=${data.id}`, {
          cache: "no-store",
        }).then((r) => r.json());
        routeFromState(s);
        return;
      }
      setMe({
        id: data.id,
        name: name.trim(),
        team: teamPick,
        attempts: 0,
        yards: 0,
        touchdowns: 0,
        totalYards: 0,
      });
      setPhase(data.phase);
      if (data.phase === "playing") setStep("game");
      else if (data.phase === "ended") setStep("final");
      else setStep("lobby");
    } catch {
      setError("Network hiccup — try again!");
    } finally {
      joinInFlight.current = false;
      setBusy(false);
    }
  };

  // Leave the roster (lobby only) so the player can pick a different squad.
  // If the game already started the server refuses and we keep our spot —
  // the next poll routes us into the game.
  const leave = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const id = localStorage.getItem(STORAGE_KEY);
      if (id) {
        const res = await fetch("/api/leave", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!res.ok) return;
      }
      localStorage.removeItem(STORAGE_KEY);
      setMe(null);
      setTeamPick(null);
      setStep("team");
    } catch {
      /* network blip — stay put, the player can tap again */
    } finally {
      setBusy(false);
    }
  };

  // Submit the gates cleared this attempt; returns the server's updated
  // truth (attempts, drive yards, touchdowns) so the game overlay can show it.
  const submitScore = useCallback(async (gates) => {
    const id = localStorage.getItem(STORAGE_KEY);
    if (!id) return null;
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, gates }),
      });
      const data = await res.json();
      if (data.attempts != null) {
        setMe((m) =>
          m
            ? {
                ...m,
                attempts: data.attempts,
                yards: data.yards,
                touchdowns: data.touchdowns,
                totalYards: data.totalYards,
              }
            : m
        );
        return data;
      }
      return null;
    } catch {
      /* score lost to a network blip — the next poll re-syncs */
      return null;
    }
  }, []);

  const myTeam = me ? TEAM_MAP[me.team] : teamPick ? TEAM_MAP[teamPick] : null;
  const attemptsLeft = me ? Math.max(0, MAX_ATTEMPTS - me.attempts) : 0;

  const title = (
    <h1 className="title">
      <span className="utop">UNC CHARLOTTE ⛏ UTOP</span>
      <span className="flappy">GRIDIRON FLAPPY</span>
    </h1>
  );

  return (
    <main className="player">
      {title}

      {step === "boot" && (
        <div className="step-card panel">
          <div className="waiting-bird"><span className="spin">🏈</span></div>
          <div className="hint">loading…</div>
        </div>
      )}

      {step === "name" && (
        <div className="step-card panel">
          <div className="step-title">WHAT&apos;S YOUR NAME?</div>
          <input
            className="name-input"
            value={name}
            maxLength={20}
            placeholder="Your name"
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) setStep("team");
            }}
          />
          <button
            className="btn"
            disabled={!name.trim()}
            onClick={() => setStep("team")}
          >
            NEXT ▶
          </button>
        </div>
      )}

      {step === "team" && (
        <div className="step-card panel">
          <div className="step-title">
            HEY {name.trim().toUpperCase()}!
            <br />
            PICK YOUR SQUAD
          </div>
          <div className="pick-grid">
            {TEAMS.map((t) => (
              <button
                key={t.id}
                className={`pick-team${teamPick === t.id ? " selected" : ""}`}
                style={{ "--team": t.color }}
                onClick={() => setTeamPick(t.id)}
              >
                <span>{t.emoji}</span>
                <span>{t.name}</span>
                <span className="cnt">{teamCounts[t.id] || 0}</span>
              </button>
            ))}
          </div>
          {error && <div className="err">{error}</div>}
          <button className="btn" disabled={!teamPick || busy} onClick={join}>
            {busy ? "JOINING…" : "JOIN THE ROSTER 🏈"}
          </button>
          <button
            className="btn secondary small"
            disabled={busy}
            onClick={() => {
              setError("");
              setStep("name");
            }}
          >
            ◀ BACK
          </button>
        </div>
      )}

      {step === "lobby" && myTeam && (
        <div className="step-card panel" style={{ "--team": myTeam.color }}>
          <div className="waiting-bird">🏈</div>
          <div className="step-title">YOU&apos;RE ON THE ROSTER!</div>
          <div className="badge" style={{ "--team": myTeam.color }}>
            {myTeam.emoji} {myTeam.name}
          </div>
          <div className="hint">
            <strong>{count}</strong> player{count === 1 ? "" : "s"} in the stadium.
            <br />
            You get <strong>{MAX_ATTEMPTS} attempts</strong> — march your drive{" "}
            <strong>{TD_YARDS} yards</strong> for a touchdown!
            <br />
            Waiting for kickoff… keep this page open! 📱
          </div>
          <button className="btn secondary small" disabled={busy} onClick={leave}>
            🚪 WRONG TEAM? PICK AGAIN
          </button>
        </div>
      )}

      {step === "game" && me && myTeam && (
        <div className="game-wrap">
          <div className="game-hud panel" style={{ "--team": myTeam.color }}>
            <span>
              {myTeam.emoji} {me.name}
            </span>
            <span className="hearts">
              {"🏈".repeat(attemptsLeft)}
              {"⚪".repeat(MAX_ATTEMPTS - attemptsLeft)}
            </span>
            <span className="best">{me.touchdowns} TD{me.touchdowns === 1 ? "" : "s"}</span>
          </div>
          <div className="drive-meter panel">
            <div className="drive-meter-label">
              DRIVE <strong>{me.yards}</strong> / {TD_YARDS} YDS
            </div>
            <div className="drive-meter-track">
              <div
                className="drive-meter-fill"
                style={{ width: `${(me.yards / TD_YARDS) * 100}%` }}
              />
            </div>
          </div>
          <FlappyGame
            color={myTeam.color}
            attemptsLeft={attemptsLeft}
            driveYards={me.yards}
            touchdowns={me.touchdowns}
            onRunEnd={submitScore}
            onFinished={() => setStep(phase === "ended" ? "final" : "done")}
          />
        </div>
      )}

      {step === "done" && me && myTeam && (
        <div className="step-card panel">
          <div className="waiting-bird">🏟️</div>
          <div className="step-title">
            ALL {MAX_ATTEMPTS} ATTEMPTS USED!
          </div>
          <div className="stat-row">
            <div className="stat">
              <span className="stat-num">{me.touchdowns}</span>
              <span className="stat-label">TOUCHDOWN{me.touchdowns === 1 ? "" : "S"}</span>
            </div>
            <div className="stat">
              <span className="stat-num">{me.totalYards}</span>
              <span className="stat-label">TOTAL YARDS</span>
            </div>
          </div>
          <div className="badge" style={{ "--team": myTeam.color }}>
            {myTeam.emoji} {myTeam.name}
          </div>
          <div className="hint">
            Every TD and yard counts toward your squad&apos;s total. 💪
            <br />
            Watch the big screen — final whistle coming soon!
          </div>
        </div>
      )}

      {step === "final" && (
        <div>
          <p className="title-sub">🏆 FINAL RESULTS 🏆</p>
          {me && myTeam && (
            <div className="center" style={{ margin: "14px 0" }}>
              <div className="badge" style={{ "--team": myTeam.color }}>
                {myTeam.emoji} {me.name} · {me.touchdowns} TD ·{" "}
                {me.totalYards} yds
              </div>
            </div>
          )}
          {finalPlayers ? (
            <FinalBoard players={finalPlayers} />
          ) : (
            <div className="hint">
              <span className="spin">🏈</span> loading results…
            </div>
          )}
        </div>
      )}
    </main>
  );
}
