/**
 * services/libraryService.js
 * Mechanika 9: Biblioteka Akademicka.
 * Zasoby (książki) dodawane w Dashboardzie (LibraryResource.totalCopies).
 * Bot pilnuje dostępności i terminów zwrotu.
 */

const prisma = require("../lib/prisma");

const DEFAULT_LOAN_DAYS = 14;

class LibraryService {
  async borrow(userId, resourceTitle, loanDays = DEFAULT_LOAN_DAYS) {
    const resource = await prisma.libraryResource.findFirst({ where: { title: resourceTitle } });
    if (!resource) throw new Error(`Nie znaleziono zasobu "${resourceTitle}" w bibliotece.`);

    const activeLoans = await prisma.libraryLoan.count({
      where: { resourceId: resource.id, returnedAt: null },
    });

    if (activeLoans >= resource.totalCopies) {
      throw new Error(`Brak dostępnych egzemplarzy "${resourceTitle}" — wszystkie wypożyczone.`);
    }

    const alreadyBorrowed = await prisma.libraryLoan.findFirst({
      where: { resourceId: resource.id, userId, returnedAt: null },
    });
    if (alreadyBorrowed) throw new Error("Masz już wypożyczony ten zasób.");

    const dueAt = new Date(Date.now() + loanDays * 24 * 60 * 60 * 1000);

    return prisma.libraryLoan.create({
      data: { resourceId: resource.id, userId, dueAt },
    });
  }

  async return_(userId, resourceTitle) {
    const resource = await prisma.libraryResource.findFirst({ where: { title: resourceTitle } });
    if (!resource) throw new Error(`Nie znaleziono zasobu "${resourceTitle}".`);

    const loan = await prisma.libraryLoan.findFirst({
      where: { resourceId: resource.id, userId, returnedAt: null },
    });
    if (!loan) throw new Error("Nie masz aktywnego wypożyczenia tego zasobu.");

    return prisma.libraryLoan.update({ where: { id: loan.id }, data: { returnedAt: new Date() } });
  }

  async myLoans(userId) {
    return prisma.libraryLoan.findMany({
      where: { userId, returnedAt: null },
      include: { resource: true },
    });
  }

  async availability(resourceTitle) {
    const resource = await prisma.libraryResource.findFirst({ where: { title: resourceTitle } });
    if (!resource) return null;
    const active = await prisma.libraryLoan.count({ where: { resourceId: resource.id, returnedAt: null } });
    return { total: resource.totalCopies, available: resource.totalCopies - active };
  }
}

module.exports = new LibraryService();
