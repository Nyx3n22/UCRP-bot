/**
 * events/guildMemberUpdate.js
 * Wykrywa zmianę ról i automatycznie aktualizuje profil postaci:
 *  1) tytuł naukowy -> prefix nicku
 *  2) wydział (np. rola Dziekana konkretnego wydziału)
 *  3) rok studiów (np. rola "Student Pierwszego Roku" -> yearOfStudy = 1)
 * Bez potrzeby ręcznej komendy administracyjnej.
 */

const prisma = require("../lib/prisma");
const { getScientificTitleBinding, getStudyYearBinding } = require("../config/roles");

module.exports = {
  name: "guildMemberUpdate",
  async execute(oldMember, newMember) {
    const addedRoles = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
    if (addedRoles.size === 0) return;

    const character = await prisma.character.findUnique({ where: { userId: newMember.id } });
    if (!character) return;

    const updateData = {};

    // 1) Sync tytułu naukowego -> automatyczny prefix nicku
    const titleBinding = await getScientificTitleBinding(newMember);
    if (titleBinding) {
      updateData.scientificTitle = titleBinding.label;
    }

    // 2) Sync wydziału (np. rola Dziekana konkretnego wydziału, lub dowolna rola z przypisanym facultyId)
    for (const role of addedRoles.values()) {
      // findFirst zamiast findUnique - jedna rola może mieć teraz kilka powiązań (różne permissionKey)
      const binding = await prisma.roleBinding.findFirst({ where: { discordRoleId: role.id, facultyId: { not: null } } });
      if (binding?.facultyId) {
        updateData.facultyId = binding.facultyId;
        break;
      }
    }

    // 3) Sync roku studiów (np. rola "Student Pierwszego Roku" -> yearOfStudy = 1)
    const studyYearBinding = await getStudyYearBinding(newMember);
    if (studyYearBinding) {
      updateData.yearOfStudy = studyYearBinding.studyYear;
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.character.update({ where: { userId: newMember.id }, data: updateData });
    }

    if (titleBinding) {
      const desiredNick = `[${titleBinding.label}] ${character.firstNameIC} ${character.lastNameIC}`;
      await newMember.setNickname(desiredNick.slice(0, 32)).catch(() => null);
    }

    // 4) Kara "WYDALENIE" -> automatyczne zabranie roli Studenta obsługiwane
    // osobno w services/punishmentService.js (wywoływane z komendy administracyjnej,
    // nie stąd — to nie jest zmiana ról tylko jej przyczyna).
  },
};
