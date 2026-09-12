/**
 * test/permissions.test.js
 *
 * Testy modelu uprawnień z bot/src/config/roles.js:
 *  - dziedziczenie hierarchii rang (wyższa ranga = uprawnienia niższych),
 *  - domyślne uprawnienia granularne poszczególnych rang,
 *  - kompatybilność wstecz ze starymi kluczami (MODERATE, MANAGE_TECH…),
 *  - przegródki (role-separatory) — wykrywanie i brak możliwości powiązania,
 *  - spójność modelu bota z ręcznie utrzymywanymi kopiami w dashboard/
 *    (lib/permissionKeys.ts + lib/permissionHierarchy.ts).
 *
 *   npm test
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// ---------- 1) Stub bazy, ZANIM config/roles.js zaimportuje lib/prisma ----------
let bindings = [];
const prismaPath = require.resolve("../src/lib/prisma");
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    roleBinding: {
      findMany: async () => bindings.map((b) => ({ ...b })),
    },
  },
  children: [],
  paths: [],
};

const roles = require("../src/config/roles");
const {
  PERMISSION_KEYS,
  RANK_HIERARCHY,
  RANK_GRANTS,
  RANK_LEGACY_GRANTS,
  LEGACY_COMPAT,
  STAFF_CATEGORIES,
  DIVIDER_ROLES,
  dividerRoleName,
  isDividerRoleName,
  isAssignableRoleName,
  expandPermissionKeys,
  hasPermission,
  hasAnyPermission,
  getEffectivePermissionKeys,
  invalidatePermissionCache,
} = roles;

/** Ustawia powiązania ról na potrzebę jednego testu (bindings są cache'owane 60s). */
function withBindings(rows, fn) {
  return async () => {
    bindings = rows.map((r, i) => ({
      id: `b${i}`,
      discordRoleId: r.roleId ?? `role-${r.permissionKey}`,
      permissionKey: r.permissionKey,
      label: r.label ?? r.permissionKey,
      facultyId: null,
      studyYear: null,
    }));
    invalidatePermissionCache();
    try {
      await fn();
    } finally {
      bindings = [];
      invalidatePermissionCache();
    }
  };
}

/** Fałszywy GuildMember — roles.cache jest mapą id -> rola (jak w discord.js). */
function memberWithRoles(...roleIds) {
  return { id: "user1", roles: { cache: new Map(roleIds.map((id) => [id, { id, name: id }])) } };
}

const memberWith = (permissionKey) => memberWithRoles(`role-${permissionKey}`);

// ---------------------------------------------------------------------------
// Hierarchia: dziedziczenie w dół
// ---------------------------------------------------------------------------

test(
  "hierarchia: Holder Projektu dziedziczy po Managerze i Pomocniku Managera",
  withBindings([{ permissionKey: PERMISSION_KEYS.HOLDER_PROJECTU }], async () => {
    const member = memberWith(PERMISSION_KEYS.HOLDER_PROJECTU);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.HOLDER_PROJECTU), true);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.MANAGER_PROJEKTU), true);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.POMOCNIK_MANAGERA), true);
  })
);

test(
  "hierarchia: przejście przez cały łańcuch administracji (Opiekun -> Młodszy Moderator)",
  withBindings([{ permissionKey: PERMISSION_KEYS.OPIEKUN_ADMINISTRACJI }], async () => {
    const member = memberWith(PERMISSION_KEYS.OPIEKUN_ADMINISTRACJI);
    const chain = [
      "OPIEKUN_ADMINISTRACJI",
      "STARSZY_ADMINISTRATOR",
      "ADMINISTRATOR",
      "MLODSZY_ADMINISTRATOR",
      "STARSZY_MODERATOR",
      "MODERATOR",
      "MLODSZY_MODERATOR",
    ];
    for (const key of chain) {
      assert.equal(await hasPermission(member, PERMISSION_KEYS[key]), true, `${key} powinien być dziedziczony`);
    }
  })
);

