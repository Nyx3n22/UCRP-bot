/**
 * services/thesisService.js
 * Mechanika 12: Rejestracja Prac Dyplomowych.
 */

const prisma = require("../lib/prisma");

class ThesisService {
  async register(studentId, supervisorId, title) {
    const existing = await prisma.thesisRegistration.findFirst({
      where: { studentId, status: { in: ["IN_PROGRESS", "UNDER_REVIEW"] } },
    });
    if (existing) throw new Error("Masz już aktywną, niezamkniętą pracę dyplomową.");

    return prisma.thesisRegistration.create({
      data: { studentId, supervisorId, title, status: "IN_PROGRESS" },
    });
  }

  async updateStatus(thesisId, status, actorId) {
    const thesis = await prisma.thesisRegistration.findUnique({ where: { id: thesisId } });
    if (!thesis) throw new Error("Nie znaleziono pracy o podanym ID.");
    if (thesis.supervisorId !== actorId) throw new Error("Tylko przypisany promotor może zmienić status.");

    return prisma.thesisRegistration.update({ where: { id: thesisId }, data: { status } });
  }

  async myThesis(studentId) {
    return prisma.thesisRegistration.findFirst({
      where: { studentId },
      orderBy: { updatedAt: "desc" },
    });
  }
}

module.exports = new ThesisService();
