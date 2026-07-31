import { Redis } from "@upstash/redis";

// Works with either the Upstash Marketplace env names or Vercel KV env names.
// Falls back to in-memory storage (single process only — fine for `next dev`,
// NOT reliable on Vercel serverless).
function getRedis() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  if (!globalThis.__utopRedis) {
    globalThis.__utopRedis = new Redis({ url, token });
  }
  return globalThis.__utopRedis;
}

function getMemory() {
  if (!globalThis.__utopMemory) {
    globalThis.__utopMemory = {
      phase: "lobby",
      players: new Map(),
      devices: new Map(),
    };
  }
  globalThis.__utopMemory.devices ||= new Map();
  return globalThis.__utopMemory;
}

const PHASE_KEY = "utop:phase";
const PLAYERS_KEY = "utop:players";
const DEVICES_KEY = "utop:devices";

export function usingRedis() {
  return getRedis() !== null;
}

export async function getPhase() {
  const redis = getRedis();
  if (!redis) return getMemory().phase;
  return (await redis.get(PHASE_KEY)) || "lobby";
}

export async function setPhase(phase) {
  const redis = getRedis();
  if (!redis) {
    getMemory().phase = phase;
    return;
  }
  await redis.set(PHASE_KEY, phase);
}

export async function getPlayers() {
  const redis = getRedis();
  if (!redis) return Array.from(getMemory().players.values());
  const hash = (await redis.hgetall(PLAYERS_KEY)) || {};
  return Object.values(hash).map((v) =>
    typeof v === "string" ? JSON.parse(v) : v
  );
}

export async function getPlayer(id) {
  if (!id) return null;
  const redis = getRedis();
  if (!redis) return getMemory().players.get(id) || null;
  const v = await redis.hget(PLAYERS_KEY, id);
  if (!v) return null;
  return typeof v === "string" ? JSON.parse(v) : v;
}

export async function savePlayer(player) {
  const redis = getRedis();
  if (!redis) {
    getMemory().players.set(player.id, player);
    return;
  }
  await redis.hset(PLAYERS_KEY, { [player.id]: JSON.stringify(player) });
}

// One roster spot per device: the join API maps a device id to the player it
// created, so repeat joins from the same phone return the existing player
// instead of creating a duplicate.
export async function getPlayerIdByDevice(deviceId) {
  if (!deviceId) return null;
  const redis = getRedis();
  if (!redis) return getMemory().devices.get(deviceId) || null;
  return (await redis.hget(DEVICES_KEY, deviceId)) || null;
}

export async function linkDevice(deviceId, playerId) {
  if (!deviceId) return;
  const redis = getRedis();
  if (!redis) {
    getMemory().devices.set(deviceId, playerId);
    return;
  }
  await redis.hset(DEVICES_KEY, { [deviceId]: playerId });
}

export async function removePlayer(id) {
  const player = await getPlayer(id);
  if (!player) return;
  const redis = getRedis();
  if (!redis) {
    const mem = getMemory();
    mem.players.delete(id);
    if (player.deviceId) mem.devices.delete(player.deviceId);
    return;
  }
  await redis.hdel(PLAYERS_KEY, id);
  if (player.deviceId) await redis.hdel(DEVICES_KEY, player.deviceId);
}

export async function playerCount() {
  const redis = getRedis();
  if (!redis) return getMemory().players.size;
  return (await redis.hlen(PLAYERS_KEY)) || 0;
}

export async function resetGame() {
  const redis = getRedis();
  if (!redis) {
    const mem = getMemory();
    mem.phase = "lobby";
    mem.players = new Map();
    mem.devices = new Map();
    return;
  }
  await redis.del(PLAYERS_KEY);
  await redis.del(DEVICES_KEY);
  await redis.set(PHASE_KEY, "lobby");
}