test(
  "hierarchia: dziedziczenie jest jednokierunkowe — niższa ranga nie dostaje wyższej",
  withBindings([{ permissionKey: PERMISSION_KEYS.POMOCNIK_MANAGERA }], async () => {
    const member = memberWith(PERMISSION_KEYS.POMOCNIK_MANAGERA);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.POMOCNIK_MANAGERA), true);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.MANAGER_PROJEKTU), false);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.HOLDER_PROJECTU), false);
  })
);

test(
  "hierarchia: Młodszy Moderator nie ma rangi Moderatora ani wyższych",
  withBindings([{ permissionKey: PERMISSION_KEYS.MLODSZY_MODERATOR }], async () => {
    const member = memberWith(PERMISSION_KEYS.MLODSZY_MODERATOR);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.MODERATOR), false);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.STARSZY_MODERATOR), false);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.ADMINISTRATOR), false);
  })
);

// ---------------------------------------------------------------------------
// Uprawnienia granularne wynikające z rangi
// ---------------------------------------------------------------------------

test(
  "granty: Młodszy Moderator wycisza i czyści, ale nie kickuje ani nie banuje",
  withBindings([{ permissionKey: PERMISSION_KEYS.MLODSZY_MODERATOR }], async () => {
    const member = memberWith(PERMISSION_KEYS.MLODSZY_MODERATOR);
    for (const key of ["TIMEOUT_MEMBERS", "CLEAR_MESSAGES", "VIEW_AUDIT_LOG", "MANAGE_THREADS", "MANAGE_NICKNAMES"]) {
      assert.equal(await hasPermission(member, PERMISSION_KEYS[key]), true, `${key} dla Młodszego Moderatora`);
    }
    assert.equal(await hasPermission(member, PERMISSION_KEYS.KICK_MEMBERS), false);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.BAN_MEMBERS), false);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.MANAGE_ROLES), false);
  })
);

test(
  "granty: Moderator dokłada kick, Starszy Moderator — ban",
  withBindings(
    [
      { permissionKey: PERMISSION_KEYS.MODERATOR, roleId: "role-moderator" },
      { permissionKey: PERMISSION_KEYS.STARSZY_MODERATOR, roleId: "role-starszy-moderator" },
    ],
    async () => {
      const moderator = memberWithRoles("role-moderator");
      const starszy = memberWithRoles("role-starszy-moderator");

      assert.equal(await hasPermission(moderator, PERMISSION_KEYS.KICK_MEMBERS), true);
      assert.equal(await hasPermission(moderator, PERMISSION_KEYS.BAN_MEMBERS), false, "Moderator nie banuje");

      assert.equal(await hasPermission(starszy, PERMISSION_KEYS.KICK_MEMBERS), true);
      assert.equal(await hasPermission(starszy, PERMISSION_KEYS.BAN_MEMBERS), true);
      assert.equal(await hasPermission(starszy, PERMISSION_KEYS.MOVE_MEMBERS), true);
    }
  )
);

test(
  "granty: Administrator dokłada zarządzanie rolami i kanałami",
  withBindings([{ permissionKey: PERMISSION_KEYS.ADMINISTRATOR }], async () => {
    const member = memberWith(PERMISSION_KEYS.ADMINISTRATOR);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.MANAGE_ROLES), true);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.MANAGE_CHANNELS), true);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.BAN_MEMBERS), true, "przez dziedziczenie po St. Moderatorze");
  })
);

test(
  "granty: Support to osobny łańcuch — wątki tak, kick nie",
  withBindings([{ permissionKey: PERMISSION_KEYS.SUPPORT }], async () => {
    const member = memberWith(PERMISSION_KEYS.SUPPORT);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.MANAGE_THREADS), true);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.VIEW_AUDIT_LOG), true);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.KICK_MEMBERS), false, "Support nie moderuje");
    assert.equal(await hasPermission(member, PERMISSION_KEYS.MLODSZY_MODERATOR), false);
  })
);

