/**
 * events/interactionCreate.js
 * Centralny router: slash commands, modale, przyciski.
 * ULEPSZONY: obsługa nowych przycisków weryfikacji V2 i aplikacji z AI
 */

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const verificationServiceV2 = require("../services/verificationServiceV2");
const applicationServiceV2 = require("../services/applicationServiceV2");
const koloService = require("../services/koloService");
const partnerstwoService = require("../services/partnerstwoService");
const ticketService = require("../services/ticketService");
const { getBoundChannelId } = require("../config/channels");
const { hasPermission } = require("../config/roles");
const { logError } = require("../utils/logger");
const ui = require("../utils/embeds");

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
      // panel DM: drugi krok akcji niszczących (wycofaj/rozwiąż/opuść).
      // MUSI być przed generycznym "kolo_panel_" - inaczej tamta gałąź
      // połknęłaby ten customId i sparsowała akcję jako "withdraw".
      if (interaction.isButton() && interaction.customId.startsWith("kolo_panel_confirm:")) {
        const [, action, koloId] = interaction.customId.split(":");
        return koloService.handlePanelConfirm(interaction, action, koloId);
      }
      // panel DM: rozpoczęcie badania. showModal() musi być PIERWSZĄ
      // odpowiedzią, więc ta gałąź nie może iść przez handlePanelButton
      // (ten robi deferUpdate, po którym modala już się nie otworzy).
      if (interaction.isButton() && interaction.customId.startsWith("kolo_panel_startresearch:")) {
        return interaction.showModal(koloService.buildStartResearchModal(interaction.customId.split(":")[1]));
      }
      // panel DM: przyciski zarządu i członków.
      // CustomId ma format "kolo_panel_<akcja>:<koloId>" (DWIE części), więc
      // akcji nie da się wyciągnąć przez [, action, koloId] - to by dało
      // action="kolo1", koloId=undefined i każdy przycisk kończyłby się
      // "to koło zostało odrzucone". Akcję bierzemy z prefiksu.
      if (interaction.isButton() && interaction.customId.startsWith("kolo_panel_")) {
        const action = interaction.customId.slice("kolo_panel_".length).split(":")[0];
        const koloId = interaction.customId.split(":")[1];
        return koloService.handlePanelButton(interaction, action, koloId);
      }
      // panel DM: cofnięcie konkretnego zaproszenia
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith("kolo_invite_revoke:")) {
        return koloService.handleInviteRevokeSelect(interaction, interaction.customId.split(":")[1]);
      }
      // panel DM: akcje na konkretnym badaniu (zatrzymaj/wznów/zakończ/przydziel)
      if (interaction.isButton() && interaction.customId.startsWith("kolo_research_action:")) {
        const [, action, researchId] = interaction.customId.split(":");
        return koloService.handleResearchAction(interaction, action, researchId);
      }
      // panel DM: przydzielenie osoby do konkretnego badania
      if (interaction.isUserSelectMenu() && interaction.customId.startsWith("kolo_manage_target:assign_research_direct:")) {
        return koloService.handleAssignResearchDirect(interaction, interaction.customId.split(":")[2]);
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
        return interaction.showModal(await verificationServiceV2.buildCaptchaModal());
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
            embeds: [ui.noPermission("Rozpatrywanie weryfikacji wymaga uprawnienia **MODERATE**.")],
            ephemeral: true,
          });
        }
        const attemptId = interaction.customId.split(":")[1];
        return verificationServiceV2.handleManualReviewDecision(interaction, attemptId, "APPROVED");
      }

      if (interaction.isButton() && interaction.customId.startsWith("verification_reject:")) {
        if (!(await hasPermission(interaction.member, "MODERATE"))) {
          return interaction.reply({
            embeds: [ui.noPermission("Rozpatrywanie weryfikacji wymaga uprawnienia **MODERATE**.")],
            ephemeral: true,
          });
        }
        const attemptId = interaction.customId.split(":")[1];
        return verificationServiceV2.handleManualReviewDecision(interaction, attemptId, "REJECTED");
      }

      if (interaction.isButton() && interaction.customId.startsWith("verification_moreinfo:")) {
        if (!(await hasPermission(interaction.member, "MODERATE"))) {
          return interaction.reply({
            embeds: [ui.noPermission("Rozpatrywanie weryfikacji wymaga uprawnienia **MODERATE**.")],
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
            embeds: [ui.noPermission("Rozpatrywanie podań wymaga uprawnienia **REVIEW_APPLICATIONS**.")],
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
            embeds: [
              decision === "ACCEPTED"
                ? ui.success("Podanie zaakceptowane", `📝 Decyzję podjął <@${interaction.user.id}>.\n\nGratulacje dla kandydata! 🎉`)
                : ui.error("Podanie odrzucone", `📝 Decyzję podjął <@${interaction.user.id}>.`),
            ],
          });

          const applicant = await interaction.client.users.fetch(application.userId).catch(() => null);
          await applicant
            ?.send({
              embeds: [
                decision === "ACCEPTED"
                  ? ui.success(
                      "Podanie zaakceptowane! 🎉",
                      "Twoje podanie zostało **zaakceptowane**!\n\nSprawdź swoje nowe role na serwerze i powodzenia! 🍀"
                    )
                  : ui.base({
                      title: "Decyzja w sprawie podania",
                      description: "Twoje podanie zostało **odrzucone**.\n\nNie zniechęcaj się — możesz spróbować ponownie w przyszłości.",
                      color: ui.COLORS.BURGUNDY,
                    }),
              ],
            })
            .catch(() => null);
        } catch (err) {
          await logError("interactionCreate", "APPLICATION_REVIEW_ERROR", err.message, {
            userId: interaction.user.id,
            applicationId,
          });
          return ui.replyError(interaction, err.message, "Nie udało się rozpatrzyć podania");
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
            embeds: [
              ui.base({
                title: "✉️ Napisz do wykładowcy",
                description: "Wybierz wykładowcę z listy poniżej, a następnie wpisz treść wiadomości.",
                color: ui.COLORS.BURGUNDY,
              }),
            ],
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

      // /wiadomosc tekst|embed - modale buduje komenda z customId
      // "wiadomosc_*_modal:<channelId>"; bez tego routingu submit modala
      // wisiał bez odpowiedzi ("Ta interakcja się nie powiodła").
      if (interaction.isModalSubmit() && interaction.customId.startsWith("wiadomosc_tekst_modal:")) {
        const channelId = interaction.customId.split(":")[1];
        const wiadomoscCommand = interaction.client.commands.get("wiadomosc");
        return wiadomoscCommand.handleTextModalSubmit(interaction, channelId);
      }
      if (interaction.isModalSubmit() && interaction.customId.startsWith("wiadomosc_embed_modal:")) {
        const channelId = interaction.customId.split(":")[1];
        const wiadomoscCommand = interaction.client.commands.get("wiadomosc");
        return wiadomoscCommand.handleEmbedModalSubmit(interaction, channelId);
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
          return ui.replyError(interaction, "Kanał ogłoszeń nie jest skonfigurowany w Dashboardzie (klucz **ANNOUNCEMENTS**).", "Brak konfiguracji");
        }

        const embed = ui.base({
          title: `🏛️ ${tytul}`,
          description: `${tresc}\n\n${ui.DIVIDER}\n🏛️ Wydział: **${wydzial}**\n✍️ Wystawił: <@${interaction.user.id}> (Dziekanat)`,
          color: ui.COLORS.BRASS,
          thumbnail: interaction.guild?.iconURL(),
        });

        const channel = await interaction.guild.channels.fetch(channelId);
        await channel.send({ embeds: [embed] });

        return ui.replySuccess(interaction, `Ogłoszenie **${tytul}** opublikowane na <#${channelId}>.`, "Dziekanat");
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
            embeds: [
              has
                ? ui.base({
                    title: "➖ Role usunięte",
                    description: roleIds.map((id) => `<@&${id}>`).join(" "),
                    color: ui.COLORS.BURGUNDY,
                  })
                : ui.success("Nadano role", roleIds.map((id) => `<@&${id}>`).join(" ")),
            ],
            ephemeral: true,
          });
        } catch (err) {
          await logError("interactionCreate", "REACTION_ROLE_ERROR", err.message, { roleIds: roleIds.join(",") });
          return ui.replyError(
            interaction,
            "Najczęstsza przyczyna: rola bota na serwerze jest ustawiona **NIŻEJ** niż któraś z tych ról. Zgłoś to administracji.",
            "Nie udało się zmienić ról"
          );
        }
      }
    } catch (err) {
      await logError("interactionCreate", "GENERAL_ERROR", err.message, {
        userId: interaction.user.id,
        stack: err.stack,
      });
      const payload = {
        embeds: [ui.error("Coś poszło nie tak", "Wystąpił błąd podczas przetwarzania interakcji. Spróbuj ponownie, a jeśli problem wróci — zgłoś go administracji.")],
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
