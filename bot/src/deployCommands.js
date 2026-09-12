/**
 * deployCommands.js — `npm run deploy`
 *
 * Idempotentna rejestracja komend slash na serwerze guildowym (GUILD_ID).
 * Skrypt NIE startuje bota i nie dotyka bazy: wczytuje komendy z katalogu,
 * robi `PUT` pełnej listy (nadpisuje poprzedni stan, więc wynik jest taki sam
 * niezależnie od tego, ile razy go uruchomisz) i kończy działanie.
 *
 * Na Renderze `npm start` blokuje proces, więc `npm start && npm run deploy`
 * nigdy nie dochodzi do drugiej części — dlatego `deploy` jest osobnym,
 * ręcznym krokiem (Start Command powinien być ustawiony na samo `npm start`).
 *
 * Użycie:
 *   npm run deploy
 *   CLEAR_GLOBAL_COMMANDS=true npm run deploy   # jednorazowe czyszczenie
 *                                               # „duchów" komend globalnych
 */

require("dotenv").config();

const { REST, Routes } = require("discord.js");
const { loadCommands } = require("./lib/loadCommands");

async function main() {
  for (const key of ["DISCORD_TOKEN", "CLIENT_ID", "GUILD_ID"]) {
    if (!process.env[key]) {
      console.error(`❌ Brak wymaganej zmiennej środowiskowej: ${key}.`);
      process.exit(1);
    }
  }

  const commandData = loadCommands();
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

  // Opcjonalne, jednorazowe czyszczenie komend globalnych — komendy
  // zarejestrowane kiedyś globalnie (bez GUILD_ID) nie znikną same.
  if (process.env.CLEAR_GLOBAL_COMMANDS === "true") {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
    console.log("🧹 Wyczyszczono globalne komendy slash (CLEAR_GLOBAL_COMMANDS=true).");
  }

  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {
    body: commandData,
  });
  console.log(`✅ Zarejestrowano ${commandData.length} komend slash na serwerze ${process.env.GUILD_ID}.`);
}

main().catch((err) => {
  console.error("❌ Rejestracja komend nie udała się:", err.message);
  process.exit(1);
});