// ---------------------------------------------------------------------------
// Kompatybilność: stare klucze -> nowe
// ---------------------------------------------------------------------------

test(
  "legacy: stary wpis MODERATE nadal daje kick/ban/timeout",
  withBindings([{ permissionKey: PERMISSION_KEYS.MODERATE }], async () => {
    const member = memberWith(PERMISSION_KEYS.MODERATE);
    for (const key of ["KICK_MEMBERS", "BAN_MEMBERS", "TIMEOUT_MEMBERS", "CLEAR_MESSAGES", "MOVE_MEMBERS"]) {
      assert.equal(await hasPermission(member, PERMISSION_KEYS[key]), true, `MODERATE -> ${key}`);
    }
    // ...i stare odwołania w kodzie wciąż przechodzą
    assert.equal(await hasPermission(member, PERMISSION_KEYS.MODERATE), true);
  })
);

test(
  "legacy: MANAGE_TECH daje rangę Główny Developer (a przez nią cały Development)",
  withBindings([{ permissionKey: PERMISSION_KEYS.MANAGE_TECH }], async () => {
    const member = memberWith(PERMISSION_KEYS.MANAGE_TECH);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.GLOWNY_DEVELOPER), true);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.DEVELOPER), true);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.MLODSZY_DEVELOPER), true);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.MANAGE_ROLES), true);
  })
);

test(
  "legacy: MANAGE_DEANERY daje podgląd audytu i zmianę pseudonimów, ale nie bana",
  withBindings([{ permissionKey: PERMISSION_KEYS.MANAGE_DEANERY }], async () => {
    const member = memberWith(PERMISSION_KEYS.MANAGE_DEANERY);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.VIEW_AUDIT_LOG), true);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.MANAGE_NICKNAMES), true);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.BAN_MEMBERS), false);
  })
);

test(
  "legacy: ranga moderacyjna NIE awansuje automatycznie do pełnego MODERATE",
  withBindings([{ permissionKey: PERMISSION_KEYS.MODERATOR }], async () => {
    const member = memberWith(PERMISSION_KEYS.MODERATOR);
    // Gdyby rangi implikowały MODERATE, Młodszy Moderator odziedziczyłby
    // przez niego BAN_MEMBERS i hierarchia przestałaby cokolwiek znaczyć.
    // Ścieżki, które muszą działać w obu światach, pytają o kilka kluczy
    // naraz: hasAnyPermission(member, ["MODERATE", "MLODSZY_MODERATOR"]).
    assert.equal(await hasPermission(member, PERMISSION_KEYS.MODERATE), false);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.KICK_MEMBERS), true);
    assert.equal(await hasAnyPermission(member, ["MODERATE", "MLODSZY_MODERATOR"]), true);
  })
);

test(
  "legacy w drugą stronę: Support spełnia REVIEW_APPLICATIONS",
  withBindings([{ permissionKey: PERMISSION_KEYS.SUPPORT }], async () => {
    const member = memberWith(PERMISSION_KEYS.SUPPORT);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.REVIEW_APPLICATIONS), true);
  })
);

// ---------------------------------------------------------------------------
// Klucze nadane wprost (poza hierarchią) + hasAnyPermission
// ---------------------------------------------------------------------------

test(
  "nadanie uprawnienia granularnego wprost działa i nie rozlewa się na sąsiednie",
  withBindings([{ permissionKey: PERMISSION_KEYS.BAN_MEMBERS }], async () => {
    const member = memberWith(PERMISSION_KEYS.BAN_MEMBERS);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.BAN_MEMBERS), true);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.KICK_MEMBERS), false);
    assert.equal(await hasPermission(member, PERMISSION_KEYS.MODERATOR), false);
  })
);

