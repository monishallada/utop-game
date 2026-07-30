export const TEAMS = [
  { id: "dynasty", name: "Dynasty", emoji: "👑", color: "#FFD700" },
  { id: "no-fly-zone", name: "No Fly Zone", emoji: "⛔", color: "#38BDF8" },
  { id: "primetime", name: "Primetime", emoji: "🌟", color: "#FF9F1A" },
  { id: "the-franchise", name: "The Franchise", emoji: "🏆", color: "#A55EEA" },
  { id: "pressure-unit", name: "Pressure Unit", emoji: "💥", color: "#FF3E9D" },
  { id: "team-lockdown", name: "Team Lockdown", emoji: "🔒", color: "#94A3B8" },
  { id: "the-playbook", name: "The Playbook", emoji: "📖", color: "#34D399" },
  { id: "underdogs", name: "Underdogs", emoji: "🐾", color: "#D2691E" },
  { id: "x-factor", name: "X-Factor", emoji: "✖️", color: "#00E5CC" },
  { id: "redzone", name: "Redzone", emoji: "🚨", color: "#FF3B3B" },
  { id: "the-blueprint", name: "The Blueprint", emoji: "📐", color: "#5352ED" },
  { id: "blitz-squad", name: "Blitz Squad", emoji: "⚡", color: "#C6FF4D" },
];

export const TEAM_MAP = Object.fromEntries(TEAMS.map((t) => [t.id, t]));

// Every player gets exactly 4 attempts for the whole game. Yards carry over
// between attempts: reach TD_YARDS and it's a touchdown — the drive resets to
// 0 and any attempts still in hand start a fresh drive.
export const MAX_ATTEMPTS = 4;
export const TD_YARDS = 100;
export const YARDS_PER_GATE = 10;
export const CLASS_SIZE = 160;
