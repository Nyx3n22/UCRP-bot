/**
 * events/interactionCreate.js
 * Centralny router: slash commands, modale, przyciski.
 * ULEPSZONY: obsługa nowych przycisków weryfikacji V2 i aplikacji z AI
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const verificationServiceV2 = require("../services/verificationServiceV2");
const applicationServiceV2 = require("../services/applicationServiceV2");
const koloService = require("../services/koloService");
const partnerstwoService = require("../services/partnerstwoService");
const ticketService = require("../services/ticketService");
const { getBoundChannelId } = require("../config/channels");
const { hasPermission } = require("../config/roles");
const { logError } = require("../utils/logger");

module.exports = {
  name: "interactionCreate",
  async execute(interaction) {
    try {
      if (interaction.isAutocomplete()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command?.autocomplete) return;
        return command.autocomplete(interaction);
      }

      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        return command.execute(interaction);
      }

      // ========== KOŁA NAUKOWE ==========
      if (interaction.isButton() && interaction.customId === "kolo_apply_start") {
        return interaction.showModal(koloService.buildApplyModal());
      }
      if (interaction.isModalSubmit() && interaction.customId === "kolo_apply_modal") {
        return koloService.handleApplyModalSubmit(interaction);
      }
      if (interaction.isUserSelectMenu() && interaction.customId === "kolo_pick_members") {
        return koloService.handlePickMembersSubmit(interaction);
      }
      if (interaction.isButton() && interaction.customId.startsWith("kolo_invite_accept:")) {
        return koloService.handleInviteResponse(interaction, interaction.customId.split(":")[1], true);
      }
      if (interaction.isButton() && interaction.customId.startsWith("kolo_invite_decline:")) {
        return koloService.handleInviteResponse(interaction, interaction.customId.split(":")[1], false);
      }
      if (interaction.isButton() && interaction.customId.startsWith("kolo_app_approve:")) {
        return koloService.handleApplicationReview(interaction, interaction.customId.split(":")[1], true);
      }
      if (interaction.isButton() && interaction.customId.startsWith("kolo_app_reject:")) {
        return koloService.handleApplicationReview(interaction, interaction.customId.split(":")[1], false);
      }
      if (interaction.isButton() && interaction.customId.startsWith("kolo_change_approve:")) {
        return koloService.handleChangeReviewDispatch(interaction, interaction.customId.split(":")[1], true);
      }
      if (interaction.isButton() && interaction.customId.startsWith("kolo_change_reject:")) {
        return koloService.handleChangeReviewDispatch(interaction, interaction.customId.split(":")[1], false);
      }
      if (interaction.isButton() && interaction.customId.startsWith("kolo_research_approve:")) {
        return koloService.handleResearchReview(interaction, interaction.customId.split(":")[1], true);
      }
      if (interaction.isButton() && interaction.customId.startsWith("kolo_research_reject:")) {
        return koloService.handleResearchReview(interaction, interaction.customId.split(":")[1], false);
      }
      if (interaction.isButton() && interaction.customId.startsWith("kolo_consent:")) {
        const [, koloId, userId] = interaction.customId.split(":");
        return koloService.handleConsentButton(interaction, koloId, userId);
      }
      // kanał ⚒️zarządzaj-kołem: menu wyboru akcji
      if (interaction.isStringSelectMenu() && interaction.customId === "kolo_manage_select") {
        return koloService.handleManageSelect(interaction);
      }
      // wybór osoby (zaproś/wyrzuć/zmień lidera/przydziel do badania)
      if (interaction.isUserSelectMenu() && interaction.customId.startsWith("kolo_manage_target:")) {
        const [, action, koloId] = interaction.customId.split(":");
        return koloService.handleManageTargetSelect(interaction, action, koloId);
      }
      // modale tekstowe (nazwa/logo/nowa rola/temat badania)
      if (interaction.isModalSubmit() && interaction.customId.startsWith("kolo_modal_rename:")) {
        return koloService.handleRenameModalSubmit(interaction, interaction.customId.split(":")[1]);
      }
      if (interaction.isModalSubmit() && interaction.customId.startsWith("kolo_modal_relogo:")) {
        return koloService.handleRelogoModalSubmit(interaction, interaction.customId.split(":")[1]);
      }
      if (interaction.isModalSubmit() && interaction.customId.startsWith("kolo_modal_newrole:")) {
        return koloService.handleNewRoleModalSubmit(interaction, interaction.customId.split(":")[1]);
      }
      if (interaction.isModalSubmit() && interaction.customId.startsWith("kolo_modal_startresearch:")) {
        return koloService.handleStartResearchModalSubmit(interaction, interaction.customId.split(":")[1]);
      }
      // wybór konkretnego badania (zatrzymaj/wznów/przydziel - ostatni krok)
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith("kolo_research_pick:")) {
        const [, action, koloId, extra] = interaction.customId.split(":");
        return koloService.handleResearchPickSelect(interaction, action, koloId, extra);
      }

      // ========== WERYFIKACJA V2 ==========
      if (interaction.isButton() && interaction.customId === "start_verification") {
        return interaction.showModal(verificationServiceV2.buildModal());
      }

      if (interaction.isModalSubmit() && interaction.customId === "verify_modal_v2") {
        return verificationServiceV2.handleModalSubmit(interaction);
      }

      if (interaction.isButton() && interaction.customId === "verify_captcha_button") {
        return interaction.showModal(verificationServiceV2.buildCaptchaModal());
      }

      if (interaction.isModalSubmit() && interaction.customId === "verify_captcha_modal_v2") {
        return verificationServiceV2.handleCaptchaModalSubmit(interaction);
      }

      if (interaction.isButton() && interaction.customId === "verify_roblox_check_button") {
        return verificationServiceV2.handleRobloxCheckButton(interaction);
      }

      // ========== RECENZJA WERYFIKACJI ==========
      if (interaction.isButton() && interaction.customId.startsWith("verification_accept:")) {
        if (!(await hasPermission(interaction.member, "MODERATE"))) {
          return interaction.reply({
            content: "❌ Brak uprawnień do rozpatrywania weryfikacji.",
            ephemeral: true,
          });
        }
        const attemptId = interaction.customId.split(":")[1];
        return verificationServiceV2.handleManualReviewDecision(interaction, attemptId, "APPROVED");
      }

      if (interaction.isButton() && interaction.customId.startsWith("verification_reject:")) {
        if (!(await hasPermission(interaction.member, "MODERATE"))) {
          return interaction.reply({
            content: "❌ Brak uprawnień do rozpatrywania weryfikacji.",
            ephemeral: true,
          });
        }
        const attemptId = interaction.customId.split(":")[1];
        return verificationServiceV2.handleManualReviewDecision(interaction, attemptId, "REJECTED");
      }

      if (interaction.isButton() && interaction.customId.startsWith("verification_moreinfo:")) {
        if (!(await hasPermission(interaction.member, "MODERATE"))) {
          return interaction.reply({
            content: "❌ Brak uprawnień do rozpatrywania weryfikacji.",
            ephemeral: true,
          });
        }
        const attemptId = interaction.customId.split(":")[1];
        return verificationServiceV2.handleManualReviewDecision(interaction, attemptId, "NEEDS_MORE_INFO");
      }

      // ========== APLIKACJE V2 Z AI ==========
      if (interaction.isButton() && interaction.customId.startsWith("application_start:")) {
        const type = interaction.customId.split(":")[1];
        return interaction.showModal(applicationServiceV2.buildApplicationModal(type));
      }
      if (interaction.isModalSubmit() && interaction.customId.startsWith("application_modal:")) {
        const type = interaction.customId.split(":")[1];
        return applicationServiceV2.handleApplicationModalSubmit(interaction, type);
      }
      if (interaction.isButton() && (interaction.customId.startsWith("application_accept:") || interaction.customId.startsWith("application_reject:"))) {
        if (!(await hasPermission(interaction.member, "REVIEW_APPLICATIONS"))) {
          return interaction.reply({
            content: "❌ Brak uprawnień do rozpatrywania podań.",
            ephemeral: true,
          });
        }

        const [action, applicationId] = interaction.customId.split(":");
        const decision = action === "application_accept" ? "ACCEPTED" : "REJECTED";

        try {
          const application = await applicationServiceV2.review(
            applicationId,
            interaction.user.id,
            decision,
            interaction.guild,
            interaction.message?.embeds?.[0]?.description || ""
          );

          const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("noop_accept")
              .setLabel("✅ Zaakceptowano")
              .setStyle(ButtonStyle.Success)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId("noop_reject")
              .setLabel("❌ Odrzucono")
              .setStyle(ButtonStyle.Danger)
              .setDisabled(true)
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
          await logError("interactionCreate", "APPLICATION_REVIEW_ERROR", err.message, {
            userId: interaction.user.id,
            applicationId,
          });
          return interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
        }
        return;
      }

      // ========== USOS PANEL ==========
      if (interaction.isButton() && interaction.customId.startsWith("usos_panel:")) {
        const action = interaction.customId.split(":")[1];
        const usosCommand = interaction.client.commands.get("usos");

        if (action === "wystaw_ocene") return interaction.showModal(usosCommand.buildGradeModal());
        if (action === "wpisz_frekwencje") return interaction.showModal(usosCommand.buildAttendanceModal());
        if (action === "zatrudnij") return interaction.showModal(usosCommand.buildHireFireModal("hire"));
        if (action === "zwolnij") return interaction.showModal(usosCommand.buildHireFireModal("fire"));
        if (action === "napisz") {
          return interaction.reply({
            content: "Wybierz wykładowcę, do którego chcesz napisać:",
            components: [usosCommand.buildLecturerSelectRow()],
            ephemeral: true,
          });
        }
        if (action === "raport") return usosCommand.handleReportButton(interaction);
        return;
      }

      if (interaction.isButton() && interaction.customId.startsWith("ticket_open:")) {
        const categoryKey = interaction.customId.split(":")[1];
        return ticketService.handleOpenButton(interaction, categoryKey);
      }
      if (interaction.isButton() && interaction.customId === "partnerstwo_start") {
        return interaction.showModal(partnerstwoService.buildModal());
      }
      if (interaction.isModalSubmit() && interaction.customId === "partnerstwo_modal") {
        return partnerstwoService.handleModalSubmit(interaction);
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

      if (interaction.isUserSelectMenu() && interaction.customId === "usos_select_lecturer") {
        const lecturerId = interaction.values[0];
        const usosCommand = interaction.client.commands.get("usos");
        return interaction.showModal(usosCommand.buildWriteModal(lecturerId));
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith("usos_write_modal:")) {
        const lecturerId = interaction.customId.split(":")[1];
        const usosCommand = interaction.client.commands.get("usos");
        return usosCommand.handleWriteModalSubmit(interaction, lecturerId);
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

      // ========== REACTION ROLE / AUTOROLE ==========
      if (interaction.isButton() && interaction.customId.startsWith("reactionrole:")) {
        const roleIds = interaction.customId.split(":")[1].split(",").filter(Boolean);
        const member = interaction.member;
        const has = roleIds.some((id) => member.roles.cache.has(id));

        try {
          if (has) {
            await Promise.all(roleIds.map((id) => member.roles.remove(id)));
          } else {
            await Promise.all(roleIds.map((id) => member.roles.add(id)));
          }
          return interaction.reply({
            content: has ? `➖ Usunięto ${roleIds.length > 1 ? "role" : "rolę"}.` : `➕ Nadano ${roleIds.length > 1 ? "role" : "rolę"}.`,
            ephemeral: true,
          });
        } catch (err) {
          await logError("interactionCreate", "REACTION_ROLE_ERROR", err.message, { roleIds: roleIds.join(",") });
          return interaction.reply({
            content:
              "❌ Nie udało się zmienić roli/ról. Najczęstsza przyczyna: rola bota na serwerze jest ustawiona NIŻEJ niż któraś z tych ról.",
            ephemeral: true,
          });
        }
      }
    } catch (err) {
      await logError("interactionCreate", "GENERAL_ERROR", err.message, {
        userId: interaction.user.id,
        stack: err.stack,
      });
      const payload = {
        content: "❌ Wystąpił błąd podczas przetwarzania interakcji.",
        ephemeral: true,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => null);
      } else {
        await interaction.reply(payload).catch(() => null);
      }
    }
  },
};
