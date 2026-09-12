/**
 * test/moderacjaPermissions.test.js
 *
 * Test integracyjny „podłączenia" nowych uprawnień do komend: /moderacja ma
 * honorować RANGI z hierarchii, a nie jeden stary klucz MODERATE. Uruchamia
 * prawdziwy moduł komendy na fałszywej interakcji — sprawdzamy tylko bramkę
 * uprawnień (czy komenda w ogóle pozwoliła wykonać akcję).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

// ---------- stub bazy (jak w koloService.test.js) ----------
let bindings = [];
const actionLog = [];
const punishments = [];
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    roleBinding: {
      findMany: async () => bindings.map((b) => ({ ...b })),
      findFirst: async ({ where }) => bindings.find((b) => b.permissionKey === where?.permissionKey) ?? null,
    },
    channelBinding: { findFirst: async () => null },
    punishment: {
      create: async ({ data }) => {
        const punishment = { id: `pun${punishments.length + 1}`, ...data };
        punishments.push(punishment);
        return punishment;
      },
    },
    actionLog: {
      create: async ({ data }) => {
        actionLog.push(data);
        return { id: `log${actionLog.length}`, ...data };
      },
    },
  },
  children: [],
  paths: [],
};

// ensureDiscordUser jest wołany przy wydawaniu kar — bez niego test musiałby
// emulować cały model DiscordUser.
const ensureUserPath = require.resolve("../src/utils/ensureUser");
require.cache[ensureUserPath] = {
  id: ensureUserPath,
  filename: ensureUserPath,
  loaded: true,
  exports: { ensureDiscordUser: async (id) => ({ id }) },
  children: [],
  paths: [],
};

const { PERMISSION_KEYS, invalidatePermissionCache } = require("../src/config/roles");
const moderacja = require("../src/commands/admin/moderacja");

function setBindings(...permissionKeys) {
  bindings = permissionKeys.map((permissionKey, i) => ({
    id: `b${i}`,
    discordRoleId: `role-${permissionKey}`,
    permissionKey,
    label: permissionKey,
    facultyId: null,
    studyYear: null,
  }));
  invalidatePermissionCache();
}

function memberWith(...permissionKeys) {
  return {
    id: "mod1",
    roles: { cache: new Map(permissionKeys.map((k) => [`role-${k}`, { id: `role-${k}`, name: k }])) },
  };
}

/** Fałszywa interakcja — zapisuje to, co komenda „odpowiedziała". */
function fakeInteraction(member, subcommand, options = {}) {
  const replies = [];
  const target = {
    id: "target1",
    displayAvatarURL: () => "https://cdn/avatar.png",
    timeout: async () => undefined,
    kick: async () => undefined,
    send: async () => undefined,
    roles: { remove: async () => undefined, add: async () => undefined },
  };
  return {
    replies,
    member,
    user: { id: "mod1" },
    guild: {
      members: {
        ban: async () => undefined,
        fetch: async () => target,
      },
    },
    channel: { id: "chan1", bulkDelete: async () => new Map([[1, {}]]) },
    options: {
      getSubcommand: () => subcommand,
      getUser: () => target,
      getString: () => options.reason ?? "test",
      getInteger: () => options.amount ?? 10,
    },
    reply: async (payload) => {
      replies.push(payload);
      return payload;
    },
  };
}

/**
 * Treść embeda z odpowiedzi (łączy title + description).
 * ui.* zwraca discord.js EmbedBuilder — treść siedzi w `.data`.
 */
function replyText(interaction) {
  assert.equal(interaction.replies.length, 1, "komenda powinna odpowiedzieć dokładnie raz");
  const embed = interaction.replies[0].embeds?.[0];
  const data = embed?.data ?? embed ?? {};
  return `${data.title ?? ""} ${data.description ?? ""}`;
}

test("/moderacja mute: Młodszy Moderator przechodzi (TIMEOUT_MEMBERS z hierarchii)", async () => {
  setBindings(PERMISSION_KEYS.MLODSZY_MODERATOR);
  const member = memberWith(PERMISSION_KEYS.MLODSZY_MODERATOR);
  const interaction = fakeInteraction(member, "mute", { amount: 10 });

  await moderacja.execute(interaction);

  assert.ok(actionLog.some((l) => l.action === "MUTE"), "akcja MUTE powinna zostać wykonana i zalogowana");
  assert.match(replyText(interaction), /wyciszony/i);
});

test("/moderacja ban: Młodszy Moderator dostaje odmowę (za niska ranga)", async () => {
  setBindings(PERMISSION_KEYS.MLODSZY_MODERATOR);
  const interaction = fakeInteraction(memberWith(PERMISSION_KEYS.MLODSZY_MODERATOR), "ban");

  await moderacja.execute(interaction);

  const text = replyText(interaction);
  assert.match(text, /BAN_MEMBERS/, "komunikat powinien wskazywać brakujące uprawnienie");
  assert.match(text, /Starszy Moderator/, "komunikat powinien podpowiadać wymaganą rangę");
  assert.equal(actionLog.some((l) => l.action === "BAN"), false, "ban nie może się wykonać");
});

test("/moderacja ban: Starszy Moderator przechodzi (BAN_MEMBERS z hierarchii)", async () => {
  setBindings(PERMISSION_KEYS.STARSZY_MODERATOR);
  const interaction = fakeInteraction(memberWith(PERMISSION_KEYS.STARSZY_MODERATOR), "ban");

  await moderacja.execute(interaction);

  assert.ok(actionLog.some((l) => l.action === "BAN"), "Starszy Moderator może banować");
  assert.match(replyText(interaction), /zbanowany/i);
});

test("/moderacja ban: stara rola MODERATE nadal przechodzi (kompatybilność)", async () => {
  setBindings(PERMISSION_KEYS.MODERATE);
  const interaction = fakeInteraction(memberWith(PERMISSION_KEYS.MODERATE), "ban");

  await moderacja.execute(interaction);

  assert.ok(actionLog.some((l) => l.action === "BAN"), "legacy MODERATE zachowuje bana");
});

test("/moderacja kara: wydalenie wymaga góry hierarchii, upomnienie — nie", async () => {
  setBindings(PERMISSION_KEYS.MLODSZY_MODERATOR);

  const wydalenie = fakeInteraction(memberWith(PERMISSION_KEYS.MLODSZY_MODERATOR), "kara");
  wydalenie.options.getString = (name) => (name === "rodzaj" ? "WYDALENIE" : "powód");
  await moderacja.execute(wydalenie);
  assert.match(replyText(wydalenie), /WYDALENIE/, "Młodszy Moderator nie może wydalać");

  const upomnienie = fakeInteraction(memberWith(PERMISSION_KEYS.MLODSZY_MODERATOR), "kara");
  upomnienie.options.getString = (name) => (name === "rodzaj" ? "UPOMNIENIE" : "powód");
  await moderacja.execute(upomnienie);
  assert.match(replyText(upomnienie), /Upomnienie|kara/i);
  assert.equal(punishments.length, 1, "upomnienie powinno zostać zapisane w dzienniku kar");
  assert.equal(punishments[0].severity, "UPOMNIENIE");
});

test("/moderacja: osoba bez żadnej rangi dostaje odmowę", async () => {
  setBindings();
  const interaction = fakeInteraction(memberWith(), "clear", { amount: 5 });

  await moderacja.execute(interaction);

  assert.match(replyText(interaction), /CLEAR_MESSAGES/);
});