test("hasAnyPermission: prawda, gdy member ma choć jeden z kluczy", async () => {
  bindings = [
    { id: "b1", discordRoleId: "role-support", permissionKey: PERMISSION_KEYS.SUPPORT, label: "Support", facultyId: null, studyYear: null },
  ];
  invalidatePermissionCache();
  const member = memberWithRoles("role-support");
  assert.equal(await hasAnyPermission(member, ["MODERATE", "SUPPORT"]), true);
  assert.equal(await hasAnyPermission(member, ["BAN_MEMBERS", "MANAGE_ROLES"]), false);
  assert.equal(await hasAnyPermission(member, []), false);
  bindings = [];
  invalidatePermissionCache();
});

test("brak ról / brak powiązań => brak uprawnień", async () => {
  bindings = [];
  invalidatePermissionCache();
  assert.equal(await hasPermission(memberWithRoles(), PERMISSION_KEYS.MODERATE), false);
  assert.equal(await hasPermission(null, PERMISSION_KEYS.MODERATE), false);
  assert.equal(await hasPermission(memberWithRoles("role-x"), undefined), false);
  assert.deepEqual(await getEffectivePermissionKeys(memberWithRoles()), []);
});

test("getEffectivePermissionKeys zwraca pełny, rozwinięty zbiór kluczy", async () => {
  bindings = [
    { id: "b1", discordRoleId: "role-moderator", permissionKey: PERMISSION_KEYS.MODERATOR, label: "Moderator", facultyId: null, studyYear: null },
    { id: "b2", discordRoleId: "role-moderator", permissionKey: PERMISSION_KEYS.MANAGE_REACTION_ROLES, label: "Autorole", facultyId: null, studyYear: null },
  ];
  invalidatePermissionCache();
  const keys = await getEffectivePermissionKeys(memberWithRoles("role-moderator"));
  for (const expected of ["MODERATOR", "MLODSZY_MODERATOR", "KICK_MEMBERS", "TIMEOUT_MEMBERS", "MANAGE_REACTION_ROLES"]) {
    assert.ok(keys.includes(expected), `brak ${expected} w ${keys.join(",")}`);
  }
  assert.ok(!keys.includes("BAN_MEMBERS"), "Moderator nie powinien mieć BAN_MEMBERS");
  bindings = [];
  invalidatePermissionCache();
});

// ---------------------------------------------------------------------------
// KEY_SETS — współdzielone progi (używane w komendach i przyciskach)
// ---------------------------------------------------------------------------

test(
  "KEY_SETS.MODERATION przepuszcza każdą rangę moderacyjną i legacy MODERATE",
  withBindings(
    [
      { permissionKey: PERMISSION_KEYS.MLODSZY_MODERATOR, roleId: "role-mlodszy" },
      { permissionKey: PERMISSION_KEYS.STARSZY_MODERATOR, roleId: "role-starszy" },
      { permissionKey: PERMISSION_KEYS.MODERATE, roleId: "role-legacy" },
      { permissionKey: PERMISSION_KEYS.SUPPORT, roleId: "role-support" },
    ],
    async () => {
      assert.equal(await hasAnyPermission(memberWithRoles("role-mlodszy"), roles.KEY_SETS.MODERATION), true);
      assert.equal(await hasAnyPermission(memberWithRoles("role-starszy"), roles.KEY_SETS.MODERATION), true);
      assert.equal(await hasAnyPermission(memberWithRoles("role-legacy"), roles.KEY_SETS.MODERATION), true);
      assert.equal(
        await hasAnyPermission(memberWithRoles("role-support"), roles.KEY_SETS.MODERATION),
        false,
        "Support nie moderuje"
      );
    }
  )
);

