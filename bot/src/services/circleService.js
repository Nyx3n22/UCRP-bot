/**
 * services/circleService.js
 * Mechanika 11: Koła Naukowe.
 */

const prisma = require("../lib/prisma");

class CircleService {
  async create(name, leaderId) {
    const existing = await prisma.scientificCircle.findUnique({ where: { name } });
    if (existing) throw new Error(`Koło naukowe "${name}" już istnieje.`);

    const circle = await prisma.scientificCircle.create({ data: { name, leaderId } });
    await prisma.scientificCircleMember.create({ data: { circleId: circle.id, userId: leaderId } });
    return circle;
  }

  async join(name, userId) {
    const circle = await prisma.scientificCircle.findUnique({ where: { name } });
    if (!circle) throw new Error(`Nie znaleziono koła "${name}".`);

    const existing = await prisma.scientificCircleMember.findUnique({
      where: { circleId_userId: { circleId: circle.id, userId } },
    });
    if (existing) throw new Error("Już należysz do tego koła.");

    return prisma.scientificCircleMember.create({ data: { circleId: circle.id, userId } });
  }

  async leave(name, userId) {
    const circle = await prisma.scientificCircle.findUnique({ where: { name } });
    if (!circle) throw new Error(`Nie znaleziono koła "${name}".`);

    return prisma.scientificCircleMember.delete({
      where: { circleId_userId: { circleId: circle.id, userId } },
    });
  }

  async adjustBudget(name, deltaIC, actorId) {
    const circle = await prisma.scientificCircle.findUnique({ where: { name } });
    if (!circle) throw new Error(`Nie znaleziono koła "${name}".`);
    if (circle.leaderId !== actorId) throw new Error("Tylko lider koła może zarządzać budżetem.");

    return prisma.scientificCircle.update({
      where: { name },
      data: { budgetIC: { increment: deltaIC } },
    });
  }

  async status(name) {
    return prisma.scientificCircle.findUnique({
      where: { name },
      include: { members: true },
    });
  }
}

module.exports = new CircleService();
