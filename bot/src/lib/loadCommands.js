/**
 * lib/loadCommands.js
 *
 * Jeden loader komend slash, współdzielony przez:
 *  - src/index.js (start bota — ładuje i rejestruje),
 *  - src/deployCommands.js (`npm run deploy` — tylko rejestracja).
 *
 * Bez tego oba miejsca miałyby własną kopię tej pętli i prędzej czy później
 * by się rozjechały (np. nowa kategoria katalogów działałaby tylko w jednym).
 */

const fs = require("node:fs");
const path = require("node:path");

const COMMANDS_DIR = path.join(__dirname, "..", "commands");

/**
 * Wczytuje wszystkie komendy z katalogów w `src/commands/`.
 * @param {import("discord.js").Collection} [collection] opcjonalnie: kolekcja
 *        klienta, do której mają trafić komendy (index.js needs it, deploy nie).
 * @returns {object[]} surowe definicje komend (commandData do `rest.put`)
 */
function loadCommands(collection) {
  const commandData = [];

  for (const category of fs.readdirSync(COMMANDS_DIR)) {
    const categoryPath = path.join(COMMANDS_DIR, category);
    if (!fs.statSync(categoryPath).isDirectory()) continue;

    for (const file of fs.readdirSync(categoryPath).filter((f) => f.endsWith(".js"))) {
      const command = require(path.join(categoryPath, file));
      if (!command?.data?.name || typeof command.execute !== "function") {
        console.warn(`⚠️ Pomijam ${category}/${file}: brak data.name lub execute().`);
        continue;
      }
      // Komendy zakładają kontekst serwera (interaction.guild/member) - w DM
      // crashowałyby na null. Blokujemy centralnie, z opt-out przez
      // `allowDM = true` w module komendy.
      if (!command.allowDM && typeof command.data.setDMPermission === "function") {
        command.data.setDMPermission(false);
      }
      if (collection) collection.set(command.data.name, command);
      commandData.push(command.data.toJSON());
    }
  }

  return commandData;
}

module.exports = { loadCommands, COMMANDS_DIR };
