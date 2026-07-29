"use client";

import { useMemo } from "react";
import { TEAMS, TEAM_MAP } from "@/lib/teams";

export function computeStandings(players) {
  const standings = TEAMS.map((t) => {
    const members = players.filter((p) => p.team === t.id);
    return {
      ...t,
      members,
      total: members.reduce((sum, p) => sum + (p.best || 0), 0),
      done: members.filter((p) => p.attempts >= 5).length,
    };
  });
  standings.sort((a, b) => b.total - a.total || b.members.length - a.members.length);
  return standings;
}

export function TeamBars({ players, showProgress }) {
  const standings = useMemo(() => computeStandings(players), [players]);
  const max = Math.max(1, ...standings.map((s) => s.total));

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
                {team.members.length} player{team.members.length === 1 ? "" : "s"}
                {showProgress ? ` · ${team.done} finished` : ""}
              </span>
            </div>
            <div className="board-bar-track">
              <div
                className="board-bar"
                style={{ width: `${(team.total / max) * 100}%` }}
              />
            </div>
          </div>
          <div className="board-score">{team.total}</div>
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
    .sort((a, b) => (b.best || 0) - (a.best || 0))
    .slice(0, 10);

  return (
    <div>
      <Confetti />
      <div className="podium">
        {second && (
          <div className="podium-spot second" style={{ "--team": second.color }}>
            <div className="crown">{second.emoji}</div>
            <div className="p-name">{second.name}</div>
            <div className="p-score">{second.total}</div>
            <div className="podium-block" />
          </div>
        )}
        {first && (
          <div className="podium-spot first" style={{ "--team": first.color }}>
            <div className="crown">👑</div>
            <div className="p-name">
              {first.emoji} {first.name}
            </div>
            <div className="p-score">{first.total}</div>
            <div className="podium-block" />
          </div>
        )}
        {third && (
          <div className="podium-spot third" style={{ "--team": third.color }}>
            <div className="crown">{third.emoji}</div>
            <div className="p-name">{third.name}</div>
            <div className="p-score">{third.total}</div>
            <div className="podium-block" />
          </div>
        )}
      </div>

      <TeamBars players={players} />

      {topPlayers.length > 0 && (
        <div className="top-players panel">
          <h3>🏈 TOP SCORERS 🏈</h3>
          {topPlayers.map((p, i) => (
            <div key={p.id || i} className="top-player-row">
              <span>
                {MEDALS[i] || `${i + 1}.`} <strong>{p.name}</strong>{" "}
                <span style={{ color: TEAM_MAP[p.team]?.color }}>
                  {TEAM_MAP[p.team]?.emoji} {TEAM_MAP[p.team]?.name}
                </span>
              </span>
              <span className="score">{p.best || 0}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CONFETTI_COLORS = [
  "#FFD700", "#FF3E9D", "#00E5CC", "#38BDF8", "#A55EEA", "#FF9F1A", "#C6FF4D",
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
