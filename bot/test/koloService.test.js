/**
 * Test smoke dla przebudowanych Kół Naukowych.
 *
 * Uruchamia PRAWDZIWE moduły (services/koloService.js, scheduler,
 * events/interactionCreate) z podmienioną warstwą bazy: `prisma generate`
 * wymaga pobrania binarek z binaries.prisma.sh, co w środowisku offline
 * nie działa, więc @prisma/client jest podstawiony in-memory store'em.
 * Logika serwisu, budowanie embedów/przycisków i routing customId są
 * wykonywane naprawdę.
 *
 *   npm test          (albo: node --test test/)
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// getKolaGuild czyta tę zmienną - bez niej zwraca null i ścieżki wymagające
// serwera Kół (np. zmiana wicelidera) kończyłyby się na "błąd konfiguracji".
process.env.KOLA_GUILD_ID = "kola-guild";

// ---------- 1) Stub @prisma/client, ZANIM cokolwiek go zaimportuje ----------
const prismaClientPath = require.resolve("@prisma/client");
class PrismaClientStub {}
require.cache[prismaClientPath] = {
  id: prismaClientPath,
  filename: prismaClientPath,
  loaded: true,
  exports: { PrismaClient: PrismaClientStub },
  children: [],
  paths: [],
};

// ---------- 2) In-memory baza ----------
const db = {
  kolo: [],
  koloMember: [],
  koloInvite: [],
  research: [],
  researchMember: [],
  koloCustomRole: [],
  koloChangeRequest: [],
  researchTopic: [{ id: "rt1", title: "temat z listy", active: true }],
  aiConfig: [], // brak wpisu => _aiScore zwraca score 1.0 bez sieci
  channelBinding: [],
  generalConfig: [{ id: "singleton", serverInviteLink: null, koloInactivityDays: 30 }],
  errorLog: [],
  actionLog: [],
};
let seq = 0;
const uid = () => `id${++seq}`;

const prisma = require("../src/lib/prisma");

// proste dopasowywanie `where` dla potrzeb testu
function matches(row, where = {}) {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "kolo") {
      const k = db.kolo.find((x) => x.id === row.koloId);
      return k ? matches(k, cond) : false;
    }
    const val = row[key];
    if (cond && typeof cond === "object" && !Array.isArray(cond) && !(cond instanceof Date)) {
      if ("in" in cond) return cond.in.includes(val);
      if ("lt" in cond) return val < cond.lt;
      if ("gt" in cond) return val > cond.gt;
      if ("not" in cond) return val !== cond.not;
      return true;
    }
    if (cond instanceof Date || typeof cond !== "object") return String(val) === String(cond);
    return true;
  });
}

function makeModel(name) {
  const table = () => db[name];
  return {
    findMany: async ({ where, orderBy, take } = {}) => {
      let rows = table().filter((r) => matches(r, where));
      if (orderBy?.createdAt === "desc") rows = [...rows].reverse();
      if (take) rows = rows.slice(0, take);
      return rows.map((r) => ({ ...r }));
    },
    findFirst: async ({ where } = {}) => {
      const row = table().find((r) => matches(r, where));
      if (!row) return null;
      const out = { ...row };
      if (where?.kolo) out.kolo = db.kolo.find((k) => k.id === row.koloId);
      return out;
    },
    findUnique: async ({ where, include } = {}) => {
      const attach = (row) => {
        if (!row) return null;
        const out = { ...row };
        if (include?.members && name === "kolo") {
          out.members = db.koloMember.filter((m) => m.koloId === row.id).map((m) => ({ ...m }));
        }
        if (include?.kolo && row.koloId) {
          out.kolo = db.kolo.find((k) => k.id === row.koloId) || null;
        }
        return out;
      };
      if (where.id) return attach(table().find((r) => r.id === where.id) || null);
      const comboKey = Object.keys(where).find((k) => k.includes("_"));
      if (comboKey) {
        const parts = where[comboKey];
        return attach(table().find((r) => Object.entries(parts).every(([k, v]) => String(r[k]) === String(v))) || null);
      }
      return attach(table().find((r) => matches(r, where)) || null);
    },
    count: async ({ where } = {}) => table().filter((r) => matches(r, where)).length,
    create: async ({ data }) => {
      const row = { id: data.id || uid(), ...data, createdAt: new Date() };
      table().push(row);
      return { ...row };
    },
    upsert: async ({ where, create, update }) => {
      const existing = await makeModel(name).findUnique({ where });
      if (existing) {
        Object.assign(existing, update || {});
        return { ...existing };
      }
      return makeModel(name).create({ data: create });
    },
    update: async ({ where, data, include }) => {
      const row = table().find((r) => (where.id ? r.id === where.id : matches(r, where)));
      if (!row) throw new Error(`${name}: nie znaleziono wiersza do aktualizacji`);
      Object.assign(row, data);
      // Prisma z `include` zwraca relacje - bez tego _advanceToReview nie
      // dostałby kolo.members i padł na .length.
      return makeModel(name).findUnique({ where: { id: row.id }, include });
    },
    updateMany: async ({ where, data }) => {
      const rows = table().filter((r) => matches(r, where));
      rows.forEach((r) => Object.assign(r, data));
      return { count: rows.length };
    },
    delete: async ({ where }) => {
      const i = table().findIndex((r) => (where.id ? r.id === where.id : matches(r, where)));
      if (i === -1) throw new Error(`${name}: nie znaleziono wiersza do usunięcia`);
      return table().splice(i, 1)[0];
    },
    deleteMany: async ({ where }) => {
      const before = table().length;
      db[name] = table().filter((r) => !matches(r, where));
      return { count: before - db[name].length };
    },
  };
}

for (const name of Object.keys(db)) {
  Object.defineProperty(prisma, name, { value: makeModel(name), configurable: true });
}
prisma.$transaction = async (ops) => Promise.all(ops);

// ---------- 3) Fałszywy klient Discord ----------
const sentMessages = [];
function makeFakeClient() {
  const dmChannels = new Map(); // jeden kanal DM na uzytkownika - jak w prawdziwym Discordzie
  const guildMembers = new Map();
  const kolaGuild = {
    id: "kola-guild",
    members: {
      fetch: async (id) => {
        if (!guildMembers.has(id)) {
          guildMembers.set(id, { id, roles: { add: async () => {}, remove: async () => {} } });
        }
        return guildMembers.get(id);
      },
    },
    roles: { fetch: async () => null, create: async () => ({ id: uid() }) },
    channels: { fetch: async () => null, create: async () => ({ id: uid() }) },
  };
  return {
    user: { id: "bot1" },
    guilds: { cache: new Map([["kola-guild", kolaGuild]]) },
    users: {
      fetch: async (id) => ({
        id,
        tag: `user#${id}`,
        send: async (payload) => {
          sentMessages.push({ to: id, payload });
          return { id: uid() };
        },
        createDM: async () => {
          if (!dmChannels.has(id)) dmChannels.set(id, makeFakeChannel(id));
          return dmChannels.get(id);
        },
      }),
    },
    channels: { fetch: async () => null },
  };
}
function makeFakeChannel(ownerId) {
  const messages = new Map();
  return {
    id: `dm-${ownerId}`,
    messages: {
      fetch: async (id) => messages.get(id) || null,
    },
    send: async (payload) => {
      const msg = {
        id: uid(),
        edit: async (p) => {
          Object.assign(msg, p);
          msg.edited = (msg.edited || 0) + 1;
          return msg;
        },
        ...payload,
      };
      messages.set(msg.id, msg);
      sentMessages.push({ to: ownerId, payload, msg });
      return msg;
    },
  };
}

// ---------- 4) Prawdziwy serwis ----------
const koloService = require("../src/services/koloService");

function makeKolo(over = {}) {
  return {
    id: "kolo1",
    name: "Koło Testowe",
    description: "opis",
    logoUrl: null,
    colorHex: "#2b6cb0",
    leaderId: "leader1",
    status: "PENDING_MEMBERS",
    categoryId: null,
    channelAnnouncements: null,
    channelChat: null,
    channelResearch: null,
    channelManage: null,
    channelDocuments: null,
    channelVoice: null,
    roleIdDivider: null,
    roleIdLeader: null,
    roleIdVice: null,
    roleIdMember: null,
    belowMinSince: null,
    panelMessageId: null,
    lastActivityAt: null,
    inactivityWarnedAt: null,
    createdAt: new Date(),
    ...over,
  };
}

function resetDb(koloOver = {}) {
  db.kolo = [makeKolo(koloOver)];
  db.koloMember = [];
  db.koloInvite = [];
  db.research = [];
  db.researchMember = [];
  db.koloCustomRole = [];
  db.koloChangeRequest = [];
  db.researchTopic = [{ id: "rt1", title: "temat z listy", active: true }];
  db.generalConfig = [{ id: "singleton", serverInviteLink: null, koloInactivityDays: 30 }];
  sentMessages.length = 0;
}

function fakeInteraction(over = {}) {
  const state = { replies: [], edits: [], followUps: [] };
  return {
    state,
    user: { id: "leader1", tag: "leader#1" },
    client: makeFakeClient(),
    values: [],
    fields: { getTextInputValue: () => "temat z listy" },
    deferUpdate: async () => {},
    deferReply: async () => {},
    editReply: async (p) => state.edits.push(p),
    followUp: async (p) => state.followUps.push(p),
    reply: async (p) => state.replies.push(p),
    ...over,
  };
}

/**
 * Wyciąga przyciski z payloadu. discord.js v14 trzyma dane builderów w
 * formie zserializowanej (custom_id / disabled), więc czytamy przez
 * toJSON() zamiast pól camelCase (te są undefined).
 */
