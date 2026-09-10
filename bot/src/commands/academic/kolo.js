/**
 * commands/academic/kolo.js
 * Zarządzanie kołem naukowym (tylko lider/wicelider aktywnego koła).
 * Założenie koła NIE odbywa się przez komendę - patrz koloService.js
 * (panel z przyciskiem na kanale KOLA_NAUKOWE).
 */

const { SlashCommandBuilder } = require("discord.js");
const koloService = require("../../services/koloService");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("kolo")
    .setDescription("🔬 Zarządzanie kołem naukowym (lider/wicelider)")
    .addSubcommand((s) =>
      s
        .setName("zaprosz")
        .setDescription("Zaprasza osobę do koła")
        .addUserOption((o) => o.setName("osoba").setDescription("Kogo zaprosić").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("wyrzuc")
        .setDescription("Usuwa osobę z koła")
        .addUserOption((o) => o.setName("osoba").setDescription("Kogo usunąć").setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName("prosba")
        .setDescription("Wysyła prośbę o zmianę (nazwa/logo/lider) do AI + administracji")
        .addStringOption((o) =>
          o
            .setName("typ")
            .setDescription("Co zmienić")
            .setRequired(true)
            .addChoices({ name: "Nazwa", value: "NAME" }, { name: "Logo", value: "LOGO" }, { name: "Lider", value: "LEADER" })
        )
        .addStringOption((o) =>
          o.setName("wartosc").setDescription("Nowa nazwa / link do logo / @nowy_lider").setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName("badanie-rozpocznij")
        .setDescription("Rozpoczyna badanie (z listy admina - od razu, lub własny temat - do akceptacji)")
        .addStringOption((o) => o.setName("temat").setDescription("Temat badania").setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((s) => s.setName("opusc").setDescription("Opuszcza koło (nie dotyczy lidera)"))
    .addSubcommandGroup((g) =>
      g
        .setName("badania")
        .setDescription("Zarządzanie prowadzonymi badaniami")
        .addSubcommand((s) => s.setName("lista").setDescription("Pokazuje badania koła"))
        .addSubcommand((s) =>
          s
            .setName("zatrzymaj")
            .setDescription("Zatrzymuje aktywne badanie")
            .addStringOption((o) => o.setName("badanie").setDescription("Które badanie").setRequired(true).setAutocomplete(true))
        )
        .addSubcommand((s) =>
          s
            .setName("wznow")
            .setDescription("Wznawia zatrzymane badanie")
            .addStringOption((o) => o.setName("badanie").setDescription("Które badanie").setRequired(true).setAutocomplete(true))
        )
        .addSubcommand((s) =>
          s
            .setName("przydziel")
            .setDescription("Przydziela osobę z koła do badania")
            .addStringOption((o) => o.setName("badanie").setDescription("Które badanie").setRequired(true).setAutocomplete(true))
            .addUserOption((o) => o.setName("osoba").setDescription("Kogo przydzielić").setRequired(true))
        )
    ),

  async execute(interaction) {
    try {
      const group = interaction.options.getSubcommandGroup(false);
      const sub = interaction.options.getSubcommand();

      if (group === "badania") return koloService.cmdManageResearch(interaction);

      if (sub === "zaprosz") return koloService.cmdInvite(interaction);
      if (sub === "wyrzuc") return koloService.cmdKick(interaction);
      if (sub === "prosba") return koloService.cmdChangeRequest(interaction);
      if (sub === "badanie-rozpocznij") return koloService.cmdStartResearch(interaction);
      if (sub === "opusc") return koloService.cmdLeave(interaction);
    } catch (err) {
      console.error("[kolo] Błąd komendy:", err);
      const ui = require("../../utils/embeds");
      const payload = { embeds: [ui.error("Błąd serwera", "Nie udało się wykonać komendy koła. Spróbuj ponownie za chwilę.")], ephemeral: true };
      // Metody cmd* robią deferReply na wejściu, więc zwykle odpowiadamy
      // edycją; reply tylko gdyby błąd padł przed deferem.
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => null);
      } else {
        await interaction.reply(payload).catch(() => null);
      }
    }
  },

  async autocomplete(interaction) {
    try {
      return await this._autocompleteInner(interaction);
    } catch (err) {
      console.error("[kolo] Błąd autocomplete:", err.message);
      return interaction.respond([]).catch(() => null);
    }
  },

  async _autocompleteInner(interaction) {
    const focused = interaction.options.getFocused(true);
    const prisma = require("../../lib/prisma");

    if (focused.name === "temat") {
      // Discord limituje name i value do 100 znaków - dłuższe tytuły
      // pomijamy w podpowiedziach (nadal można je wpisać ręcznie).
      const topics = await prisma.researchTopic.findMany({ where: { active: true }, take: 25 });
      const filtered = topics.filter(
        (t) => t.title.length <= 100 && t.title.toLowerCase().includes(focused.value.toLowerCase())
      );
      return interaction.respond(filtered.slice(0, 25).map((t) => ({ name: t.title.slice(0, 100), value: t.title })));
    }

    if (focused.name === "badanie") {
      const membership = await prisma.koloMember.findFirst({
        where: { userId: interaction.user.id, role: { in: ["LEADER", "VICE_LEADER"] } },
      });
      if (!membership) return interaction.respond([]);
      const researches = await prisma.research.findMany({
        where: { koloId: membership.koloId, status: { in: ["ACTIVE", "PAUSED"] } },
        take: 25,
      });
      const filtered = researches.filter((r) => r.topic.toLowerCase().includes(focused.value.toLowerCase()));
      // Value to ID badania, nie temat - temat może przekraczać limit 100
      // znaków i (teoretycznie) powtarzać się między badaniami.
      return interaction.respond(
        filtered.slice(0, 25).map((r) => ({ name: `${r.topic} (${r.status})`.slice(0, 100), value: r.id }))
      );
    }

    return interaction.respond([]);
  },
};
