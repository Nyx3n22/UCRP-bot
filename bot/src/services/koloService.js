/**
 * services/koloService.js
 * Koła Naukowe — bez komend do zakładania. Flow:
 *   1) Bot wysyła panel (przycisk) na kanał KOLA_NAUKOWE.
 *   2) Kandydat klika -> modal (nazwa, opis, logo) -> wybór min. 3 osób
 *      (User Select Menu) -> zaproszenia DM z Akceptuj/Odrzuć.
 *   3) Gdy WSZYSCY zaproszeni zaakceptują -> AI ocena + wysyłka do
 *      kanału KOLA_REVIEW (fallback LOG_MOD) z przyciskami admina.
 *   4) Po akceptacji: tworzone są 3 role (Koło / Lider / Wicelider),
 *      koło dostaje status ACTIVE, komenda /kolo staje się użyteczna
 *      dla jego członków.
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
} = require("discord.js");
const prisma = require("../lib/prisma");
const { hasPermission } = require("../config/roles");
const { getBoundChannelId } = require("../config/channels");
const { generateAiReply } = require("./aiGatewayService");
const { logError, logAction } = require("./../utils/logger");

const MIN_INVITED = 3; // + lider = min. 4 osoby
const MAX_MEMBERS = 15;
const GRACE_PERIOD_MS = 72 * 60 * 60 * 1000; // 72h
const RESEARCH_CAPACITY = { 1: 3, 2: 6, 3: 10 }; // ile osób w kole potrzeba na N jednoczesnych badań
const MAX_CONCURRENT_RESEARCH = 3;

// pending[userId] = { name, description, logoUrl } — dane z modala,
// zanim użytkownik wybierze osoby do zaproszenia (User Select Menu to
// osobna interakcja, nie da się tego zrobić w jednym kroku modala).
const pendingApplications = new Map();

function koloRoleName(kolo) {
  return kolo.name;
}
function liderRoleName(kolo) {
  return `Lider ${kolo.name}`;
}
function viceRoleName(kolo) {
  return `Wicelider ${kolo.name}`;
}

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
      .setColor(0x2b6cb0);
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

      await channel.send({ embeds: [this.buildPanelEmbed()], components: [this.buildPanelRow()] });
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

  async _getReviewChannel(guild) {
    const channelId = (await getBoundChannelId("KOLA_REVIEW")) || (await getBoundChannelId("LOG_MOD"));
    if (!channelId) return null;
    return guild.channels.fetch(channelId).catch(() => null);
  }

  async _advanceToReview(client, koloId) {
    const kolo = await prisma.kolo.update({ where: { id: koloId }, data: { status: "PENDING_REVIEW" }, include: { members: true } });

    const ai = await this._aiScore(
      "rejestracja_kola",
      `Nazwa: ${kolo.name}\nOpis: ${kolo.description}\nLiczba członków założycieli: ${kolo.members.length}`
    );
    await prisma.kolo.update({ where: { id: kolo.id }, data: {} }); // no dedicated ai fields on Kolo itself by design; embed carries score

    const guild = client.guilds.cache.first();
    const channel = await this._getReviewChannel(guild);
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

      const guild = interaction.guild;
      const roleMember = await guild.roles.create({ name: koloRoleName(kolo), mentionable: true });
      const roleLider = await guild.roles.create({ name: liderRoleName(kolo), mentionable: true });
      const roleVice = await guild.roles.create({ name: viceRoleName(kolo), mentionable: true });

      await prisma.kolo.update({
        where: { id: koloId },
        data: { status: "ACTIVE", roleIdMember: roleMember.id, roleIdLeader: roleLider.id, roleIdVice: roleVice.id },
      });

      for (const m of kolo.members) {
        const member = await guild.members.fetch(m.userId).catch(() => null);
        if (!member) continue;
        await member.roles.add(roleMember.id).catch(() => null);
        if (m.userId === kolo.leaderId) await member.roles.add(roleLider.id).catch(() => null);
      }

      const leader = await interaction.client.users.fetch(kolo.leaderId).catch(() => null);
      await leader
        ?.send(`🎉 Koło **${kolo.name}** zostało zaakceptowane! Użyj \`/kolo\` na serwerze, aby nim zarządzać.`)
        .catch(() => null);

      await logAction("kolo_approved", interaction.user.id, koloId, { name: kolo.name });
      return interaction.editReply({ components: [] });
    } catch (err) {
      await logError("koloService", "APPLICATION_REVIEW_ERROR", err.message, { koloId, stack: err.stack });
      return interaction.followUp({ content: "❌ Błąd podczas przetwarzania decyzji.", ephemeral: true }).catch(() => null);
    }
  }

  // ==================== ZARZĄDZANIE (/kolo) ====================

  /** Zwraca KoloMember rekord requestera z dołączonym Kolo, albo null. Sprawdza czy jest liderem/wiceliderem. */
  async _getManagedKolo(userId) {
    const membership = await prisma.koloMember.findFirst({
      where: { userId, role: { in: ["LEADER", "VICE_LEADER"] } },
      include: { kolo: true },
    });
    if (!membership || membership.kolo.status !== "ACTIVE") return null;
    return membership;
  }

  /** Jak _getManagedKolo, ale dopuszcza też PENDING_MEMBERS - potrzebne, żeby
   * lider mógł zaprosić zastępstwo za osobę, która odrzuciła/przegapiła
   * zaproszenie, zanim koło w ogóle zostanie zatwierdzone. */
  async _getManagedKoloAnyPending(userId) {
    const membership = await prisma.koloMember.findFirst({
      where: { userId, role: { in: ["LEADER", "VICE_LEADER"] } },
      include: { kolo: true },
    });
    if (!membership || !["ACTIVE", "PENDING_MEMBERS"].includes(membership.kolo.status)) return null;
    return membership;
  }

  async cmdInvite(interaction) {
    const membership = await this._getManagedKoloAnyPending(interaction.user.id);
    if (!membership) return interaction.reply({ content: "❌ Musisz być liderem lub wiceliderem koła (aktywnego lub czekającego na komplet osób).", ephemeral: true });

    const target = interaction.options.getUser("osoba");
    const kolo = membership.kolo;

    const memberCount = await prisma.koloMember.count({ where: { koloId: kolo.id } });
    if (memberCount >= MAX_MEMBERS) return interaction.reply({ content: `❌ Koło ma już maksymalną liczbę członków (${MAX_MEMBERS}).`, ephemeral: true });

    const already = await prisma.koloMember.findFirst({ where: { userId: target.id } });
    if (already) return interaction.reply({ content: "❌ Ta osoba należy już do jakiegoś koła.", ephemeral: true });

    const pendingInvite = await prisma.koloInvite.findFirst({ where: { koloId: kolo.id, userId: target.id, status: "PENDING" } });
    if (pendingInvite) return interaction.reply({ content: "❌ Ta osoba ma już wysłane zaproszenie do tego koła.", ephemeral: true });

    const invite = await prisma.koloInvite.create({
      data: { koloId: kolo.id, userId: target.id, expiresAt: new Date(Date.now() + GRACE_PERIOD_MS) },
    });
    await this._sendInviteDm(interaction.client, invite, kolo, interaction.user);

    return interaction.reply({ content: `✅ Wysłano zaproszenie do <@${target.id}>.`, ephemeral: true });
  }

  async cmdKick(interaction) {
    const membership = await this._getManagedKolo(interaction.user.id);
    if (!membership) return interaction.reply({ content: "❌ Musisz być liderem lub wiceliderem aktywnego koła.", ephemeral: true });

    const target = interaction.options.getUser("osoba");
    const kolo = membership.kolo;

    if (target.id === kolo.leaderId) return interaction.reply({ content: "❌ Nie możesz wyrzucić lidera. Użyj prośby o zmianę lidera.", ephemeral: true });

    const targetMembership = await prisma.koloMember.findUnique({ where: { koloId_userId: { koloId: kolo.id, userId: target.id } } });
    if (!targetMembership) return interaction.reply({ content: "❌ Ta osoba nie należy do koła.", ephemeral: true });

    await prisma.koloMember.delete({ where: { id: targetMembership.id } });

    const guild = interaction.guild;
    const member = await guild.members.fetch(target.id).catch(() => null);
    for (const roleId of [kolo.roleIdMember, kolo.roleIdVice]) {
      if (roleId) await member?.roles.remove(roleId).catch(() => null);
    }

    await this._checkMinimumMembers(interaction.client, kolo.id);
    await logAction("kolo_member_kicked", interaction.user.id, kolo.id, { targetId: target.id });

    return interaction.reply({ content: `✅ Wyrzucono <@${target.id}> z koła.`, ephemeral: true });
  }

  /** Wołane po każdym opuszczeniu/wyrzuceniu - sprawdza czy koło spadło poniżej minimum i uruchamia/zeruje licznik 72h. */
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
              `Masz 72h, aby uzupełnić braki (\`/kolo zaproś\`), inaczej koło zostanie automatycznie rozwiązane.`
          )
          .catch(() => null);
      }
    } else if (kolo.belowMinSince) {
      await prisma.kolo.update({ where: { id: koloId }, data: { belowMinSince: null } });
    }
  }

  async cmdChangeRequest(interaction) {
    const membership = await this._getManagedKolo(interaction.user.id);
    if (!membership || membership.role !== "LEADER") {
      return interaction.reply({ content: "❌ Tylko lider koła może prosić o taką zmianę.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const typ = interaction.options.getString("typ");
    const wartosc = interaction.options.getString("wartosc");
    const kolo = membership.kolo;

    let payload;
    if (typ === "LEADER") {
      const match = wartosc.match(/\d{15,25}/);
      if (!match) return interaction.editReply({ content: "❌ Podaj wzmiankę (@osoba) lub ID nowego lidera." });
      payload = { newLeaderId: match[0] };
    } else if (typ === "NAME") {
      const taken = await prisma.kolo.findUnique({ where: { name: wartosc } });
      if (taken) return interaction.editReply({ content: "❌ Koło o tej nazwie już istnieje." });
      payload = { newName: wartosc };
    } else {
      payload = { newLogoUrl: wartosc };
    }

    const ai = await this._aiScore(`zmiana_${typ.toLowerCase()}`, `Koło: ${kolo.name}\nTyp zmiany: ${typ}\nNowa wartość: ${wartosc}`);

    const request = await prisma.koloChangeRequest.create({
      data: { koloId: kolo.id, requestedBy: interaction.user.id, type: typ, payload, aiScore: ai.score, aiAnalysis: ai },
    });

    const channel = await this._getReviewChannel(interaction.guild);
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle("📝 Prośba o zmianę w kole naukowym")
        .addFields(
          { name: "Koło", value: kolo.name, inline: true },
          { name: "Typ zmiany", value: typ, inline: true },
          { name: "Nowa wartość", value: wartosc },
          { name: "AI Score", value: `${Math.round(ai.score * 100)}%` }
        )
        .setColor(0xd69e2e);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`kolo_change_approve:${request.id}`).setLabel("✅ Zaakceptuj").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`kolo_change_reject:${request.id}`).setLabel("❌ Odrzuć").setStyle(ButtonStyle.Danger)
      );
      await channel.send({ embeds: [embed], components: [row] });
    }

    return interaction.editReply({ content: "✅ Prośba wysłana do administracji." });
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
      const guild = interaction.guild;

      if (request.type === "NAME") {
        const newName = request.payload.newName;
        await prisma.kolo.update({ where: { id: kolo.id }, data: { name: newName } });
        for (const [roleId, prefix] of [[kolo.roleIdMember, ""], [kolo.roleIdLeader, "Lider "], [kolo.roleIdVice, "Wicelider "]]) {
          if (!roleId) continue;
          const role = await guild.roles.fetch(roleId).catch(() => null);
          await role?.setName(`${prefix}${newName}`).catch(() => null);
        }
      } else if (request.type === "LOGO") {
        await prisma.kolo.update({ where: { id: kolo.id }, data: { logoUrl: request.payload.newLogoUrl } });
      } else if (request.type === "LEADER") {
        const newLeaderId = request.payload.newLeaderId;
        const newLeaderMembership = await prisma.koloMember.findUnique({ where: { koloId_userId: { koloId: kolo.id, userId: newLeaderId } } });
        if (!newLeaderMembership) {
          return interaction.followUp({ content: "❌ Nowy lider musi być członkiem koła.", ephemeral: true });
        }
        await prisma.$transaction([
          prisma.koloMember.update({ where: { id: newLeaderMembership.id }, data: { role: "LEADER" } }),
          prisma.koloMember.updateMany({ where: { koloId: kolo.id, userId: kolo.leaderId }, data: { role: "MEMBER" } }),
          prisma.kolo.update({ where: { id: kolo.id }, data: { leaderId: newLeaderId } }),
        ]);

        if (kolo.roleIdLeader) {
          const oldMember = await guild.members.fetch(kolo.leaderId).catch(() => null);
          await oldMember?.roles.remove(kolo.roleIdLeader).catch(() => null);
          const newMember = await guild.members.fetch(newLeaderId).catch(() => null);
          await newMember?.roles.add(kolo.roleIdLeader).catch(() => null);
        }
      }

      await prisma.koloChangeRequest.update({ where: { id: requestId }, data: { status: "APPROVED" } });
      await logAction("kolo_change_approved", interaction.user.id, kolo.id, { type: request.type, payload: request.payload });

      return interaction.editReply({ components: [] });
    } catch (err) {
      await logError("koloService", "CHANGE_REVIEW_ERROR", err.message, { requestId, stack: err.stack });
      return interaction.followUp({ content: "❌ Błąd podczas przetwarzania.", ephemeral: true }).catch(() => null);
    }
  }

  // ==================== BADANIA ====================

  _capacityRequirementFor(nextActiveCount) {
    return RESEARCH_CAPACITY[nextActiveCount] ?? null;
  }

  async cmdStartResearch(interaction) {
    const membership = await this._getManagedKolo(interaction.user.id);
    if (!membership) return interaction.reply({ content: "❌ Musisz być liderem lub wiceliderem aktywnego koła.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const kolo = membership.kolo;
    const topicInput = interaction.options.getString("temat").trim();

    const activeCount = await prisma.research.count({ where: { koloId: kolo.id, status: { in: ["ACTIVE", "PAUSED"] } } });
    const nextCount = activeCount + 1;
    if (nextCount > MAX_CONCURRENT_RESEARCH) {
      return interaction.editReply({ content: `❌ Koło może prowadzić maksymalnie ${MAX_CONCURRENT_RESEARCH} badania naraz.` });
    }
    const required = this._capacityRequirementFor(nextCount);
    const memberCount = await prisma.koloMember.count({ where: { koloId: kolo.id } });
    if (memberCount < required) {
      return interaction.editReply({ content: `❌ Do prowadzenia ${nextCount}. jednoczesnego badania koło potrzebuje min. ${required} osób (ma ${memberCount}).` });
    }

    const officialTopic = await prisma.researchTopic.findFirst({ where: { title: topicInput, active: true } });

    if (officialTopic) {
      const research = await prisma.research.create({
        data: { koloId: kolo.id, topic: officialTopic.title, isCustomTopic: false, status: "ACTIVE", startedAt: new Date() },
      });
      await logAction("kolo_research_started", interaction.user.id, kolo.id, { researchId: research.id, topic: officialTopic.title });
      return interaction.editReply({ content: `✅ Rozpoczęto badanie: **${officialTopic.title}**.` });
    }

    // Własny temat - wymaga AI + admina
    const ai = await this._aiScore("wlasny_temat_badania", `Koło: ${kolo.name}\nProponowany temat: ${topicInput}`);
    const research = await prisma.research.create({
      data: { koloId: kolo.id, topic: topicInput, isCustomTopic: true, status: "PENDING_REVIEW", aiScore: ai.score, aiAnalysis: ai },
    });

    const channel = await this._getReviewChannel(interaction.guild);
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

      await prisma.research.update({
        where: { id: researchId },
        data: approve ? { status: "ACTIVE", startedAt: new Date() } : { status: "REJECTED" },
      });

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

  async cmdManageResearch(interaction) {
    const membership = await this._getManagedKolo(interaction.user.id);
    if (!membership) return interaction.reply({ content: "❌ Musisz być liderem lub wiceliderem aktywnego koła.", ephemeral: true });

    const action = interaction.options.getSubcommand();
    const kolo = membership.kolo;

    if (action === "lista") {
      const researches = await prisma.research.findMany({ where: { koloId: kolo.id }, include: { members: true } });
      if (researches.length === 0) return interaction.reply({ content: "Koło nie prowadzi jeszcze żadnych badań.", ephemeral: true });
      const embed = new EmbedBuilder()
        .setTitle(`🔬 Badania koła ${kolo.name}`)
        .setDescription(
          researches
            .map((r) => `**${r.topic}** — ${r.status} (${r.members.length} os.${r.members.length ? ": " + r.members.map((m) => `<@${m.userId}>`).join(", ") : ""})`)
            .join("\n")
        )
        .setColor(0x2b6cb0);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const research = await prisma.research.findFirst({
      where: { koloId: kolo.id, topic: interaction.options.getString("badanie") },
    });
    if (!research) return interaction.reply({ content: "❌ Nie znaleziono takiego badania w tym kole.", ephemeral: true });

    if (action === "zatrzymaj") {
      if (research.status !== "ACTIVE") return interaction.reply({ content: "❌ To badanie nie jest aktywne.", ephemeral: true });
      await prisma.research.update({ where: { id: research.id }, data: { status: "PAUSED", pausedAt: new Date() } });
      return interaction.reply({ content: `⏸️ Badanie **${research.topic}** zatrzymane.`, ephemeral: true });
    }

    if (action === "wznow") {
      if (research.status !== "PAUSED") return interaction.reply({ content: "❌ To badanie nie jest zatrzymane.", ephemeral: true });
      await prisma.research.update({ where: { id: research.id }, data: { status: "ACTIVE", pausedAt: null } });
      return interaction.reply({ content: `▶️ Badanie **${research.topic}** wznowione.`, ephemeral: true });
    }

    if (action === "przydziel") {
      const target = interaction.options.getUser("osoba");
      const targetMembership = await prisma.koloMember.findUnique({ where: { koloId_userId: { koloId: kolo.id, userId: target.id } } });
      if (!targetMembership) return interaction.reply({ content: "❌ Ta osoba nie należy do koła.", ephemeral: true });

      const existing = await prisma.researchMember.findUnique({ where: { researchId_userId: { researchId: research.id, userId: target.id } } });
      if (existing) return interaction.reply({ content: "❌ Ta osoba jest już przydzielona do tego badania.", ephemeral: true });

      await prisma.researchMember.create({ data: { researchId: research.id, userId: target.id } });
      return interaction.reply({ content: `✅ Przydzielono <@${target.id}> do badania **${research.topic}**.`, ephemeral: true });
    }
  }
}

module.exports = new KoloService();
