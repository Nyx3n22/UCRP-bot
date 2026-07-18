/**
 * events/guildMemberUpdate.js
 * Wykrywa zmianę ról (np. nadanie tytułu naukowego lub roli Dziekana)
 * i aktualizuje Character.scientificTitle / Character.facultyId
 * bez potrzeby ręcznej komendy administracyjnej.
 */

const prisma = require("../lib/prisma");
const { getScientificTitleBinding, hasPermission } = require("../config/roles");

module.exports = {
  name: "guildMemberUpdate",
  async execute(oldMember, newMember) {
    const addedRoles = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
    if (addedRoles.size === 0) return;

    const character = await prisma.character.findUnique({ where: { userId: newMember.id } });
    if (!character) return;

    // 1) Sync tytułu naukowego -> automatyczny prefix nicku
    const titleBinding = await getScientificTitleBinding(newMember);
    if (titleBinding) {
      await prisma.character.update({
        where: { userId: newMember.id },
        data: { scientificTitle: titleBinding.label },
      });

      const desiredNick = `[${titleBinding.label}] ${character.firstNameIC} ${character.lastNameIC}`;
      await newMember.setNickname(desiredNick.slice(0, 32)).catch(() => null);
    }

    // 2) Sync wydziału (np. rola Dziekana konkretnego wydziału)
    const facultyBinding = addedRoles.find((r) => titleBinding?.discordRoleId !== r.id);
    if (facultyBinding) {
      const binding = await prisma.roleBinding.findUnique({ where: { discordRoleId: facultyBinding.id } });
      if (binding?.facultyId) {
        await prisma.character.update({
          where: { userId: newMember.id },
          data: { facultyId: binding.facultyId },
        });
      }
    }

    // 3) Kara "WYDALENIE" -> automatyczne zabranie roli Studenta obsługiwane
    // osobno w services/punishmentService.js (wywoływane z komendy administracyjnej,
    // nie stąd — to nie jest zmiana ról tylko jej przyczyna).
  },
};
