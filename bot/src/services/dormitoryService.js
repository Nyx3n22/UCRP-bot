/**
 * services/dormitoryService.js
 * Mechanika 13: Akademiki.
 */

const prisma = require("../lib/prisma");

class DormitoryService {
  async moveIn(roomNumber, userId) {
    const room = await prisma.dormitoryRoom.findUnique({
      where: { roomNumber },
      include: { residents: true },
    });
    if (!room) throw new Error(`Nie znaleziono pokoju "${roomNumber}".`);

    const alreadyResident = await prisma.dormitoryResident.findFirst({ where: { userId } });
    if (alreadyResident) throw new Error("Jesteś już przypisany do innego pokoju — najpierw się wymelduj.");

    return prisma.dormitoryResident.create({ data: { roomId: room.id, userId } });
  }

  async moveOut(userId) {
    const resident = await prisma.dormitoryResident.findFirst({ where: { userId } });
    if (!resident) throw new Error("Nie mieszkasz obecnie w żadnym akademiku.");
    return prisma.dormitoryResident.delete({ where: { id: resident.id } });
  }

  /** Pobiera czynsz IC od wszystkich mieszkańców danego pokoju */
  async collectRent(roomNumber) {
    const room = await prisma.dormitoryRoom.findUnique({
      where: { roomNumber },
      include: { residents: true },
    });
    if (!room) throw new Error(`Nie znaleziono pokoju "${roomNumber}".`);

    const results = [];
    for (const resident of room.residents) {
      const character = await prisma.character.findUnique({ where: { userId: resident.userId } });
      if (!character || character.salaryIC < room.rentIC) {
        results.push({ userId: resident.userId, paid: false });
        continue;
      }
      await prisma.character.update({
        where: { userId: resident.userId },
        data: { salaryIC: { decrement: room.rentIC } },
      });
      results.push({ userId: resident.userId, paid: true, amount: room.rentIC });
    }
    return results;
  }

  async myRoom(userId) {
    const resident = await prisma.dormitoryResident.findFirst({
      where: { userId },
      include: { room: true },
    });
    return resident?.room ?? null;
  }
}

module.exports = new DormitoryService();
