/**
 * commands/rp/podanie.js
 * /podanie student | wykladowca | administracja
 * Otwiera Modal (max 5 pól — limit Discorda). Obsługa submitu w interactionCreate.js.
 */

const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");
const prisma = require("../../lib/prisma");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("podanie")
    .setDescription("Składa podanie rekrutacyjne")
    .addSubcommand((s) => s.setName("student").setDescription("Podanie o przyjęcie na studia"))
    .addSubcommand((s) => s.setName("wykladowca").setDescription("Podanie o stanowisko wykładowcy"))
    .addSubcommand((s) => s.setName("administracja").setDescription("Podanie o stanowisko w administracji"))
    .addSubcommand((s) => s.setName("moje").setDescription("Status Twoich podań")),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "moje") {
      const applicationService = require("../../services/applicationService");
      const apps = await applicationService.myApplications(interaction.user.id);
      if (apps.length === 0) return interaction.reply({ content: "Nie złożyłeś jeszcze żadnego podania.", ephemeral: true });

      const lines = apps.map((a) => `**${a.type}** — ${a.status} (${a.createdAt.toLocaleDateString("pl-PL")})`);
      return interaction.reply({ content: lines.join("\n"), ephemeral: true });
    }

    const type = { student: "STUDENT", wykladowca: "WYKLADOWCA", administracja: "ADMINISTRACJA" }[sub];
    const modal = this._buildModal(type);
    await interaction.showModal(modal);
  },

  _buildModal(type) {
    const modal = new ModalBuilder().setCustomId(`podanie_modal:${type}`);

    if (type === "STUDENT") {
      modal.setTitle("Podanie — Student");
      modal.addComponents(
        this._row("wydzial", "Preferowany wydział", TextInputStyle.Short),
        this._row("motywacja", "Dlaczego chcesz studiować u nas?", TextInputStyle.Paragraph),
        this._row("dodatkowe", "Dodatkowe informacje (opcjonalnie)", TextInputStyle.Paragraph, false)
      );
    } else if (type === "WYKLADOWCA") {
      modal.setTitle("Podanie — Wykładowca");
      modal.addComponents(
        this._row("wydzial", "Wydział", TextInputStyle.Short),
        this._row("przedmiot", "Przedmiot(y), który chcesz prowadzić", TextInputStyle.Short),
        this._row("doswiadczenie", "Doświadczenie (IC/OOC)", TextInputStyle.Paragraph),
        this._row("motywacja", "Motywacja", TextInputStyle.Paragraph)
      );
    } else {
      modal.setTitle("Podanie — Administracja");
      modal.addComponents(
        this._row("stanowisko", "O jakie stanowisko się ubiegasz?", TextInputStyle.Short),
        this._row("doswiadczenie", "Doświadczenie w administracji serwerów", TextInputStyle.Paragraph),
        this._row("dyspozycyjnosc", "Dyspozycyjność (godz./tydzień)", TextInputStyle.Short),
        this._row("motywacja", "Motywacja", TextInputStyle.Paragraph)
      );
    }

    return modal;
  },

  _row(customId, label, style, required = true) {
    return new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(customId).setLabel(label).setStyle(style).setRequired(required)
    );
  },
};
