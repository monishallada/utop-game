// Pure in-memory storage — no database needed. State lives in this Node
// process, so run the game from ONE server (e.g. `next start` on a laptop,
// with phones connecting over LAN or a tunnel). It will NOT work across
// multiple serverless instances (e.g. Vercel).
function getMemory() {
  if (!globalThis.__utopMemory) {
    globalThis.__utopMemory = { phase: "lobby", players: new Map() };
  }
  return globalThis.__utopMemory;
}

export async function getPhase() {
  return getMemory().phase;
}

export async function setPhase(phase) {
  getMemory().phase = phase;
}

export async function getPlayers() {
  return Array.from(getMemory().players.values());
}

export async function getPlayer(id) {
  if (!id) return null;
  return getMemory().players.get(id) || null;
}

export async function savePlayer(player) {
  getMemory().players.set(player.id, player);
}

export async function playerCount() {
  return getMemory().players.size;
}

export async function resetGame() {
  const mem = getMemory();
  mem.phase = "lobby";
  mem.players = new Map();
}
