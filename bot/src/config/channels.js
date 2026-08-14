/**
 * config/channels.js
 * Obsługa ChannelBinding — mapowanie kluczy na ID kanałów Discord
 */

const prisma = require("../lib/prisma");

let cache = { bindings: [], fetchedAt: 0 };
const CACHE_TTL_MS = 60_000;

async function loadBindings() {
  if (Date.now() - cache.fetchedAt < CACHE_TTL_MS && cache.bindings.length > 0) {
    return cache.bindings;
  }
  try {
    const bindings = await prisma.channelBinding.findMany();
    cache = { bindings, fetchedAt: Date.now() };
    return bindings;
  } catch (err) {
    console.error("[channels] Błąd przy pobieraniu ChannelBinding:", err.message);
    return [];
  }
}

/**
 * Zwraca ID kanału dla danego klucza
 */
async function getBoundChannelId(key) {
  const bindings = await loadBindings();
  const binding = bindings.find((b) => b.key === key);
  return binding?.channelId ?? null;
}

/**
 * Zwraca JSON z listy ID kanałów/ról
 */
async function getBoundChannelJson(key) {
  const binding = await getBoundChannelId(key);
  if (!binding) return null;
  try {
    return JSON.parse(binding);
  } catch {
    return null;
  }
}

module.exports = { getBoundChannelId, getBoundChannelJson };
