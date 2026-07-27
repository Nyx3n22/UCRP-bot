/**
 * services/scholarshipService.js
 * Mechanika 8: System Stypendialny.
 * Kadra/Dziekanat uruchamia wypłatę dla studentów z GPA powyżej progu
 * (próg i kwota konfigurowalne z Dashboardu — tu jako parametry wywołania,
 * z sensownymi wartościami domyślnymi).
 */

const prisma = require("../lib/prisma");

const DEFAULT_MIN_GPA = 4.5;
const DEFAULT_AMOUNT_IC = 1500;

class ScholarshipService {
  async calculateGpa(userId) {
    const grades = await prisma.grade.findMany({ where: { userId } });
    if (grades.length === 0) return null;
    return grades.reduce((sum, g) => sum + g.value, 0) / grades.length;
  }

  /** Przetwarza wszystkich studentów danego wydziału i wypłaca stypendia kwalifikującym się */
  async runPayoutForFaculty(facultyId, { minGpa = DEFAULT_MIN_GPA, amountIC = DEFAULT_AMOUNT_IC } = {}, client = null) {
    const students = await prisma.character.findMany({ where: { facultyId } });
    const results = [];

    for (const student of students) {
      const gpa = await this.calculateGpa(student.userId);
      if (gpa === null || gpa < minGpa) continue;

      await prisma.scholarship.create({
        data: { userId: student.userId, amountIC, gpaAtIssue: gpa },
      });
      await prisma.character.update({
        where: { userId: student.userId },
        data: { salaryIC: { increment: amountIC } },
      });

      if (client) {
        const user = await client.users.fetch(student.userId).catch(() => null);
        await user
          ?.send(`🎓 **Otrzymałeś/aś stypendium!** ${amountIC} IC za średnią ${gpa.toFixed(2)}.`)
          .catch(() => null);
      }

      results.push({ userId: student.userId, gpa, amountIC });
    }

    return results;
  }

  async history(userId) {
    return prisma.scholarship.findMany({ where: { userId }, orderBy: { issuedAt: "desc" } });
  }
}

module.exports = new ScholarshipService();
