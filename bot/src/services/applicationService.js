/**
 * services/applicationService.js
 * Składanie podań przeniesione w całości do Dashboardu (publiczny formularz,
 * bez limitu 5 pól jaki mają Modale Discorda, plus AI generuje wstępną analizę
 * od razu po złożeniu). Ten serwis zajmuje się już tylko ROZPATRZENIEM podania,
 * które wciąż dzieje się na Discordzie (przyciski Akceptuj/Odrzuć na embedzie
 * wysłanym przez Dashboard).
 */

const prisma = require("../lib/prisma");
const { getRoleIdForPermission, PERMISSION_KEYS } = require("../config/roles");

const ROLE_ON_ACCEPT = {
  STUDENT: PERMISSION_KEYS.STUDENT_ROLE,
  WYKLADOWCA: PERMISSION_KEYS.WYKLADOWCA_ROLE,
  ADMINISTRACJA: PERMISSION_KEYS.ADMINISTRACJA_ROLE,
};

class ApplicationService {
  async review(applicationId, reviewerId, decision, guild) {
    const application = await prisma.application.findUnique({ where: { id: applicationId } });
    if (!application) throw new Error("Nie znaleziono podania.");
    if (application.status !== "PENDING") throw new Error("To podanie zostało już rozpatrzone.");

    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: { status: decision, reviewedById: reviewerId },
    });

    if (decision === "ACCEPTED") {
      const permissionKey = ROLE_ON_ACCEPT[application.type];
      const roleId = permissionKey ? await getRoleIdForPermission(permissionKey) : null;
      if (roleId) {
        const member = await guild.members.fetch(application.userId).catch(() => null);
        await member?.roles.add(roleId).catch(() => null);
      }
    }

    return updated;
  }
}

module.exports = new ApplicationService();