function buttonsOf(payload) {
  const out = [];
  for (const row of payload.components || []) {
    const json = typeof row.toJSON === "function" ? row.toJSON() : row;
    for (const c of json.components || []) if (c.custom_id) out.push(c);
  }
  return out;
}
const customIds = (payload) => buttonsOf(payload).map((b) => b.custom_id);
const labels = (payload) => buttonsOf(payload).map((b) => b.label);
/** Treść pierwszego embeda (EmbedBuilder trzyma ją w .data / toJSON()). */
const embedText = (payload) => {
  const e = payload.embeds[0];
  const json = typeof e.toJSON === "function" ? e.toJSON() : e;
  return `${json.title || ""}\n${json.description || ""}`;
};

// ==================== TESTY ====================

test("komenda /kolo nie istnieje (usunęliśmy plik i loader jej nie widzi)", () => {
  const fs = require("node:fs");
  assert.equal(fs.existsSync(path.join(__dirname, "../src/commands/academic/kolo.js")), false);
  // serwis nie eksportuje już handlerów komend
  for (const gone of ["cmdInvite", "cmdKick", "cmdChangeRequest", "cmdStartResearch", "cmdManageResearch", "cmdLeave"]) {
    assert.equal(typeof koloService[gone], "undefined", `${gone} powinno być usunięte`);
  }
});

