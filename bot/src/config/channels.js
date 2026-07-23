/**
 * config/channels.js
 * Analogicznie do roles.js — kanały przypisywane w Dashboardzie (ChannelBinding),
 * nigdy hardkodowane w kodzie bota.
 */

const prisma = require("../lib/prisma");

let cache = { bindings: new Map(), fetchedAt: 0 };
const CACHE_TTL_MS = 60_000;

async function loadBindings() {
  if (Date.now() - cache.fetchedAt < CACHE_TTL_MS && cache.bindings.size > 0) {
    return cache.bindings;
  }
  const rows = await prisma.channelBinding.findMany();
  cache = { bindings: new Map(rows.map((r) => [r.key, r.channelId])), fetchedAt: Date.now() };
  return cache.bindings;
}

async function getBoundChannelId(key) {
  const bindings = await loadBindings();
  return bindings.get(key) ?? null;
}

// alias historyczny - kanały zawsze były trzymane w tym miejscu
const getChannelId = getBoundChannelId;

module.exports = { getBoundChannelId, getChannelId };
