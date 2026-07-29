"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TEAMS, TEAM_MAP, MAX_ATTEMPTS } from "@/lib/teams";
import FlappyGame from "@/components/FlappyGame";
import { FinalBoard } from "@/components/Scoreboard";

const STORAGE_KEY = "utop_player_id";

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
      // host reset the game — start over
      clearIdentity();
      return;
    }
    if (data.me) setMe(data.me);
    const p = data.me;
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
      .then(routeFromState)
      .catch(() => setStep("name"));
  }, [routeFromState]);

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
          if (data.me === null) clearIdentity();
          else if (data.phase === "ended") setStep("final");
          else {
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
    if (!teamPick || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), team: teamPick }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not join — try again!");
        return;
      }
      localStorage.setItem(STORAGE_KEY, data.id);
      setMe({ id: data.id, name: name.trim(), team: teamPick, best: 0, attempts: 0 });
      setPhase(data.phase);
      if (data.phase === "playing") setStep("game");
      else if (data.phase === "ended") setStep("final");
      else setStep("lobby");
    } catch {
      setError("Network hiccup — try again!");
    } finally {
      setBusy(false);
    }
  };

  const submitScore = useCallback(async (score) => {
    const id = localStorage.getItem(STORAGE_KEY);
    if (!id) return;
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, score }),
      });
      const data = await res.json();
      if (res.ok || data.attempts != null) {
        setMe((m) => (m ? { ...m, best: data.best, attempts: data.attempts } : m));
      }
    } catch {
      /* score lost to a network blip — their next run can still beat it */
    }
  }, []);

  const myTeam = me ? TEAM_MAP[me.team] : teamPick ? TEAM_MAP[teamPick] : null;
  const attemptsLeft = me ? Math.max(0, MAX_ATTEMPTS - me.attempts) : 0;

  const title = (
    <h1 className="title">
      <span className="utop">✦ UTOP ✦</span>
      <span className="flappy">FLAPPYBIRD</span>
    </h1>
  );

  return (
    <main className="player">
      {title}

      {step === "boot" && (
        <div className="step-card panel">
          <div className="waiting-bird"><span className="spin">🐤</span></div>
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
            {busy ? "JOINING…" : "JOIN LOBBY 🚀"}
          </button>
        </div>
      )}

      {step === "lobby" && myTeam && (
        <div className="step-card panel" style={{ "--team": myTeam.color }}>
          <div className="waiting-bird">🐤</div>
          <div className="step-title">YOU&apos;RE IN!</div>
          <div className="badge" style={{ "--team": myTeam.color }}>
            {myTeam.emoji} {myTeam.name}
          </div>
          <div className="hint">
            <strong>{count}</strong> player{count === 1 ? "" : "s"} in the lobby.
            <br />
            Waiting for the host to start the game…
            <br />
            Keep this page open! 📱
          </div>
        </div>
      )}

      {step === "game" && me && myTeam && (
        <div className="game-wrap">
          <div className="game-hud panel" style={{ "--team": myTeam.color }}>
            <span>
              {myTeam.emoji} {me.name}
            </span>
            <span className="hearts">
              {"❤️".repeat(attemptsLeft)}
              {"🖤".repeat(MAX_ATTEMPTS - attemptsLeft)}
            </span>
            <span className="best">BEST {me.best}</span>
          </div>
          <FlappyGame
            color={myTeam.color}
            attemptsLeft={attemptsLeft}
            best={me.best}
            onRunEnd={submitScore}
            onFinished={() => setStep(phase === "ended" ? "final" : "done")}
          />
        </div>
      )}

      {step === "done" && me && myTeam && (
        <div className="step-card panel">
          <div className="waiting-bird">😮‍💨</div>
          <div className="step-title">
            ALL {MAX_ATTEMPTS} FLIGHTS FLOWN!
            <br />
            <br />
            YOUR BEST: {me.best}
          </div>
          <div className="badge" style={{ "--team": myTeam.color }}>
            {myTeam.emoji} {myTeam.name}
          </div>
          <div className="hint">
            Your best score is locked in for your squad. 💪
            <br />
            Watch the big screen — final results coming soon!
          </div>
        </div>
      )}

      {step === "final" && (
        <div>
          <p className="title-sub">🏆 FINAL RESULTS 🏆</p>
          {me && myTeam && (
            <div className="center" style={{ margin: "14px 0" }}>
              <div className="badge" style={{ "--team": myTeam.color }}>
                {myTeam.emoji} {me.name} · best {me.best}
              </div>
            </div>
          )}
          {finalPlayers ? (
            <FinalBoard players={finalPlayers} />
          ) : (
            <div className="hint">
              <span className="spin">🐤</span> loading results…
            </div>
          )}
        </div>
      )}
    </main>
  );
}