test("panel lidera w PENDING_MEMBERS: zaproś / cofnij / odśwież / wycofaj zgłoszenie", async () => {
  resetDb({ status: "PENDING_MEMBERS" });
  db.koloMember.push({ id: uid(), koloId: "kolo1", userId: "leader1", role: "LEADER", consentGiven: false });
  db.koloInvite.push(
    { id: "inv1", koloId: "kolo1", userId: "userA", status: "PENDING", expiresAt: new Date(Date.now() + 3600_000) },
    { id: "inv2", koloId: "kolo1", userId: "userB", status: "DECLINED", expiresAt: new Date(Date.now() + 3600_000) }
  );

  const payload = await koloService._buildLeaderPanel("kolo1");
  assert.ok(embedText(payload).includes("Zgłoszenie - zbieranie członków"));
  assert.ok(embedText(payload).includes("<@userA>"), "panel pokazuje kto jeszcze nie zaakceptował");
  assert.deepEqual(customIds(payload), [
    "kolo_panel_invite:kolo1",
    "kolo_panel_revoke:kolo1",
    "kolo_panel_refresh:kolo1",
    "kolo_panel_confirm:withdraw:kolo1",
  ]);
  assert.deepEqual(labels(payload), ["Zaproś osobę", "Cofnij zaproszenie", "Odśwież", "Wycofaj zgłoszenie"]);
});

test("panel lidera w ACTIVE: pełne zarządzanie + badania + rozwiązanie", async () => {
  resetDb({ status: "ACTIVE" });
  const payload = await koloService._buildLeaderPanel("kolo1");
  assert.deepEqual(customIds(payload), [
    "kolo_panel_invite:kolo1",
    "kolo_panel_revoke:kolo1",
    "kolo_panel_refresh:kolo1",
    "kolo_panel_manage:kolo1",
    "kolo_panel_research:kolo1",
    "kolo_panel_confirm:dissolve:kolo1",
  ]);
});

test("'Cofnij zaproszenie' jest wyłączone, gdy nie ma oczekujących zaproszeń", async () => {
  resetDb({ status: "PENDING_MEMBERS" });
  const payload = await koloService._buildLeaderPanel("kolo1");
  const revoke = buttonsOf(payload).find((b) => b.custom_id === "kolo_panel_revoke:kolo1");
  assert.equal(revoke.disabled, true);
});

test("panel członka: status, własne badania i przycisk wyjścia", async () => {
  resetDb({ status: "ACTIVE" });
  db.koloMember.push({ id: uid(), koloId: "kolo1", userId: "member1", role: "MEMBER", consentGiven: true });
  db.research.push({ id: "r1", koloId: "kolo1", topic: "Badanie A", status: "ACTIVE", isCustomTopic: false });
  db.researchMember.push({ id: uid(), researchId: "r1", userId: "member1" });

  const payload = await koloService._buildMemberPanel("kolo1", "member1");
  assert.ok(embedText(payload).includes("Badanie A"));
  assert.deepEqual(customIds(payload), ["kolo_panel_refresh_member:kolo1", "kolo_panel_confirm:leave:kolo1"]);
});

