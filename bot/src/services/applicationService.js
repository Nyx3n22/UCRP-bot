/**
 * services/applicationService.js
 * Realizuje pkt. 2 (Podania Rekrutacyjne): aplikacje na studentów/wykładowców/
 * administrację wypełniane w bocie (Modal), wysyłane na kanały ustawione
 * w Dashboardzie, rozpatrywane przyciskami Akceptuj/Odrzuć.
 */

const prisma = require("../lib/prisma");
const { getRoleIdForPermission, PERMISSION_KEYS } = require("../config/roles");

const ROLE_ON_ACCEPT = {
  STUDENT: PERMISSION_KEYS.STUDENT_ROLE,
  WYKLADOWCA: PERMISSION_KEYS.WYKLADOWCA_ROLE,
  ADMINISTRACJA: PERMISSION_KEYS.ADMINISTRACJA_ROLE,
};

class ApplicationService {
  async submit(userId, type, answers) {
    const pending = await prisma.application.findFirst({
      where: { userId, type, status: "PENDING" },
    });
    if (pending) throw new Error("Masz już złożone i nierozpatrzone podanie tego typu.");

    return prisma.application.create({
      data: { userId, type, answers, status: "PENDING" },
    });
  }

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

  async myApplications(userId) {
    return prisma.application.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  }
}

module.exports = new ApplicationService();
