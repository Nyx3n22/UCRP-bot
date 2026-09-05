/**
 * services/levelService.js
 * System poziomów (/level): XP za wiadomości (z cooldownem) i za czas
 * spędzony na kanałach głosowych. Progi ról za poziom konfigurowalne
 * w Dashboardzie (LevelRoleReward). Awans ogłaszany na kanale LEVEL_UP.
 */

const { EmbedBuilder } = require("discord.js");
const prisma = require("../lib/prisma");
const { getBoundChannelId } = require("../config/channels");
const { logError } = require("../utils/logger");

const MESSAGE_XP_MIN = 15;
const MESSAGE_XP_MAX = 25;
const MESSAGE_COOLDOWN_MS = 60 * 1000;
const VOICE_XP_PER_MINUTE = 5;

/** Krzywa poziomów w stylu MEE6: rosnący próg XP na kolejny poziom. */
function xpNeededForLevel(level) {
  return 5 * level * level + 50 * level + 100;
}

function levelFromXp(xp) {
  let level = 0;
  let remaining = xp;
  while (remaining >= xpNeededForLevel(level)) {
    remaining -= xpNeededForLevel(level);
    level++;
  }
  return level;
}

class LevelService {
  async _getOrCreate(userId) {
    return prisma.userLevel.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  async onMessage(message) {
    if (message.author.bot) return;
    try {
      const record = await this._getOrCreate(message.author.id);
      if (record.lastMessageAt && Date.now() - record.lastMessageAt.getTime() < MESSAGE_COOLDOWN_MS) return;

      const gained = MESSAGE_XP_MIN + Math.floor(Math.random() * (MESSAGE_XP_MAX - MESSAGE_XP_MIN + 1));
      await this._addXp(message.client, message.guild, record, gained);
      await prisma.userLevel.update({ where: { userId: message.author.id }, data: { lastMessageAt: new Date() } });
    } catch (err) {
      await logError("levelService", "MESSAGE_XP_ERROR", err.message, { userId: message.author.id, stack: err.stack });
    }
  }

  async onVoiceJoin(userId) {
    try {
      await prisma.userLevel.upsert({
        where: { userId },
        update: { voiceJoinedAt: new Date() },
        create: { userId, voiceJoinedAt: new Date() },
      });
    } catch (err) {
      await logError("levelService", "VOICE_JOIN_ERROR", err.message, { userId, stack: err.stack });
    }
  }

  async onVoiceLeave(client, guild, userId) {
    try {
      const record = await prisma.userLevel.findUnique({ where: { userId } });
      if (!record?.voiceJoinedAt) return;

      const minutes = (Date.now() - record.voiceJoinedAt.getTime()) / 60000;
      const gained = Math.floor(minutes * VOICE_XP_PER_MINUTE);
      await prisma.userLevel.update({ where: { userId }, data: { voiceJoinedAt: null } });
      if (gained > 0) await this._addXp(client, guild, record, gained);
    } catch (err) {
      await logError("levelService", "VOICE_LEAVE_ERROR", err.message, { userId, stack: err.stack });
    }
  }

  async _addXp(client, guild, record, gained) {
    const newXp = record.xp + gained;
    const newLevel = levelFromXp(newXp);
    const leveledUp = newLevel > record.level;

    await prisma.userLevel.update({ where: { userId: record.userId }, data: { xp: newXp, level: newLevel } });

    if (leveledUp) await this._handleLevelUp(client, guild, record.userId, newLevel);
  }

  async _handleLevelUp(client, guild, userId, newLevel) {
    const channelId = await getBoundChannelId("LEVEL_UP");
    if (channelId) {
      const channel = await guild?.channels.fetch(channelId).catch(() => null);
      const embed = new EmbedBuilder()
        .setDescription(`🎉 <@${userId}> awansował(a) na **poziom ${newLevel}**!`)
        .setColor(0xf4900c);
      await channel?.send({ embeds: [embed] }).catch(() => null);
    }

    const reward = await prisma.levelRoleReward.findUnique({ where: { level: newLevel } });
    if (reward && guild) {
      const member = await guild.members.fetch(userId).catch(() => null);
      await member?.roles.add(reward.roleId).catch(() => null);
    }
  }

  /** Zwraca dane do embeda /level: xp, poziom, xp do następnego poziomu, ranking (pozycja). */
  async getProfile(userId) {
    const record = (await prisma.userLevel.findUnique({ where: { userId } })) ?? { xp: 0, level: 0 };
    const xpIntoLevel = record.xp - Array.from({ length: record.level }, (_, i) => xpNeededForLevel(i)).reduce((a, b) => a + b, 0);
    const xpForNext = xpNeededForLevel(record.level);
    const rank = (await prisma.userLevel.count({ where: { xp: { gt: record.xp } } })) + 1;
    return { xp: record.xp, level: record.level, xpIntoLevel, xpForNext, rank };
  }

  buildProgressBar(current, total, length = 20) {
    const filled = Math.round((current / total) * length);
    return "█".repeat(Math.max(0, Math.min(length, filled))) + "░".repeat(Math.max(0, length - filled));
  }
}

module.exports = new LevelService();