test("cofnięcie zaproszenia z panelu: status EXPIRED + DM do zaproszonego", async () => {
  resetDb({ status: "PENDING_MEMBERS" });
  db.koloMember.push({ id: uid(), koloId: "kolo1", userId: "leader1", role: "LEADER", consentGiven: false });
  db.koloInvite.push({ id: "inv1", koloId: "kolo1", userId: "userA", status: "PENDING", expiresAt: new Date(Date.now() + 3600_000) });

  const interaction = fakeInteraction({ values: ["inv1"] });
  await koloService.handleInviteRevokeSelect(interaction, "kolo1");

  assert.equal(db.koloInvite[0].status, "EXPIRED");
  assert.ok(sentMessages.some((m) => m.to === "userA" && String(m.payload).includes("cofnięte")));
  assert.ok(interaction.state.edits[0].content.includes("Cofnięto zaproszenie"));
});

test("lider aktywnego koła nie może wyjść (_leaveCore), członek może", async () => {
  resetDb({ status: "ACTIVE" });
  const leaderMembership = { id: "m1", koloId: "kolo1", userId: "leader1", role: "LEADER" };
  const client = makeFakeClient();
  const blocked = await koloService._leaveCore(client, db.kolo[0], leaderMembership, "leader1");
  assert.equal(blocked.ok, false);
  assert.ok(blocked.message.includes("Lider nie może opuścić"));

  db.koloMember.push({ id: "m2", koloId: "kolo1", userId: "member1", role: "MEMBER" });
  const left = await koloService._leaveCore(client, db.kolo[0], { id: "m2", koloId: "kolo1", userId: "member1", role: "MEMBER" }, "member1");
  assert.equal(left.ok, true);
  assert.equal(db.koloMember.some((m) => m.userId === "member1"), false);
});

test("wymóg aktywności: brak -> ostrzeżenie -> rozwiązanie po 72h", async () => {
  const client = makeFakeClient();
  const DAY = 24 * 60 * 60 * 1000;

  // 1) świeże koło - nic się nie dzieje
  resetDb({ status: "ACTIVE", lastActivityAt: new Date() });
  db.koloMember.push({ id: uid(), koloId: "kolo1", userId: "leader1", role: "LEADER", consentGiven: true });
  assert.equal(await koloService._checkActivityRequirement(client, db.kolo[0]), "ok");

  // 2) 31 dni bezczynności -> ostrzeżenie
  resetDb({ status: "ACTIVE", lastActivityAt: new Date(Date.now() - 31 * DAY) });
  db.koloMember.push({ id: uid(), koloId: "kolo1", userId: "leader1", role: "LEADER", consentGiven: true });
  assert.equal(await koloService._checkActivityRequirement(client, db.kolo[0]), "warned");
  assert.ok(db.kolo[0].inactivityWarnedAt, "ustawiono znacznik ostrzeżenia");
  assert.ok(sentMessages.some((m) => String(m.payload).includes("nie wykazało żadnej aktywności")));

  // 3) ostrzeżenie starsze niż 72h -> rozwiązanie
  resetDb({
    status: "ACTIVE",
    lastActivityAt: new Date(Date.now() - 40 * DAY),
    inactivityWarnedAt: new Date(Date.now() - 4 * DAY),
  });
  db.koloMember.push({ id: uid(), koloId: "kolo1", userId: "leader1", role: "LEADER", consentGiven: true });
  assert.equal(await koloService._checkActivityRequirement(client, db.kolo[0]), "dissolved");
  assert.equal(db.kolo[0].status, "DISSOLVED");
  assert.equal(db.koloMember.length, 0, "członkostwa wyczyszczone");
  assert.ok(db.kolo[0].name.includes("#nieaktywne-"), "nazwa zwolniona");

  // 4) limit 0 = wymóg wyłączony
  resetDb({ status: "ACTIVE", lastActivityAt: new Date(Date.now() - 400 * DAY) });
  db.generalConfig[0].koloInactivityDays = 0;
  assert.equal(await koloService._checkActivityRequirement(client, db.kolo[0]), "ok");
});

