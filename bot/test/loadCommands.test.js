/**
 * test/loadCommands.test.js
 *
 * Współdzielony loader komend (src/lib/loadCommands.js) jest używany przez
 * start bota (src/index.js) i przez `npm run deploy`. Jeśli któryś moduł
 * komendy przestanie się wczytywać (literówka, brak eksportu, nowy require
 * rzucający przy imporcie), padnie i bot, i rejestracja komend — łapiemy to
 * tutaj, bez łączenia się z Discordem.
 *
 * @prisma/client jest podstawiony stubem (patrz komentarz w koloService.test.js).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

const { loadCommands, COMMANDS_DIR } = require("../src/lib/loadCommands");

test("loader wczytuje każdy plik komendy z katalogu src/commands", () => {
  const expectedFiles = fs
    .readdirSync(COMMANDS_DIR)
    .filter((entry) => fs.statSync(path.join(COMMANDS_DIR, entry)).isDirectory())
    .flatMap((category) =>
      fs
        .readdirSync(path.join(COMMANDS_DIR, category))
        .filter((f) => f.endsWith(".js"))
        .map((f) => `${category}/${f}`)
    );

  assert.ok(expectedFiles.length > 0, "nie znaleziono żadnego katalogu z komendami");

  const commands = loadCommands();
  assert.equal(commands.length, expectedFiles.length, "każdy plik komendy musi się wczytać");
});

test("każda komenda ma poprawną definicję slash (name + opis)", () => {
  const commands = loadCommands();
  for (const command of commands) {
    assert.ok(command.name, "komenda bez nazwy");
    assert.ok(command.name.length >= 1 && command.name.length <= 32, `nazwa poza limitem Discorda: ${command.name}`);
    assert.ok(command.description, `komenda ${command.name} bez opisu`);
    assert.equal(command.dm_permission, false, `komenda ${command.name} powinna być wyłączona w DM`);
  }
});

test("loader potrafi wypełnić kolekcję klienta (użycie z src/index.js)", () => {
  const collection = new Map();
  const commands = loadCommands(collection);
  assert.equal(collection.size, commands.length);
  for (const command of commands) {
    assert.ok(collection.has(command.name), `${command.name} nie trafił do kolekcji`);
    assert.equal(typeof collection.get(command.name).execute, "function");
  }
});
