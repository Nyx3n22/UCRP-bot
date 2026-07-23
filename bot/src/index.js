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
  partials: [Partials.Channel, Partials.Message], // wymagane dla DM (kolektor odpowiedzi w egzaminie)
});

client.commands = new Collection();

function loadCommands() {
  const commandsPath = path.join(__dirname, "commands");
  const categories = fs.readdirSync(commandsPath);
  const commandData = [];

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category);
    const files = fs.readdirSync(categoryPath).filter((f) => f.endsWith(".js"));
    for (const file of files) {
      const command = require(path.join(categoryPath, file));
      client.commands.set(command.data.name, command);
      commandData.push(command.data.toJSON());
    }
  }
  return commandData;
}

function loadEvents() {
  const eventsPath = path.join(__dirname, "events");
  const files = fs.readdirSync(eventsPath).filter((f) => f.endsWith(".js"));
  for (const file of files) {
    const event = require(path.join(eventsPath, file));
    client.on(event.name, (...args) => event.execute(...args));
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
  console.log(`🔧 Start procesu. PORT z środowiska: ${process.env.PORT ?? "(brak - użyję domyślnego 3001)"}`);
  startHealthServer(); // najpierw otwieramy port - Render skanuje go od razu po starcie procesu
  const commandData = loadCommands();
  loadEvents();
  await client.login(process.env.DISCORD_TOKEN);
  await registerSlashCommands(commandData);
  startSocialMediaScheduler(client);
})();