test("nowe i ukończone badanie kasuje licznik bezczynności", async () => {
  resetDb({ status: "ACTIVE", lastActivityAt: new Date(Date.now() - 10 * 24 * 3600 * 1000) });
  // 1. jednoczesne badanie wymaga min. 3 osób w kole (RESEARCH_CAPACITY = {1: 3})
  db.koloMember.push(
    { id: uid(), koloId: "kolo1", userId: "leader1", role: "LEADER", consentGiven: true },
    { id: uid(), koloId: "kolo1", userId: "m2", role: "MEMBER", consentGiven: true },
    { id: uid(), koloId: "kolo1", userId: "m3", role: "MEMBER", consentGiven: true }
  );

  const client = makeFakeClient();
  const msg = await koloService._startResearchCore(client, db.kolo[0], "leader1", "temat z listy");
  assert.ok(msg.includes("Rozpoczęto badanie"));
  assert.equal(db.kolo[0].status, "ACTIVE");
  const idleDays = (Date.now() - new Date(db.kolo[0].lastActivityAt).getTime()) / (24 * 3600 * 1000);
  assert.ok(idleDays < 1, `lastActivityAt odświeżone (było 10 dni, jest ${idleDays.toFixed(2)})`);

  // zakończenie badania też liczy się jako aktywność
  db.kolo[0].lastActivityAt = new Date(Date.now() - 10 * 24 * 3600 * 1000);
  const interaction = fakeInteraction({ values: [db.research[0].id] });
  await koloService.handleResearchPickSelect(interaction, "complete_research", "kolo1", null);
  assert.equal(db.research[0].status, "COMPLETED");
  assert.ok(db.research[0].completedAt, "completedAt ustawione");
  const idleAfter = (Date.now() - new Date(db.kolo[0].lastActivityAt).getTime()) / (24 * 3600 * 1000);
  assert.ok(idleAfter < 1, "ukończenie badania odświeżyło aktywność");
});

test("uprawnienia na serwerze Kół: lider admin kategorii, wicelider moderator", async () => {
  const edited = [];
  const makeChannel = (id) => ({
    id,
    permissionOverwrites: {
      edit: async (roleId, perms) => edited.push({ channelId: id, roleId, perms }),
    },
  });
  const category = makeChannel("cat1");
  category.children = { cache: new Map([["c1", makeChannel("c1")], ["c2", makeChannel("c2")]]) };

  const guild = { channels: { fetch: async (id) => (id === "cat1" ? category : null) } };
  const kolo = makeKolo({ status: "ACTIVE", categoryId: "cat1", roleIdLeader: "roleL", roleIdVice: "roleV" });

  const ok = await koloService._applyKoloPermissions(guild, kolo);
  assert.equal(ok, true);
  assert.equal(koloService._isPermsApplied("kolo1"), true);

  const leaderEdits = edited.filter((e) => e.roleId === "roleL");
  const viceEdits = edited.filter((e) => e.roleId === "roleV");
  // kategoria + 2 dzieci
  assert.equal(leaderEdits.length, 3);
  assert.equal(viceEdits.length, 3);

  const leaderAllow = leaderEdits[0].perms.allow;
  assert.ok(leaderAllow.includes("ManageChannels"), "lider zarządza kanałami");
  assert.ok(leaderAllow.includes("ManageRoles"), "lider zarządza rolami");
  assert.ok(leaderAllow.includes("ModerateMembers"), "lider może moderować");
  assert.deepEqual(leaderEdits[0].perms.deny, [], "nie zabieramy liderowi niczego");

  const viceAllow = viceEdits[0].perms.allow;
  assert.ok(viceAllow.includes("ModerateMembers"), "wicelider moderuje");
  assert.ok(viceAllow.includes("ManageMessages"), "wicelider ogarnia wiadomości");
  assert.equal(viceAllow.includes("ManageChannels"), false, "wicelider NIE zarządza kanałami");
  assert.equal(viceAllow.includes("ManageRoles"), false, "wicelider NIE zarządza rolami");

  // uprawnienia nadawane per-rola, a nie całym obiektem (nie kasujemy `everyone`)
  assert.equal(edited.every((e) => typeof e.perms.allow === "object"), true);
});

test("routing customId: kolo_panel_confirm nie wpada w generyczną gałąź kolo_panel_", () => {
  // Odtwarzamy dokładnie tę samą kolejność warunków co events/interactionCreate.js
  const fs = require("node:fs");
  const router = fs.readFileSync(path.join(__dirname, "../src/events/interactionCreate.js"), "utf8");
  const confirmIdx = router.indexOf('startsWith("kolo_panel_confirm:")');
  const researchIdx = router.indexOf('startsWith("kolo_panel_startresearch:")');
  const genericIdx = router.indexOf('startsWith("kolo_panel_")');
  assert.ok(confirmIdx > -1 && researchIdx > -1 && genericIdx > -1, "wszystkie gałęzie istnieją");
  assert.ok(confirmIdx < genericIdx, "confirm musi być PRZED generycznym kolo_panel_");
  assert.ok(researchIdx < genericIdx, "startresearch musi być PRZED generycznym kolo_panel_");
});

