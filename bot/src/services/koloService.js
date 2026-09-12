/**
 * services/koloService.js
 * Koła Naukowe — bez komend slash. WAŻNE: infrastruktura koła
 * (kategoria, kanały, role) powstaje na INNYM serwerze Discord (drugim)
 * niż reszta bota (weryfikacja, tickety, aplikacje itd. - te zostają na
 * głównym GUILD_ID). ID drugiego serwera: zmienna środowiskowa
 * KOLA_GUILD_ID (patrz config/kolaGuild.js) - bot musi być tam zaproszony
 * z uprawnieniami Manage Roles + Manage Channels.
 *
 * Flow:
 *   1) Bot wysyła panel (przycisk) na kanał KOLA_NAUKOWE (główny serwer,
 *      tam gdzie jest społeczność). To JEDYNA droga założenia koła.
 *   2) Kandydat klika -> modal (nazwa, opis, logo) -> wybór min. 3 osób
 *      (User Select Menu) -> zaproszenia DM z Akceptuj/Odrzuć.
 *   3) W TRAKCIE oczekiwania na akceptacje lider (i wiceliderzy) mają na DM
 *      żywy panel z przyciskami: Zaproś • Cofnij zaproszenie • Rozwiąż/
 *      Wycofaj • Odśwież — patrz _refreshLeaderPanel. Panel to JEDNA
 *      wiadomość na koło (Kolo.panelMessageId), odświeżana w miejscu po
 *      każdej zmianie i dosyłana na nowo, gdy użytkownik ją usunie.
 *   4) Gdy WSZYSCY zaproszeni zaakceptują -> AI ocena + wysyłka do
 *      kanału KOLA_REVIEW (fallback LOG_MOD, główny serwer) z przyciskami
 *      admina.
 *   5) Po akceptacji: na DRUGIM serwerze tworzona jest kategoria + 6
 *      kanałów + 4 role (przedziałka + Lider/Wicelider/Członek). Lider
 *      dostaje rolę od razu; pozostali członkowie dostają DM z linkiem
 *      do drugiego serwera i przyciskiem zgody - role dopiero po
 *      kliknięciu (muszą tam dołączyć, jeśli jeszcze ich nie ma).
 *
 * ZARZĄDZANIE — dwie równoważne drogi, obie bez komend slash:
 *   - kanał ⚒️zarządzaj-kołem na serwerze Kół (menu z akcjami),
 *   - panel DM lidera/wiceliderów (te same akcje: zaproszenia, wyrzucanie,
 *     prośby o zmianę nazwy/logo/lidera, badania, rozwiązanie koła).
 *   Każdy członek koła dostaje na DM swój własny panel: status koła,
 *   badania, w których uczestniczy, i przycisk "Opuść koło"
 *   (patrz _refreshMemberPanel).
 *
 * UPRAWNIENIA NA SERWERZE KÓŁ: lider jest administratorem własnej
 * kategorii (kanały, role, wiadomości), wicelider moderatorem - patrz
 * LEADER_ALLOW / VICE_ALLOW i _applyKoloPermissions. Scheduler dorzuca te
 * uprawnienia też kołom założonym przed tą zmianą.
 *
 * WYMÓG AKTYWNOŚCI: aktywne koło musi co GeneralConfig.koloInactivityDays
 * dni coś zrobić (nowe badanie, ukończone badanie, nowy członek - każde z
 * tych woła _noteActivity). Po przekroczeniu limitu lider i członkowie
 * dostają ostrzeżenie (Kolo.inactivityWarnedAt), a 72h później koło jest
 * rozwiązywane (patrz _checkActivityRequirement + koloScheduler).
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
 * obu przypadków, dla prostoty i spójności. Licznik działa też dla zgłoszeń
 * w PENDING_MEMBERS: jeśli zaproszeni odrzucą/zignorują zaproszenia, koło
 * nie wisi wiecznie, tylko po 72h zostaje odrzucone (a członkostwa
 * wyczyszczone).
 *
 * CZŁONKOSTWO - jedyne źródło prawdy to KoloMember, ale wpis liczy się
 * TYLKO dopóki koło żyje (PENDING_MEMBERS / PENDING_REVIEW / ACTIVE).
 * Każde odrzucenie albo rozwiązanie koła (ręcznie przez admina, auto po
 * 72h, wycofanie zgłoszenia) MUSI usunąć członków, ich przydziały do badań
 * i wygasić wiszące zaproszenia - patrz _teardownKolo/_dissolveKolo.
 * Sprzątanie bazy jest zawsze pierwsze i niezależne od tego, czy serwer
 * Kół jest osiągalny (usuniecie kanałów/ról to tylko best-effort dodatek),
 * a KAŻDE sprawdzenie "czy ktoś jest w kole" idzie przez
 * _findLiveMembership, które ignoruje martwe statusy i przy okazji usuwa
 * sieroty zostawione przez wcześniejsze wersje bota.
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
  PermissionFlagsBits,
} = require("discord.js");
const prisma = require("../lib/prisma");
const { hasAnyPermission, KEY_SETS } = require("../config/roles");
const { getBoundChannelId } = require("../config/channels");
const { generateAiReply } = require("./aiGatewayService");
const { logError, logAction } = require("./../utils/logger");
const { detectDominantColor } = require("../utils/dominantColor");
const { generateBanner } = require("../utils/banner");
const { getKolaGuild } = require("../config/kolaGuild");

const MIN_INVITED = 3; // + lider = min. 4 osoby
const MAX_MEMBERS = 15;

// Statusy, w których koło naprawdę istnieje - tylko wtedy członkostwo
// (KoloMember) coś znaczy. REJECTED/DISSOLVED to trupy: wpisy członków
// takiego koła to sieroty, które nie mogą nikogo blokować.
const LIVE_KOLO_STATUSES = ["PENDING_MEMBERS", "PENDING_REVIEW", "ACTIVE"];
const DEAD_KOLO_STATUSES = ["REJECTED", "DISSOLVED"];
const GRACE_PERIOD_MS = 72 * 60 * 60 * 1000; // 72h
const RESEARCH_CAPACITY = { 1: 3, 2: 6, 3: 10 }; // ile osób w kole potrzeba na N jednoczesnych badań
const MAX_CONCURRENT_RESEARCH = 3;

// Wymóg aktywności: tyle czasu ma koło na reakcję po ostrzeżeniu o braku
// aktywności, zanim koloScheduler je rozwiąże (ten sam rytm 72h co licznik
// "poniżej minimum" - jedna zasada dla wszystkich automatycznych zamknięć).
const INACTIVITY_WARNING_GRACE_MS = GRACE_PERIOD_MS;
// Fallback, gdyby GeneralConfig nie miał jeszcze pola koloInactivityDays
// (np. baza sprzed migracji) - patrz GeneralConfig.koloInactivityDays.
const DEFAULT_INACTIVITY_DAYS = 30;

// Uprawnienia zarządu na serwerze Kół (KOLA_GUILD_ID). Lider dostaje pełną
// administrację WŁASNEJ kategorii (kanały, role, wiadomości), wicelider
// moderację - bez czekania na administrację serwera. Nadawane przez
// _applyKoloPermissions (patrz tam dlaczego per-rola, a nie całym obiektem).
const LEADER_ALLOW = [
  "ViewChannel",
  "SendMessages",
  "SendMessagesInThreads",
  "CreatePublicThreads",
  "CreatePrivateThreads",
  "EmbedLinks",
  "AttachFiles",
  "AddReactions",
  "ReadMessageHistory",
  "MentionEveryone",
  "ManageMessages",
  "ManageThreads",
  "ManageChannels",
  "ManageRoles",
  "ManageWebhooks",
  "ManageEvents",
  "ManageGuildExpressions",
  "ModerateMembers",
  "KickMembers",
  "MuteMembers",
  "DeafenMembers",
  "MoveMembers",
  "PrioritySpeaker",
  "Connect",
  "Speak",
  "Stream",
  "UseVAD",
  "ChangeNickname",
];
const VICE_ALLOW = [
  "ViewChannel",
  "SendMessages",
  "SendMessagesInThreads",
  "EmbedLinks",
  "AttachFiles",
  "AddReactions",
  "ReadMessageHistory",
  "ManageMessages",
  "ManageThreads",
  "ModerateMembers",
  "MuteMembers",
  "DeafenMembers",
  "MoveMembers",
  "Connect",
  "Speak",
  "Stream",
  "UseVAD",
];

// pending[userId] = { name, description, logoUrl } — dane z modala,
// zanim użytkownik wybierze osoby do zaproszenia (User Select Menu to
// osobna interakcja, nie da się tego zrobić w jednym kroku modala).
const pendingApplications = new Map();

// panelMessages["koloId:userId"] = { channelId, messageId } — żywe panele DM
// (lider/wicelider/członek). Trzymane w pamięci, żeby odświeżenie EDYTOWAŁO
// istniejącą wiadomość zamiast wysyłać nową przy każdej zmianie w kole.
// Panel lidera ma dodatkowo trwałe ID w Kolo.panelMessageId (przeżywa
// restart bota - patrz _sendLeaderPanel).
const panelMessages = new Map();

// Koła, którym w tym procesie nadano już uprawnienia zarządu na serwerze Kół
// (patrz _applyKoloPermissions) - bez tego scheduler wołałby Discord API
// co 15 minut dla każdego koła bez potrzeby.
const permsAppliedKola = new Set();

class KoloService {
  // ==================== CZŁONKOSTWO (wspólne rdzenie) ====================

  /**
   * Usuwa sieroce członkostwa wskazanych użytkowników z kół MARTWYCH
   * (REJECTED/DISSOLVED) razem z ich przydziałami do badań. Zwraca liczbę
   * znalezionych sierot.
   *
   * Po co: gdy koło zostało odrzucone/rozwiązane, a wpisy KoloMember z
   * jakiegokolwiek powodu przetrwały (starsza wersja bota, błąd w połowie
   * teardownu, brak dostępu do serwera Kół), reguła "jedno koło" blokowała
   * taką osobę NA ZAWSZE - nie mogła założyć nowego koła ani przyjąć
   * zaproszenia. Teraz każde sprawdzenie członkostwa sprząta po sobie.
   */
  async _purgeStaleMemberships(userIds) {
    const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))];
    if (ids.length === 0) return 0;

    const stale = await prisma.koloMember.findMany({
      where: { userId: { in: ids }, kolo: { status: { in: DEAD_KOLO_STATUSES } } },
      select: { koloId: true, userId: true },
    });
    if (stale.length === 0) return 0;

    const koloIds = [...new Set(stale.map((m) => m.koloId))];
    await this._clearKoloMembers(koloIds);
    await logAction("kolo_stale_memberships_purged", ids[0], koloIds[0], {
      koloIds,
      affectedUsers: [...new Set(stale.map((m) => m.userId))],
    });
    return stale.length;
  }

  /**
   * Usuwa "ludzi" z koła/ł kół: członkostwa + przydziały do ich badań.
   * Samo Kolo zostaje (historia/logi), ale nikt już w nim nie figuruje.
   */
  async _clearKoloMembers(koloIds) {
    const ids = [...new Set((Array.isArray(koloIds) ? koloIds : [koloIds]).filter(Boolean))];
    if (ids.length === 0) return;

    const researchIds = (
      await prisma.research.findMany({ where: { koloId: { in: ids } }, select: { id: true } })
    ).map((r) => r.id);

    await prisma.$transaction([
      prisma.koloMember.deleteMany({ where: { koloId: { in: ids } } }),
      ...(researchIds.length > 0
        ? [prisma.researchMember.deleteMany({ where: { researchId: { in: researchIds } } })]
        : []),
    ]);
  }

  /**
   * JEDYNE miejsce, którym wolno sprawdzać "czy użytkownik jest w kole".
   * Najpierw sprząta sieroty po martwych kołach, potem szuka członkostwa
   * wyłącznie w kołach o żywym statusie.
   *
   * @param {string} userId
   * @param {object} [opts]
   * @param {string[]|null} [opts.roles]     ograniczenie do ról (LEADER/VICE_LEADER)
   * @param {string|null}   [opts.koloId]    ograniczenie do konkretnego koła
   * @param {string[]}      [opts.statuses]  dopuszczalne statusy koła (domyślnie żywe)
   * @returns {Promise<object|null>} membership z dołączonym `kolo` albo null
   */
  async _findLiveMembership(userId, { roles = null, koloId = null, statuses = LIVE_KOLO_STATUSES } = {}) {
    if (!userId) return null;
    await this._purgeStaleMemberships(userId);

    return prisma.koloMember.findFirst({
      where: {
        userId,
        ...(koloId ? { koloId } : {}),
        ...(roles ? { role: { in: roles } } : {}),
        kolo: { status: { in: statuses } },
      },
      include: { kolo: true },
    });
  }

  // ==================== PANEL / ZGŁOSZENIE ====================

  buildPanelEmbed() {
    return new EmbedBuilder()
      .setTitle("🔬 Koła Naukowe")
      .setDescription(
        "Chcesz założyć koło naukowe? Kliknij przycisk poniżej.\n\n" +
          `Będziesz musiał/a podać nazwę, opis oraz zaprosić min. ${MIN_INVITED} innych osób ` +
          "(oprócz siebie) - wszystkie muszą zaakceptować zaproszenie, zanim zgłoszenie trafi do oceny."
      )
      .setColor(0x2b6cb0).setFooter({ text: "Uniwersytet Centralny RP • Koła Naukowe" }).setTimestamp();
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
      // Członkostwo liczymy tylko w ŻYWYCH kołach - po odrzuconym/
      // rozwiązanym kole użytkownik musi móc założyć nowe (a przy okazji
      // sprzątamy ewentualne sieroty w bazie).
      const existingMembership = await this._findLiveMembership(interaction.user.id);
      if (existingMembership) {
        return interaction.reply({
          content: `❌ Jesteś już członkiem koła naukowego (**${existingMembership.kolo.name}**). Nie można należeć do dwóch naraz.`,
          ephemeral: true,
        });
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

      const pickedIds = interaction.values.filter((id) => id !== interaction.user.id);
      // Osoby już w innym kole nie mogą przyjąć zaproszenia (reguła jednego
      // koła) - odfiltruj je OD RAZU, inaczej zgłoszenie utknie w
      // PENDING_MEMBERS z zaproszeniami, których nikt nie może przyjąć.
      // Liczą się tylko ŻYWE koła: ktoś, czyje koło zostało odrzucone albo
      // rozwiązane, jest wolny i może być zaproszony (najpierw sprzątamy
      // sieroty, żeby nie blokowały nikogo na podstawie martwych wpisów).
      await this._purgeStaleMemberships(pickedIds);
      const busyMembers = await prisma.koloMember.findMany({
        where: { userId: { in: pickedIds }, kolo: { status: { in: LIVE_KOLO_STATUSES } } },
        select: { userId: true },
      });
      const busySet = new Set(busyMembers.map((m) => m.userId));
      const invitedIds = pickedIds.filter((id) => !busySet.has(id));
      if (invitedIds.length < MIN_INVITED) {
        return interaction.editReply({
          content:
            `❌ Musisz wybrać min. ${MIN_INVITED} innych osób (nie licząc siebie), które nie należą do żadnego koła. ` +
            (busySet.size > 0 ? `Pominięto ${busySet.size} os. już należących do innych kół - wybierz ponownie.` : ""),
          components: [],
        });
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
          `(masz 72h, zanim wygasną). Gdy wszyscy zaakceptują, zgłoszenie trafi do oceny AI i administracji.` +
          (busySet.size > 0 ? `\n⚠️ Pominięto ${busySet.size} os. już należących do innych kół.` : ""),
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
      .setFooter({ text: "To zaproszenie wygasa po 72h • Uniwersytet Centralny RP" }).setTimestamp();

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
      if (DEAD_KOLO_STATUSES.includes(invite.kolo?.status)) {
        // Koło zdążyło zostać odrzucone/rozwiązane (np. auto-odrzucenie
        // zgłoszenia, w którym nikt nie zaakceptował zaproszeń). Kliknięcie
        // starego DM-a nie może już nikogo dopisać do martwego koła.
        await prisma.koloInvite.update({ where: { id: inviteId }, data: { status: "EXPIRED" } }).catch(() => null);
        return interaction.editReply({
          content: "❌ To koło zostało odrzucone lub rozwiązane - zaproszenie jest nieaktualne.",
          embeds: [],
          components: [],
        });
      }

      if (!accepted) {
        await prisma.koloInvite.update({ where: { id: inviteId }, data: { status: "DECLINED" } });
        const leader = await interaction.client.users.fetch(invite.kolo.leaderId).catch(() => null);
        await leader
          ?.send(
            `❌ **${interaction.user.tag}** odrzucił(a) zaproszenie do koła **${invite.kolo.name}**. ` +
              "Użyj przycisku 📨 Zaproś osobę na panelu koła (DM), aby zaprosić kogoś innego."
          )
          .catch(() => null);
        // Od razu przelicz minimum: jeśli to była ostatnia szansa na komplet
        // (brak wiszących zaproszeń), startuje 72h licznik, po którym
        // zgłoszenie zostanie odrzucone, a członkostwa wyczyszczone.
        await this._checkMinimumMembers(interaction.client, invite.koloId);
        // Panel zarządu musi przestać pokazywać tę osobę jako "oczekującą" -
        // bez tego lider widziałby ⏳ przy kimś, kto już odmówił (licznik
        // belowMinSince nie rusza, dopóki wiszą inne zaproszenia, więc samo
        // _checkMinimumMembers panelu by nie odświeżyło).
        await this.refreshPanels(interaction.client, invite.koloId);
        return interaction.editReply({ content: "Odrzucono zaproszenie.", embeds: [], components: [] });
      }

      // Ktoś mógł dołączyć do innego koła już PO otrzymaniu tego
      // zaproszenia - członkostwo w dwóch kołach naraz jest zabronione.
      // Sprawdzamy tylko ŻYWE koła (członkostwo w odrzuconym/rozwiązanym
      // to sierota, nie przeszkoda).
      const memberElsewhere = await this._findLiveMembership(interaction.user.id);
      if (memberElsewhere && memberElsewhere.koloId !== invite.koloId) {
        await prisma.koloInvite.update({ where: { id: inviteId }, data: { status: "DECLINED" } });
        return interaction.editReply({
          content: `❌ Należysz już do innego koła naukowego (**${memberElsewhere.kolo.name}**) - nie możesz przyjąć tego zaproszenia.`,
          embeds: [],
          components: [],
        });
      }

      await prisma.koloInvite.update({ where: { id: inviteId }, data: { status: "ACCEPTED" } });
      await prisma.koloMember.upsert({
        where: { koloId_userId: { koloId: invite.koloId, userId: interaction.user.id } },
        update: {},
        create: { koloId: invite.koloId, userId: interaction.user.id, role: "MEMBER" },
      });

      // Zaproszenie do JUŻ AKTYWNEGO koła (panel DM / kanał zarządzania):
      // nowy członek musi jeszcze potwierdzić dostęp DM-em, inaczej nigdy nie
      // dostałby ról na serwerze Kół (stary błąd: accept kończył się
      // tylko wpisem w bazie).
      if (invite.kolo.status === "ACTIVE") {
        await this._sendConsentDm(interaction.client, invite.koloId, interaction.user.id, invite.kolo.name);
        await this._checkMinimumMembers(interaction.client, invite.koloId);
        // Nowy członek = aktywność koła + odświeżenie paneli u wszystkich
        // (zarząd widzi nowy stan, nowy członek dostaje swój panel).
        await this._noteActivity(invite.koloId);
        await this.refreshPanels(interaction.client, invite.koloId);
        return interaction.editReply({
          content: `✅ Przyjęto zaproszenie do koła **${invite.kolo.name}**. Sprawdź DM z prośbą o potwierdzenie dostępu do kanałów.`,
          embeds: [],
          components: [],
        });
      }

      const [stillPending, acceptedCount] = await Promise.all([
        prisma.koloInvite.count({ where: { koloId: invite.koloId, status: "PENDING" } }),
        prisma.koloInvite.count({ where: { koloId: invite.koloId, status: "ACCEPTED" } }),
      ]);
      if (invite.kolo.status === "PENDING_MEMBERS") {
        if (stillPending === 0 && acceptedCount >= MIN_INVITED) {
          await this._advanceToReview(interaction.client, invite.koloId);
        } else if (stillPending === 0) {
          // Wszyscy odpowiedzieli, ale za mało zaakceptowało (reszta
          // odrzuciła) - lider musi doprosić brakujące osoby, inaczej
          // zgłoszenie utknęłoby tu na zawsze.
          const leader = await interaction.client.users.fetch(invite.kolo.leaderId).catch(() => null);
          await leader
            ?.send(
              `⚠️ W kole **${invite.kolo.name}** zaakceptowało tylko ${acceptedCount} z wymaganych min. ${MIN_INVITED} osób. ` +
                "Zaproś brakujące osoby przyciskiem 📨 Zaproś osobę na panelu koła (DM), żeby zgłoszenie mogło trafić do oceny. " +
                "Masz na to 72h - potem zgłoszenie zostanie automatycznie odrzucone, a wszyscy zwolnieni z koła."
            )
            .catch(() => null);
          // Start licznika 72h (belowMinSince) - bez tego zgłoszenie wisi
          // w PENDING_MEMBERS wiecznie, a lider i zaakceptowani członkowie
          // są zablokowani (nie mogą założyć/dołączyć do innego koła).
          await this._checkMinimumMembers(interaction.client, invite.koloId);
        }
      }

      // Panel zarządu (i członków zgłoszenia) ma pokazać nowy stan: kto już
      // zaakceptował, ile brakuje i czy licznik 72h tyka.
      await this.refreshPanels(interaction.client, invite.koloId);

      return interaction.editReply({ content: `✅ Dołączono do koła **${invite.kolo.name}**.`, embeds: [], components: [] });
    } catch (err) {
      await logError("koloService", "INVITE_RESPONSE_ERROR", err.message, { userId: interaction.user.id, stack: err.stack });
      return interaction.editReply({ content: "❌ Błąd serwera.", components: [] }).catch(() => null);
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
    // belowMinSince: null - komplet zebrany, licznik "poniżej minimum"
    // (wspólny dla ACTIVE i PENDING_MEMBERS) przestaje tykać.
    const kolo = await prisma.kolo.update({
      where: { id: koloId },
      data: { status: "PENDING_REVIEW", belowMinSince: null },
      include: { members: true },
    });

    // Status zmienił się na PENDING_REVIEW - panele muszą stracić przyciski
    // "Zaproś/Wycofaj zgłoszenie", bo od teraz decyduje administracja.
    // MUSI być przed wczesnym returnem poniżej: brak kanału recenzji to
    // problem administracji, a nie powód, żeby lider miał martwy panel.
    await this.refreshPanels(client, koloId);

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
      .setColor(0x2b6cb0).setFooter({ text: "Uniwersytet Centralny RP • Koła Naukowe" }).setTimestamp();
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
      // Recenzja zgłoszeń koła: dowolna ranga moderacyjna (Młodszy Moderator
      // i wyżej) albo stary klucz MODERATE.
      if (!(await hasAnyPermission(interaction.member, KEY_SETS.MODERATION))) {
        return interaction.followUp({ content: "❌ Nie masz uprawnień do rozpatrywania kół naukowych.", ephemeral: true });
      }

      const kolo = await prisma.kolo.findUnique({ where: { id: koloId }, include: { members: true } });
      if (!kolo || kolo.status !== "PENDING_REVIEW") {
        return interaction.followUp({ content: "❌ To zgłoszenie zostało już rozpatrzone lub nie istnieje.", ephemeral: true });
      }

      if (!approve) {
        // Nazwa jest @unique - odrzucone koło musi ją zwolnić, inaczej nikt
        // nigdy nie założy koła o tej nazwie. Członków (i ich przydziały do
        // badań oraz wiszące zaproszenia) czyści _teardownKolo - inaczej
        // reguła "jedno koło" blokowałaby ich na zawsze: nie mogliby ani
        // założyć nowego, ani dołączyć do innego.
        await this._teardownKolo(null, kolo, { finalStatus: "REJECTED", nameSuffix: "odrzucone" });
        for (const m of kolo.members) {
          const user = await interaction.client.users.fetch(m.userId).catch(() => null);
          await user
            ?.send(
              `❌ Zgłoszenie koła **${kolo.name}** zostało odrzucone przez administrację. ` +
                "Nie należysz już do żadnego koła - możesz założyć nowe albo przyjąć zaproszenie do istniejącego."
            )
            .catch(() => null);
        }
        await logAction("kolo_rejected", interaction.user.id, koloId, { name: kolo.name, freedMembers: kolo.members.map((m) => m.userId) });
        return interaction.editReply({ components: [] });
      }

      const activated = await this._activateKolo(interaction.client, kolo);
      if (!activated) {
        // Infrastruktura nie powstała (brak serwera Kół / błąd Discorda) -
        // NIE zdejmujemy przycisków i nie zostawiamy koła w limbo: admin
        // dostaje komunikat i może ponowić, gdy bot znów zobaczy serwer.
        return interaction.followUp({
          content:
            "❌ Nie udało się utworzyć kategorii/kanałów/ról koła (serwer Kół Naukowych jest niedostępny albo bot nie ma tam uprawnień). " +
            "Zgłoszenie zostaje nierozpatrzone - kliknij ponownie później.",
          ephemeral: true,
        });
      }
      await logAction("kolo_approved", interaction.user.id, koloId, { name: kolo.name });
      return interaction.editReply({ components: [] });
    } catch (err) {
      await logError("koloService", "APPLICATION_REVIEW_ERROR", err.message, { koloId, stack: err.stack });
      return interaction.followUp({ content: "❌ Błąd podczas przetwarzania decyzji.", ephemeral: true }).catch(() => null);
    }
  }

  // ==================== INFRASTRUKTURA (kategoria/kanały/role) ====================

  /** Tworzy kategorię + 6 kanałów + 4 role dla zatwierdzonego koła NA DRUGIM
   * SERWERZE (KOLA_GUILD_ID) - Koła Naukowe żyją na innym serwerze niż
   * reszta bota. Nadaje rolę liderowi od razu (on zarejestrował koło,
   * zgoda jest dorozumiana), a pozostałym członkom wysyła DM z prośbą
   * o zgodę i linkiem do DRUGIEGO serwera - ich role zostaną nadane
   * dopiero po kliknięciu (i dołączeniu tam, jeśli jeszcze ich nie ma).
   *
   * Zwraca true/false - przy false koło NIE zostało aktywowane (zostało w
   * PENDING_REVIEW z przyciskami do ponowienia), a częściowo utworzone
   * kanały/role są posprzątane. */
  async _activateKolo(client, kolo) {
    const guild = getKolaGuild(client);
    if (!guild) {
      await logError("koloService", "NO_KOLA_GUILD", "KOLA_GUILD_ID nieustawione lub bot nie jest na tym serwerze - nie można aktywować koła.", { koloId: kolo.id });
      return false;
    }

    const created = []; // role/kanały utworzone w tej próbie - materiał do rollbacku
    try {
      await this._activateKoloInner(client, guild, kolo, created);
      return true;
    } catch (err) {
      await logError("koloService", "ACTIVATE_KOLO_ERROR", err.message, { koloId: kolo.id, stack: err.stack });

      // Jeśli koło zdążyło zostać zapisane jako ACTIVE (błąd nastąpił już po
      // aktualizacji bazy), infrastruktura JEST używana - kasowanie jej
      // zostawiłoby aktywne koło bez kanałów. Wtedy uznajemy aktywację za
      // udaną i tylko logujemy problem.
      const current = await prisma.kolo.findUnique({ where: { id: kolo.id } }).catch(() => null);
      if (current?.status === "ACTIVE") return true;

      // Niedokończona infrastruktura to śmieci (koło nie jest ACTIVE, więc
      // żaden teardown nigdy by jej nie znalazł) - usuwamy w odwrotnej
      // kolejności, best-effort.
      for (const obj of [...created].reverse()) {
        await obj.delete?.("Błąd podczas tworzenia koła naukowego").catch(() => null);
      }
      return false;
    }
  }

  async _activateKoloInner(client, guild, kolo, created) {
    const { emoji, hex } = await detectDominantColor(kolo.logoUrl);

    const divider = await guild.roles.create({
      name: `•══════• ${kolo.name} •══════•`,
      color: hex,
      hoist: true,
      mentionable: false,
    });
    created.push(divider);
    const roleLider = await guild.roles.create({ name: "• Lider Koła Naukowego •", color: hex, mentionable: true });
    created.push(roleLider);
    const roleWicelider = await guild.roles.create({ name: "• Wicelider Koła Naukowego •", color: hex, mentionable: true });
    created.push(roleWicelider);
    const roleCzlonek = await guild.roles.create({ name: "• Członek Koła Naukowego •", color: hex, mentionable: true });
    created.push(roleCzlonek);

    const everyone = guild.roles.everyone;
    const category = await guild.channels.create({
      name: `${emoji} • ${kolo.name}`,
      type: 4, // GuildCategory
      permissionOverwrites: [
        { id: everyone.id, deny: ["ViewChannel"] },
        { id: divider.id, allow: ["ViewChannel"] },
      ],
    });
    created.push(category);

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
    created.push(ogloszenia);

    const czat = await guild.channels.create({
      name: "💬│czat-koła",
      type: 0,
      parent: category.id,
    });
    created.push(czat);

    const badania = await guild.channels.create({
      name: "🔬│badania",
      type: 0,
      parent: category.id,
      permissionOverwrites: [
        { id: everyone.id, deny: ["ViewChannel"] },
        { id: divider.id, allow: ["ViewChannel"], deny: ["SendMessages"] },
      ],
    });
    created.push(badania);

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
    created.push(zarzadzaj);

    const dokumenty = await guild.channels.create({
      name: "📜│dokumenty-koła",
      type: 15, // GuildForum
      parent: category.id,
    });
    created.push(dokumenty);

    const vc = await guild.channels.create({
      name: "🔊│vc",
      type: 2, // GuildVoice
      parent: category.id,
    });
    created.push(vc);

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
        // Nowe koło startuje "aktywne" - licznik bezczynności rusza od zera
        // (patrz _checkActivityRequirement).
        lastActivityAt: new Date(),
        inactivityWarnedAt: null,
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

    // Uprawnienia zarządu na serwerze Kół: lider adminem własnej kategorii,
    // wicelider moderatorem. Musi być PO zapisie ID ról/kanałów do bazy -
    // _applyKoloPermissions czyta je z obiektu kolo, więc podajemy świeże.
    const activated = {
      ...kolo,
      categoryId: category.id,
      channelAnnouncements: ogloszenia.id,
      channelChat: czat.id,
      channelResearch: badania.id,
      channelManage: zarzadzaj.id,
      channelDocuments: dokumenty.id,
      channelVoice: vc.id,
      roleIdLeader: roleLider.id,
      roleIdVice: roleWicelider.id,
    };
    await this._applyKoloPermissions(guild, activated).catch((err) =>
      logError("koloService", "PERMISSIONS_APPLY_ERROR", err.message, { koloId: kolo.id, stack: err.stack })
    );

    // Panel DM dla każdego członka koła (zarząd dostaje panel zarządu).
    await this.refreshPanels(client, kolo.id);

    // Baner powitalny to kosmetyka (Canvas) - jego awaria nie może wykładać
    // całej aktywacji, bo skończyłaby się rollbackiem działającego koła.
    try {
      const welcomeBanner = new AttachmentBuilder(generateBanner(kolo.name, hex), { name: "banner.png" });
      const welcome = new EmbedBuilder()
        .setTitle(`${emoji} Koło Naukowe ${kolo.name} zostało utworzone!`)
        .setDescription(kolo.description)
        .setImage("attachment://banner.png")
        .setColor(hex).setFooter({ text: "Uniwersytet Centralny RP • Koła Naukowe" }).setTimestamp();
      if (kolo.logoUrl) welcome.setThumbnail(kolo.logoUrl);
      await ogloszenia.send({ embeds: [welcome], files: [welcomeBanner] }).catch(() => null);
    } catch (err) {
      await logError("koloService", "WELCOME_BANNER_ERROR", err.message, { koloId: kolo.id, stack: err.stack });
    }
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
      .setColor(0x2b6cb0).setFooter({ text: "Uniwersytet Centralny RP • Koła Naukowe" }).setTimestamp();
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

      // Członek ma już role i dostęp - dostaje swój panel koła na DM.
      await this._sendMemberPanel(interaction.client, koloId, userId).catch(() => null);

      return interaction.editReply({ content: `✅ Gotowe! Masz teraz dostęp do kanałów koła **${kolo.name}**.`, embeds: [], components: [] });
    } catch (err) {
      await logError("koloService", "CONSENT_ERROR", err.message, { koloId, userId, stack: err.stack });
      // deferUpdate() już poszedł, więc musimy odpowiedzieć editReply -
      // inaczej użytkownik wisi na "myślącym" przycisku bez końca.
      return interaction.editReply({ content: "❌ Błąd serwera. Spróbuj ponownie.", embeds: [], components: [] }).catch(() => null);
    }
  }

  async _getManagedKolo(userId) {
    // Tylko AKTYWNE koła i tylko żywe członkostwa (sieroty po odrzuconych/
    // rozwiązanych kołach są przy okazji usuwane z bazy).
    return this._findLiveMembership(userId, { roles: ["LEADER", "VICE_LEADER"], statuses: ["ACTIVE"] });
  }

  /**
   * Ponowna weryfikacja uprawnień w handlerach "drugiego kroku" (wybór
   * osoby, wybór badania, modale). Pierwszy krok (menu) już to sprawdził,
   * ale między krokami role mogły się zmienić - nie ufamy samemu customId.
   * Zwraca membership albo null (i wtedy handler ma przerwać).
   */
  async _requireManager(userId, koloId) {
    return this._findLiveMembership(userId, { roles: ["LEADER", "VICE_LEADER"], koloId, statuses: ["ACTIVE"] });
  }

  // ==================== EMBED ZARZĄDZANIA (kanał ⚒️zarządzaj-kołem) ====================

  buildManageEmbed(kolo) {
    return new EmbedBuilder()
      .setTitle(`⚒️ Zarządzanie kołem ${kolo.name}`)
      .setDescription("Wybierz akcję z listy poniżej. Dostępne tylko dla lidera i wicelidera.")
      .setColor(0x2b6cb0).setFooter({ text: "Uniwersytet Centralny RP • Koła Naukowe" }).setTimestamp();
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

  /**
   * Modal tematu badania wywoływany z panelu DM. CustomId to ten sam
   * `kolo_modal_startresearch:{koloId}` co z kanału ⚒️zarządzaj-kołem, więc
   * obsługa (handleStartResearchModalSubmit) jest wspólna.
   */
  buildStartResearchModal(koloId) {
    return this._buildTextModal(`kolo_modal_startresearch:${koloId}`, "Temat badania", "temat");
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
            ? researches.map((r) => `**${r.topic}** — ${r.status}`).join("\n").slice(0, 1000)
            : "Brak",
        }
      );
    embed.setFooter({ text: "Uniwersytet Centralny RP • Koła Naukowe" }).setTimestamp();
    if (kolo.logoUrl) embed.setThumbnail(kolo.logoUrl);
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ==================== TARGET (user select) HANDLERY ====================

  async handleManageTargetSelect(interaction, action, koloId) {
    await interaction.deferUpdate();
    // Zapraszanie działa też w zgłoszeniu zbierającym członków (lider
    // doprasza brakujące osoby po odrzutach) - reszta akcji wymaga
    // zatwierdzonego, aktywnego koła.
    const managed =
      action === "invite"
        ? await this._requireInvitableManager(interaction.user.id, koloId)
        : await this._requireManager(interaction.user.id, koloId);
    if (!managed) return interaction.editReply({ content: "❌ Musisz być liderem lub wiceliderem tego koła.", components: [] });
    const targetId = interaction.values[0];
    const kolo = managed.kolo;

    if (action === "invite") return this._doInvite(interaction, kolo, targetId);
    if (action === "kick") return this._doKick(interaction, kolo, targetId);
    if (action === "set_vice") return this._doSetVice(interaction, kolo, targetId);
    if (action === "transfer_leader") return this._doRequestLeaderTransfer(interaction, kolo, targetId);
    if (action === "assign_research") return this._doAssignResearchPickResearch(interaction, kolo, targetId);
  }

  /**
   * Przydzielenie osoby do KONKRETNEGO badania (przycisk z panelu DM, gdzie
   * badanie jest już znane - stąd w customId jego ID, a nie ID koła).
   */
  async handleAssignResearchDirect(interaction, researchId) {
    await interaction.deferUpdate();
    try {
      const research = await prisma.research.findUnique({ where: { id: researchId }, include: { kolo: true } });
      if (!research) return interaction.editReply({ content: "❌ Nie znaleziono badania.", components: [] });
      const managed = await this._requireManager(interaction.user.id, research.koloId);
      if (!managed) return interaction.editReply({ content: "❌ Musisz być liderem lub wiceliderem tego koła.", components: [] });
      if (!["ACTIVE", "PAUSED"].includes(research.status)) {
        return interaction.editReply({ content: "❌ Do tego badania nie można przydzielać (nie jest prowadzone).", components: [] });
      }

      const targetId = interaction.values[0];
      const targetMembership = await prisma.koloMember.findUnique({
        where: { koloId_userId: { koloId: research.koloId, userId: targetId } },
      });
      if (!targetMembership) return interaction.editReply({ content: "❌ Ta osoba nie należy do koła.", components: [] });
      const existing = await prisma.researchMember.findUnique({
        where: { researchId_userId: { researchId, userId: targetId } },
      });
      if (existing) return interaction.editReply({ content: "❌ Ta osoba jest już przydzielona do tego badania.", components: [] });

      await prisma.researchMember.create({ data: { researchId, userId: targetId } });
      await this._postResearchUpdate(interaction.client, research.kolo, research);
      await logAction("kolo_research_assigned", interaction.user.id, research.koloId, { researchId, targetId });
      await this.refreshPanels(interaction.client, research.koloId);
      return interaction.editReply({ content: `✅ Przydzielono <@${targetId}> do badania **${research.topic}**.`, components: [] });
    } catch (err) {
      await logError("koloService", "ASSIGN_RESEARCH_DIRECT_ERROR", err.message, { researchId, stack: err.stack });
      return interaction.editReply({ content: "❌ Błąd serwera.", components: [] }).catch(() => null);
    }
  }

  /**
   * Wspólny rdzeń zapraszania - używany i przez menu w kanale
   * ⚒️zarządzaj-kołem, i przez panel na DM. Zwraca { ok, message } zamiast
   * odpowiadać na interakcję, bo oba wołania odpowiadają inaczej.
   */
  async _inviteCore(client, kolo, targetId, actorUser) {
    const memberCount = await prisma.koloMember.count({ where: { koloId: kolo.id } });
    if (memberCount >= MAX_MEMBERS) return { ok: false, message: `❌ Koło ma już maksymalną liczbę członków (${MAX_MEMBERS}).` };

    // "Należy do jakiegoś koła" liczymy tylko dla ŻYWYCH kół - po
    // odrzuconym/rozwiązanym kole wpis członka to sierota, przez którą
    // nie dało się już nikogo zaprosić (ani nigdzie dołączyć).
    const already = await this._findLiveMembership(targetId);
    if (already && already.koloId === kolo.id) return { ok: false, message: `❌ <@${targetId}> jest już członkiem tego koła.` };
    if (already) return { ok: false, message: `❌ Ta osoba należy już do koła **${already.kolo.name}**.` };

    const pendingInvite = await prisma.koloInvite.findFirst({ where: { koloId: kolo.id, userId: targetId, status: "PENDING", expiresAt: { gt: new Date() } } });
    if (pendingInvite) return { ok: false, message: "❌ Ta osoba ma już wysłane zaproszenie." };

    // Upsert, nie create: (koloId, userId) jest @unique, a ktoś mógł już
    // kiedyś dostać/odrzucić zaproszenie do tego koła - create rzuciłby P2002.
    const invite = await prisma.koloInvite.upsert({
      where: { koloId_userId: { koloId: kolo.id, userId: targetId } },
      update: { status: "PENDING", expiresAt: new Date(Date.now() + GRACE_PERIOD_MS) },
      create: { koloId: kolo.id, userId: targetId, expiresAt: new Date(Date.now() + GRACE_PERIOD_MS) },
    });
    const leaderUser = await client.users.fetch(kolo.leaderId).catch(() => null);
    await this._sendInviteDm(client, invite, kolo, leaderUser || actorUser);
    // Nowe zaproszenie = nowa szansa na komplet. Dla zgłoszenia w
    // PENDING_MEMBERS wiszące zaproszenie wstrzymuje licznik "poniżej
    // minimum" (inaczej zgłoszenie zostałoby odrzucone w połowie
    // dopraszania ludzi); dla AKTYWNEGO koła licznik biegnie dalej, bo
    // samo wysłanie zaproszenia jeszcze braków nie uzupełniło.
    await this._checkMinimumMembers(client, kolo.id);
    await logAction("kolo_invite_sent", actorUser.id, kolo.id, { targetId });
    // Panel zarządu ma od razu pokazać nowe oczekujące zaproszenie.
    await this.refreshPanels(client, kolo.id);
    return { ok: true, message: `✅ Wysłano zaproszenie do <@${targetId}>.` };
  }

  async _doInvite(interaction, kolo, targetId) {
    const result = await this._inviteCore(interaction.client, kolo, targetId, interaction.user);
    return interaction.editReply({ content: result.message, components: [] });
  }

  /**
   * Wspólny rdzeń wyrzucania. Role zdejmujemy ZAWSZE na serwerze Kół
   * (getKolaGuild), nie na interaction.guild - panel DM nie ma w ogóle
   * kontekstu serwera, a menu zarządzania może być kliknięte zdalnie.
   */
  async _kickCore(client, kolo, targetId) {
    if (targetId === kolo.leaderId) return { ok: false, message: "❌ Nie możesz wyrzucić lidera. Użyj zmiany lidera." };

    const targetMembership = await prisma.koloMember.findUnique({ where: { koloId_userId: { koloId: kolo.id, userId: targetId } } });
    if (!targetMembership) return { ok: false, message: "❌ Ta osoba nie należy do koła." };

    await prisma.koloMember.delete({ where: { id: targetMembership.id } });
    // Sprzątanie przydziałów do badań koła (inaczej wisiałyby sieroty)
    const researchIds = (await prisma.research.findMany({ where: { koloId: kolo.id }, select: { id: true } })).map((r) => r.id);
    if (researchIds.length > 0) {
      await prisma.researchMember.deleteMany({ where: { researchId: { in: researchIds }, userId: targetId } });
    }

    const guild = getKolaGuild(client);
    if (guild) {
      const member = await guild.members.fetch(targetId).catch(() => null);
      for (const roleId of [kolo.roleIdDivider, kolo.roleIdLeader, kolo.roleIdVice, kolo.roleIdMember]) {
        if (roleId) await member?.roles.remove(roleId).catch(() => null);
      }
      const customRoles = await prisma.koloCustomRole.findMany({ where: { koloId: kolo.id } });
      for (const cr of customRoles) await member?.roles.remove(cr.roleId).catch(() => null);
    }

    await this._checkMinimumMembers(client, kolo.id);
    return { ok: true, message: `✅ Wyrzucono <@${targetId}> z koła.` };
  }

  async _doKick(interaction, kolo, targetId) {
    const result = await this._kickCore(interaction.client, kolo, targetId);
    if (result.ok) {
      await logAction("kolo_member_kicked", interaction.user.id, kolo.id, { targetId });
      // Stan koła się zmienił (mniej osób, możliwe uruchomienie licznika 72h)
      // - panele zarządu muszą to pokazać. Wyrzucony traci wpis w bazie, więc
      // refreshPanels przy okazji sprząta jego wpis z mapy paneli.
      await this.refreshPanels(interaction.client, kolo.id);
    }
    return interaction.editReply({ content: result.message, components: [] });
  }

  async _doSetVice(interaction, kolo, targetId) {
    const targetMembership = await prisma.koloMember.findUnique({ where: { koloId_userId: { koloId: kolo.id, userId: targetId } } });
    if (!targetMembership) return interaction.editReply({ content: "❌ Ta osoba nie należy do koła.", components: [] });
    if (targetId === kolo.leaderId) return interaction.editReply({ content: "❌ Lider nie może być jednocześnie wiceliderem.", components: [] });

    // Role koła istnieją TYLKO na serwerze Kół - interaction.guild to zwykle
    // główny serwer, gdzie fetch rzuciłby błąd i role nigdy by się nie zmieniły.
    const guild = getKolaGuild(interaction.client);
    if (!guild) return interaction.editReply({ content: "❌ Błąd konfiguracji serwera Kół Naukowych.", components: [] });

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

    // Nowy wicelider dostaje panel ZARZĄDU, zdegradowany wraca do panelu
    // członka - refreshPanels rozdziela to sam po roli z bazy.
    await this.refreshPanels(interaction.client, kolo.id);

    return interaction.editReply({ content: `✅ <@${targetId}> jest teraz wiceliderem.`, components: [] });
  }

  async _doRequestLeaderTransfer(interaction, kolo, targetId) {
    const targetMembership = await prisma.koloMember.findUnique({ where: { koloId_userId: { koloId: kolo.id, userId: targetId } } });
    if (!targetMembership) return interaction.editReply({ content: "❌ Nowy lider musi być członkiem koła.", components: [] });

    await this._createChangeRequest(
      interaction.client, kolo, interaction.user.id, "LEADER", { newLeaderId: targetId },
      "zmiana_lidera", `Koło: ${kolo.name}\nObecny lider: ${kolo.leaderId}\nProponowany nowy lider: ${targetId}`,
      "Zmiana lidera", `<@${targetId}>`
    );
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

  /**
   * Wspólny rdzeń próśb o zmianę (AI + zapis + embed do recenzji) -
   * używany przez modale z menu zarządzania (kanał i panel DM).
   */
  async _createChangeRequest(client, kolo, requestedById, type, payload, aiKind, aiDetails, label, valueLabel) {
    const ai = await this._aiScore(aiKind, aiDetails);
    const request = await prisma.koloChangeRequest.create({
      data: { koloId: kolo.id, requestedBy: requestedById, type, payload, aiScore: ai.score, aiAnalysis: ai },
    });
    await this._postChangeReviewEmbed(client, kolo, label, valueLabel, ai, request.id);
    await logAction("kolo_change_requested", requestedById, kolo.id, { type, payload });
    return request;
  }

  async handleRenameModalSubmit(interaction, koloId) {
    await interaction.deferReply({ ephemeral: true });
    const managed = await this._requireManager(interaction.user.id, koloId);
    if (!managed) return interaction.editReply({ content: "❌ Musisz być liderem lub wiceliderem tego koła." });
    const newName = interaction.fields.getTextInputValue("nazwa").trim();
    const kolo = managed.kolo;
    const taken = await prisma.kolo.findUnique({ where: { name: newName } });
    if (taken) return interaction.editReply({ content: "❌ Koło o tej nazwie już istnieje." });

    await this._createChangeRequest(
      interaction.client, kolo, interaction.user.id, "NAME", { newName },
      "zmiana_nazwy", `Koło: ${kolo.name}\nNowa nazwa: ${newName}`,
      "Zmiana nazwy", newName
    );
    return interaction.editReply({ content: "✅ Prośba wysłana do administracji." });
  }

  async handleRelogoModalSubmit(interaction, koloId) {
    await interaction.deferReply({ ephemeral: true });
    const managed = await this._requireManager(interaction.user.id, koloId);
    if (!managed) return interaction.editReply({ content: "❌ Musisz być liderem lub wiceliderem tego koła." });
    const newLogoUrl = interaction.fields.getTextInputValue("logo").trim();
    const kolo = managed.kolo;

    await this._createChangeRequest(
      interaction.client, kolo, interaction.user.id, "LOGO", { newLogoUrl },
      "zmiana_logo", `Koło: ${kolo.name}\nNowy link logo: ${newLogoUrl}`,
      "Zmiana logo", newLogoUrl
    );
    return interaction.editReply({ content: "✅ Prośba wysłana do administracji." });
  }

  async handleNewRoleModalSubmit(interaction, koloId) {
    await interaction.deferReply({ ephemeral: true });
    const managed = await this._requireManager(interaction.user.id, koloId);
    if (!managed) return interaction.editReply({ content: "❌ Musisz być liderem lub wiceliderem tego koła." });
    const roleName = interaction.fields.getTextInputValue("nazwa").trim();
    const kolo = managed.kolo;

    const existing = await prisma.koloCustomRole.findUnique({ where: { koloId_name: { koloId, name: roleName } } });
    if (existing) return interaction.editReply({ content: "❌ Taka rola już istnieje w tym kole." });

    await this._createChangeRequest(
      interaction.client, kolo, interaction.user.id, "NEW_ROLE", { roleName },
      "nowa_rola", `Koło: ${kolo.name}\nProponowana nazwa roli: ${roleName}`,
      "Nowa rola", `• ${roleName} •`
    );
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
      .setColor(0xd69e2e).setFooter({ text: "Uniwersytet Centralny RP • Koła Naukowe" }).setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`kolo_change_approve:${requestId}`).setLabel("✅ Zaakceptuj").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`kolo_change_reject:${requestId}`).setLabel("❌ Odrzuć").setStyle(ButtonStyle.Danger)
    );
    await channel.send({ embeds: [embed], components: [row] });
  }

  async handleChangeReview(interaction, requestId, approve) {
    await interaction.deferUpdate();
    try {
      // Recenzja zgłoszeń koła: dowolna ranga moderacyjna (Młodszy Moderator
      // i wyżej) albo stary klucz MODERATE.
      if (!(await hasAnyPermission(interaction.member, KEY_SETS.MODERATION))) {
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

      // Zatwierdzona zmiana (nazwa/logo/lider/nowa rola) musi być widoczna na
      // panelach DM. Przy zmianie lidera to istotne podwójnie: nowy lider
      // dostaje panel zarządu, a stary wraca do panelu członka.
      await this.refreshPanels(interaction.client, kolo.id);

      return interaction.editReply({ components: [] });
    } catch (err) {
      await logError("koloService", "CHANGE_REVIEW_ERROR", err.message, { requestId, stack: err.stack });
      return interaction.followUp({ content: "❌ Błąd podczas przetwarzania.", ephemeral: true }).catch(() => null);
    }
  }

  // ==================== ROZWIĄZANIE KOŁA ====================

  /**
   * Rdzeń prośby o rozwiązanie koła (zgoda administracji wymagana).
   * Zwraca tekst zamiast odpowiadać na interakcję - wołają go i kanał
   * ⚒️zarządzaj-kołem (_requestDissolve), i panel DM (handlePanelConfirm).
   */
  async _dissolveRequestCore(client, kolo, requestedById) {
    const existing = await prisma.koloChangeRequest.findFirst({
      where: { koloId: kolo.id, type: "DISSOLVE", status: "PENDING_REVIEW" },
    });
    if (existing) return "⏳ Prośba o rozwiązanie tego koła już czeka na decyzję administracji.";

    const request = await prisma.koloChangeRequest.create({
      data: { koloId: kolo.id, requestedBy: requestedById, type: "DISSOLVE", payload: {} },
    });
    await this._postChangeReviewEmbed(client, kolo, "Rozwiązanie koła", "(nieodwracalne)", { score: null }, request.id);
    await logAction("kolo_dissolve_requested", requestedById, kolo.id, {});
    return "✅ Prośba o rozwiązanie koła wysłana do administracji.";
  }

  async _requestDissolve(interaction, kolo) {
    await interaction.deferReply({ ephemeral: true });
    const message = await this._dissolveRequestCore(interaction.client, kolo, interaction.user.id);
    return interaction.editReply({ content: message });
  }

  /**
   * Zwalnia unikalną nazwę koła (Kolo.name jest @unique) przy archiwizacji -
   * bez tego nikt nigdy nie założyłby koła o nazwie odrzuconej/rozwiązanej.
   */
  async _archivedKoloName(name, koloId, suffix) {
    if (name.includes(`#${suffix}-`)) return name; // już zarchiwizowana (ponowne wywołanie)
    const base = `${name}#${suffix}-${koloId.slice(0, 6)}`;
    const taken = await prisma.kolo.findUnique({ where: { name: base } });
    return taken ? `${base}-${Date.now().toString(36)}` : base;
  }

  /**
   * Definitywne zamknięcie koła: baza (status, zwolnienie nazwy, USUNIĘCIE
   * członków wraz z przydziałami do badań, wygaszenie wiszących zaproszeń,
   * zamknięcie otwartych próśb) + best-effort usunięcie kategorii/kanałów/
   * ról na serwerze Kół.
   *
   * KOLEJNOŚĆ JEST CELOWA: najpierw baza, potem Discord. W starej wersji
   * sprzątanie bazy było na końcu, więc brak dostępu do serwera Kół (bot
   * nie w cache / brak KOLA_GUILD_ID) albo jakikolwiek błąd podczas
   * usuwania ról przerywał funkcję PRZED transakcją. Efekt: koło znikało
   * z kanałów, a bot dalej myślał, że wszyscy są jego członkami - nikt nie
   * mógł założyć nowego koła ani przyjąć zaproszenia. Teraz infrastruktura
   * Discorda to tylko dodatek (guild może być nullem), a źródłem prawdy o
   * członkostwie jest baza i to ona jest sprzątana zawsze.
   *
   * @param {object|null} guild serwer Kół (KOLA_GUILD_ID) albo null
   * @param {object} kolo
   * @param {object} [opts]
   * @param {"DISSOLVED"|"REJECTED"} [opts.finalStatus]
   * @param {string} [opts.nameSuffix]
   * @returns {Promise<{members: object[], archivedName: string, discordCleaned: boolean}>}
   */
  async _teardownKolo(guild, kolo, { finalStatus = "DISSOLVED", nameSuffix = "rozwiazane" } = {}) {
    // Członków pobieramy PRZED usunięciem wpisów - wołający wysyła im DM-y.
    const members = await prisma.koloMember.findMany({ where: { koloId: kolo.id } });
    const archivedName = await this._archivedKoloName(kolo.name, kolo.id, nameSuffix);
    const researchIds = (
      await prisma.research.findMany({ where: { koloId: kolo.id }, select: { id: true } })
    ).map((r) => r.id);

    // 1) BAZA - autorytatywne "kto jest w kole". Jedna transakcja, żeby nie
    //    został stan pośredni (np. członkowie usunięci, ale status stary).
    await prisma.$transaction([
      prisma.kolo.update({
        where: { id: kolo.id },
        data: { status: finalStatus, name: archivedName, belowMinSince: null },
      }),
      prisma.koloMember.deleteMany({ where: { koloId: kolo.id } }),
      ...(researchIds.length > 0
        ? [prisma.researchMember.deleteMany({ where: { researchId: { in: researchIds } } })]
        : []),
      prisma.koloInvite.updateMany({ where: { koloId: kolo.id, status: "PENDING" }, data: { status: "EXPIRED" } }),
      prisma.koloChangeRequest.updateMany({ where: { koloId: kolo.id, status: "PENDING_REVIEW" }, data: { status: "REJECTED" } }),
    ]);

    // 1b) PANELE DM - koła już nie ma, więc jego panele nie będą nigdy
    //     odświeżane (refreshPanels chodzi tylko po żywych członkach).
    //     Bez tego wpisy zostawałyby w pamięci procesu na zawsze.
    //     Kolo.panelMessageId zostaje w bazie celowo: to historia, a martwe
    //     koło i tak nie jest nigdzie odświeżane.
    for (const key of [...panelMessages.keys()]) {
      if (key.startsWith(`${kolo.id}:`)) panelMessages.delete(key);
    }

    // 2) DISCORD - best-effort. Koło w PENDING_MEMBERS/REJECTED nie ma tu
    //    nic (wszystkie ID są null), więc pętle po prostu nic nie robią.
    let discordCleaned = false;
    if (guild) {
      try {
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
        discordCleaned = true;
      } catch (err) {
        // Baza jest już posprzątana - to tylko estetyka po stronie Discorda.
        await logError("koloService", "TEARDOWN_DISCORD_ERROR", err.message, { koloId: kolo.id, finalStatus, stack: err.stack });
      }
    } else if (kolo.categoryId || kolo.roleIdDivider || kolo.channelChat || kolo.channelManage) {
      // Koło miało infrastrukturę, a nie ma jak jej usunąć - baza jest
      // czysta (nikt już w nim nie figuruje), ale kanały/role zostaną na
      // serwerze, dopóki ktoś ich nie skasuje ręcznie.
      await logError(
        "koloService",
        "TEARDOWN_NO_KOLA_GUILD",
        "Serwer Kół Naukowych niedostępny - członkostwa i status wyczyszczone w bazie, ale kanały/role koła mogły zostać (do ręcznego usunięcia).",
        { koloId: kolo.id, finalStatus },
        "WARNING"
      );
    }

    return { members, archivedName, discordCleaned };
  }

  /**
   * Pełne rozwiązanie/odrzucenie koła: baza + Discord + DM do WSZYSTKICH
   * członków + wpis w ActionLog. Wspólny punkt dla każdej ścieżki kończącej
   * życie koła (zgoda admina na rozwiązanie, auto-rozwiązanie po 72h,
   * auto-odrzucenie zgłoszenia bez kompletu, wycofanie zgłoszenia przez
   * lidera), żeby żadna z nich nie zostawiła ludzi w nieistniejącym kole.
   *
   * @param {object} client
   * @param {object} kolo
   * @param {object} [opts]
   * @param {"DISSOLVED"|"REJECTED"} [opts.finalStatus]
   * @param {string} [opts.nameSuffix]
   * @param {string|null} [opts.dmText] treść DM do każdego (byłego) członka
   * @param {string} [opts.actorId]
   * @param {string} [opts.action]
   */
  async _dissolveKolo(client, kolo, { finalStatus = "DISSOLVED", nameSuffix = "rozwiazane", dmText = null, actorId = "system", action = "kolo_auto_dissolved" } = {}) {
    const guild = getKolaGuild(client);
    const result = await this._teardownKolo(guild, kolo, { finalStatus, nameSuffix });

    if (dmText) {
      for (const m of result.members) {
        const user = await client.users.fetch(m.userId).catch(() => null);
        await user?.send(dmText).catch(() => null);
      }
    }

    await logAction(action, actorId, kolo.id, {
      name: kolo.name,
      finalStatus,
      freedMembers: result.members.map((m) => m.userId),
      discordCleaned: result.discordCleaned,
    });
    return result;
  }

  // handleChangeReview obsługuje NAME/LOGO/LEADER/NEW_ROLE; DISSOLVE ma inny efekt (usuwanie),
  // więc łapiemy go osobno zanim trafi do generycznej ścieżki powyżej.
  async handleChangeReviewDispatch(interaction, requestId, approve) {
    const request = await prisma.koloChangeRequest.findUnique({ where: { id: requestId }, include: { kolo: true } });
    if (request?.type === "DISSOLVE") {
      await interaction.deferUpdate();
      // Recenzja zgłoszeń koła: dowolna ranga moderacyjna (Młodszy Moderator
      // i wyżej) albo stary klucz MODERATE.
      if (!(await hasAnyPermission(interaction.member, KEY_SETS.MODERATION))) {
        return interaction.followUp({ content: "❌ Nie masz uprawnień.", ephemeral: true });
      }
      if (request.status !== "PENDING_REVIEW") {
        return interaction.followUp({ content: "❌ Ta prośba została już rozpatrzona.", ephemeral: true });
      }
      if (DEAD_KOLO_STATUSES.includes(request.kolo?.status)) {
        // Koło zdążyło zakończyć żywot inną drogą (np. auto-odrzucenie po
        // 72h) - zamykamy tylko samą prośbę i zdejmujemy przyciski.
        await prisma.koloChangeRequest.update({ where: { id: requestId }, data: { status: "REJECTED" } });
        return interaction.editReply({ components: [] });
      }

      await prisma.koloChangeRequest.update({ where: { id: requestId }, data: { status: approve ? "APPROVED" : "REJECTED" } });
      if (approve) {
        await this._dissolveKolo(interaction.client, request.kolo, {
          finalStatus: "DISSOLVED",
          nameSuffix: "rozwiazane",
          dmText:
            `💥 Koło **${request.kolo.name}** zostało rozwiązane przez administrację. ` +
            "Nie należysz już do żadnego koła - możesz założyć nowe albo przyjąć zaproszenie do istniejącego.",
          actorId: interaction.user.id,
          action: "kolo_dissolved",
        });
      }
      return interaction.editReply({ components: [] });
    }
    return this.handleChangeReview(interaction, requestId, approve);
  }

  // ==================== BADANIA ====================

  _capacityRequirementFor(nextActiveCount) {
    return RESEARCH_CAPACITY[nextActiveCount] ?? null;
  }

  /**
   * Wspólny rdzeń rozpoczynania badania - menu zarządzania i panel DM.
   * Zwraca tekst odpowiedzi.
   */
  async _startResearchCore(client, kolo, requestedById, topicInput) {
    const koloId = kolo.id;
    const activeCount = await prisma.research.count({ where: { koloId, status: { in: ["ACTIVE", "PAUSED"] } } });
    const nextCount = activeCount + 1;
    if (nextCount > MAX_CONCURRENT_RESEARCH) {
      return `❌ Koło może prowadzić maksymalnie ${MAX_CONCURRENT_RESEARCH} badania naraz.`;
    }
    const required = this._capacityRequirementFor(nextCount);
    const memberCount = await prisma.koloMember.count({ where: { koloId } });
    if (required !== null && memberCount < required) {
      return `❌ Do prowadzenia ${nextCount}. jednoczesnego badania koło potrzebuje min. ${required} osób (ma ${memberCount}).`;
    }

    // Duplikat: to samo badanie już trwa albo czeka na decyzję.
    const duplicate = await prisma.research.findFirst({
      where: { koloId, topic: { equals: topicInput, mode: "insensitive" }, status: { in: ["ACTIVE", "PAUSED", "PENDING_REVIEW"] } },
    });
    if (duplicate) return `❌ Badanie **${duplicate.topic}** już trwa lub czeka na decyzję.`;

    // Dopasowanie oficjalnego tematu case-insensitive (inna wielkość liter
    // nie powinna spychać tematu na ścieżkę "własny do akceptacji").
    const officialTopic = await prisma.researchTopic.findFirst({ where: { title: { equals: topicInput, mode: "insensitive" }, active: true } });

    if (officialTopic) {
      const research = await prisma.research.create({
        data: { koloId, topic: officialTopic.title, isCustomTopic: false, status: "ACTIVE", startedAt: new Date() },
      });
      await this._postResearchUpdate(client, kolo, research);
      await logAction("kolo_research_started", requestedById, koloId, { researchId: research.id, topic: officialTopic.title });
      // Nowe badanie = aktywność koła (kasuje licznik bezczynności).
      await this._noteActivity(koloId);
      await this.refreshPanels(client, koloId);
      return `✅ Rozpoczęto badanie: **${officialTopic.title}**.`;
    }

    const ai = await this._aiScore("wlasny_temat_badania", `Koło: ${kolo.name}\nProponowany temat: ${topicInput}`);
    const research = await prisma.research.create({
      data: { koloId, topic: topicInput, isCustomTopic: true, status: "PENDING_REVIEW", aiScore: ai.score, aiAnalysis: ai },
    });
    await logAction("kolo_research_proposed", requestedById, koloId, { researchId: research.id, topic: topicInput });

    const channel = await this._getReviewChannel(client);
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle("🔬 Propozycja własnego tematu badania")
        .addFields(
          { name: "Koło", value: kolo.name, inline: true },
          { name: "Temat", value: topicInput.slice(0, 1000) },
          { name: "AI Score", value: `${Math.round(ai.score * 100)}%` }
        )
        .setColor(0xd69e2e).setFooter({ text: "Uniwersytet Centralny RP • Koła Naukowe" }).setTimestamp();
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`kolo_research_approve:${research.id}`).setLabel("✅ Zaakceptuj").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`kolo_research_reject:${research.id}`).setLabel("❌ Odrzuć").setStyle(ButtonStyle.Danger)
      );
      await channel.send({ embeds: [embed], components: [row] });
    }

    return "✅ Własny temat wysłany do oceny AI i administracji. Poczekaj na decyzję.";
  }

  async handleStartResearchModalSubmit(interaction, koloId) {
    await interaction.deferReply({ ephemeral: true });
    const managed = await this._requireManager(interaction.user.id, koloId);
    if (!managed) return interaction.editReply({ content: "❌ Musisz być liderem lub wiceliderem tego koła." });
    const topicInput = interaction.fields.getTextInputValue("temat").trim();
    const message = await this._startResearchCore(interaction.client, managed.kolo, interaction.user.id, topicInput);
    return interaction.editReply({ content: message });
  }

  async handleResearchReview(interaction, researchId, approve) {
    await interaction.deferUpdate();
    try {
      // Recenzja zgłoszeń koła: dowolna ranga moderacyjna (Młodszy Moderator
      // i wyżej) albo stary klucz MODERATE.
      if (!(await hasAnyPermission(interaction.member, KEY_SETS.MODERATION))) {
        return interaction.followUp({ content: "❌ Nie masz uprawnień.", ephemeral: true });
      }
      const research = await prisma.research.findUnique({ where: { id: researchId }, include: { kolo: true } });
      if (!research || research.status !== "PENDING_REVIEW") {
        return interaction.followUp({ content: "❌ To zgłoszenie zostało już rozpatrzone.", ephemeral: true });
      }
      if (DEAD_KOLO_STATUSES.includes(research.kolo?.status)) {
        // Koło zdążyło zostać odrzucone/rozwiązane - jego badania nie mają
        // już gdzie żyć (kanały i członkowie zniknęli).
        await prisma.research.update({ where: { id: researchId }, data: { status: "REJECTED" } });
        return interaction.editReply({ components: [] });
      }

      const updated = await prisma.research.update({
        where: { id: researchId },
        data: approve ? { status: "ACTIVE", startedAt: new Date() } : { status: "REJECTED" },
      });

      if (approve) {
        await this._postResearchUpdate(interaction.client, research.kolo, updated);
        // Zatwierdzenie własnego tematu to rozpoczęte badanie, czyli aktywność
        // koła - tak samo jak start badania z oficjalnej listy.
        await this._noteActivity(research.koloId);
        await this.refreshPanels(interaction.client, research.koloId);
      }

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
    // (Usunięto martwe zapytanie o ResearchTopic.description - model nie ma
    // takiego pola, więc warunek nigdy nie był prawdziwy.)

    const embed = new EmbedBuilder()
      .setTitle(`🔬 ${research.topic}`.slice(0, 256))
      .addFields(
        { name: "Status", value: this._researchStatusLabel(research.status), inline: true },
        { name: "Przydzieleni", value: members.length ? members.map((m) => `<@${m.userId}>`).join(", ").slice(0, 1000) : "Brak", inline: true }
      )
      .setColor(kolo.colorHex || 0x2b6cb0)
      .setFooter({ text: `${research.isCustomTopic ? "Własny temat" : "Temat z listy oficjalnej"} • Uniwersytet Centralny RP` }).setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => null);
  }

  _researchStatusLabel(status) {
    return { ACTIVE: "🟢 Aktywne", PAUSED: "⏸️ Zatrzymane", COMPLETED: "✅ Zakończone", REJECTED: "❌ Odrzucone", PENDING_REVIEW: "⏳ Do oceny" }[status] || status;
  }

  /**
   * @param {string} [researchIdOverride] ID badania podane wprost. Konieczne
   *   dla ścieżki przyciskowej (handleResearchAction) - przycisk NIE ma
   *   interaction.values, więc bez tego researchId byłoby undefined i każda
   *   akcja kończyła się "Nie znaleziono badania".
   */
  async handleResearchPickSelect(interaction, action, koloId, extra, researchIdOverride = null) {
    await interaction.deferUpdate();
    const managed = await this._requireManager(interaction.user.id, koloId);
    if (!managed) return interaction.editReply({ content: "❌ Musisz być liderem lub wiceliderem tego koła.", components: [] });
    const researchId = researchIdOverride || interaction.values[0];
    const research = await prisma.research.findUnique({ where: { id: researchId }, include: { kolo: true } });
    if (!research || research.koloId !== koloId) return interaction.editReply({ content: "❌ Nie znaleziono badania.", components: [] });

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

    if (action === "complete_research") {
      if (!["ACTIVE", "PAUSED"].includes(research.status)) {
        return interaction.editReply({ content: "❌ Tylko prowadzone badanie można zakończyć.", components: [] });
      }
      const completed = await prisma.research.update({
        where: { id: researchId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      await this._postResearchUpdate(interaction.client, research.kolo, completed);
      await logAction("kolo_research_completed", interaction.user.id, koloId, { researchId, topic: research.topic });
      // Ukończone badanie to najmocniejszy dowód aktywności koła.
      await this._noteActivity(koloId);
      await this.refreshPanels(interaction.client, koloId);
      return interaction.editReply({ content: `✅ Badanie **${research.topic}** zakończone.`, components: [] });
    }

    // Wybór badania z panelu DM: pokazujemy dostępne akcje dla tego badania.
    if (action === "dm_pick") {
      const canComplete = ["ACTIVE", "PAUSED"].includes(research.status);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`kolo_research_action:pause:${researchId}`)
          .setLabel("Zatrzymaj")
          .setEmoji("⏸️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(research.status !== "ACTIVE"),
        new ButtonBuilder()
          .setCustomId(`kolo_research_action:resume:${researchId}`)
          .setLabel("Wznów")
          .setEmoji("▶️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(research.status !== "PAUSED"),
        new ButtonBuilder()
          .setCustomId(`kolo_research_action:complete:${researchId}`)
          .setLabel("Zakończ")
          .setEmoji("🏁")
          .setStyle(ButtonStyle.Success)
          .setDisabled(!canComplete),
        new ButtonBuilder()
          .setCustomId(`kolo_research_action:assign:${researchId}`)
          .setLabel("Przydziel osobę")
          .setEmoji("🧑‍🔬")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!canComplete)
      );
      const assigned = await prisma.researchMember.findMany({ where: { researchId }, select: { userId: true } });
      return interaction.editReply({
        content:
          `**${research.topic}** — ${this._researchStatusLabel(research.status)}\n` +
          (assigned.length > 0 ? `Przydzieleni: ${assigned.map((m) => `<@${m.userId}>`).join(", ")}` : "_Brak przydzielonych osób._"),
        components: [row],
      });
    }
  }

  /**
   * Przyciski akcji badania z panelu DM (kolo_research_action:akcja:badanieId).
   * Te same operacje co w kanale ⚒️zarządzaj-kołem, tylko wywołane z DM.
   */
  async handleResearchAction(interaction, action, researchId) {
    await interaction.deferUpdate();
    try {
      const research = await prisma.research.findUnique({ where: { id: researchId }, include: { kolo: true } });
      if (!research) return interaction.editReply({ content: "❌ Nie znaleziono badania.", components: [] });
      const managed = await this._requireManager(interaction.user.id, research.koloId);
      if (!managed) return interaction.editReply({ content: "❌ Musisz być liderem lub wiceliderem tego koła.", components: [] });

      // researchId przekazujemy wprost - patrz researchIdOverride.
      if (action === "pause" || action === "resume") {
        return this.handleResearchPickSelect(interaction, `${action}_research`, research.koloId, null, researchId);
      }
      if (action === "complete") {
        return this.handleResearchPickSelect(interaction, "complete_research", research.koloId, null, researchId);
      }
      if (action === "assign") {
        const select = new UserSelectMenuBuilder()
          .setCustomId(`kolo_manage_target:assign_research_direct:${researchId}`)
          .setPlaceholder("Kogo przydzielić do badania?")
          .setMinValues(1)
          .setMaxValues(1);
        return interaction.editReply({ content: "Wybierz osobę:", components: [new ActionRowBuilder().addComponents(select)] });
      }
      return interaction.editReply({ content: "❌ Nieznana akcja.", components: [] });
    } catch (err) {
      await logError("koloService", "RESEARCH_ACTION_ERROR", err.message, { action, researchId, stack: err.stack });
      return interaction.editReply({ content: "❌ Błąd serwera.", components: [] }).catch(() => null);
    }
  }

  // ==================== PANEL NA DM (zarząd + członkowie) ====================
  //
  // Komenda /kolo została usunięta - całe zarządzanie kołem odbywa się przez
  // przyciski na DM albo przez menu w kanale ⚒️zarządzaj-kołem na serwerze
  // Kół. Obie drogi wołają TE SAME rdzenie (_inviteCore, _kickCore,
  // _leaveCore, _dissolveRequestCore, _createChangeRequest,
  // _startResearchCore), więc reguły są identyczne niezależnie od tego,
  // którędy kliknięto.
  //
  // Panel to JEDNA wiadomość na osobę, edytowana w miejscu (nie nowa przy
  // każdej zmianie): panel lidera trzymany trwale w Kolo.panelMessageId
  // (przeżywa restart bota, scheduler go odświeża i dosyła, gdy zniknie),
  // panele pozostałych osób w mapie panelMessages.

  /**
   * Koło, do którego można zapraszać: aktywne LUB w trakcie zbierania
   * członków (lider doprasza brakujące osoby po odrzutach).
   */
  async _getInvitableKolo(userId) {
    return this._findLiveMembership(userId, {
      roles: ["LEADER", "VICE_LEADER"],
      statuses: ["ACTIVE", "PENDING_MEMBERS"],
    });
  }

  /** To samo co _requireManager, ale dopuszcza zgłoszenie w PENDING_MEMBERS. */
  async _requireInvitableManager(userId, koloId) {
    return this._findLiveMembership(userId, {
      roles: ["LEADER", "VICE_LEADER"],
      koloId,
      statuses: ["ACTIVE", "PENDING_MEMBERS"],
    });
  }

  _koloStatusLabel(status) {
    return (
      {
        PENDING_MEMBERS: "⏳ Zgłoszenie - zbieranie członków",
        PENDING_REVIEW: "🧾 Czeka na decyzję administracji",
        ACTIVE: "🟢 Aktywne",
        REJECTED: "❌ Odrzucone",
        DISSOLVED: "💥 Rozwiązane",
      }[status] || status
    );
  }

  /** "2 dni" / "5 h" / "40 min" - ile zostało do wygaśnięcia zaproszenia. */
  _inviteTimeLeft(expiresAt) {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return "wygasło";
    const hours = Math.floor(ms / 3_600_000);
    if (hours >= 24) return `${Math.floor(hours / 24)} dni`;
    if (hours >= 1) return `${hours} h`;
    return `${Math.max(1, Math.round(ms / 60_000))} min`;
  }

  /** Wspólny zestaw danych do panelu (jedno zapytanie mniej na odświeżenie). */
  async _panelData(koloId) {
    const [kolo, members, invites, researches] = await Promise.all([
      prisma.kolo.findUnique({ where: { id: koloId } }),
      prisma.koloMember.findMany({ where: { koloId } }),
      prisma.koloInvite.findMany({ where: { koloId }, orderBy: { createdAt: "desc" } }),
      prisma.research.findMany({ where: { koloId }, orderBy: { createdAt: "desc" }, take: 10 }),
    ]);
    return { kolo, members, invites, researches };
  }

  /**
   * Panel zarządu (lider/wicelider). Treść i przyciski zależą od statusu:
   *  - PENDING_MEMBERS: czekamy na akceptacje -> zaproś / cofnij zaproszenie /
   *    wycofaj zgłoszenie (to jest ten panel, który lider widzi "w trakcie
   *    oczekiwania aż osoby zaakceptują zaproszenie"),
   *  - PENDING_REVIEW: administracja decyduje -> tylko podgląd,
   *  - ACTIVE: pełne zarządzanie (to samo menu co w ⚒️zarządzaj-kołem).
   */
  async _buildLeaderPanel(koloId) {
    const { kolo, members, invites, researches } = await this._panelData(koloId);
    if (!kolo) return null;

    const pending = invites.filter((i) => i.status === "PENDING" && new Date(i.expiresAt) > new Date());
    const accepted = invites.filter((i) => i.status === "ACCEPTED");
    const declined = invites.filter((i) => i.status === "DECLINED").length;
    const expired = invites.filter((i) => i.status === "EXPIRED").length;
    const minRequired = MIN_INVITED + 1;

    const inviteLines =
      pending.length > 0
        ? pending.map((i) => `⏳ <@${i.userId}> — jeszcze ${this._inviteTimeLeft(i.expiresAt)}`).join("\n")
        : "_Brak oczekujących zaproszeń._";

    const desc = [
      `**Status:** ${this._koloStatusLabel(kolo.status)}`,
      `**Członkowie:** ${members.length}/${minRequired} min. (limit ${MAX_MEMBERS})`,
      "",
      "**Zaproszenia oczekujące:**",
      inviteLines,
      "",
      `✅ zaakceptowane: **${accepted.length}** • ❌ odrzucone: **${declined}** • ⌛ wygasłe: **${expired}**`,
    ];

    if (kolo.status === "PENDING_MEMBERS") {
      const missing = Math.max(0, minRequired - members.length);
      desc.push(
        "",
        missing > 0
          ? `⚠️ Brakuje **${missing}** osób, żeby zgłoszenie trafiło do oceny. ` +
              (kolo.belowMinSince
                ? `Licznik 72h już biegnie — po jego upływie zgłoszenie zostanie automatycznie odrzucone.`
                : "Dopóki wiszą zaproszenia, licznik 72h nie tyka.")
          : "✅ Komplet zebrany — zgłoszenie idzie do oceny AI i administracji."
      );
    }

    const researchLines = researches
      .filter((r) => ["ACTIVE", "PAUSED", "PENDING_REVIEW"].includes(r.status))
      .map((r) => `${this._researchStatusLabel(r.status)} ${r.topic}`);
    if (researchLines.length > 0) desc.push("", "**Badania:**", ...researchLines.slice(0, 5));

    const embed = new EmbedBuilder()
      .setTitle(`🔬 Panel koła — ${kolo.name}`.slice(0, 256))
      .setDescription(desc.join("\n").slice(0, 4000))
      .setColor(kolo.colorHex || 0x2b6cb0)
      .setFooter({ text: "Uniwersytet Centralny RP • Koła Naukowe • panel odświeża się sam" })
      .setTimestamp();
    if (kolo.logoUrl) embed.setThumbnail(kolo.logoUrl);

    // PENDING_REVIEW: decyduje administracja, więc zarząd nie ma tu nic do
    // klikania. Przyciski zapraszania NIE mogą zostać - handler
    // (_requireInvitableManager) dopuszcza tylko ACTIVE/PENDING_MEMBERS,
    // więc byłyby widoczne, ale martwe (klik zwracałby mylący błąd).
    const refreshButton = new ButtonBuilder()
      .setCustomId(`kolo_panel_refresh:${kolo.id}`)
      .setLabel("Odśwież")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Secondary);

    const rows = [];
    if (kolo.status === "PENDING_REVIEW") {
      desc.push("", "🧾 Zgłoszenie jest u administracji - na tym etapie nie można już nic zmieniać.");
      rows.push(new ActionRowBuilder().addComponents(refreshButton));
      return { embeds: [embed], components: rows };
    }

    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`kolo_panel_invite:${kolo.id}`).setLabel("Zaproś osobę").setEmoji("📨").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`kolo_panel_revoke:${kolo.id}`).setLabel("Cofnij zaproszenie").setEmoji("↩️").setStyle(ButtonStyle.Secondary).setDisabled(pending.length === 0),
        refreshButton
      )
    );

    if (kolo.status === "PENDING_MEMBERS") {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`kolo_panel_confirm:withdraw:${kolo.id}`)
            .setLabel("Wycofaj zgłoszenie")
            .setEmoji("🚫")
            .setStyle(ButtonStyle.Danger)
        )
      );
    } else if (kolo.status === "ACTIVE") {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`kolo_panel_manage:${kolo.id}`).setLabel("Zarządzaj kołem").setEmoji("⚒️").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`kolo_panel_research:${kolo.id}`).setLabel("Badania").setEmoji("🔬").setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`kolo_panel_confirm:dissolve:${kolo.id}`)
            .setLabel("Rozwiąż koło")
            .setEmoji("💥")
            .setStyle(ButtonStyle.Danger)
        )
      );
    }

    return { embeds: [embed], components: rows };
  }

  /**
   * Panel zwykłego członka: status koła, badania z jego udziałem i wyjście.
   * Lider/wicelider dostaje panel zarządu, więc ta wersja jest dla reszty.
   */
  async _buildMemberPanel(koloId, userId) {
    const { kolo, members, researches } = await this._panelData(koloId);
    if (!kolo) return null;

    const mine = await prisma.researchMember.findMany({ where: { userId, research: { koloId } } });
    const mineIds = new Set(mine.map((m) => m.researchId));
    const myResearch = researches.filter((r) => mineIds.has(r.id));
    const role = members.find((m) => m.userId === userId)?.role || "MEMBER";

    const desc = [
      `**Status:** ${this._koloStatusLabel(kolo.status)}`,
      `**Twoja rola:** ${{ LEADER: "👑 Lider", VICE_LEADER: "🥈 Wicelider", MEMBER: "👤 Członek" }[role]}`,
      `**Członkowie:** ${members.length}`,
      "",
      "**Twoje badania:**",
      myResearch.length > 0
        ? myResearch.map((r) => `${this._researchStatusLabel(r.status)} ${r.topic}`).join("\n")
        : "_Nie jesteś przydzielony/a do żadnego badania._",
    ];

    const embed = new EmbedBuilder()
      .setTitle(`🔬 Twoje koło — ${kolo.name}`.slice(0, 256))
      .setDescription(desc.join("\n").slice(0, 4000))
      .setColor(kolo.colorHex || 0x2b6cb0)
      .setFooter({ text: "Uniwersytet Centralny RP • Koła Naukowe" })
      .setTimestamp();
    if (kolo.logoUrl) embed.setThumbnail(kolo.logoUrl);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`kolo_panel_refresh_member:${kolo.id}`).setLabel("Odśwież").setEmoji("🔄").setStyle(ButtonStyle.Secondary)
    );
    if (kolo.status === "ACTIVE") {
      row.addComponents(
        new ButtonBuilder().setCustomId(`kolo_panel_confirm:leave:${kolo.id}`).setLabel("Opuść koło").setEmoji("🚪").setStyle(ButtonStyle.Danger)
      );
    } else if (kolo.status === "PENDING_MEMBERS") {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`kolo_panel_confirm:withdraw_member:${kolo.id}`)
          .setLabel("Wycofaj się ze zgłoszenia")
          .setEmoji("🚪")
          .setStyle(ButtonStyle.Danger)
      );
    }

    return { embeds: [embed], components: [row] };
  }

  /**
   * Wyślij/odśwież panel zarządu u jednej osoby. Jedna wiadomość na koło per
   * osoba: lider ma ID zapisane w bazie (przeżywa restart), pozostali w mapie.
   * @param {boolean} [opts.forceNew] ignoruj zapisany ID i wyślij nową wiadomość
   */
  async _sendLeaderPanel(client, koloId, userId, { forceNew = false } = {}) {
    const payload = await this._buildLeaderPanel(koloId);
    if (!payload) return null;
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return null;
    const dm = await user.createDM().catch(() => null);
    if (!dm) return null;

    const key = `${koloId}:${userId}`;
    const kolo = await prisma.kolo.findUnique({ where: { id: koloId }, select: { leaderId: true, panelMessageId: true } });
    const isLeader = kolo?.leaderId === userId;
    const storedId = forceNew ? null : isLeader ? kolo?.panelMessageId : panelMessages.get(key)?.messageId || null;

    if (storedId) {
      const existing = await dm.messages.fetch(storedId).catch(() => null);
      if (existing) {
        await existing.edit(payload).catch(() => null);
        return existing;
      }
    }

    const sent = await dm.send(payload).catch(() => null);
    if (!sent) return null;
    if (isLeader) {
      await prisma.kolo.update({ where: { id: koloId }, data: { panelMessageId: sent.id } }).catch(() => null);
    } else {
      panelMessages.set(key, { channelId: dm.id, messageId: sent.id });
    }
    return sent;
  }

  /** Panel członka (albo panel zarządu, jeśli to lider/wicelider). */
  async _sendMemberPanel(client, koloId, userId) {
    const membership = await prisma.koloMember.findUnique({ where: { koloId_userId: { koloId, userId } } });
    if (!membership) return null;
    if (["LEADER", "VICE_LEADER"].includes(membership.role)) {
      return this._sendLeaderPanel(client, koloId, userId);
    }

    const payload = await this._buildMemberPanel(koloId, userId);
    if (!payload) return null;
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return null;
    const dm = await user.createDM().catch(() => null);
    if (!dm) return null;

    const key = `${koloId}:${userId}`;
    const storedId = panelMessages.get(key)?.messageId;
    if (storedId) {
      const existing = await dm.messages.fetch(storedId).catch(() => null);
      if (existing) {
        await existing.edit(payload).catch(() => null);
        return existing;
      }
    }
    const sent = await dm.send(payload).catch(() => null);
    if (sent) panelMessages.set(key, { channelId: dm.id, messageId: sent.id });
    return sent;
  }

  /**
   * Odświeża panele WSZYSTKICH członków koła (zarząd dostaje panel zarządu,
   * reszta panel członka). Wołane po każdej zmianie stanu koła i z schedulera.
   * Awaria DM jednej osoby (zablokowany bot) nie przerywa reszty.
   */
  async refreshPanels(client, koloId) {
    try {
      const members = await prisma.koloMember.findMany({ where: { koloId }, select: { userId: true } });
      const current = new Set(members.map((m) => m.userId));
      for (const userId of current) {
        await this._sendMemberPanel(client, koloId, userId).catch(() => null);
      }
      // Sprzątanie: wpisy osób, które już w kole nie są (wyszły/wyrzucone),
      // inaczej mapa rosłaby bez końca przez cały czas działania procesu.
      for (const key of [...panelMessages.keys()]) {
        if (!key.startsWith(`${koloId}:`)) continue;
        if (!current.has(key.split(":")[1])) panelMessages.delete(key);
      }
    } catch (err) {
      await logError("koloService", "PANEL_REFRESH_ERROR", err.message, { koloId, stack: err.stack });
    }
  }

  /** Router przycisków panelu DM. */
  async handlePanelButton(interaction, action, koloId) {
    await interaction.deferUpdate();
    try {
      const kolo = await prisma.kolo.findUnique({ where: { id: koloId } });
      if (!kolo || DEAD_KOLO_STATUSES.includes(kolo.status)) {
        return interaction.editReply({
          content: "❌ To koło zostało odrzucone lub rozwiązane - panel jest nieaktualny.",
          embeds: [],
          components: [],
        });
      }

      // "Odśwież" NIE może iść przed sprawdzeniem uprawnień: _sendLeaderPanel
      // sam nie weryfikuje członkostwa, więc każdy znający ID koła mógłby
      // sobie zamówić panel z listą członków i oczekujących zaproszeń.
      if (action === "refresh") {
        const managed = await this._requireInvitableManager(interaction.user.id, koloId);
        if (!managed) {
          return interaction.editReply({ content: "❌ Musisz być liderem lub wiceliderem tego koła.", components: [] });
        }
        await this._sendLeaderPanel(interaction.client, koloId, interaction.user.id, { forceNew: true });
        return interaction.editReply({ components: [] });
      }
      if (action === "refresh_member") {
        const membership = await prisma.koloMember.findUnique({
          where: { koloId_userId: { koloId, userId: interaction.user.id } },
        });
        if (!membership) {
          return interaction.editReply({ content: "❌ Nie należysz do tego koła.", components: [] });
        }
        await this._sendMemberPanel(interaction.client, koloId, interaction.user.id);
        return interaction.editReply({ components: [] });
      }

      // Akcje poniżej wymagają zarządu (lider/wicelider).
      const managed = await this._requireInvitableManager(interaction.user.id, koloId);
      if (!managed) {
        return interaction.followUp({ content: "❌ Musisz być liderem lub wiceliderem tego koła.", ephemeral: true });
      }

      if (action === "invite") {
        const select = new UserSelectMenuBuilder()
          .setCustomId(`kolo_manage_target:invite:${koloId}`)
          .setPlaceholder("Wybierz osobę do zaproszenia")
          .setMinValues(1)
          .setMaxValues(1);
        return interaction.followUp({ content: "Wybierz osobę:", components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
      }

      if (action === "revoke") {
        const pending = await prisma.koloInvite.findMany({
          where: { koloId, status: "PENDING", expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
        });
        if (pending.length === 0) return interaction.followUp({ content: "❌ Brak oczekujących zaproszeń.", ephemeral: true });
        const select = new StringSelectMenuBuilder()
          .setCustomId(`kolo_invite_revoke:${koloId}`)
          .setPlaceholder("Które zaproszenie cofnąć?")
          .addOptions(
            pending.slice(0, 25).map((i) => ({
              label: `Cofnij zaproszenie (pozostało ${this._inviteTimeLeft(i.expiresAt)})`.slice(0, 100),
              description: `Zaproszony: ${i.userId}`.slice(0, 100),
              value: i.id,
            }))
          );
        return interaction.followUp({ components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
      }

      if (action === "manage") {
        if (kolo.status !== "ACTIVE") {
          return interaction.followUp({ content: "❌ Pełne zarządzanie jest dostępne dopiero po zatwierdzeniu koła.", ephemeral: true });
        }
        return interaction.followUp({
          content: "Wybierz akcję (to samo menu co w kanale ⚒️zarządzaj-kołem):",
          components: [this.buildManageSelectRow()],
          ephemeral: true,
        });
      }

      if (action === "research") {
        if (kolo.status !== "ACTIVE") {
          return interaction.followUp({ content: "❌ Badania można prowadzić dopiero w aktywnym kole.", ephemeral: true });
        }
        const researches = await prisma.research.findMany({ where: { koloId, status: { in: ["ACTIVE", "PAUSED"] } } });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`kolo_panel_startresearch:${koloId}`)
            .setLabel("Rozpocznij badanie")
            .setEmoji("🔬")
            .setStyle(ButtonStyle.Primary)
        );
        if (researches.length > 0) {
          const select = new StringSelectMenuBuilder()
            .setCustomId(`kolo_research_pick:dm_pick:${koloId}`)
            .setPlaceholder("Wybierz badanie (zatrzymaj / wznow / zakończ / przydziel)")
            .addOptions(researches.slice(0, 25).map((r) => ({ label: r.topic.slice(0, 100), value: r.id })));
          return interaction.followUp({
            content: "Badania koła:",
            components: [row, new ActionRowBuilder().addComponents(select)],
            ephemeral: true,
          });
        }
        return interaction.followUp({ content: "Koło nie prowadzi teraz badań.", components: [row], ephemeral: true });
      }

      return interaction.followUp({ content: "❌ Nieznana akcja panelu.", ephemeral: true });
    } catch (err) {
      await logError("koloService", "PANEL_BUTTON_ERROR", err.message, { action, koloId, userId: interaction.user.id, stack: err.stack });
      return interaction.followUp({ content: "❌ Błąd serwera. Spróbuj ponownie.", ephemeral: true }).catch(() => null);
    }
  }

  /** Drugi krok akcji niszczących z panelu DM (potwierdzenie). */
  async handlePanelConfirm(interaction, action, koloId) {
    await interaction.deferUpdate();
    try {
      const kolo = await prisma.kolo.findUnique({ where: { id: koloId } });
      if (!kolo || DEAD_KOLO_STATUSES.includes(kolo.status)) {
        return interaction.editReply({ content: "❌ To koło już nie istnieje.", embeds: [], components: [] });
      }

      // Wyjście z koła - akcja ZWYKŁEGO członka (przycisk na jego panelu),
      // więc MUSI być przed sprawdzeniem zarządu. Lidera aktywnego koła i tak
      // blokuje _leaveCore ("przekaż koło albo rozwiąż").
      if (action === "leave") {
        const membership = await prisma.koloMember.findUnique({ where: { koloId_userId: { koloId, userId: interaction.user.id } } });
        if (!membership) return interaction.editReply({ content: "❌ Nie należysz do tego koła.", embeds: [], components: [] });
        const result = await this._leaveCore(interaction.client, kolo, membership, interaction.user.id);
        await this.refreshPanels(interaction.client, koloId);
        return interaction.editReply({ content: result.message, embeds: [], components: [] });
      }

      // Wycofanie się członka ze zgłoszenia - nie wymaga zarządu.
      if (action === "withdraw_member") {
        const membership = await prisma.koloMember.findUnique({ where: { koloId_userId: { koloId, userId: interaction.user.id } } });
        if (!membership) return interaction.editReply({ content: "❌ Nie należysz do tego koła.", embeds: [], components: [] });
        if (["LEADER", "VICE_LEADER"].includes(membership.role)) {
          return interaction.editReply({ content: "❌ Zarząd wycofuje zgłoszenie przyciskiem „Wycofaj zgłoszenie”.", components: [] });
        }
        if (kolo.status !== "PENDING_MEMBERS") {
          return interaction.editReply({ content: "❌ Zgłoszenie nie zbiera już członków.", components: [] });
        }
        const result = await this._leaveCore(interaction.client, kolo, membership, interaction.user.id);
        await this.refreshPanels(interaction.client, koloId);
        return interaction.editReply({ content: result.message, embeds: [], components: [] });
      }

      const managed = await this._requireInvitableManager(interaction.user.id, koloId);
      if (!managed) return interaction.editReply({ content: "❌ Musisz być liderem lub wiceliderem tego koła.", components: [] });

      if (action === "withdraw") {
        if (kolo.status !== "PENDING_MEMBERS") {
          return interaction.editReply({ content: "❌ To zgłoszenie nie czeka już na członków.", components: [] });
        }
        if (kolo.leaderId !== interaction.user.id) {
          return interaction.editReply({ content: "❌ Tylko lider może wycofać zgłoszenie.", components: [] });
        }
        await this._dissolveKolo(interaction.client, kolo, {
          finalStatus: "REJECTED",
          nameSuffix: "wycofane",
          dmText: `🚫 Lider wycofał(a) zgłoszenie koła **${kolo.name}** - koło nie powstanie. Nie należysz już do żadnego koła.`,
          actorId: interaction.user.id,
          action: "kolo_application_withdrawn",
        });
        return interaction.editReply({
          content: `✅ Zgłoszenie koła **${kolo.name}** wycofane. Nazwa jest znów wolna.`,
          embeds: [],
          components: [],
        });
      }

      if (action === "dissolve") {
        if (kolo.status !== "ACTIVE") {
          return interaction.editReply({ content: "❌ Rozwiązać można tylko aktywne koło.", components: [] });
        }
        const message = await this._dissolveRequestCore(interaction.client, kolo, interaction.user.id);
        return interaction.editReply({ content: message, components: [] });
      }


      return interaction.editReply({ content: "❌ Nieznana akcja.", components: [] });
    } catch (err) {
      await logError("koloService", "PANEL_CONFIRM_ERROR", err.message, { action, koloId, userId: interaction.user.id, stack: err.stack });
      return interaction.editReply({ content: "❌ Błąd serwera.", components: [] }).catch(() => null);
    }
  }

  /** Cofnięcie zaproszenia z panelu DM (zaproszony dostaje info, że nieaktualne). */
  async handleInviteRevokeSelect(interaction, koloId) {
    await interaction.deferUpdate();
    try {
      const managed = await this._requireInvitableManager(interaction.user.id, koloId);
      if (!managed) return interaction.editReply({ content: "❌ Musisz być liderem lub wiceliderem tego koła.", components: [] });

      const inviteId = interaction.values[0];
      const invite = await prisma.koloInvite.findUnique({ where: { id: inviteId }, include: { kolo: true } });
      if (!invite || invite.koloId !== koloId || invite.status !== "PENDING") {
        return interaction.editReply({ content: "❌ To zaproszenie zostało już rozpatrzone lub wygasło.", components: [] });
      }

      await prisma.koloInvite.update({ where: { id: inviteId }, data: { status: "EXPIRED" } });
      const invited = await interaction.client.users.fetch(invite.userId).catch(() => null);
      await invited
        ?.send(`↩️ Zaproszenie do koła **${invite.kolo.name}** zostało cofnięte przez zarząd.`)
        .catch(() => null);

      await logAction("kolo_invite_revoked", interaction.user.id, koloId, { targetId: invite.userId });
      // Cofnięte zaproszenie to mniejsza szansa na komplet - przelicz licznik.
      await this._checkMinimumMembers(interaction.client, koloId);
      await this.refreshPanels(interaction.client, koloId);
      return interaction.editReply({ content: `✅ Cofnięto zaproszenie dla <@${invite.userId}>.`, components: [] });
    } catch (err) {
      await logError("koloService", "INVITE_REVOKE_ERROR", err.message, { koloId, stack: err.stack });
      return interaction.editReply({ content: "❌ Błąd serwera.", components: [] }).catch(() => null);
    }
  }

  // ==================== WYJŚCIE Z KOŁA (wspólny rdzeń) ====================

  /**
   * Dobrowolne odejście z koła - wołane z panelu DM (przycisk „Opuść koło” /
   * „Wycofaj się ze zgłoszenia”). Zwraca { ok, message } zamiast odpowiadać
   * na interakcję, bo wywołujący odpowiada różnie (editReply/followUp).
   *
   *  - członek/wicelider: wychodzi z koła ACTIVE albo ze zgłoszenia w
   *    PENDING_MEMBERS (przyjął zaproszenie, ale się rozmyślił) - bez tego
   *    tkwiłby w cudzym zgłoszeniu i nie mógł dołączyć nigdzie indziej,
   *  - lider AKTYWNEGO koła: nie może (musi przekazać koło albo rozwiązać),
   *  - lider zgłoszenia w PENDING_MEMBERS: wycofuje CAŁE zgłoszenie - patrz
   *    handlePanelConfirm("withdraw").
   */
  async _leaveCore(client, kolo, membership, userId) {
    if (membership.role === "LEADER" && kolo.status === "ACTIVE") {
      return {
        ok: false,
        message:
          "❌ Lider nie może opuścić aktywnego koła. Przekaż najpierw rolę lidera (⚒️ Zarządzaj kołem → Zmień lidera) albo rozwiąż koło.",
      };
    }
    if (kolo.status === "PENDING_REVIEW") {
      return {
        ok: false,
        message: "❌ Zgłoszenie koła czeka już na decyzję administracji - nie można z niego teraz wyjść.",
      };
    }

    const isApplication = kolo.status === "PENDING_MEMBERS";
    await prisma.koloMember.delete({ where: { id: membership.id } });
    const researchIds = (await prisma.research.findMany({ where: { koloId: kolo.id }, select: { id: true } })).map((r) => r.id);
    if (researchIds.length > 0) {
      await prisma.researchMember.deleteMany({ where: { researchId: { in: researchIds }, userId } });
    }
    // Role istnieją dopiero od momentu aktywacji koła - przy zgłoszeniu w
    // PENDING_MEMBERS nie ma czego zdejmować (i nie niepokojmy serwera Kół).
    if (!isApplication) {
      const guild = getKolaGuild(client);
      if (guild) {
        const member = await guild.members.fetch(userId).catch(() => null);
        for (const roleId of [kolo.roleIdDivider, kolo.roleIdLeader, kolo.roleIdVice, kolo.roleIdMember]) {
          if (roleId) await member?.roles.remove(roleId).catch(() => null);
        }
        const customRoles = await prisma.koloCustomRole.findMany({ where: { koloId: kolo.id } });
        for (const cr of customRoles) await member?.roles.remove(cr.roleId).catch(() => null);
      }
    }
    await this._checkMinimumMembers(client, kolo.id);
    await logAction("kolo_member_left", userId, kolo.id, { koloStatus: kolo.status });
    return {
      ok: true,
      message: isApplication
        ? `✅ Wypisałeś(aś) się ze zgłoszenia koła **${kolo.name}**. Nie należysz już do żadnego koła.`
        : `✅ Opuściłeś koło **${kolo.name}**.`,
    };
  }

  // ==================== POMOCNICZE ====================

  /**
   * Wspólny licznik "poniżej minimum" (Kolo.belowMinSince) - dotyczy i
   * AKTYWNYCH kół, i ZGŁOSZEŃ zbierających członków:
   *   - ACTIVE: ktoś odpadł (wyrzucenie/opuszczenie) i jest mniej niż
   *     lider + 3 osoby,
   *   - PENDING_MEMBERS: zaproszeni odrzucili zaproszenia albo pozwolili im
   *     wygasnąć, więc komplet się nie zebrał.
   * Dopóki wiszą ważne zaproszenia (PENDING_MEMBERS), licznik nie tyka -
   * jest jeszcze szansa na komplet. Gdy wystartuje, lider ma 72h na
   * doproszenie kogoś, a potem koloScheduler kończy koło (ACTIVE ->
   * DISSOLVED, PENDING_MEMBERS -> REJECTED) i czyści członkostwa, więc nikt
   * nie zostaje "w kole", którego już nie ma.
   */
  async _checkMinimumMembers(client, koloId) {
    const kolo = await prisma.kolo.findUnique({ where: { id: koloId }, include: { members: true } });
    if (!kolo || !["ACTIVE", "PENDING_MEMBERS"].includes(kolo.status)) return;

    const minRequired = MIN_INVITED + 1; // lider + min. 3
    const clearCounter = async () => {
      if (kolo.belowMinSince) await prisma.kolo.update({ where: { id: koloId }, data: { belowMinSince: null } });
    };

    if (kolo.members.length >= minRequired) {
      await clearCounter();
      return;
    }

    if (kolo.status === "PENDING_MEMBERS") {
      const liveInvites = await prisma.koloInvite.count({
        where: { koloId, status: "PENDING", expiresAt: { gt: new Date() } },
      });
      if (liveInvites > 0) {
        await clearCounter();
        return;
      }
    }

    if (!kolo.belowMinSince) {
      await prisma.kolo.update({ where: { id: koloId }, data: { belowMinSince: new Date() } });
      const leader = await client.users.fetch(kolo.leaderId).catch(() => null);
      await leader
        ?.send(
          kolo.status === "PENDING_MEMBERS"
            ? `⚠️ Zgłoszenie koła **${kolo.name}** nie zebrało wymaganej liczby członków (${kolo.members.length}/${minRequired}). ` +
              "Masz 72h, żeby doprosić brakujące osoby (przycisk 📨 Zaproś osobę na Twoim panelu koła na DM) - " +
              "inaczej zgłoszenie zostanie automatycznie odrzucone, a wszyscy (łącznie z Tobą) zostaną z niego zwolnieni."
            : `⚠️ Koło **${kolo.name}** spadło poniżej wymaganego minimum (${minRequired} osób). ` +
              "Masz 72h, aby uzupełnić braki (📨 Zaproś osobę na panelu koła na DM albo w kanale ⚒️zarządzaj-kołem), " +
              "inaczej koło zostanie automatycznie rozwiązane."
        )
        .catch(() => null);
      // Panel lidera ma pokazać, że licznik 72h już tyka.
      await this._sendLeaderPanel(client, koloId, kolo.leaderId).catch(() => null);
    }
  }

  // ==================== WYMÓG AKTYWNOŚCI ====================

  /**
   * Zaznacza, że w kole "coś się wydarzyło" - kasuje licznik bezczynności
   * i ewentualne ostrzeżenie. Wołane przy: starcie badania, akceptacji
   * własnego tematu, zakończeniu badania i dołączeniu nowego członka
   * (patrz _checkActivityRequirement).
   */
  async _noteActivity(koloId) {
    await prisma.kolo
      .update({ where: { id: koloId }, data: { lastActivityAt: new Date(), inactivityWarnedAt: null } })
      .catch(() => null);
  }

  /**
   * Cel utrzymania koła: aktywne koło musi co GeneralConfig.koloInactivityDays
   * dni wykazać jakąś aktywność (nowe/ukończone badanie albo nowy członek).
   *  - brak aktywności ponad limit -> ostrzeżenie DM do zarządu i członków
   *    (Kolo.inactivityWarnedAt),
   *  - kolejne 72h bez reakcji -> auto-rozwiązanie (DISSOLVED).
   * Limit 0 (albo brak pola w bazie sprzed migracji) wyłącza wymóg.
   *
   * @returns {Promise<"ok"|"warned"|"dissolved">}
   */
  async _checkActivityRequirement(client, kolo) {
    if (kolo.status !== "ACTIVE") return "ok";

    const cfg = await prisma.generalConfig.findUnique({ where: { id: "singleton" } });
    const days = cfg?.koloInactivityDays ?? DEFAULT_INACTIVITY_DAYS;
    if (!days || days <= 0) return "ok"; // wymóg wyłączony

    const since = kolo.lastActivityAt || kolo.createdAt;
    const idleMs = Date.now() - new Date(since).getTime();
    if (idleMs < days * 24 * 60 * 60 * 1000) {
      // Koło wróciło do życia - skasuj ewentualne ostrzeżenie.
      if (kolo.inactivityWarnedAt) {
        await prisma.kolo.update({ where: { id: kolo.id }, data: { inactivityWarnedAt: null } }).catch(() => null);
      }
      return "ok";
    }

    if (!kolo.inactivityWarnedAt) {
      await prisma.kolo.update({ where: { id: kolo.id }, data: { inactivityWarnedAt: new Date() } });
      const members = await prisma.koloMember.findMany({ where: { koloId: kolo.id }, select: { userId: true } });
      const idleDays = Math.floor(idleMs / (24 * 60 * 60 * 1000));
      const text =
        `⚠️ Koło **${kolo.name}** nie wykazało żadnej aktywności od ${idleDays} dni (limit: ${days}). ` +
        "Masz 72h, żeby rozpocząć lub zakończyć badanie albo przyjąć nowego członka " +
        "(panel koła na DM → 🔬 Badania / 📨 Zaproś osobę) - inaczej koło zostanie automatycznie rozwiązane.";
      for (const m of members) {
        const user = await client.users.fetch(m.userId).catch(() => null);
        await user?.send(text).catch(() => null);
      }
      await logAction("kolo_inactivity_warning", "system", kolo.id, { idleDays, limitDays: days });
      return "warned";
    }

    const warnedMs = Date.now() - new Date(kolo.inactivityWarnedAt).getTime();
    if (warnedMs < INACTIVITY_WARNING_GRACE_MS) return "warned";

    await this._dissolveKolo(client, kolo, {
      finalStatus: "DISSOLVED",
      nameSuffix: "nieaktywne",
      dmText:
        `💥 Koło **${kolo.name}** zostało rozwiązane z powodu braku aktywności ` +
        `(72h po ostrzeżeniu nic się w nim nie wydarzyło). Nie należysz już do żadnego koła: ` +
        "możesz założyć nowe albo przyjąć zaproszenie do istniejącego.",
      action: "kolo_auto_dissolved_inactivity",
    });
    return "dissolved";
  }

  // ==================== UPRAWNIENIA NA SERWERZE KÓŁ ====================

  /**
   * Nadaje zarządowi koła realne uprawnienia na serwerze Kół: lider jest
   * administratorem WŁASNEJ kategorii (kanały, role, wiadomości), wicelider
   * moderatorem. Dzięki temu koło samo ogarnia swoją przestrzeń bez
   * czekania na administrację serwera.
   *
   * Nadpisywania ustawiamy PER ROLA (channel.permissionOverwrites.edit),
   * a nie całym obiektem - `channels.edit({ permissionOverwrites })`
   * zastąpiłoby całą listę i skasowało m.in. `everyone: DENY ViewChannel`,
   * czyli otworzyłoby prywatne kanały koła dla całego serwera.
   *
   * Idempotentne: wołane przy aktywacji koła i raz na proces dla kół
   * założonych wcześniej (patrz permsAppliedKola + koloScheduler).
   */
  async _applyKoloPermissions(guild, kolo) {
    if (!guild || !kolo.categoryId || !kolo.roleIdLeader) return false;

    const applyTo = async (channel) => {
      if (!channel) return;
      if (kolo.roleIdLeader) {
        await channel.permissionOverwrites.edit(kolo.roleIdLeader, { allow: LEADER_ALLOW, deny: [] }).catch(() => null);
      }
      if (kolo.roleIdVice) {
        await channel.permissionOverwrites.edit(kolo.roleIdVice, { allow: VICE_ALLOW, deny: [] }).catch(() => null);
      }
    };

    const category = await guild.channels.fetch(kolo.categoryId).catch(() => null);
    if (!category) return false;
    await applyTo(category);

    const children = category.children?.cache;
    if (children?.size) {
      for (const child of children.values()) await applyTo(child);
    } else {
      // Kategorie tworzone przez bota mają dzieci w cache, ale na wszelki
      // wypadek (partial cache) przechodzimy po znanych ID kanałów.
      for (const channelId of [
        kolo.channelAnnouncements,
        kolo.channelChat,
        kolo.channelResearch,
        kolo.channelManage,
        kolo.channelDocuments,
        kolo.channelVoice,
      ]) {
        if (!channelId) continue;
        await applyTo(await guild.channels.fetch(channelId).catch(() => null));
      }
    }

    permsAppliedKola.add(kolo.id);
    return true;
  }

  /** Koła, którym w tym procesie nadano już uprawnienia (patrz wyżej). */
  _isPermsApplied(koloId) {
    return permsAppliedKola.has(koloId);
  }

}

module.exports = new KoloService();
