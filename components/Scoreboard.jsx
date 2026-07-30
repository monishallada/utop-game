"use client";

import { useMemo } from "react";
import { TEAMS, TEAM_MAP, MAX_ATTEMPTS } from "@/lib/teams";

// Rank groups by touchdowns; total accumulated yards breaks ties.
export function computeStandings(players) {
  const standings = TEAMS.map((t) => {
    const members = players.filter((p) => p.team === t.id);
    return {
      ...t,
      members,
      touchdowns: members.reduce((sum, p) => sum + (p.touchdowns || 0), 0),
      totalYards: members.reduce((sum, p) => sum + (p.totalYards || 0), 0),
      done: members.filter((p) => p.attempts >= MAX_ATTEMPTS).length,
    };
  });
  standings.sort(
    (a, b) =>
      b.touchdowns - a.touchdowns ||
      b.totalYards - a.totalYards ||
      b.members.length - a.members.length
  );
  return standings;
}

export function TeamBars({ players, showProgress }) {
  const standings = useMemo(() => computeStandings(players), [players]);
  const max = Math.max(
    1,
    ...standings.map((s) => s.touchdowns * 100 + s.totalYards)
  );

  return (
    <div className="board">
      {standings.map((team, i) => (
        <div
          key={team.id}
          className="board-row panel"
          style={{ "--team": team.color }}
        >
          <div className="board-rank">{i + 1}</div>
          <div className="board-team">
            <div className="board-team-name">
              <span>
                {team.emoji} {team.name}
              </span>
              <span className="meta">
                {team.totalYards} yds · {team.members.length} player
                {team.members.length === 1 ? "" : "s"}
                {showProgress ? ` · ${team.done} finished` : ""}
              </span>
            </div>
            <div className="board-bar-track">
              <div
                className="board-bar"
                style={{
                  width: `${((team.touchdowns * 100 + team.totalYards) / max) * 100}%`,
                }}
              />
            </div>
          </div>
          <div className="board-score">
            {team.touchdowns}
            <span className="board-td-label">TD{team.touchdowns === 1 ? "" : "s"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

const MEDALS = ["🥇", "🥈", "🥉", "4.", "5.", "6.", "7.", "8.", "9.", "10."];

export function FinalBoard({ players }) {
  const standings = useMemo(() => computeStandings(players), [players]);
  const [first, second, third] = standings;
  const topPlayers = [...players]
    .sort(
      (a, b) =>
        (b.touchdowns || 0) - (a.touchdowns || 0) ||
        (b.totalYards || 0) - (a.totalYards || 0)
    )
    .slice(0, 10);

  return (
    <div>
      <Confetti />

      {first && (
        <div className="winner-banner" style={{ "--team": first.color }}>
          <div className="winner-crown">🏆</div>
          <div className="winner-name">
            {first.emoji} {first.name.toUpperCase()} {first.emoji}
          </div>
          <div className="winner-sub">
            CHAMPIONS · {first.touchdowns} TOUCHDOWN
            {first.touchdowns === 1 ? "" : "S"} · {first.totalYards} TOTAL YARDS
          </div>
        </div>
      )}

      <div className="podium">
        {second && (
          <div className="podium-spot second" style={{ "--team": second.color }}>
            <div className="crown">{second.emoji}</div>
            <div className="p-name">{second.name}</div>
            <div className="p-score">{second.touchdowns} TD</div>
            <div className="p-yards">{second.totalYards} yds</div>
            <div className="podium-block" />
          </div>
        )}
        {first && (
          <div className="podium-spot first" style={{ "--team": first.color }}>
            <div className="crown">👑</div>
            <div className="p-name">
              {first.emoji} {first.name}
            </div>
            <div className="p-score">{first.touchdowns} TD</div>
            <div className="p-yards">{first.totalYards} yds</div>
            <div className="podium-block" />
          </div>
        )}
        {third && (
          <div className="podium-spot third" style={{ "--team": third.color }}>
            <div className="crown">{third.emoji}</div>
            <div className="p-name">{third.name}</div>
            <div className="p-score">{third.touchdowns} TD</div>
            <div className="p-yards">{third.totalYards} yds</div>
            <div className="podium-block" />
          </div>
        )}
      </div>

      <TeamBars players={players} />

      <div className="goat-note">
        🐐 Remember that DONOVAN and MONISH are the GOATS 🐐
      </div>

      {topPlayers.length > 0 && (
        <div className="top-players panel">
          <h3>🏈 TOP PLAYMAKERS 🏈</h3>
          {topPlayers.map((p, i) => (
            <div key={p.id || i} className="top-player-row">
              <span>
                {MEDALS[i] || `${i + 1}.`} <strong>{p.name}</strong>{" "}
                <span style={{ color: TEAM_MAP[p.team]?.color }}>
                  {TEAM_MAP[p.team]?.emoji} {TEAM_MAP[p.team]?.name}
                </span>
              </span>
              <span className="score">
                {p.touchdowns || 0} TD · {p.totalYards || 0} yds
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Charlotte green, Niner gold, and white
const CONFETTI_COLORS = [
  "#A49665", "#005035", "#FFFFFF", "#D4BD7D", "#0A6B45", "#F0E6C8",
];

export function Confetti({ count = 80 }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: `${(i * 37) % 100}%`,
        background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        animationDuration: `${3 + ((i * 13) % 40) / 10}s`,
        animationDelay: `${((i * 29) % 50) / 10}s`,
        transform: `rotate(${(i * 47) % 360}deg)`,
      })),
    [count]
  );
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((style, i) => (
        <i key={i} style={style} />
      ))}
    </div>
  );
}