test("wycofanie zgłoszenia przez lidera zwalnia wszystkich i nazwę koła", async () => {
  resetDb({ status: "PENDING_MEMBERS" });
  db.koloMember.push(
    { id: "m1", koloId: "kolo1", userId: "leader1", role: "LEADER", consentGiven: false },
    { id: "m2", koloId: "kolo1", userId: "member1", role: "MEMBER", consentGiven: false }
  );
  db.koloInvite.push({ id: "inv1", koloId: "kolo1", userId: "userA", status: "PENDING", expiresAt: new Date(Date.now() + 3600_000) });

  const interaction = fakeInteraction();
  await koloService.handlePanelConfirm(interaction, "withdraw", "kolo1");

  assert.equal(db.kolo[0].status, "REJECTED");
  assert.equal(db.koloMember.length, 0);
  assert.equal(db.koloInvite[0].status, "EXPIRED");
  assert.ok(db.kolo[0].name.includes("#wycofane-"), "nazwa zwolniona pod nowe koło");
  assert.ok(interaction.state.edits[0].content.includes("wycofane"));
});

test("członek nie wycofa całego zgłoszenia, ale wypisze siebie (withdraw_member)", async () => {
  resetDb({ status: "PENDING_MEMBERS" });
  db.koloMember.push(
    { id: "m1", koloId: "kolo1", userId: "leader1", role: "LEADER", consentGiven: false },
    { id: "m2", koloId: "kolo1", userId: "member1", role: "MEMBER", consentGiven: false }
  );

  // "Wycofaj zgłoszenie" to akcja zarządu - zwykły członek jej nie zrobi.
  const asMember = fakeInteraction({ user: { id: "member1", tag: "member#1" } });
  await koloService.handlePanelConfirm(asMember, "withdraw", "kolo1");
  assert.ok(asMember.state.edits[0].content.includes("liderem lub wiceliderem"));
  assert.equal(db.kolo[0].status, "PENDING_MEMBERS", "zgłoszenie nietknięte");

  // Wicelider też nie - całe zgłoszenie wycofuje wyłącznie lider.
  db.koloMember.push({ id: "m3", koloId: "kolo1", userId: "vice1", role: "VICE_LEADER", consentGiven: false });
  const asVice = fakeInteraction({ user: { id: "vice1", tag: "vice#1" } });
  await koloService.handlePanelConfirm(asVice, "withdraw", "kolo1");
  assert.ok(asVice.state.edits[0].content.includes("Tylko lider"));
  assert.equal(db.kolo[0].status, "PENDING_MEMBERS", "zgłoszenie nadal żyje");

  // Członek wypisuje tylko siebie.
  const leave = fakeInteraction({ user: { id: "member1", tag: "member#1" } });
  await koloService.handlePanelConfirm(leave, "withdraw_member", "kolo1");
  assert.ok(leave.state.edits[0].content.includes("Wypisałeś"));
  assert.equal(db.koloMember.some((m) => m.userId === "member1"), false, "członek wypisany");
  assert.equal(db.kolo[0].status, "PENDING_MEMBERS", "zgłoszenie wciąż istnieje");
});

test("panel jest odświeżany w miejscu, a nie dosyłany jako nowa wiadomość", async () => {
  resetDb({ status: "PENDING_MEMBERS" });
  db.koloMember.push({ id: "m1", koloId: "kolo1", userId: "leader1", role: "LEADER", consentGiven: false });
  const client = makeFakeClient();

  const first = await koloService._sendLeaderPanel(client, "kolo1", "leader1");
  assert.ok(first, "panel wysłany");
  const storedId = db.kolo[0].panelMessageId;
  assert.equal(storedId, first.id, "ID panelu zapisany w bazie (przeżyje restart bota)");

  sentMessages.length = 0;
  const second = await koloService._sendLeaderPanel(client, "kolo1", "leader1");
  assert.equal(second.id, storedId, "ta sama wiadomość");
  assert.ok(second.edited >= 1, "wiadomość edytowana, nie wysłana ponownie");
  assert.equal(sentMessages.length, 0, "zero nowych wiadomości na DM");
});

