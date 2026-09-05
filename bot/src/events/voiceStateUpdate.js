/**
 * events/voiceStateUpdate.js
 * Podpina attendanceService pod wejścia/wyjścia z kanałów głosowych
 * oznaczonych jako "Sala Wykładowa" w Dashboardzie.
 */

const attendanceService = require("../services/attendanceService");
const levelService = require("../services/levelService");

module.exports = {
  name: "voiceStateUpdate",
  async execute(oldState, newState) {
    const userId = newState.id ?? oldState.id;

    const leftChannel = oldState.channelId;
    const joinedChannel = newState.channelId;

    if (leftChannel === joinedChannel) return; // np. mute/deafen bez zmiany kanału

    if (leftChannel && (await attendanceService.isLectureHall(leftChannel))) {
      await attendanceService.onLeave(userId, leftChannel);
    }
    if (leftChannel) {
      await levelService.onVoiceLeave(oldState.guild.client, oldState.guild, userId);
    }

    if (joinedChannel && (await attendanceService.isLectureHall(joinedChannel))) {
      await attendanceService.onJoin(userId, joinedChannel);
    }
    if (joinedChannel) {
      await levelService.onVoiceJoin(userId);
    }
  },
};
