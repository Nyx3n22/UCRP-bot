/**
 * services/punishmentService.js
 * Realizuje pkt. 15 z listy mechanik: dziennik kar + automatyczne
 * zabranie roli "Student" gdy severity = WYDALENIE.
 */

const prisma = require("../lib/prisma");
const { getBoundChannelId } = require("../config/channels");

const STUDENT_PERMISSION_KEY = "STUDENT_ROLE"; // binding w RoleBinding wskazujący rolę Student

class PunishmentService {
  async issue(guild, { targetUserId, issuedById, reason, severity, expiresAt }) {
    const punishment = await prisma.punishment.create({
      data: { userId: targetUserId, issuedById, reason, severity, expiresAt },
    });

    if (severity === "WYDALENIE") {
      await this._expelStudent(guild, targetUserId);
    }

    const logChannelId = await getBoundChannelId("LOG_PUNISHMENTS");
    if (logChannelId) {
      const channel = await guild.channels.fetch(logChannelId).catch(() => null);
      await channel?.send(
        `⚖️ **Kara wydana:** <@${targetUserId}>\n` +
          `Rodzaj: **${severity}**\nPowód: ${reason}\nWydał: <@${issuedById}>`
      );
    }

    return punishment;
  }

  async _expelStudent(guild, targetUserId) {
    const studentBinding = await prisma.roleBinding.findFirst({
      where: { permissionKey: STUDENT_PERMISSION_KEY },
    });
    if (!studentBinding) return;

    const member = await guild.members.fetch(targetUserId).catch(() => null);
    if (!member) return;

    await member.roles.remove(studentBinding.discordRoleId).catch(() => null);

    // Wydalenie kończy też status studenta w profilu postaci (bez usuwania historii RP)
    await prisma.character
      .update({ where: { userId: targetUserId }, data: { yearOfStudy: null } })
      .catch(() => null);
  }

  async history(targetUserId) {
    return prisma.punishment.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: "desc" },
    });
  }
}

module.exports = new PunishmentService();