test("scheduler: maintainActiveKola nadaje uprawnienia, ostrzega i rozwiązuje nieaktywne koło", async () => {
  const { maintainActiveKola } = require("../src/scheduler/koloScheduler");
  const DAY = 24 * 60 * 60 * 1000;

  resetDb({
    status: "ACTIVE",
    categoryId: "cat1",
    roleIdLeader: "roleL",
    roleIdVice: "roleV",
    lastActivityAt: new Date(Date.now() - 999 * DAY), // dawno nieaktywne
  });
  db.koloMember.push({ id: "m1", koloId: "kolo1", userId: "leader1", role: "LEADER", consentGiven: true });

  // serwer Kół z kategorią i jednym kanałem potomnym
  const makeChannel = (id) => ({ id, permissionOverwrites: { edit: async () => {} } });
  const category = makeChannel("cat1");
  category.children = { cache: new Map([["c1", makeChannel("c1")]]) };

  // scheduler destruktyruje getKolaGuild przy ładowaniu modułu, więc
  // podmieniamy eksport ZANIM moduł schedulera zostanie zaimportowany.
  const kolaGuildPath = require.resolve("../src/config/kolaGuild");
  const original = require.cache[kolaGuildPath].exports.getKolaGuild;
  require.cache[kolaGuildPath].exports.getKolaGuild = () => ({
    channels: { fetch: async (id) => (id === "cat1" ? category : null) },
  });

  try {
    delete require.cache[require.resolve("../src/scheduler/koloScheduler")];
    const { maintainActiveKola: run } = require("../src/scheduler/koloScheduler");

    // 1) pierwszy tick: ostrzeżenie (koło jeszcze żyje, lider dostał DM)
    await run(makeFakeClient());
    assert.equal(db.kolo[0].status, "ACTIVE", "po ostrzeżeniu koło nadal żyje");
    assert.ok(db.kolo[0].inactivityWarnedAt, "ustawiono znacznik ostrzeżenia");
    assert.ok(sentMessages.some((m) => String(m.payload).includes("nie wykazało żadnej aktywności")));
    assert.equal(koloService._isPermsApplied("kolo1"), true, "uprawnienia zarządu nadane");

    // 2) ostrzeżenie starsze niż 72h -> kolejny tick rozwiązuje koło
    db.kolo[0].inactivityWarnedAt = new Date(Date.now() - 4 * DAY);
    sentMessages.length = 0;
    await run(makeFakeClient());
    assert.equal(db.kolo[0].status, "DISSOLVED", "nieaktywne koło rozwiązane przez scheduler");
    assert.equal(db.koloMember.length, 0, "członkostwa wyczyszczone");
    assert.ok(db.kolo[0].name.includes("#nieaktywne-"), "nazwa zwolniona");
    assert.ok(sentMessages.some((m) => String(m.payload).includes("braku aktywności")), "DM z powodem rozwiązania");
  } finally {
    require.cache[kolaGuildPath].exports.getKolaGuild = original;
  }
});

test("odświeżenie panelu nie działa dla osób spoza koła (regresja: wyciek listy zaproszeń)", async () => {
  resetDb({ status: "ACTIVE" });
  db.koloMember.push({ id: "m1", koloId: "kolo1", userId: "leader1", role: "LEADER", consentGiven: true });
  db.koloInvite.push({ id: "inv1", koloId: "kolo1", userId: "sekretUserId", status: "PENDING", expiresAt: new Date(Date.now() + 3600_000) });

  // Panel zarządu: osoba z zewnątrz nie może go sobie zamówić.
  sentMessages.length = 0;
  const intruder = fakeInteraction({ user: { id: "obcyUser", tag: "obcy#1" } });
  await koloService.handlePanelButton(intruder, "refresh", "kolo1");
  assert.equal(sentMessages.filter((m) => m.to === "obcyUser").length, 0, "obcy nie dostaje panelu zarządu");
  assert.ok(intruder.state.edits[0].content.includes("liderem lub wiceliderem"));

  // Panel członka: to samo.
  sentMessages.length = 0;
  const intruder2 = fakeInteraction({ user: { id: "obcyUser2", tag: "obcy#2" } });
  await koloService.handlePanelButton(intruder2, "refresh_member", "kolo1");
  assert.equal(sentMessages.filter((m) => m.to === "obcyUser2").length, 0, "obcy nie dostaje panelu członka");
  assert.ok(intruder2.state.edits[0].content.includes("Nie należysz"));

  // Zarząd nadal odświeża bez problemu.
  sentMessages.length = 0;
  const leader = fakeInteraction();
  await koloService.handlePanelButton(leader, "refresh", "kolo1");
  assert.equal(sentMessages.filter((m) => m.to === "leader1").length, 1, "lider dostaje odświeżony panel");
});

