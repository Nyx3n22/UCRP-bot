/**
 * events/interactionCreate.js
 * Centralny router: slash commands, modale, przyciski.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const verificationService = require("../services/verificationService");
const applicationService = require("../services/applicationService");
const { getBoundChannelId } = require("../config/channels");
const { hasPermission } = require("../config/roles");

module.exports = {
  name: "interactionCreate",
  async execute(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        return command.execute(interaction);
      }

      if (interaction.isButton() && interaction.customId === "start_verification") {
        return interaction.showModal(verificationService.buildModal());
      }

      if (interaction.isModalSubmit() && interaction.customId === "verify_modal") {
        return verificationService.handleModalSubmit(interaction);
      }

      if (interaction.isButton() && interaction.customId.startsWith("usos_panel:")) {
        const action = interaction.customId.split(":")[1];
        const usosCommand = interaction.client.commands.get("usos");

        if (action === "wystaw_ocene") return interaction.showModal(usosCommand.buildGradeModal());
        if (action === "wpisz_frekwencje") return interaction.showModal(usosCommand.buildAttendanceModal());
        if (action === "zatrudnij") return interaction.showModal(usosCommand.buildHireFireModal("hire"));
        if (action === "zwolnij") return interaction.showModal(usosCommand.buildHireFireModal("fire"));
        if (action === "napisz") return interaction.showModal(usosCommand.buildWriteModal());
        if (action === "raport") return usosCommand.handleReportButton(interaction);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === "usos_grade_modal") {
        const usosCommand = interaction.client.commands.get("usos");
        return usosCommand.handleGradeModalSubmit(interaction);
      }

      if (interaction.isModalSubmit() && interaction.customId === "usos_attendance_modal") {
        const usosCommand = interaction.client.commands.get("usos");
        return usosCommand.handleAttendanceModalSubmit(interaction);
      }

      if (interaction.isModalSubmit() && interaction.customId === "usos_hire_modal") {
        const usosCommand = interaction.client.commands.get("usos");
        return usosCommand.handleHireFireModalSubmit(interaction, "hire");
      }

      if (interaction.isModalSubmit() && interaction.customId === "usos_fire_modal") {
        const usosCommand = interaction.client.commands.get("usos");
        return usosCommand.handleHireFireModalSubmit(interaction, "fire");
      }

      if (interaction.isModalSubmit() && interaction.customId === "usos_write_modal") {
        const usosCommand = interaction.client.commands.get("usos");
        return usosCommand.handleWriteModalSubmit(interaction);
      }

      if (interaction.isModalSubmit() && interaction.customId === "dziekanat_modal") {
        const tytul = interaction.fields.getTextInputValue("tytul");
        const wydzial = interaction.fields.getTextInputValue("wydzial");
        const tresc = interaction.fields.getTextInputValue("tresc");

        const channelId = await getBoundChannelId("ANNOUNCEMENTS");
        if (!channelId) {
          return interaction.reply({
            content: "Kanał ogłoszeń nie jest skonfigurowany w Dashboardzie.",
            ephemeral: true,
          });
        }

        const embed = new EmbedBuilder()
          .setTitle(`🏛️ ${tytul}`)
          .setDescription(tresc)
          .addFields({ name: "Wydział", value: wydzial })
          .setColor(0x1a2a6c)
          .setFooter({ text: `Dziekanat • wystawił: ${interaction.user.tag}` })
          .setTimestamp();

        const channel = await interaction.guild.channels.fetch(channelId);
        await channel.send({ embeds: [embed] });

        return interaction.reply({ content: "✅ Ogłoszenie Dziekanatu opublikowane.", ephemeral: true });
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith("podanie_modal:")) {
        const type = interaction.customId.split(":")[1];
        const fieldKeysByType = {
          STUDENT: ["wydzial", "motywacja", "dodatkowe"],
          WYKLADOWCA: ["wydzial", "przedmiot", "doswiadczenie", "motywacja"],
          ADMINISTRACJA: ["stanowisko", "doswiadczenie", "dyspozycyjnosc", "motywacja"],
        };
        const answers = {};
        for (const key of fieldKeysByType[type] ?? []) {
          try {
            answers[key] = interaction.fields.getTextInputValue(key);
          } catch {
            // pole opcjonalne, nie zostało wypełnione
          }
        }

        try {
          const application = await applicationService.submit(interaction.user.id, type, answers);

          const channelKey = `APPLICATIONS_${type}`;
          const channelId = await getBoundChannelId(channelKey);
          if (!channelId) {
            return interaction.reply({
              content: "✅ Podanie zapisane, ale kanał do jego rozpatrzenia nie jest skonfigurowany w Dashboardzie — poinformuj administrację.",
              ephemeral: true,
            });
          }

          const embed = new EmbedBuilder()
            .setTitle(`📝 Nowe podanie — ${type}`)
            .setDescription(`Zgłaszający: <@${interaction.user.id}>`)
            .addFields(Object.entries(answers).map(([k, v]) => ({ name: k, value: v.slice(0, 1024) })))
            .setColor(0x1a2a6c)
            .setFooter({ text: `ID podania: ${application.id}` })
            .setTimestamp();

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`application_accept:${application.id}`).setLabel("Akceptuj").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`application_reject:${application.id}`).setLabel("Odrzuć").setStyle(ButtonStyle.Danger)
          );

          const channel = await interaction.guild.channels.fetch(channelId);
          await channel.send({ embeds: [embed], components: [row] });

          return interaction.reply({ content: "✅ Podanie złożone. Otrzymasz wiadomość po jego rozpatrzeniu.", ephemeral: true });
        } catch (err) {
          return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
        }
      }

      if (interaction.isButton() && (interaction.customId.startsWith("application_accept:") || interaction.customId.startsWith("application_reject:"))) {
        if (!(await hasPermission(interaction.member, "REVIEW_APPLICATIONS"))) {
          return interaction.reply({ content: "❌ Brak uprawnień do rozpatrywania podań.", ephemeral: true });
        }

        const [action, applicationId] = interaction.customId.split(":");
        const decision = action === "application_accept" ? "ACCEPTED" : "REJECTED";

        try {
          const application = await applicationService.review(applicationId, interaction.user.id, decision, interaction.guild);

          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("noop_accept").setLabel("Akceptuj").setStyle(ButtonStyle.Success).setDisabled(true),
            new ButtonBuilder().setCustomId("noop_reject").setLabel("Odrzuć").setStyle(ButtonStyle.Danger).setDisabled(true)
          );
          await interaction.update({ components: [disabledRow] });

          await interaction.followUp({
            content: `${decision === "ACCEPTED" ? "✅ Podanie zaakceptowane" : "❌ Podanie odrzucone"} przez <@${interaction.user.id}>.`,
          });

          const applicant = await interaction.client.users.fetch(application.userId).catch(() => null);
          await applicant
            ?.send(
              decision === "ACCEPTED"
                ? "🎉 Twoje podanie zostało zaakceptowane! Sprawdź swoje role na serwerze."
                : "Twoje podanie zostało odrzucone. Możesz spróbować ponownie w przyszłości."
            )
            .catch(() => null);
        } catch (err) {
          return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
        }
        return;
      }

      // Reaction Role / Autorole przez przyciski, obsługiwane generycznie
      if (interaction.isButton() && interaction.customId.startsWith("reactionrole:")) {
        const roleId = interaction.customId.split(":")[1];
        const member = interaction.member;
        const has = member.roles.cache.has(roleId);

        try {
          await member.roles[has ? "remove" : "add"](roleId);
          return interaction.reply({
            content: has ? "➖ Rola usunięta." : "➕ Rola nadana.",
            ephemeral: true,
          });
        } catch (err) {
          console.error(`[reactionrole] Nie udało się ${has ? "usunąć" : "nadać"} roli ${roleId}:`, err.message);
          return interaction.reply({
            content:
              "❌ Nie udało się zmienić roli. Najczęstsza przyczyna: rola bota na serwerze jest ustawiona NIŻEJ niż ta rola w hierarchii ról (Ustawienia serwera → Role → przeciągnij rolę bota wyżej niż wszystkie role, które ma nadawać).",
            ephemeral: true,
          });
        }
      }
    } catch (err) {
      console.error("[interactionCreate] Błąd:", err);
      const payload = { content: "❌ Wystąpił błąd podczas przetwarzania interakcji.", ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => null);
      } else {
        await interaction.reply(payload).catch(() => null);
      }
    }
  },
};