test(
  "KEY_SETS: Support rozpatruje weryfikacje i podania, Trial Support — nie",
  withBindings(
    [
      { permissionKey: PERMISSION_KEYS.SUPPORT, roleId: "role-support" },
      { permissionKey: PERMISSION_KEYS.TRIAL_SUPPORT, roleId: "role-trial" },
    ],
    async () => {
      assert.equal(await hasAnyPermission(memberWithRoles("role-support"), roles.KEY_SETS.VERIFICATION_REVIEW), true);
      assert.equal(await hasAnyPermission(memberWithRoles("role-support"), roles.KEY_SETS.APPLICATION_REVIEW), true);
      assert.equal(await hasAnyPermission(memberWithRoles("role-trial"), roles.KEY_SETS.VERIFICATION_REVIEW), false);
      // Trial Support ma MANAGE_THREADS (wcina się w tickety), ale nie dostaje
      // decyzji o weryfikacji — te są od SUPPORT w górę.
      assert.equal(await hasAnyPermission(memberWithRoles("role-trial"), roles.KEY_SETS.TICKET_STAFF), true);
    }
  )
);

test("KEY_SETS: każdy zestaw zawiera tylko znane klucze", () => {
  const known = new Set(Object.values(PERMISSION_KEYS));
  for (const [name, keys] of Object.entries(roles.KEY_SETS)) {
    assert.ok(Array.isArray(keys) && keys.length > 0, `${name}: pusty zestaw`);
    for (const key of keys) assert.ok(known.has(key), `${name}: nieznany klucz ${key}`);
  }
});

// ---------------------------------------------------------------------------
// Przegródki
// ---------------------------------------------------------------------------

test("przegródki: rozpoznawanie po nazwie", () => {
  assert.equal(isDividerRoleName("•══════• Development •══════•"), true);
  assert.equal(isDividerRoleName("•══════• Zarząd Projektu •══════•"), true);
  assert.equal(isDividerRoleName("•═• X •═•"), true);
  assert.equal(isDividerRoleName("• Moderator •"), false, "zwykła rola staffu nie jest przegródką");
  assert.equal(isDividerRoleName("• Zawieszony •"), false);
  assert.equal(isDividerRoleName("Bot"), false);
  assert.equal(isDividerRoleName(undefined), false);
});

test("przegródki: każda kategoria ma przegródkę i nie jest ona kluczem uprawnień", () => {
  const keyValues = new Set(Object.values(PERMISSION_KEYS));
  assert.equal(DIVIDER_ROLES.length, STAFF_CATEGORIES.length);
  for (const category of STAFF_CATEGORIES) {
    const divider = dividerRoleName(category.label);
    assert.ok(DIVIDER_ROLES.includes(divider), `brak przegródki dla ${category.label}`);
    assert.equal(isDividerRoleName(divider), true);
    assert.equal(isAssignableRoleName(divider), false, "przegródka nie może być nadawana");
    assert.equal(keyValues.has(divider), false, "przegródka nie może być kluczem uprawnień");
  }
  assert.equal(isAssignableRoleName("• Moderator •"), true);
});

test("przegródki: role samodzielne (Zawieszony/Urlop) to nie przegródki", () => {
  const standalone = STAFF_CATEGORIES.flatMap((c) => c.standaloneRoles ?? []);
  assert.ok(standalone.length > 0, "kategoria Samodzielne powinna wymieniać swoje role");
  for (const name of standalone) {
    assert.equal(isDividerRoleName(name), false, `${name} nie jest przegródką`);
    assert.equal(isAssignableRoleName(name), true, `${name} można powiązać z uprawnieniem`);
  }
});

test("przegródki: kategorie pokrywają wszystkie rangi staffu", () => {
  const inCategories = new Set(STAFF_CATEGORIES.flatMap((c) => c.ranks));
  for (const rank of roles.RANK_KEYS) {
    assert.ok(inCategories.has(rank), `ranga ${rank} nie ma swojej kategorii przegródki`);
  }
});

// ---------------------------------------------------------------------------
// Integralność modelu
// ---------------------------------------------------------------------------