test("przejście zgłoszenia do administracji odświeża panele nawet bez kanału recenzji", async () => {
  // KOLA_REVIEW/LOG_MOD nie istnieją w tej bazie -> _getReviewChannel zwraca
  // null i funkcja kończy się wcześnie. Status w bazie jest JUŻ zmieniony,
  // więc panel lidera musi zostać odświeżony przed tym returnem.
  resetDb({ status: "PENDING_MEMBERS" });
  db.koloMember.push({ id: "m1", koloId: "kolo1", userId: "leader1", role: "LEADER", consentGiven: false });

  const client = makeFakeClient();
  sentMessages.length = 0;
  await koloService._advanceToReview(client, "kolo1");

  assert.equal(db.kolo[0].status, "PENDING_REVIEW");
  const dms = sentMessages.filter((m) => m.to === "leader1");
  assert.equal(dms.length, 1, "lider dostał odświeżony panel mimo braku kanału recenzji");

  const payload = dms[0].payload;
  assert.ok(embedText(payload).includes("Czeka na decyzję administracji"));
  assert.deepEqual(customIds(payload), ["kolo_panel_refresh:kolo1"], "panel w PENDING_REVIEW ma tylko Odśwież");
});

test("zmiana wicelidera przenosi panele: nowy dostaje zarządu, stary członka", async () => {
  resetDb({ status: "ACTIVE", roleIdVice: "roleV", roleIdMember: "roleM" });
  db.koloMember.push(
    { id: "m1", koloId: "kolo1", userId: "leader1", role: "LEADER", consentGiven: true },
    { id: "m2", koloId: "kolo1", userId: "oldVice", role: "VICE_LEADER", consentGiven: true },
    { id: "m3", koloId: "kolo1", userId: "newVice", role: "MEMBER", consentGiven: true }
  );

  const interaction = fakeInteraction();
  await koloService._doSetVice(interaction, db.kolo[0], "newVice");

  assert.equal(db.koloMember.find((m) => m.userId === "newVice").role, "VICE_LEADER");
  assert.equal(db.koloMember.find((m) => m.userId === "oldVice").role, "MEMBER");

  // nowy wicelider -> panel zarządu (przycisk "Zarządzaj kołem")
  const newViceDm = sentMessages.filter((m) => m.to === "newVice").pop();
  assert.ok(newViceDm, "nowy wicelider dostał panel");
  assert.ok(customIds(newViceDm.payload).includes("kolo_panel_manage:kolo1"), "panel zarządu");

  // stary wicelider -> panel członka (przycisk "Opuść koło")
  const oldViceDm = sentMessages.filter((m) => m.to === "oldVice").pop();
  assert.ok(oldViceDm, "stary wicelider dostał panel");
  assert.ok(customIds(oldViceDm.payload).includes("kolo_panel_confirm:leave:kolo1"), "panel członka");
});

test("wyrzucenie członka odświeża panele i sprząta jego wpis z mapy paneli", async () => {
  resetDb({ status: "ACTIVE" });
  db.koloMember.push(
    { id: "m1", koloId: "kolo1", userId: "leader1", role: "LEADER", consentGiven: true },
    { id: "m2", koloId: "kolo1", userId: "member1", role: "MEMBER", consentGiven: true }
  );

  // najpierw członek dostaje swój panel (wpis do mapy panelMessages)
  const client = makeFakeClient();
  await koloService.refreshPanels(client, "kolo1");
  assert.ok(sentMessages.some((m) => m.to === "member1"), "członek miał panel");

  sentMessages.length = 0;
  const interaction = fakeInteraction();
  await koloService._doKick(interaction, db.kolo[0], "member1");

  assert.equal(db.koloMember.some((m) => m.userId === "member1"), false, "członek wyrzucony");
  assert.ok(sentMessages.some((m) => m.to === "leader1"), "panel zarządu odświeżony po wyrzuceniu");
  // wyrzucony nie jest już odświeżany (brak wpisu w bazie = brak wpisu w mapie)
  assert.equal(sentMessages.filter((m) => m.to === "member1").length, 0, "wyrzucony nie dostaje nowego panelu");
});

test("potwierdzenie dostępu wysyła członkowi jego panel", async () => {
  resetDb({ status: "ACTIVE", roleIdDivider: "roleD", roleIdMember: "roleM" });
  db.koloMember.push({ id: "m2", koloId: "kolo1", userId: "member1", role: "MEMBER", consentGiven: false });

  const interaction = fakeInteraction({ user: { id: "member1", tag: "member#1" } });
  await koloService.handleConsentButton(interaction, "kolo1", "member1");

  assert.equal(db.koloMember[0].consentGiven, true, "zgoda zapisana");
  const panel = sentMessages.filter((m) => m.to === "member1").pop();
  assert.ok(panel, "członek dostał wiadomość");
  assert.ok(customIds(panel.payload).includes("kolo_panel_confirm:leave:kolo1"), "to panel członka z przyciskiem wyjścia");
});
