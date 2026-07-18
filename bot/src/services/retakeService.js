/**
 * services/retakeService.js
 * Mechanika 10: Zaliczenia Warunkowe (Warunki).
 * Student/kadra zgłasza powtarzanie przedmiotu; bot pobiera opłatę IC
 * z Character.salaryIC (symbolicznie — traktujemy saldo jako portfel IC).
 */

const prisma = require("../lib/prisma");

const DEFAULT_FEE_IC = 300;

class RetakeService {
  async reportRetake(userId, subjectName, feeIC = DEFAULT_FEE_IC) {
    const subject = await prisma.subject.findFirst({ where: { name: subjectName } });
    if (!subject) throw new Error(`Nie znaleziono przedmiotu "${subjectName}".`);

    const character = await prisma.character.findUnique({ where: { userId } });
    if (!character) throw new Error("Brak profilu postaci.");
    if (character.salaryIC < feeIC) {
      throw new Error(`Za mało środków IC na opłatę warunkową (potrzeba ${feeIC}, masz ${character.salaryIC}).`);
    }

    await prisma.character.update({
      where: { userId },
      data: { salaryIC: { decrement: feeIC } },
    });

    return prisma.conditionalRetake.create({
      data: { userId, subjectId: subject.id, feeIC },
    });
  }

  async history(userId) {
    return prisma.conditionalRetake.findMany({ where: { userId }, orderBy: { reportedAt: "desc" } });
  }
}

module.exports = new RetakeService();