test("model: każdy klucz w relacjach istnieje w PERMISSION_KEYS", () => {
  const known = new Set(Object.values(PERMISSION_KEYS));
  for (const [name, table] of Object.entries({
    RANK_HIERARCHY,
    RANK_GRANTS,
    RANK_LEGACY_GRANTS,
    LEGACY_COMPAT,
  })) {
    for (const [from, targets] of Object.entries(table)) {
      assert.ok(known.has(from), `${name}: nieznany klucz ${from}`);
      for (const target of targets) {
        assert.ok(known.has(target), `${name}: ${from} -> nieznany klucz ${target}`);
      }
    }
  }
});

test("model: domknięcie każdego klucza zawiera ten klucz i kończy się", () => {
  const expanded = expandPermissionKeys([PERMISSION_KEYS.MODERATE]);
  assert.ok(expanded.has(PERMISSION_KEYS.MODERATE));
  assert.ok(expanded.has(PERMISSION_KEYS.BAN_MEMBERS));

  for (const key of Object.values(PERMISSION_KEYS)) {
    const set = expandPermissionKeys([key]);
    assert.ok(set.has(key), `domknięcie ${key} musi zawierać ten klucz`);
  }
});

test("model: domknięcie nie zapętla się na cyklu w IMPLIES", () => {
  // Relacje w pliku nie tworzą dziś cyklu między różnymi kluczami, ale gdyby
  // ktoś dodał A -> B i B -> A (np. nowa ranga <-> stary klucz), domknięcie
  // musi się zatrzymać zamiast wisieć.
  roles.IMPLIES.CYCLE_A = ["CYCLE_B"];
  roles.IMPLIES.CYCLE_B = ["CYCLE_A"];
  try {
    const set = expandPermissionKeys(["CYCLE_A"]);
    assert.deepEqual([...set].sort(), ["CYCLE_A", "CYCLE_B"]);
  } finally {
    delete roles.IMPLIES.CYCLE_A;
    delete roles.IMPLIES.CYCLE_B;
  }
});

test("model: rangi nie dziedziczą po sobie w kółko (brak cyklu w hierarchii)", () => {
  const visiting = new Set();
  const visited = new Set();
  const walk = (key) => {
    if (visited.has(key)) return;
    assert.equal(visiting.has(key), false, `cykl w hierarchii przy ${key}`);
    visiting.add(key);
    for (const lower of RANK_HIERARCHY[key] ?? []) walk(lower);
    visiting.delete(key);
    visited.add(key);
  };
  for (const rank of Object.keys(RANK_HIERARCHY)) walk(rank);
});

// ---------------------------------------------------------------------------
// SYNC: bot <-> dashboard (ręcznie utrzymywane kopie)
// ---------------------------------------------------------------------------

const DASHBOARD_LIB = path.resolve(__dirname, "..", "..", "dashboard", "lib");

function readDashboardFile(name) {
  const full = path.join(DASHBOARD_LIB, name);
  assert.ok(fs.existsSync(full), `brak pliku dashboard/lib/${name}`);
  return fs.readFileSync(full, "utf8");
}

/** Wyciąga obiekt `{ KLUCZ: [...], ... }` z pliku TS (wpisy mogą być wieloliniowe). */
function parseRecord(source, constName) {
  const start = source.indexOf(`const ${constName}`);
  assert.notEqual(start, -1, `nie znaleziono deklaracji const ${constName} w pliku dashboardu`);
  const end = source.indexOf("\n};", start);
  assert.notEqual(end, -1, `nie znaleziono końca obiektu ${constName}`);
  const body = source.slice(start, end);

  const out = {};
  const re = /([A-Z][A-Z0-9_]*)\s*:\s*\[([^\]]*)\]/g;
  let match;
  while ((match = re.exec(body)) !== null) {
    out[match[1]] = [...match[2].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  }
  assert.ok(Object.keys(out).length > 0, `${constName}: nie wyciągnięto żadnego wpisu — zmienił się format?`);
  return out;
}

