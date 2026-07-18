/**
 * services/attendanceService.js
 * Mechanika 7: Rejestrator Frekwencji.
 * Kanały głosowe uznawane za "Sale Wykładowe" są oznaczone w Dashboardzie
 * (ChannelBinding z kluczem LECTURE_HALL_<id> lub prefixem nazwy — tu
 * używamy prostszego podejścia: lista ID w AiConfig-podobnej tabeli
 * LectureHallConfig po stronie Dashboardu; tu odpytujemy ChannelBinding
 * z kluczem "LECTURE_HALL" jako JSON-string tablicy ID).
 */

const prisma = require("../lib/prisma");
const { getBoundChannelId } = require("../config/channels");

class AttendanceService {
  async isLectureHall(channelId) {
    const raw = await getBoundChannelId("LECTURE_HALLS_JSON");
    if (!raw) return false;
    try {
      const ids = JSON.parse(raw);
      return ids.includes(channelId);
    } catch {
      return false;
    }
  }

  async onJoin(userId, channelId) {
    await prisma.attendanceLog.create({
      data: { userId, voiceChannelId: channelId, joinedAt: new Date() },
    });
  }

  async onLeave(userId, channelId) {
    const open = await prisma.attendanceLog.findFirst({
      where: { userId, voiceChannelId: channelId, leftAt: null },
      orderBy: { joinedAt: "desc" },
    });
    if (!open) return;

    const leftAt = new Date();
    const durationSec = Math.floor((leftAt.getTime() - open.joinedAt.getTime()) / 1000);

    await prisma.attendanceLog.update({
      where: { id: open.id },
      data: { leftAt, durationSec },
    });
  }

  /** Raport sumarycznego czasu danego studenta na salach wykładowych */
  async report(userId, sinceDays = 30) {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const logs = await prisma.attendanceLog.findMany({
      where: { userId, joinedAt: { gte: since }, durationSec: { not: null } },
    });
    const totalSec = logs.reduce((sum, l) => sum + (l.durationSec ?? 0), 0);
    return { totalMinutes: Math.round(totalSec / 60), sessions: logs.length };
  }
}

module.exports = new AttendanceService();
