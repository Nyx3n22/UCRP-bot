/**
 * services/koloService.js
 * Koła Naukowe — bez komend do zakładania. WAŻNE: infrastruktura koła
 * (kategoria, kanały, role) powstaje na INNYM serwerze Discord (drugim)
 * niż reszta bota (weryfikacja, tickety, aplikacje itd. - te zostają na
 * głównym GUILD_ID). ID drugiego serwera: zmienna środowiskowa
 * KOLA_GUILD_ID (patrz config/kolaGuild.js) - bot musi być tam zaproszony
 * z uprawnieniami Manage Roles + Manage Channels.
 *
 * Flow:
 *   1) Bot wysyła panel (przycisk) na kanał KOLA_NAUKOWE (główny serwer,
 *      tam gdzie jest społeczność).
 *   2) Kandydat klika -> modal (nazwa, opis, logo) -> wybór min. 3 osób
 *      (User Select Menu) -> zaproszenia DM z Akceptuj/Odrzuć.
 *   3) Gdy WSZYSCY zaproszeni zaakceptują -> AI ocena + wysyłka do
 *      kanału KOLA_REVIEW (fallback LOG_MOD, główny serwer) z przyciskami
 *      admina.
 *   4) Po akceptacji: na DRUGIM serwerze tworzona jest kategoria + 6
 *      kanałów + 4 role (przedziałka + Lider/Wicelider/Członek). Lider
 *      dostaje rolę od razu; pozostali członkowie dostają DM z linkiem
 *      do drugiego serwera i przyciskiem zgody - role dopiero po
 *      kliknięciu (muszą tam dołączyć, jeśli jeszcze ich nie ma).
 *      Zarządzanie kołem (menu w ⚒️zarządzaj-kołem) odbywa się już
 *      całkowicie na drugim serwerze.
 *
 * Zarządzanie (tylko lider/wicelider): zaproszenia, wyrzucanie, prośby
 * o zmianę (nazwa/logo/lider - też przez AI+admina), badania.
 *
 * Zasady pojemności badań (patrz _capacityRequirementFor):
 *   1 aktywne badanie  -> min. 3 osób w kole
 *   2 aktywne badania  -> min. 6 osób w kole
 *   3 aktywne badania  -> min. 10 osób w kole (twardy limit: max 3 badania)
 *
 * Minimalna liczba osób w kole (lider + min. 3 zaproszonych = 4) i limit
 * 72h na uzupełnienie braków (inaczej auto-rozwiązanie) są pilnowane
 * przez ten sam mechanizm co wygasanie niezaakceptowanych zaproszeń
 * (patrz koloScheduler.js) - Kolo.belowMinSince to wspólny licznik dla
 * obu przypadków, dla prostoty i spójności.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  AttachmentBuilder,
} = require("discord.js");
const prisma = require("../lib/prisma");
const { hasPermission } = require("../config/roles");
const { getBoundChannelId } = require("../config/channels");
const { generateAiReply } = require("./aiGatewayService");
const { logError, logAction } = require("./../utils/logger");
const { detectDominantColor } = require("../utils/dominantColor");
const { generateBanner } = require("../utils/banner");
const { getKolaGuild } = require("../config/kolaGuild");

const MIN_INVITED = 3; // + lider = min. 4 osoby
const MAX_MEMBERS = 15;
const GRACE_PERIOD_MS = 72 * 60 * 60 * 1000; // 72h
const RESEARCH_CAPACITY = { 1: 3, 2: 6, 3: 10 }; // ile osób w kole potrzeba na N jednoczesnych badań
const MAX_CONCURRENT_RESEARCH = 3;

// pending[userId] = { name, description, logoUrl } — dane z modala,
// zanim użytkownik wybierze osoby do zaproszenia (User Select Menu to
// osobna interakcja, nie da się tego zrobić w jednym kroku modala).
const pendingApplications = new Map();

class KoloService {
  // ==================== PANEL / ZGŁOSZENIE ====================

  buildPanelEmbed() {
    return new EmbedBuilder()
      .setTitle("🔬 Koła Naukowe")
      .setDescription(
        "Chcesz założyć koło naukowe? Kliknij przycisk poniżej.\n\n" +
          `Będziesz musiał/a podać nazwę, opis oraz zaprosić min. ${MIN_INVITED} innych osób ` +
          "(oprócz siebie) - wszystkie muszą zaakceptować zaproszenie, zanim zgłoszenie trafi do oceny."
      )
      .setColor(0x2b6cb0).setTimestamp();
  }

  buildPanelRow() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("kolo_apply_start").setLabel("🔬 Załóż koło naukowe").setStyle(ButtonStyle.Primary)
    );
  }

  /** Wysyła (lub odświeża) panel na kanale KOLA_NAUKOWE. Wołane raz przy starcie bota. */
  async ensurePanelPosted(client) {
    try {
      const channelId = await getBoundChannelId("KOLA_NAUKOWE");
      if (!channelId) return;

      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) return;

      const recent = await channel.messages.fetch({ limit: 25 }).catch(() => null);
      const already = recent?.find(
        (m) => m.author.id === client.user.id && m.components?.[0]?.components?.[0]?.customId === "kolo_apply_start"
      );
      if (already) return;

      const banner = new AttachmentBuilder(generateBanner("Koła Naukowe"), { name: "banner.png" });
      await channel.send({
        embeds: [this.buildPanelEmbed().setImage("attachment://banner.png")],
        components: [this.buildPanelRow()],
        files: [banner],
      });
    } catch (err) {
      await logError("koloService", "PANEL_POST_ERROR", err.message, { stack: err.stack });
    }
  }

  buildApplyModal() {
    return new ModalBuilder()
      .setCustomId("kolo_apply_modal")
      .setTitle("Załóż koło naukowe (1/2)")
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId("nazwa").setLabel("Nazwa koła").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("opis")
            .setLabel("Opis / cel koła")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("logo")
            .setLabel("Link do logo (opcjonalnie)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        )
      );
  }

  async handleApplyModalSubmit(interaction) {
    try {
      const existingMembership = await prisma.koloMember.findFirst({ where: { userId: interaction.user.id } });
      if (existingMembership) {
        return interaction.reply({ content: "❌ Jesteś już członkiem koła naukowego. Nie można należeć do dwóch naraz.", ephemeral: true });
      }

      const nameTaken = await prisma.kolo.findUnique({
        where: { name: interaction.fields.getTextInputValue("nazwa").trim() },
      });
      if (nameTaken) {
        return interaction.reply({ content: "❌ Koło o tej nazwie już istnieje.", ephemeral: true });
      }

      pendingApplications.set(interaction.user.id, {
        name: interaction.fields.getTextInputValue("nazwa").trim(),
        description: interaction.fields.getTextInputValue("opis").trim(),
        logoUrl: interaction.fields.getTextInputValue("logo").trim() || null,
      });

      const select = new UserSelectMenuBuilder()
        .setCustomId("kolo_pick_members")
        .setPlaceholder(`Wybierz min. ${MIN_INVITED} osób do zaproszenia`)
        .setMinValues(MIN_INVITED)
        .setMaxValues(MAX_MEMBERS - 1);

      return interaction.reply({
        content:
          `✅ Dane zapisane (2/2). Teraz wybierz min. ${MIN_INVITED} osób, które zaprosisz do koła ` +
          "- każda z nich musi zaakceptować zaproszenie, zanim zgłoszenie trafi do oceny.",
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true,
      });
    } catch (err) {
      await logError("koloService", "APPLY_MODAL_ERROR", err.message, { userId: interaction.user.id, stack: err.stack });
      return interaction.reply({ content: "❌ Błąd serwera. Spróbuj ponownie.", ephemeral: true }).catch(() => null);
    }
  }

  async handlePickMembersSubmit(interaction) {
    await interaction.deferUpdate();
    try {
      const pending = pendingApplications.get(interaction.user.id);
      if (!pending) {
        return interaction.editReply({ content: "❌ Sesja wygasła, zacznij od nowa klikając przycisk na panelu.", components: [] });
      }

      const invitedIds = interaction.values.filter((id) => id !== interaction.user.id);
      if (invitedIds.length < MIN_INVITED) {
        return interaction.editReply({ content: `❌ Musisz wybrać min. ${MIN_INVITED} innych osób (nie licząc siebie).`, components: [] });
      }

      const kolo = await prisma.kolo.create({
        data: {
          name: pending.name,
          description: pending.description,
          logoUrl: pending.logoUrl,
          leaderId: interaction.user.id,
          status: "PENDING_MEMBERS",
          members: { create: { userId: interaction.user.id, role: "LEADER" } },
        },
      });
      pendingApplications.delete(interaction.user.id);

      const expiresAt = new Date(Date.now() + GRACE_PERIOD_MS);
      for (const userId of invitedIds) {
        const invite = await prisma.koloInvite.create({ data: { koloId: kolo.id, userId, expiresAt } });
        await this._sendInviteDm(interaction.client, invite, kolo, interaction.user);
      }

      await logAction("kolo_application_started", interaction.user.id, kolo.id, { name: kolo.name, invited: invitedIds });

      return interaction.editReply({
        content:
          `✅ Zgłoszenie koła **${kolo.name}** utworzone. Wysłano zaproszenia do ${invitedIds.length} osób ` +
          `(masz 72h, zanim wygasną). Gdy wszyscy zaakceptują, zgłoszenie trafi do oceny AI i administracji.`,
        components: [],
      });
    } catch (err) {
      await logError("koloService", "PICK_MEMBERS_ERROR", err.message, { userId: interaction.user.id, stack: err.stack });
      return interaction.editReply({ content: "❌ Błąd serwera. Skontaktuj się z supportem.", components: [] }).catch(() => null);
    }
  }

  async _sendInviteDm(client, invite, kolo, leaderUser) {
    const embed = new EmbedBuilder()
      .setTitle("🔬 Zaproszenie do koła naukowego")
      .setDescription(`**${leaderUser.tag}** zaprasza Cię do koła **${kolo.name}**.\n\n${kolo.description}`)
      .setColor(0x2b6cb0)
      .setFooter({ text: "To zaproszenie wygasa po 72h." });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`kolo_invite_accept:${invite.id}`).setLabel("✅ Akceptuj").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`kolo_invite_decline:${invite.id}`).setLabel("❌ Odrzuć").setStyle(ButtonStyle.Danger)
    );

    const user = await client.users.fetch(invite.userId).catch(() => null);
    await user?.send({ embeds: [embed], components: [row] }).catch(() => null);
  }

  async handleInviteResponse(interaction, inviteId, accepted) {
    await interaction.deferUpdate();
    try {
      const invite = await prisma.koloInvite.findUnique({ where: { id: inviteId }, include: { kolo: true } });
      if (!invite) return interaction.editReply({ content: "❌ Nie znaleziono zaproszenia.", components: [] });
      if (invite.userId !== interaction.user.id) {
        return interaction.editReply({ content: "❌ To nie jest Twoje zaproszenie.", components: [] });
      }
      if (invite.status !== "PENDING") {
        return interaction.editReply({ content: "❌ To zaproszenie zostało już rozpatrzone lub wygasło.", components: [] });
      }

      if (!accepted) {
        await prisma.koloInvite.update({ where: { id: inviteId }, data: { status: "DECLINED" } });
        const leader = await interaction.client.users.fetch(invite.kolo.leaderId).catch(() => null);
        await leader
          ?.send(
            `❌ **${interaction.user.tag}** odrzucił(a) zaproszenie do koła **${invite.kolo.name}**. ` +
              `Użyj \`/kolo zaproś\`, aby zaprosić kogoś innego.`
          )
          .catch(() => null);
        return interaction.editReply({ content: "Odrzucono zaproszenie.", embeds: [], components: [] });
      }

      await prisma.koloInvite.update({ where: { id: inviteId }, data: { status: "ACCEPTED" } });
      await prisma.koloMember.upsert({
        where: { koloId_userId: { koloId: invite.koloId, userId: interaction.user.id } },
        update: {},
        create: { koloId: invite.koloId, userId: interaction.user.id, role: "MEMBER" },
      });

      const stillPending = await prisma.koloInvite.count({ where: { koloId: invite.koloId, status: "PENDING" } });
      if (stillPending === 0 && invite.kolo.status === "PENDING_MEMBERS") {
        await this._advanceToReview(interaction.client, invite.koloId);
      }

      return interaction.editReply({ content: `✅ Dołączono do koła **${invite.kolo.name}**.`, embeds: [], components: [] });
    } catch (err) {
      await logError("koloService", "INVITE_RESPONSE_ERROR", err.message, { userId: interaction.user.id, stack: err.stack });
      return interaction.editReply({ content: "❌ Błąd serwera.", components: [] }).catch(() => null);
    }
  }

  // ==================== OCENA AI + ADMIN ====================

  async _aiScore(kind, details) {
    const aiConfig = await prisma.aiConfig.findUnique({ where: { id: "singleton" } });
    if (!aiConfig || !aiConfig.koloAiEnabled) return { score: 1.0, flags: [], analysis: null };

    const prompt = `Oceń poniższe zgłoszenie dotyczące koła naukowego na serwerze RP (uniwersytet). Typ: ${kind}.\n\n${details}\n\nOdpowiedź WYŁĄCZNIE w JSON: {"score": 0.0-1.0, "flags": ["lista_problemow"], "reasoning": "krótkie uzasadnienie"}`;

    try {
      const response = await generateAiReply(prompt, aiConfig, {
        isPremium: false,
        systemPrompt: "Jesteś moderatorem oceniającym zgłoszenia kół naukowych na serwerze RP. Odpowiadaj wyłącznie w formacie JSON.",
      });
      const parsed = JSON.parse(response);
      return {
        score: Math.max(0, Math.min(1, parsed.score ?? 0.5)),
        flags: parsed.flags || [],
        analysis: parsed.reasoning || "",
      };
    } catch (err) {
      console.error("[koloService] AI analysis error:", err.message);
      return { score: 0.8, flags: ["ai_parse_error"], analysis: null };
    }
  }


  // ==================== OCENA AI + ADMIN (aplikacja koła) ====================

  async _aiScore(kind, details) {
    const aiConfig = await prisma.aiConfig.findUnique({ where: { id: "singleton" } });
    if (!aiConfig || !aiConfig.koloAiEnabled) return { score: 1.0, flags: [], analysis: null };

    const prompt = `Oceń poniższe zgłoszenie dotyczące koła naukowego na serwerze RP (uniwersytet). Typ: ${kind}.\n\n${details}\n\nOdpowiedź WYŁĄCZNIE w JSON: {"score": 0.0-1.0, "flags": ["lista_problemow"], "reasoning": "krótkie uzasadnienie"}`;

    try {
      const response = await generateAiReply(prompt, aiConfig, {
        isPremium: false,
        systemPrompt: "Jesteś moderatorem oceniającym zgłoszenia kół naukowych na serwerze RP. Odpowiadaj wyłącznie w formacie JSON.",
      });
      const parsed = JSON.parse(response);
      return {
        score: Math.max(0, Math.min(1, parsed.score ?? 0.5)),
        flags: parsed.flags || [],
        analysis: parsed.reasoning || "",
      };
    } catch (err) {
      console.error("[koloService] AI analysis error:", err.message);
      return { score: 0.8, flags: ["ai_parse_error"], analysis: null };
    }
  }

  async _getReviewChannel(client) {
    const channelId = (await getBoundChannelId("KOLA_REVIEW")) || (await getBoundChannelId("LOG_MOD"));
    if (!channelId) return null;
    return client.channels.fetch(channelId).catch(() => null);
  }

  async _advanceToReview(client, koloId) {
    const kolo = await prisma.kolo.update({ where: { id: koloId }, data: { status: "PENDING_REVIEW" }, include: { members: true } });

    const ai = await this._aiScore(
      "rejestracja_kola",
      `Nazwa: ${kolo.name}\nOpis: ${kolo.description}\nLiczba członków założycieli: ${kolo.members.length}`
    );

    const channel = await this._getReviewChannel(client);
    if (!channel) {
      await logError("koloService", "NO_REVIEW_CHANNEL", "Brak kanału KOLA_REVIEW/LOG_MOD, pomijam wysłanie embeda", { koloId });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("🔬 Nowe koło naukowe do przeglądu")
      .addFields(
        { name: "Nazwa", value: kolo.name, inline: true },
        { name: "Lider", value: `<@${kolo.leaderId}>`, inline: true },
        { name: "Członkowie", value: `${kolo.members.length}`, inline: true },
        { name: "Opis", value: kolo.description.slice(0, 1000) },
        { name: "AI Score", value: `${Math.round(ai.score * 100)}%${ai.flags.length ? ` ⚠️ ${ai.flags.join(", ")}` : " ✅"}` }
      )
      .setColor(0x2b6cb0);
    if (kolo.logoUrl) embed.setThumbnail(kolo.logoUrl);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`kolo_app_approve:${kolo.id}`).setLabel("✅ Zaakceptuj").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`kolo_app_reject:${kolo.id}`).setLabel("❌ Odrzuć").setStyle(ButtonStyle.Danger)
    );

    await channel.send({ embeds: [embed], components: [row] });
  }

  async handleApplicationReview(interaction, koloId, approve) {
    await interaction.deferUpdate();
    try {
      if (!(await hasPermission(interaction.member, "MODERATE"))) {
        return interaction.followUp({ content: "❌ Nie masz uprawnień do rozpatrywania kół naukowych.", ephemeral: true });
      }

      const kolo = await prisma.kolo.findUnique({ where: { id: koloId }, include: { members: true } });
      if (!kolo || kolo.status !== "PENDING_REVIEW") {
        return interaction.followUp({ content: "❌ To zgłoszenie zostało już rozpatrzone lub nie istnieje.", ephemeral: true });
      }

      if (!approve) {
        await prisma.kolo.update({ where: { id: koloId }, data: { status: "REJECTED" } });
        const leader = await interaction.client.users.fetch(kolo.leaderId).catch(() => null);
        await leader?.send(`❌ Zgłoszenie koła **${kolo.name}** zostało odrzucone przez administrację.`).catch(() => null);
        await logAction("kolo_rejected", interaction.user.id, koloId, {});
        return interaction.editReply({ components: [] });
      }

      await this._activateKolo(interaction.client, kolo);
      await logAction("kolo_approved", interaction.user.id, koloId, { name: kolo.name });
      return interaction.editReply({ components: [] });
    } catch (err) {
      await logError("koloService", "APPLICATION_REVIEW_ERROR", err.message, { koloId, stack: err.stack });
      return interaction.followUp({ content: "❌ Błąd podczas przetwarzania decyzji.", ephemeral: true }).catch(() => null);
    }
  }

  // ==================== INFRASTRUKTURA (kategoria/kanały/role) ====================

  /** Tworzy kategorię + 6 kanałów + 4 role dla zatwierdzonego koła, nadaje rolę liderowi
   * od razu (on zarejestrował koło, zgoda jest dorozumiana), a pozostałym członkom
   * wysyła DM z prośbą o zgodę - ich role zostaną nadane dopiero po kliknięciu. */
  /** Tworzy kategorię + 6 kanałów + 4 role dla zatwierdzonego koła NA DRUGIM
   * SERWERZE (KOLA_GUILD_ID) - Koła Naukowe żyją na innym serwerze niż
   * reszta bota. Nadaje rolę liderowi od razu (on zarejestrował koło,
   * zgoda jest dorozumiana), a pozostałym członkom wysyła DM z prośbą
   * o zgodę i linkiem do DRUGIEGO serwera - ich role zostaną nadane
   * dopiero po kliknięciu (i dołączeniu tam, jeśli jeszcze ich nie ma). */
  async _activateKolo(client, kolo) {
    const guild = getKolaGuild(client);
    if (!guild) {
      await logError("koloService", "NO_KOLA_GUILD", "KOLA_GUILD_ID nieustawione lub bot nie jest na tym serwerze - nie można aktywować koła.", { koloId: kolo.id });
      return;
    }

    const { emoji, hex } = await detectDominantColor(kolo.logoUrl);

    const divider = await guild.roles.create({
      name: `•══════• ${kolo.name} •══════•`,
      color: hex,
      hoist: true,
      mentionable: false,
    });
    const roleLider = await guild.roles.create({ name: "• Lider Koła Naukowego •", color: hex, mentionable: true });
    const roleWicelider = await guild.roles.create({ name: "• Wicelider Koła Naukowego •", color: hex, mentionable: true });
    const roleCzlonek = await guild.roles.create({ name: "• Członek Koła Naukowego •", color: hex, mentionable: true });

    const everyone = guild.roles.everyone;
    const category = await guild.channels.create({
      name: `${emoji} • ${kolo.name}`,
      type: 4, // GuildCategory
      permissionOverwrites: [
        { id: everyone.id, deny: ["ViewChannel"] },
        { id: divider.id, allow: ["ViewChannel"] },
      ],
    });

    const ogloszenia = await guild.channels.create({
      name: "📣│ogłoszenia-koła",
      type: 0,
      parent: category.id,
      permissionOverwrites: [
        { id: everyone.id, deny: ["ViewChannel"] },
        { id: divider.id, allow: ["ViewChannel"], deny: ["SendMessages"] },
        { id: roleLider.id, allow: ["SendMessages"] },
        { id: roleWicelider.id, allow: ["SendMessages"] },
      ],
    });

    const czat = await guild.channels.create({
      name: "💬│czat-koła",
      type: 0,
      parent: category.id,
    });

    const badania = await guild.channels.create({
      name: "🔬│badania",
      type: 0,
      parent: category.id,
      permissionOverwrites: [
        { id: everyone.id, deny: ["ViewChannel"] },
        { id: divider.id, allow: ["ViewChannel"], deny: ["SendMessages"] },
      ],
    });

    const zarzadzaj = await guild.channels.create({
      name: "⚒️│zarządzaj-kołem",
      type: 0,
      parent: category.id,
      permissionOverwrites: [
        { id: everyone.id, deny: ["ViewChannel"] },
        { id: divider.id, deny: ["ViewChannel"] },
        { id: roleLider.id, allow: ["ViewChannel", "SendMessages"] },
        { id: roleWicelider.id, allow: ["ViewChannel", "SendMessages"] },
      ],
    });

    const dokumenty = await guild.channels.create({
      name: "📜│dokumenty-koła",
      type: 15, // GuildForum
      parent: category.id,
    });

    const vc = await guild.channels.create({
      name: "🔊│vc",
      type: 2, // GuildVoice
      parent: category.id,
    });

    await prisma.kolo.update({
      where: { id: kolo.id },
      data: {
        status: "ACTIVE",
        colorHex: hex,
        categoryId: category.id,
        channelAnnouncements: ogloszenia.id,
        channelChat: czat.id,
        channelResearch: badania.id,
        channelManage: zarzadzaj.id,
        channelDocuments: dokumenty.id,
        channelVoice: vc.id,
        roleIdDivider: divider.id,
        roleIdLeader: roleLider.id,
        roleIdVice: roleWicelider.id,
        roleIdMember: roleCzlonek.id,
      },
    });

    // Lider: zgoda dorozumiana, role nadajemy od razu.
    const leaderMember = await guild.members.fetch(kolo.leaderId).catch(() => null);
    if (leaderMember) {
      await leaderMember.roles.add([divider.id, roleLider.id]).catch(() => null);
      await prisma.koloMember.updateMany({
        where: { koloId: kolo.id, userId: kolo.leaderId },
        data: { consentGiven: true, currentRoleId: roleLider.id },
      });
    }

    // Pozostali członkowie: DM ze zgodą, role dopiero po kliknięciu.
    const otherMembers = await prisma.koloMember.findMany({ where: { koloId: kolo.id, userId: { not: kolo.leaderId } } });
    for (const m of otherMembers) {
      await this._sendConsentDm(client, kolo.id, m.userId, kolo.name);
    }

    await this.postManageEmbed(zarzadzaj, kolo.id);

    const welcomeBanner = new AttachmentBuilder(generateBanner(kolo.name, hex), { name: "banner.png" });
    const welcome = new EmbedBuilder()
      .setTitle(`${emoji} Koło Naukowe ${kolo.name} zostało utworzone!`)
      .setDescription(kolo.description)
      .setImage("attachment://banner.png")
      .setColor(hex);
    if (kolo.logoUrl) welcome.setThumbnail(kolo.logoUrl);
    await ogloszenia.send({ embeds: [welcome], files: [welcomeBanner] }).catch(() => null);
  }

  async _sendConsentDm(client, koloId, userId, koloName) {
    const cfg = await prisma.generalConfig.findUnique({ where: { id: "singleton" } });
    const embed = new EmbedBuilder()
      .setTitle("🔬 Dołączasz do koła naukowego")
      .setDescription(
        `Twoje koło **${koloName}** zostało zatwierdzone! Aby otrzymać dostęp do jego kanałów, ` +
          "musisz być na serwerze i potwierdzić poniżej.\n\n" +
          (cfg?.serverInviteLink ? `🔗 Link do serwera: ${cfg.serverInviteLink}` : "")
      )
      .setColor(0x2b6cb0);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`kolo_consent:${koloId}:${userId}`).setLabel("✅ Potwierdzam, daj mi dostęp").setStyle(ButtonStyle.Success)
    );
    const user = await client.users.fetch(userId).catch(() => null);
    await user?.send({ embeds: [embed], components: [row] }).catch(() => null);
  }

  async handleConsentButton(interaction, koloId, userId) {
    await interaction.deferUpdate();
    try {
      if (interaction.user.id !== userId) {
        return interaction.followUp({ content: "❌ To nie jest Twoja zgoda do potwierdzenia.", ephemeral: true });
      }

      const kolo = await prisma.kolo.findUnique({ where: { id: koloId } });
      if (!kolo || kolo.status !== "ACTIVE") {
        return interaction.editReply({ content: "❌ To koło nie jest już aktywne.", embeds: [], components: [] });
      }

      const guild = getKolaGuild(interaction.client);
      if (!guild) {
        return interaction.editReply({ content: "❌ Błąd konfiguracji serwera Kół Naukowych. Skontaktuj się z supportem.", embeds: [], components: [] });
      }
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) {
        return interaction.editReply({
          content: "❌ Nie znaleziono Cię na serwerze - dołącz najpierw, a potem kliknij ponownie.",
          embeds: [],
        });
      }

      await member.roles.add([kolo.roleIdDivider, kolo.roleIdMember]).catch(() => null);
      await prisma.koloMember.updateMany({
        where: { koloId, userId },
        data: { consentGiven: true, currentRoleId: kolo.roleIdMember },
      });

      return interaction.editReply({ content: `✅ Gotowe! Masz teraz dostęp do kanałów koła **${kolo.name}**.`, embeds: [], components: [] });
    } catch (err) {
      await logError("koloService", "CONSENT_ERROR", err.message, { koloId, userId, stack: err.stack });
    }
  }

  async _getManagedKolo(userId) {
    const membership = await prisma.koloMember.findFirst({
      where: { userId, role: { in: ["LEADER", "VICE_LEADER"] } },
      include: { kolo: true },
    });
    if (!membership || membership.kolo.status !== "ACTIVE") return null;
    return membership;
  }

  // ==================== EMBED ZARZĄDZANIA (kanał ⚒️zarządzaj-kołem) ====================

  buildManageEmbed(kolo) {
    return new EmbedBuilder()
      .setTitle(`⚒️ Zarządzanie kołem ${kolo.name}`)
      .setDescription("Wybierz akcję z listy poniżej. Dostępne tylko dla lidera i wicelidera.")
      .setColor(0x2b6cb0);
  }

  buildManageSelectRow() {
    const select = new StringSelectMenuBuilder()
      .setCustomId("kolo_manage_select")
      .setPlaceholder("Wybierz akcję...")
      .addOptions(
        { label: "Zaproś osobę", value: "invite", emoji: "📨" },
        { label: "Wyrzuć osobę", value: "kick", emoji: "👢" },
        { label: "Zmień nazwę koła", value: "rename", emoji: "✏️", description: "Wymaga zgody administracji" },
        { label: "Zmień logo koła", value: "relogo", emoji: "🖼️", description: "Wymaga zgody administracji" },
        { label: "Zmień lidera", value: "transfer_leader", emoji: "👑", description: "Wymaga zgody administracji" },
        { label: "Ustaw wicelidera", value: "set_vice", emoji: "🥈" },
        { label: "Utwórz nową rolę", value: "new_role", emoji: "🏷️", description: "Wymaga zgody administracji" },
        { label: "Rozpocznij badanie", value: "start_research", emoji: "🔬" },
        { label: "Zatrzymaj badanie", value: "pause_research", emoji: "⏸️" },
        { label: "Wznów badanie", value: "resume_research", emoji: "▶️" },
        { label: "Przydziel osobę do badania", value: "assign_research", emoji: "🧑‍🔬" },
        { label: "Informacje o kole", value: "info", emoji: "ℹ️" },
        { label: "Rozwiąż koło", value: "dissolve", emoji: "💥", description: "Wymaga zgody administracji" }
      );
    return new ActionRowBuilder().addComponents(select);
  }

  async postManageEmbed(channel, koloId) {
    const kolo = await prisma.kolo.findUnique({ where: { id: koloId } });
    await channel.send({ embeds: [this.buildManageEmbed(kolo)], components: [this.buildManageSelectRow()] }).catch(() => null);
  }

  async handleManageSelect(interaction) {
    const membership = await this._getManagedKolo(interaction.user.id);
    if (!membership) {
      return interaction.reply({ content: "❌ Musisz być liderem lub wiceliderem tego koła.", ephemeral: true });
    }
    const action = interaction.values[0];
    const kolo = membership.kolo;

    if (action === "invite" || action === "kick" || action === "transfer_leader" || action === "assign_research") {
      const select = new UserSelectMenuBuilder().setCustomId(`kolo_manage_target:${action}:${kolo.id}`).setMinValues(1).setMaxValues(1);
      return interaction.reply({ content: "Wybierz osobę:", components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
    }

    if (action === "set_vice") {
      const select = new UserSelectMenuBuilder().setCustomId(`kolo_manage_target:set_vice:${kolo.id}`).setMinValues(1).setMaxValues(1);
      return interaction.reply({ content: "Wybierz nowego wicelidera:", components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
    }

    if (action === "rename") return interaction.showModal(this._buildTextModal(`kolo_modal_rename:${kolo.id}`, "Nowa nazwa koła", "nazwa"));
    if (action === "relogo") return interaction.showModal(this._buildTextModal(`kolo_modal_relogo:${kolo.id}`, "Link do nowego logo", "logo"));
    if (action === "new_role") return interaction.showModal(this._buildTextModal(`kolo_modal_newrole:${kolo.id}`, "Nazwa nowej roli (bez • •)", "nazwa"));
    if (action === "start_research") return interaction.showModal(this._buildTextModal(`kolo_modal_startresearch:${kolo.id}`, "Temat badania", "temat"));

    if (action === "pause_research" || action === "resume_research") {
      const statusFilter = action === "pause_research" ? ["ACTIVE"] : ["PAUSED"];
      const researches = await prisma.research.findMany({ where: { koloId: kolo.id, status: { in: statusFilter } } });
      if (researches.length === 0) return interaction.reply({ content: "❌ Brak badań w odpowiednim stanie.", ephemeral: true });
      const select = new StringSelectMenuBuilder()
        .setCustomId(`kolo_research_pick:${action}:${kolo.id}`)
        .setPlaceholder("Wybierz badanie...")
        .addOptions(researches.slice(0, 25).map((r) => ({ label: r.topic.slice(0, 100), value: r.id })));
      return interaction.reply({ components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
    }

    if (action === "info") return this._sendInfo(interaction, kolo);
    if (action === "dissolve") return this._requestDissolve(interaction, kolo);
  }

  _buildTextModal(customId, label, fieldId) {
    return new ModalBuilder()
      .setCustomId(customId)
      .setTitle(label)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId(fieldId).setLabel(label).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200)
        )
      );
  }

  async _sendInfo(interaction, kolo) {
    const [members, researches] = await Promise.all([
      prisma.koloMember.findMany({ where: { koloId: kolo.id } }),
      prisma.research.findMany({ where: { koloId: kolo.id } }),
    ]);
    const embed = new EmbedBuilder()
      .setTitle(`ℹ️ ${kolo.name}`)
      .setColor(kolo.colorHex || 0x2b6cb0)
      .addFields(
        { name: "Lider", value: `<@${kolo.leaderId}>`, inline: true },
        { name: "Członkowie", value: `${members.length}`, inline: true },
        {
          name: "Badania",
          value: researches.length
            ? researches.map((r) => `**${r.topic}** — ${r.status}`).join("\n")
            : "Brak",
        }
      );
    if (kolo.logoUrl) embed.setThumbnail(kolo.logoUrl);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ==================== TARGET (user select) HANDLERY ====================

  async handleManageTargetSelect(interaction, action, koloId) {
    await interaction.deferUpdate();
    const targetId = interaction.values[0];
    const kolo = await prisma.kolo.findUnique({ where: { id: koloId } });
    if (!kolo || kolo.status !== "ACTIVE") return interaction.editReply({ content: "❌ Koło nieaktywne.", components: [] });

    if (action === "invite") return this._doInvite(interaction, kolo, targetId);
    if (action === "kick") return this._doKick(interaction, kolo, targetId);
    if (action === "set_vice") return this._doSetVice(interaction, kolo, targetId);
    if (action === "transfer_leader") return this._doRequestLeaderTransfer(interaction, kolo, targetId);
    if (action === "assign_research") return this._doAssignResearchPickResearch(interaction, kolo, targetId);
  }

  async _doInvite(interaction, kolo, targetId) {
    const memberCount = await prisma.koloMember.count({ where: { koloId: kolo.id } });
    if (memberCount >= MAX_MEMBERS) return interaction.editReply({ content: `❌ Koło ma już maksymalną liczbę członków (${MAX_MEMBERS}).`, components: [] });

    const already = await prisma.koloMember.findFirst({ where: { userId: targetId } });
    if (already) return interaction.editReply({ content: "❌ Ta osoba należy już do jakiegoś koła.", components: [] });

    const pendingInvite = await prisma.koloInvite.findFirst({ where: { koloId: kolo.id, userId: targetId, status: "PENDING" } });
    if (pendingInvite) return interaction.editReply({ content: "❌ Ta osoba ma już wysłane zaproszenie.", components: [] });

    const invite = await prisma.koloInvite.create({ data: { koloId: kolo.id, userId: targetId, expiresAt: new Date(Date.now() + GRACE_PERIOD_MS) } });
    const leaderUser = await interaction.client.users.fetch(kolo.leaderId).catch(() => null);
    await this._sendInviteDm(interaction.client, invite, kolo, leaderUser || interaction.user);
    return interaction.editReply({ content: `✅ Wysłano zaproszenie do <@${targetId}>.`, components: [] });
  }

  async _doKick(interaction, kolo, targetId) {
    if (targetId === kolo.leaderId) return interaction.editReply({ content: "❌ Nie możesz wyrzucić lidera. Użyj zmiany lidera.", components: [] });

    const targetMembership = await prisma.koloMember.findUnique({ where: { koloId_userId: { koloId: kolo.id, userId: targetId } } });
    if (!targetMembership) return interaction.editReply({ content: "❌ Ta osoba nie należy do koła.", components: [] });

    await prisma.koloMember.delete({ where: { id: targetMembership.id } });

    const guild = interaction.guild;
    const member = await guild.members.fetch(targetId).catch(() => null);
    for (const roleId of [kolo.roleIdDivider, kolo.roleIdLeader, kolo.roleIdVice, kolo.roleIdMember]) {
      if (roleId) await member?.roles.remove(roleId).catch(() => null);
    }
    const customRoles = await prisma.koloCustomRole.findMany({ where: { koloId: kolo.id } });
    for (const cr of customRoles) await member?.roles.remove(cr.roleId).catch(() => null);

    await this._checkMinimumMembers(interaction.client, kolo.id);
    await logAction("kolo_member_kicked", interaction.user.id, kolo.id, { targetId });
    return interaction.editReply({ content: `✅ Wyrzucono <@${targetId}> z koła.`, components: [] });
  }

  async _doSetVice(interaction, kolo, targetId) {
    const targetMembership = await prisma.koloMember.findUnique({ where: { koloId_userId: { koloId: kolo.id, userId: targetId } } });
    if (!targetMembership) return interaction.editReply({ content: "❌ Ta osoba nie należy do koła.", components: [] });
    if (targetId === kolo.leaderId) return interaction.editReply({ content: "❌ Lider nie może być jednocześnie wiceliderem.", components: [] });

    const guild = interaction.guild;

    // zdejmij starego wicelidera, jeśli był
    const oldVice = await prisma.koloMember.findFirst({ where: { koloId: kolo.id, role: "VICE_LEADER" } });
    if (oldVice) {
      const oldMember = await guild.members.fetch(oldVice.userId).catch(() => null);
      await oldMember?.roles.remove(kolo.roleIdVice).catch(() => null);
      await oldMember?.roles.add(kolo.roleIdMember).catch(() => null);
      await prisma.koloMember.update({ where: { id: oldVice.id }, data: { role: "MEMBER", currentRoleId: kolo.roleIdMember } });
    }

    const newMember = await guild.members.fetch(targetId).catch(() => null);
    await newMember?.roles.remove(kolo.roleIdMember).catch(() => null);
    await newMember?.roles.add(kolo.roleIdVice).catch(() => null);
    await prisma.koloMember.update({ where: { id: targetMembership.id }, data: { role: "VICE_LEADER", currentRoleId: kolo.roleIdVice } });

    return interaction.editReply({ content: `✅ <@${targetId}> jest teraz wiceliderem.`, components: [] });
  }

  async _doRequestLeaderTransfer(interaction, kolo, targetId) {
    const targetMembership = await prisma.koloMember.findUnique({ where: { koloId_userId: { koloId: kolo.id, userId: targetId } } });
    if (!targetMembership) return interaction.editReply({ content: "❌ Nowy lider musi być członkiem koła.", components: [] });

    const ai = await this._aiScore("zmiana_lidera", `Koło: ${kolo.name}\nObecny lider: ${kolo.leaderId}\nProponowany nowy lider: ${targetId}`);
    const request = await prisma.koloChangeRequest.create({
      data: { koloId: kolo.id, requestedBy: interaction.user.id, type: "LEADER", payload: { newLeaderId: targetId }, aiScore: ai.score, aiAnalysis: ai },
    });
    await this._postChangeReviewEmbed(interaction.client, kolo, "Zmiana lidera", `<@${targetId}>`, ai, request.id);
    return interaction.editReply({ content: "✅ Prośba o zmianę lidera wysłana do administracji.", components: [] });
  }

  async _doAssignResearchPickResearch(interaction, kolo, targetId) {
    const researches = await prisma.research.findMany({ where: { koloId: kolo.id, status: { in: ["ACTIVE", "PAUSED"] } } });
    if (researches.length === 0) return interaction.editReply({ content: "❌ Koło nie prowadzi obecnie żadnych badań.", components: [] });

    const select = new StringSelectMenuBuilder()
      .setCustomId(`kolo_research_pick:assign_research:${kolo.id}:${targetId}`)
      .setPlaceholder("Wybierz badanie...")
      .addOptions(researches.slice(0, 25).map((r) => ({ label: r.topic.slice(0, 100), value: r.id })));
    return interaction.editReply({ content: "Wybierz badanie:", components: [new ActionRowBuilder().addComponents(select)] });
  }

  // ==================== MODALE (rename/relogo/newrole/startresearch) ====================

  async handleRenameModalSubmit(interaction, koloId) {
    await interaction.deferReply({ ephemeral: true });
    const newName = interaction.fields.getTextInputValue("nazwa").trim();
    const kolo = await prisma.kolo.findUnique({ where: { id: koloId } });
    const taken = await prisma.kolo.findUnique({ where: { name: newName } });
    if (taken) return interaction.editReply({ content: "❌ Koło o tej nazwie już istnieje." });

    const ai = await this._aiScore("zmiana_nazwy", `Koło: ${kolo.name}\nNowa nazwa: ${newName}`);
    const request = await prisma.koloChangeRequest.create({
      data: { koloId, requestedBy: interaction.user.id, type: "NAME", payload: { newName }, aiScore: ai.score, aiAnalysis: ai },
    });
    await this._postChangeReviewEmbed(interaction.client, kolo, "Zmiana nazwy", newName, ai, request.id);
    return interaction.editReply({ content: "✅ Prośba wysłana do administracji." });
  }

  async handleRelogoModalSubmit(interaction, koloId) {
    await interaction.deferReply({ ephemeral: true });
    const newLogoUrl = interaction.fields.getTextInputValue("logo").trim();
    const kolo = await prisma.kolo.findUnique({ where: { id: koloId } });

    const ai = await this._aiScore("zmiana_logo", `Koło: ${kolo.name}\nNowy link logo: ${newLogoUrl}`);
    const request = await prisma.koloChangeRequest.create({
      data: { koloId, requestedBy: interaction.user.id, type: "LOGO", payload: { newLogoUrl }, aiScore: ai.score, aiAnalysis: ai },
    });
    await this._postChangeReviewEmbed(interaction.client, kolo, "Zmiana logo", newLogoUrl, ai, request.id);
    return interaction.editReply({ content: "✅ Prośba wysłana do administracji." });
  }

  async handleNewRoleModalSubmit(interaction, koloId) {
    await interaction.deferReply({ ephemeral: true });
    const roleName = interaction.fields.getTextInputValue("nazwa").trim();
    const kolo = await prisma.kolo.findUnique({ where: { id: koloId } });

    const existing = await prisma.koloCustomRole.findUnique({ where: { koloId_name: { koloId, name: roleName } } });
    if (existing) return interaction.editReply({ content: "❌ Taka rola już istnieje w tym kole." });

    const ai = await this._aiScore("nowa_rola", `Koło: ${kolo.name}\nProponowana nazwa roli: ${roleName}`);
    const request = await prisma.koloChangeRequest.create({
      data: { koloId, requestedBy: interaction.user.id, type: "NEW_ROLE", payload: { roleName }, aiScore: ai.score, aiAnalysis: ai },
    });
    await this._postChangeReviewEmbed(interaction.client, kolo, "Nowa rola", `• ${roleName} •`, ai, request.id);
    return interaction.editReply({ content: "✅ Prośba wysłana do administracji." });
  }

  async _postChangeReviewEmbed(client, kolo, label, value, ai, requestId) {
    const channel = await this._getReviewChannel(client);
    if (!channel) return;
    const embed = new EmbedBuilder()
      .setTitle(`📝 Prośba: ${label}`)
      .addFields(
        { name: "Koło", value: kolo.name, inline: true },
        { name: "Nowa wartość", value: String(value) },
        { name: "AI Score", value: `${Math.round((ai.score ?? 0.5) * 100)}%` }
      )
      .setColor(0xd69e2e);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`kolo_change_approve:${requestId}`).setLabel("✅ Zaakceptuj").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`kolo_change_reject:${requestId}`).setLabel("❌ Odrzuć").setStyle(ButtonStyle.Danger)
    );
    await channel.send({ embeds: [embed], components: [row] });
  }

  async handleChangeReview(interaction, requestId, approve) {
    await interaction.deferUpdate();
    try {
      if (!(await hasPermission(interaction.member, "MODERATE"))) {
        return interaction.followUp({ content: "❌ Nie masz uprawnień.", ephemeral: true });
      }

      const request = await prisma.koloChangeRequest.findUnique({ where: { id: requestId }, include: { kolo: true } });
      if (!request || request.status !== "PENDING_REVIEW") {
        return interaction.followUp({ content: "❌ Ta prośba została już rozpatrzona.", ephemeral: true });
      }

      if (!approve) {
        await prisma.koloChangeRequest.update({ where: { id: requestId }, data: { status: "REJECTED" } });
        return interaction.editReply({ components: [] });
      }

      const kolo = request.kolo;
      const guild = getKolaGuild(interaction.client);
      if (!guild) {
        return interaction.followUp({ content: "❌ Błąd konfiguracji serwera Kół Naukowych.", ephemeral: true });
      }

      if (request.type === "NAME") {
        const newName = request.payload.newName;
        await prisma.kolo.update({ where: { id: kolo.id }, data: { name: newName } });
        const { emoji } = await detectDominantColor(kolo.logoUrl);
        for (const [roleId, prefix, suffix] of [
          [kolo.roleIdDivider, "•══════• ", " •══════•"],
        ]) {
          if (!roleId) continue;
          const role = await guild.roles.fetch(roleId).catch(() => null);
          await role?.setName(`${prefix}${newName}${suffix}`).catch(() => null);
        }
        const category = kolo.categoryId ? await guild.channels.fetch(kolo.categoryId).catch(() => null) : null;
        await category?.setName(`${emoji} • ${newName}`).catch(() => null);
      } else if (request.type === "LOGO") {
        const newLogoUrl = request.payload.newLogoUrl;
        const { emoji, hex } = await detectDominantColor(newLogoUrl);
        await prisma.kolo.update({ where: { id: kolo.id }, data: { logoUrl: newLogoUrl, colorHex: hex } });
        const category = kolo.categoryId ? await guild.channels.fetch(kolo.categoryId).catch(() => null) : null;
        await category?.setName(`${emoji} • ${kolo.name}`).catch(() => null);
        for (const roleId of [kolo.roleIdDivider, kolo.roleIdLeader, kolo.roleIdVice, kolo.roleIdMember]) {
          if (!roleId) continue;
          const role = await guild.roles.fetch(roleId).catch(() => null);
          await role?.setColor(hex).catch(() => null);
        }
      } else if (request.type === "LEADER") {
        const newLeaderId = request.payload.newLeaderId;
        const newLeaderMembership = await prisma.koloMember.findUnique({ where: { koloId_userId: { koloId: kolo.id, userId: newLeaderId } } });
        if (!newLeaderMembership) return interaction.followUp({ content: "❌ Nowy lider musi być członkiem koła.", ephemeral: true });

        await prisma.$transaction([
          prisma.koloMember.update({ where: { id: newLeaderMembership.id }, data: { role: "LEADER", currentRoleId: kolo.roleIdLeader } }),
          prisma.koloMember.updateMany({ where: { koloId: kolo.id, userId: kolo.leaderId }, data: { role: "MEMBER", currentRoleId: kolo.roleIdMember } }),
          prisma.kolo.update({ where: { id: kolo.id }, data: { leaderId: newLeaderId } }),
        ]);

        const oldMember = await guild.members.fetch(kolo.leaderId).catch(() => null);
        await oldMember?.roles.remove(kolo.roleIdLeader).catch(() => null);
        await oldMember?.roles.add(kolo.roleIdMember).catch(() => null);
        const newMember = await guild.members.fetch(newLeaderId).catch(() => null);
        await newMember?.roles.remove(kolo.roleIdMember).catch(() => null);
        await newMember?.roles.add(kolo.roleIdLeader).catch(() => null);
      } else if (request.type === "NEW_ROLE") {
        const roleName = request.payload.roleName;
        const role = await guild.roles.create({ name: `• ${roleName} •`, color: kolo.colorHex, mentionable: true });
        await prisma.koloCustomRole.create({ data: { koloId: kolo.id, name: roleName, roleId: role.id } });
      }

      await prisma.koloChangeRequest.update({ where: { id: requestId }, data: { status: "APPROVED" } });
      await logAction("kolo_change_approved", interaction.user.id, kolo.id, { type: request.type, payload: request.payload });
      return interaction.editReply({ components: [] });
    } catch (err) {
      await logError("koloService", "CHANGE_REVIEW_ERROR", err.message, { requestId, stack: err.stack });
      return interaction.followUp({ content: "❌ Błąd podczas przetwarzania.", ephemeral: true }).catch(() => null);
    }
  }

  // ==================== ROZWIĄZANIE KOŁA ====================

  async _requestDissolve(interaction, kolo) {
    await interaction.deferReply({ ephemeral: true });
    const request = await prisma.koloChangeRequest.create({
      data: { koloId: kolo.id, requestedBy: interaction.user.id, type: "DISSOLVE", payload: {} },
    });
    await this._postChangeReviewEmbed(interaction.client, kolo, "Rozwiązanie koła", "(nieodwracalne)", { score: null }, request.id);
    return interaction.editReply({ content: "✅ Prośba o rozwiązanie koła wysłana do administracji." });
  }

  /** Usuwa kategorię/kanały/role koła i oznacza je jako rozwiązane - używane
   * zarówno przy ręcznym zatwierdzeniu przez admina, jak i auto-rozwiązaniu
   * po 72h poniżej minimum (koloScheduler.js). */
  async _teardownKolo(guild, kolo) {
    const customRoles = await prisma.koloCustomRole.findMany({ where: { koloId: kolo.id } });
    for (const roleId of [kolo.roleIdDivider, kolo.roleIdLeader, kolo.roleIdVice, kolo.roleIdMember, ...customRoles.map((r) => r.roleId)]) {
      if (!roleId) continue;
      const role = await guild.roles.fetch(roleId).catch(() => null);
      await role?.delete("Koło Naukowe rozwiązane").catch(() => null);
    }

    for (const channelId of [kolo.channelAnnouncements, kolo.channelChat, kolo.channelResearch, kolo.channelManage, kolo.channelDocuments, kolo.channelVoice]) {
      if (!channelId) continue;
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      await channel?.delete("Koło Naukowe rozwiązane").catch(() => null);
    }
    if (kolo.categoryId) {
      const category = await guild.channels.fetch(kolo.categoryId).catch(() => null);
      await category?.delete("Koło Naukowe rozwiązane").catch(() => null);
    }

    await prisma.kolo.update({ where: { id: kolo.id }, data: { status: "DISSOLVED" } });
  }

  // handleChangeReview obsługuje NAME/LOGO/LEADER/NEW_ROLE; DISSOLVE ma inny efekt (usuwanie),
  // więc łapiemy go osobno zanim trafi do generycznej ścieżki powyżej.
  async handleChangeReviewDispatch(interaction, requestId, approve) {
    const request = await prisma.koloChangeRequest.findUnique({ where: { id: requestId }, include: { kolo: true } });
    if (request?.type === "DISSOLVE") {
      await interaction.deferUpdate();
      if (!(await hasPermission(interaction.member, "MODERATE"))) {
        return interaction.followUp({ content: "❌ Nie masz uprawnień.", ephemeral: true });
      }
      if (request.status !== "PENDING_REVIEW") {
        return interaction.followUp({ content: "❌ Ta prośba została już rozpatrzona.", ephemeral: true });
      }
      await prisma.koloChangeRequest.update({ where: { id: requestId }, data: { status: approve ? "APPROVED" : "REJECTED" } });
      if (approve) {
        const members = await prisma.koloMember.findMany({ where: { koloId: request.koloId } });
        const kolaGuild = getKolaGuild(interaction.client);
        if (kolaGuild) await this._teardownKolo(kolaGuild, request.kolo);
        for (const m of members) {
          const user = await interaction.client.users.fetch(m.userId).catch(() => null);
          await user?.send(`💥 Koło **${request.kolo.name}** zostało rozwiązane przez administrację.`).catch(() => null);
        }
      }
      return interaction.editReply({ components: [] });
    }
    return this.handleChangeReview(interaction, requestId, approve);
  }

  // ==================== BADANIA ====================

  _capacityRequirementFor(nextActiveCount) {
    return RESEARCH_CAPACITY[nextActiveCount] ?? null;
  }

  async handleStartResearchModalSubmit(interaction, koloId) {
    await interaction.deferReply({ ephemeral: true });
    const kolo = await prisma.kolo.findUnique({ where: { id: koloId } });
    const topicInput = interaction.fields.getTextInputValue("temat").trim();

    const activeCount = await prisma.research.count({ where: { koloId, status: { in: ["ACTIVE", "PAUSED"] } } });
    const nextCount = activeCount + 1;
    if (nextCount > MAX_CONCURRENT_RESEARCH) {
      return interaction.editReply({ content: `❌ Koło może prowadzić maksymalnie ${MAX_CONCURRENT_RESEARCH} badania naraz.` });
    }
    const required = this._capacityRequirementFor(nextCount);
    const memberCount = await prisma.koloMember.count({ where: { koloId } });
    if (memberCount < required) {
      return interaction.editReply({ content: `❌ Do prowadzenia ${nextCount}. jednoczesnego badania koło potrzebuje min. ${required} osób (ma ${memberCount}).` });
    }

    const officialTopic = await prisma.researchTopic.findFirst({ where: { title: topicInput, active: true } });

    if (officialTopic) {
      const research = await prisma.research.create({
        data: { koloId, topic: officialTopic.title, isCustomTopic: false, status: "ACTIVE", startedAt: new Date() },
      });
      await this._postResearchUpdate(interaction.client, kolo, research);
      await logAction("kolo_research_started", interaction.user.id, koloId, { researchId: research.id, topic: officialTopic.title });
      return interaction.editReply({ content: `✅ Rozpoczęto badanie: **${officialTopic.title}**.` });
    }

    const ai = await this._aiScore("wlasny_temat_badania", `Koło: ${kolo.name}\nProponowany temat: ${topicInput}`);
    const research = await prisma.research.create({
      data: { koloId, topic: topicInput, isCustomTopic: true, status: "PENDING_REVIEW", aiScore: ai.score, aiAnalysis: ai },
    });

    const channel = await this._getReviewChannel(interaction.client);
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle("🔬 Propozycja własnego tematu badania")
        .addFields(
          { name: "Koło", value: kolo.name, inline: true },
          { name: "Temat", value: topicInput },
          { name: "AI Score", value: `${Math.round(ai.score * 100)}%` }
        )
        .setColor(0xd69e2e);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`kolo_research_approve:${research.id}`).setLabel("✅ Zaakceptuj").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`kolo_research_reject:${research.id}`).setLabel("❌ Odrzuć").setStyle(ButtonStyle.Danger)
      );
      await channel.send({ embeds: [embed], components: [row] });
    }

    return interaction.editReply({ content: "✅ Własny temat wysłany do oceny AI i administracji. Poczekaj na decyzję." });
  }

  async handleResearchReview(interaction, researchId, approve) {
    await interaction.deferUpdate();
    try {
      if (!(await hasPermission(interaction.member, "MODERATE"))) {
        return interaction.followUp({ content: "❌ Nie masz uprawnień.", ephemeral: true });
      }
      const research = await prisma.research.findUnique({ where: { id: researchId }, include: { kolo: true } });
      if (!research || research.status !== "PENDING_REVIEW") {
        return interaction.followUp({ content: "❌ To zgłoszenie zostało już rozpatrzone.", ephemeral: true });
      }

      const updated = await prisma.research.update({
        where: { id: researchId },
        data: approve ? { status: "ACTIVE", startedAt: new Date() } : { status: "REJECTED" },
      });

      if (approve) await this._postResearchUpdate(interaction.client, research.kolo, updated);

      const leader = await interaction.client.users.fetch(research.kolo.leaderId).catch(() => null);
      await leader
        ?.send(
          approve
            ? `✅ Badanie **${research.topic}** (koło ${research.kolo.name}) zostało zaakceptowane i rozpoczęte.`
            : `❌ Propozycja badania **${research.topic}** (koło ${research.kolo.name}) została odrzucona.`
        )
        .catch(() => null);

      return interaction.editReply({ components: [] });
    } catch (err) {
      await logError("koloService", "RESEARCH_REVIEW_ERROR", err.message, { researchId, stack: err.stack });
      return interaction.followUp({ content: "❌ Błąd podczas przetwarzania.", ephemeral: true }).catch(() => null);
    }
  }

  /** Wysyła/aktualizuje status badania na kanale 🔬badania - tylko bot tam pisze. */
  async _postResearchUpdate(client, kolo, research) {
    if (!kolo.channelResearch) return;
    const channel = await client.channels.fetch(kolo.channelResearch).catch(() => null);
    if (!channel) return;

    const members = await prisma.researchMember.findMany({ where: { researchId: research.id } });
    const topicInfo = !research.isCustomTopic ? await prisma.researchTopic.findFirst({ where: { title: research.topic } }) : null;

    const embed = new EmbedBuilder()
      .setTitle(`🔬 ${research.topic}`)
      .addFields(
        { name: "Status", value: this._researchStatusLabel(research.status), inline: true },
        { name: "Przydzieleni", value: members.length ? members.map((m) => `<@${m.userId}>`).join(", ") : "Brak", inline: true }
      )
      .setColor(kolo.colorHex || 0x2b6cb0)
      .setFooter({ text: research.isCustomTopic ? "Własny temat" : "Temat z listy oficjalnej" });
    if (topicInfo?.description) embed.setDescription(topicInfo.description);

    await channel.send({ embeds: [embed] }).catch(() => null);
  }

  _researchStatusLabel(status) {
    return { ACTIVE: "🟢 Aktywne", PAUSED: "⏸️ Zatrzymane", COMPLETED: "✅ Zakończone", REJECTED: "❌ Odrzucone", PENDING_REVIEW: "⏳ Do oceny" }[status] || status;
  }

  async handleResearchPickSelect(interaction, action, koloId, extra) {
    await interaction.deferUpdate();
    const researchId = interaction.values[0];
    const research = await prisma.research.findUnique({ where: { id: researchId }, include: { kolo: true } });
    if (!research) return interaction.editReply({ content: "❌ Nie znaleziono badania.", components: [] });

    if (action === "pause_research") {
      if (research.status !== "ACTIVE") return interaction.editReply({ content: "❌ To badanie nie jest aktywne.", components: [] });
      await prisma.research.update({ where: { id: researchId }, data: { status: "PAUSED", pausedAt: new Date() } });
      await this._postResearchUpdate(interaction.client, research.kolo, { ...research, status: "PAUSED" });
      return interaction.editReply({ content: `⏸️ Badanie **${research.topic}** zatrzymane.`, components: [] });
    }

    if (action === "resume_research") {
      if (research.status !== "PAUSED") return interaction.editReply({ content: "❌ To badanie nie jest zatrzymane.", components: [] });
      await prisma.research.update({ where: { id: researchId }, data: { status: "ACTIVE", pausedAt: null } });
      await this._postResearchUpdate(interaction.client, research.kolo, { ...research, status: "ACTIVE" });
      return interaction.editReply({ content: `▶️ Badanie **${research.topic}** wznowione.`, components: [] });
    }

    if (action === "assign_research") {
      const targetId = extra;
      const targetMembership = await prisma.koloMember.findUnique({ where: { koloId_userId: { koloId, userId: targetId } } });
      if (!targetMembership) return interaction.editReply({ content: "❌ Ta osoba nie należy do koła.", components: [] });

      const existing = await prisma.researchMember.findUnique({ where: { researchId_userId: { researchId, userId: targetId } } });
      if (existing) return interaction.editReply({ content: "❌ Ta osoba jest już przydzielona do tego badania.", components: [] });

      await prisma.researchMember.create({ data: { researchId, userId: targetId } });
      await this._postResearchUpdate(interaction.client, research.kolo, research);
      return interaction.editReply({ content: `✅ Przydzielono <@${targetId}> do badania **${research.topic}**.`, components: [] });
    }
  }

  // ==================== POMOCNICZE ====================

  async _checkMinimumMembers(client, koloId) {
    const kolo = await prisma.kolo.findUnique({ where: { id: koloId }, include: { members: true } });
    if (!kolo || kolo.status !== "ACTIVE") return;

    const minRequired = MIN_INVITED + 1; // lider + min. 3
    if (kolo.members.length < minRequired) {
      if (!kolo.belowMinSince) {
        await prisma.kolo.update({ where: { id: koloId }, data: { belowMinSince: new Date() } });
        const leader = await client.users.fetch(kolo.leaderId).catch(() => null);
        await leader
          ?.send(
            `⚠️ Koło **${kolo.name}** spadło poniżej wymaganego minimum (${minRequired} osób). ` +
              "Masz 72h, aby uzupełnić braki (zaproś kogoś przez kanał ⚒️zarządzaj-kołem), inaczej koło zostanie automatycznie rozwiązane."
          )
          .catch(() => null);
      }
    } else if (kolo.belowMinSince) {
      await prisma.kolo.update({ where: { id: koloId }, data: { belowMinSince: null } });
    }
  }

}

module.exports = new KoloService();
