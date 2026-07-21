/**
 * index.js — punkt wejścia bota.
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, Partials, Collection, REST, Routes } = require("discord.js");
const { startSocialMediaScheduler } = require("./scheduler/socialMediaScheduler");
const { startHealthServer } = require("./healthServer");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.commands = new Collection();

function loadCommands() {
  const commandsPath = path.join(__dirname, "commands");
  if (!fs.existsSync(commandsPath)) return [];

  const categories = fs.readdirSync(commandsPath);
  const commandData = [];

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    if (!fs.statSync(categoryPath).isDirectory()) continue;

    const files = fs.readdirSync(categoryPath).filter((f) => f.endsWith(".js"));
    for (const file of files) {
      const command = require(path.join(categoryPath, file));
      if ("data" in command && "execute" in command) {
        client.commands.set(command.data.name, command);
        commandData.push(command.data.toJSON());
      }
    }
  }
  return commandData;
}

function loadEvents() {
  const eventsPath = path.join(__dirname, "events");
  if (!fs.existsSync(eventsPath)) return;

  const files = fs.readdirSync(eventsPath).filter((f) => f.endsWith(".js"));
  for (const file of files) {
    const event = require(path.join(eventsPath, file));
    console.log(`🔌 Załadowano event: ${event.name}`);

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      // Owijamy w try...catch oraz Promise, aby wyłapać błędy z async execute()
      client.on(event.name, async (...args) => {
        try {
          await event.execute(...args, client);
        } catch (error) {
          console.error(`❌ Błąd w evencie [${event.name}]:`, error);
        }
      });
    }
  }
}

async function registerSlashCommands(commandData) {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {
    body: commandData,
  });
  console.log(`✅ Zarejestrowano ${commandData.length} komend slash.`);
}

(async () => {
  startHealthServer();
  const commandData = loadCommands();
  loadEvents();
  await client.login(process.env.DISCORD_TOKEN);
  await registerSlashCommands(commandData);
  startSocialMediaScheduler(client);
})();

// Globalne przechwytywanie błędów, żeby Render zawsze pokazywał logi zamiast milczeć
process.on("unhandledRejection", (reason) => {
  console.error("❌ Niezłapany błąd (Unhandled Rejection):", reason);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Krytyczny wyjątek (Uncaught Exception):", error);
});