test("sync: dashboard/lib/permissionKeys.ts ma te same klucze co bot", () => {
  const source = readDashboardFile("permissionKeys.ts");
  const re = /\{\s*key:\s*"([A-Z0-9_]+)"\s*,\s*label:/g;
  const dashboardKeys = [];
  let match;
  while ((match = re.exec(source)) !== null) dashboardKeys.push(match[1]);

  assert.ok(dashboardKeys.length > 0, "nie wyciągnięto kluczy z permissionKeys.ts — zmienił się format?");

  const botKeys = Object.values(PERMISSION_KEYS);
  assert.deepEqual(
    [...dashboardKeys].sort(),
    [...botKeys].sort(),
    "bot/src/config/roles.js i dashboard/lib/permissionKeys.ts mają się pokrywać 1:1 (sync ręczny!)"
  );
  assert.equal(new Set(dashboardKeys).size, dashboardKeys.length, "duplikaty kluczy w permissionKeys.ts");
});

test("sync: każdy klucz w dashboardzie ma grupę z PERMISSION_GROUPS_ORDER", () => {
  const source = readDashboardFile("permissionKeys.ts");
  const orderStart = source.indexOf("PERMISSION_GROUPS_ORDER");
  const orderEnd = source.indexOf("\n];", orderStart);
  const declaredGroups = [...source.slice(orderStart, orderEnd).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(declaredGroups.length > 0, "brak PERMISSION_GROUPS_ORDER");

  const re = /\{\s*key:\s*"([A-Z0-9_]+)"\s*,\s*label:\s*"[^"]*"\s*,\s*group:\s*"([^"]*)"/g;
  let match;
  let checked = 0;
  while ((match = re.exec(source)) !== null) {
    checked += 1;
    assert.ok(declaredGroups.includes(match[2]), `klucz ${match[1]} ma grupę spoza PERMISSION_GROUPS_ORDER: ${match[2]}`);
  }
  assert.equal(checked, Object.values(PERMISSION_KEYS).length, "nie każdy klucz ma przypisaną grupę w UI");
});

test("sync: dashboard/lib/permissionHierarchy.ts odtwarza relacje z bota 1:1", () => {
  const source = readDashboardFile("permissionHierarchy.ts");
  for (const [name, botTable] of Object.entries({
    RANK_HIERARCHY,
    RANK_GRANTS,
    RANK_LEGACY_GRANTS,
    LEGACY_COMPAT,
  })) {
    const dashboardTable = parseRecord(source, name);
    assert.deepEqual(dashboardTable, botTable, `${name} rozjechał się między botem a dashboardem`);
  }
});

test("sync: dashboard ma te same kategorie staffu (przegródki) co bot", () => {
  const source = readDashboardFile("permissionHierarchy.ts");
  const start = source.indexOf("const STAFF_CATEGORIES");
  assert.notEqual(start, -1, "brak deklaracji const STAFF_CATEGORIES w dashboardzie");
  const end = source.indexOf("\n];", start);
  const body = source.slice(start, end);

  const re =
    /key:\s*"([^"]+)"\s*,\s*label:\s*"([^"]+)"\s*,\s*assignable:\s*(true|false)\s*,\s*ranks:\s*\[([^\]]*)\](?:\s*,\s*standaloneRoles:\s*\[([^\]]*)\])?/g;
  const dashboardCategories = [];
  let match;
  while ((match = re.exec(body)) !== null) {
    dashboardCategories.push({
      key: match[1],
      label: match[2],
      assignable: match[3] === "true",
      ranks: [...match[4].matchAll(/"([^"]+)"/g)].map((m) => m[1]),
      standaloneRoles: match[5] ? [...match[5].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [],
    });
  }
  assert.ok(dashboardCategories.length > 0, "nie wyciągnięto kategorii — zmienił się format?");

  const botCategories = STAFF_CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    assignable: c.assignable,
    ranks: c.ranks,
    standaloneRoles: c.standaloneRoles ?? [],
  }));
  assert.deepEqual(dashboardCategories, botCategories);
});
