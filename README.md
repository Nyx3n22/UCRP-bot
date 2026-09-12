# Uniwersytet Warszawski RP — Bot Discord + Dashboard

> Dashboard ma teraz działającą implementację (nie tylko szkielet) — logowanie Discord OAuth2, wszystkie strony konfiguracyjne opisane w sekcji "Strony" pliku [`dashboard/README.md`](dashboard/README.md). Uruchomienie i architektura Dashboardu opisane tam, nie tutaj.

Architektura: **monorepo** z dwoma niezależnie deployowalnymi aplikacjami dzielącymi jedną bazę danych przez Prisma.

```
uwrp-bot/
├── prisma/
│   └── schema.prisma              # jedno źródło prawdy dla bota i dashboardu
│
├── bot/                            # discord.js v14 (Node.js) — worker
│   ├── src/
│   │   ├── index.js                # bootstrap klienta, rejestracja handlerów
│   │   ├── deployCommands.js       # `npm run deploy` — idempotentna rejestracja komend slash
│   │   ├── config/
│   │   │   ├── env.js               # walidacja zmiennych środowiskowych (zod)
│   │   │   └── roles.js             # klucze uprawnień, hierarchia rang, przegródki
│   │   ├── commands/
│   │   │   ├── rp/
│   │   │   │   ├── postac.js        # /postac
│   │   │   │   ├── legitymacja.js   # /legitymacja (Canvas)
│   │   │   │   └── indeks.js        # /indeks
│   │   │   ├── academic/
│   │   │   │   ├── sylabus.js       # /sylabus
│   │   │   │   ├── egzamin.js       # /egzamin start|stop|wyniki
│   │   │   │   └── usos.js          # /usos - panel dopasowany do roli (bez podkomend)
│   │   │   └── admin/
│   │   │       ├── moderacja.js     # ban/kick/mute/clear
│   │   │       └── ogloszenie.js
│   │   ├── events/
│   │   │   ├── ready.js
│   │   │   ├── interactionCreate.js
│   │   │   ├── guildMemberAdd.js    # autorole + start weryfikacji
│   │   │   ├── guildMemberUpdate.js # dynamiczna synchronizacja ról -> profil
│   │   │   └── messageCreate.js     # automod AI + bramka AI (kredyty)
│   │   ├── services/
│   │   │   ├── aiCreditService.js   # logika kredytów AI
│   │   │   ├── aiGatewayService.js  # wywołania do Claude/OpenAI + automod
│   │   │   ├── examService.js       # interaktywny egzamin DM
│   │   │   ├── verificationService.js # modal + captcha + Roblox
│   │   │   ├── peselGenerator.js    # algorytm PESEL IC
│   │   │   ├── ticketService.js
│   │   │   ├── logService.js
│   │   │   └── roleSyncService.js   # nasłuch zmian ról -> aktualizacja postaci
│   │   ├── lib/
│   │   │   ├── prisma.js            # singleton PrismaClient
│   │   │   └── loadCommands.js      # współdzielony loader komend (index.js + deployCommands.js)
│   │   ├── repositories/            # cienka warstwa nad Prisma (Repository Pattern)
│   │   │   ├── userRepository.js
│   │   │   ├── characterRepository.js
│   │   │   └── examRepository.js
│   │   └── utils/
│   │       ├── embeds.js
│   │       └── captcha.js
│   ├── package.json
│   └── .env.example
│
└── dashboard/                      # Next.js 14 (App Router, Server Actions) — panel admina, patrz dashboard/README.md
    ├── app/
    │   ├── login/                    # Discord OAuth2 (next-auth)
    │   ├── unauthorized/
    │   ├── (dashboard)/               # chronione layoutem sprawdzającym DASHBOARD_ACCESS
    │   │   ├── page.tsx                 # przegląd / liczniki
    │   │   ├── channels/                # przypisywanie kanałów (ChannelBinding)
    │   │   ├── ai-module/               # token Hugging Face, modele, progi kredytów
    │   │   ├── exams/                   # kreator pytań egzaminacyjnych
    │   │   ├── syllabuses/              # podstawa programowa per przedmiot
    │   │   ├── reaction-roles/          # grupy i opcje paneli autoról
    │   │   ├── characters/              # przeglądarka bazy postaci
    │   │   └── logs/                    # ActionLog
    │   └── api/auth/[...nextauth]/
    ├── lib/                           # prisma.ts, auth.ts, discord.ts, permissions.ts,
    │                                  # permissionKeys.ts, permissionHierarchy.ts, roleCategories.ts
    ├── components/                    # Sidebar, SessionProviderWrapper
    └── package.json
```

## Deploy (Render) — synchronizacja schematu bazy

Baza jest synchronizowana ze schematem przez **`prisma db push`**, nie przez `prisma migrate`. Powód: produkcja wystartowała z `db push`, więc nie ma w niej tabeli `_prisma_migrations` — pierwsze `migrate deploy` uznałoby wszystkie migracje z `prisma/migrations/` za niezastosowane i spróbowałoby wykonać `init` od zera na już istniejących tabelach. Folder `prisma/migrations/` jest więc historyczny i **nie jest** odpalany na produkcji; jednym źródłem prawdy jest `prisma/schema.prisma`.

**Build Command serwisu bota** (`uwrp-bot`, tam gdzie jest `DATABASE_URL`) — dokładnie tak, jak jest ustawiony i potwierdzony logiem builda:

```bash
npm install && npx prisma generate --schema=../prisma/schema.prisma && npx prisma db push --schema=../prisma/schema.prisma
```

Dlaczego tak:

- **`npx`, a nie `npm run`.** CLI `prisma` siedzi w `devDependencies`. Na Renderze `NODE_ENV=production`, więc `npm install` pomija pakiety deweloperskie — w `node_modules/.bin` nie ma binarki `prisma` i `npm run prisma:generate` padłby na `prisma: not found`. `npx` nie szuka w `node_modules/.bin`, tylko dociąga CLI z rejestru sam. (Alternatywa `npm install --include=dev && npm run …` też zadziała, ale instaluje cały tree deweloperski — `npx` jest lżejszy i nie zależy od skryptów w `package.json`.)
- **`db push` jest idempotentny.** Dodaje brakujące tabele/kolumny i nie robi nic, gdy baza już pasuje do schematu, więc każdy kolejny deploy przechodzi bez błędu.
- **Celowo bez `--accept-data-loss`.** Jeśli zmiana w schemacie wymagałaby usunięcia danych (np. skasowania kolumny albo tabeli), build zatrzyma się z błędem zamiast po cichu wyczyścić produkcję — wtedy decyzję podejmujesz ręcznie i świadomie.
- **`db push` tylko w serwisie bota.** Dashboard (`dashboard/`) współdzieli tę samą bazę i robi **wyłącznie** `prisma generate` (jest w jego `postinstall`/`build`). Dwa serwisy pushujące schemat równolegle to wyścig o DDL.
- **Nigdy nie dokładaj `prisma migrate deploy`** do builda ani startu — patrz akapit o `_prisma_migrations` wyżej.

**Start Command:** ustaw na samo `npm start`. Na Renderze widnieje dziś `npm start && npm run deploy`, ale `npm start` (`node src/index.js`) blokuje proces, więc druga część nigdy się nie wykona — to martwy kod. `npm run deploy` istnieje jako osobny, **idempotentny** krok (rejestracja komend slash na serwerze guildowym, `PUT` pełnej listy, bezpieczne wielokrotne uruchomienie):

```bash
npm run deploy        # bot/src/deployCommands.js — tylko rejestruje komendy i kończy działanie
```

Możesz go odpalić ręcznie (lub jako osobny job) po zmianie komend; nie zastępuje startu bota i nie dotyka bazy. Zmian ustawień usługi na Renderze nie da się zrobić z kodu — trzeba ją wkleić w panelu.

`prisma migrate dev` zostaje wyłącznie do eksperymentów lokalnych na osobnej bazie; nie ma ścieżki, którą jego wynik trafiłby na produkcję.

### ⚠️ Uwaga operacyjna: `Kolo.lastActivityAt` po wdrożeniu kolumny

Deploy z 2026-09-12 dodał kolumny `Kolo.panelMessageId`, `Kolo.lastActivityAt`, `Kolo.inactivityWarnedAt` i `GeneralConfig.koloInactivityDays`. `db push` nie ma skąd wziąć wartości historycznych, więc **po pierwszym pushu `lastActivityAt` jest `NULL` dla każdego istniejącego koła**.

Efekt: `_checkActivityRequirement` w `bot/src/services/koloService.js` liczy bezczynność od momentu

```js
const since = kolo.lastActivityAt || kolo.createdAt;
```

czyli dla starych kół od daty **założenia**. Scheduler (`bot/src/scheduler/koloScheduler.js`, `CHECK_INTERVAL_MS` = 15 min) ostrzega każde aktywne koło starsze niż `GeneralConfig.koloInactivityDays` (domyślnie 30), a 72 h po ostrzeżeniu rozwiązuje je automatycznie. Innymi słowy: tuż po wdrożeniu koła założone dawno temu mogą dostać falę ostrzeżeń, mimo że są aktywne.

Zanim włączyć scheduler po raz pierwszy (albo od razu po deployu), „uziemij" licznik jednym zapytaniem — traktujemy wszystkie istniejące koła jako aktywne na teraz:

```sql
UPDATE "Kolo" SET "lastActivityAt" = NOW() WHERE "lastActivityAt" IS NULL;
```

Warto też wyzerować ewentualne ostrzeżenia wysłane w międzyczasie:

```sql
UPDATE "Kolo" SET "inactivityWarnedAt" = NULL WHERE "inactivityWarnedAt" IS NOT NULL;
```

## Wzorce projektowe zastosowane w kodzie

- **Repository Pattern** — cała logika Prisma odizolowana od komend Discorda (łatwe testy, łatwa podmiana ORM).
- **Service Layer** — `examService`, `aiCreditService`, `verificationService` nie znają się nawzajem z `interactionCreate`; komenda tylko woła serwis.
- **Strategy Pattern** — koszt operacji AI liczony wg progów długości tekstu (tablica strategii, łatwo edytowalna z Dashboardu bez redeployu, bo progi trzymane w tabeli `AiPricingTier`).
- **Event-driven sync** — `guildMemberUpdate` nasłuchuje zmiany ról i deleguje do `roleSyncService`, który aktualizuje `Character.title`/`Character.faculty` bez ręcznej komendy.

## Hierarchia ról (skrót logiki uprawnień)

Role nie są hardkodowane po ID w kodzie bota — Dashboard zapisuje mapowanie `RoleBinding { discordRoleId, permissionKey }` w bazie, a `config/roles.js` tylko definiuje **klucze uprawnień** używane w kodzie (`MANAGE_EXAMS`, `MANAGE_SYLLABUS`, `MODERATE`, `MANAGE_DEANERY`, `DONATE_UNLIMITED_AI` itd.). Dzięki temu zmiana ID roli na serwerze nie wymaga zmiany kodu — tylko wpisu w Dashboardzie.

### Rangi staffu — dziedziczenie (jedno powiązanie wystarczy)

Rangi tworzą łańcuchy, w których **wyższa ranga dostaje wszystkie uprawnienia rang niższych**. W Dashboardzie wiążesz rolę Discorda z jedną rangą, a reszta wynika z hierarchii i z „grantu z urzędu" (`RANK_GRANTS`):

```
Holder Projektu      → Manager Projektu → Pomocnik Managera Projektu
Główny Developer     → Developer        → Młodszy Developer
Opiekun Administracji→ Starszy Administrator → Administrator → Młodszy Administrator
                                             → Starszy Moderator → Moderator → Młodszy Moderator
Support              → Trial Support        (osobny łańcuch — Support nie dziedziczy po Moderacji)
Zarząd Projektu      (ranga samodzielna)
```

Uprawnienia granularne przypisane do rang (domyślnie, można je też nadać wybranej roli wprost):

| Ranga | Dokłada |
| --- | --- |
| Młodszy Moderator | `TIMEOUT_MEMBERS`, `CLEAR_MESSAGES`, `MANAGE_THREADS`, `MANAGE_NICKNAMES`, `VIEW_AUDIT_LOG` |
| Moderator | `KICK_MEMBERS` |
| Starszy Moderator | `BAN_MEMBERS`, `MOVE_MEMBERS` |
| Młodszy Administrator | `MANAGE_CHANNELS` |
| Administrator | `MANAGE_ROLES` |
| Support | `MANAGE_THREADS`, `VIEW_AUDIT_LOG`, `CLEAR_MESSAGES` (+ `REVIEW_APPLICATIONS`) |
| Trial Support | `MANAGE_THREADS` |
| Główny Developer | `MANAGE_ROLES` (+ `MANAGE_TECH`) |
| Developer | `MANAGE_CHANNELS`, `MANAGE_THREADS` |
| Młodszy Developer / Pomocnik Managera / Zarząd Projektu | `VIEW_AUDIT_LOG` |
| Manager Projektu | `MANAGE_CHANNELS` |
| Holder Projektu | `MANAGE_ROLES` (+ `MANAGE_PROJECT`) |

Przykład: rola „• Starszy Moderator •" powiązana z kluczem `STARSZY_MODERATOR` daje jej posiadaczowi kick, ban, timeout, clear, wątki, pseudonimy, przenoszenie i podgląd audytu — bez dopisywania kolejnych powiązań.

**Kompatybilność wstecz.** Stare klucze (`MODERATE`, `MANAGE_TECH`, `MANAGE_PROJECT`, `MANAGE_DEANERY`, `REVIEW_APPLICATIONS`) zostają i „rozszerzają się" na nowe: kto miał `MODERATE`, nadal może banować/kickować/czyścić. W drugą stronę już nie — rangi **nie** dostają automatycznie pełnego `MODERATE`, bo wtedy Młodszy Moderator odziedziczyłby przez niego bana i hierarchia przestałaby cokolwiek znaczyć. Sprawdzenia, które muszą działać w obu światach, pytają o kilka kluczy naraz (`KEY_SETS` w `config/roles.js`), np. `hasAnyPermission(member, KEY_SETS.MODERATION)` = `["MODERATE", "MLODSZY_MODERATOR"]`. Zasada przy wyborze rangi do sprawdzenia: **wpisz najniższą akceptowalną** — wyższe i tak ją dziedziczą.

`DASHBOARD_ACCESS` celowo nie implikuje niczego: to jedyny klucz, który trzeba nadać wprost (raz, w bazie/seedzie), żeby w ogóle wejść do panelu.

### Przegródki (role-separatory)

Kategorie na serwerze głównym są oddzielone przegródkami o nazwie `•══════• Kategoria •══════•` (Development, Administracja, Moderacja, Support, Przydział, Holder, Manager, Zarząd Projektu, Bot). Są **wyłącznie wizualne**: nie mają uprawnień, nie są nadawane ludziom i **nigdy nie trafiają do `RoleBinding`** — Dashboard rozpoznaje je po nazwie (`isDividerRoleName`) i pomija w liście ról do powiązania, a akcja zapisu ma drugą linię obrony. Reprezentacja w kodzie: `STAFF_CATEGORIES` / `DIVIDER_ROLES` w `bot/src/config/roles.js` i `dashboard/lib/permissionHierarchy.ts`.

> To **nie** jest system ról Kół Naukowych (`Kolo.roleIdDivider` na serwerze `KOLA_GUILD_ID`) — tamten żyje w `bot/src/services/koloService.js` i jest osobnym mechanizmem na osobnym serwerze.

### Poziomy (od najwyższych uprawnień technicznych/administracyjnych do społeczności)
1. Zarząd Projektu (Holder, Manager, ...)
2. Administracja Techniczna (Development, Główny Developer)
3. Administracja Serwera (Opiekun, Starszy Admin, Admin, Moderator, Support)
4. Frakcje i Kary (Dział Wydarzeń, Dział Frakcji, Kary, Zakazy)
5. Role Donate (Zasłużony, Ultra/Giga/Mini Donator, Booster) — wpływają na `DONATE_UNLIMITED_AI`
6. Władze Uczelni (Rektor, Prorektor, Kanclerz, Dziekan, Prodziekan) — `MANAGE_DEANERY`, `MANAGE_FACULTY`
7. Dziekanat i Koordynacja (Kierownik/Pracownik Dziekanatu, Administrator USOS) — `MANAGE_GRADES`
8. Tytuły Naukowe (Profesor, Dr hab., Doktor, Magister) — wpływają na automatyczny prefix nicku
9. Kadra Akademicka (Promotor, Adiunkt, Asystent, Lektor) — `MANAGE_EXAMS`, `MANAGE_SYLLABUS` dla przypisanego wydziału
10. Wydziały — tagują `Character.facultyId`
11. Społeczność (Starosta Roku, Student, Obywatel) — uprawnienia bazowe

### Sync kluczy między botem a dashboardem

`bot/src/config/roles.js` (JS) i `dashboard/lib/{permissionKeys,permissionHierarchy}.ts` (TS) to ręcznie utrzymywane kopie tego samego modelu. `bot/test/permissions.test.js` porównuje je wpis po wpisie (klucze, grupy UI, `RANK_HIERARCHY`, `RANK_GRANTS`, `RANK_LEGACY_GRANTS`, `LEGACY_COMPAT`, `STAFF_CATEGORIES`) i **failuje build testów**, gdy się rozjadą. Po zmianie w jednym miejscu popraw drugie i uruchom `cd bot && npm test`.

## Uwaga dot. modułu AI — WYŁĄCZNIE Hugging Face

Bot **nie ma żadnej integracji z Anthropic/OpenAI ani innym providerem** — `aiGatewayService.js` rozmawia tylko z Hugging Face, dwoma różnymi endpointami dobranymi pod zadanie:

- **Bramka AI (odpowiedzi na kanałach RP)** → `https://router.huggingface.co/v1/chat/completions` (format zgodny z OpenAI chat completions, obsługiwany natywnie przez HF Router). Model ustawiany w Dashboardzie (`AiConfig.chatModel`, domyślnie `meta-llama/Llama-3.1-8B-Instruct` — dowolny model czatowy dostępny w HF Inference).
- **Automod** → klasyczny `https://api-inference.huggingface.co/models/{model}` z dedykowanym modelem klasyfikacyjnym (`AiConfig.automodModel`, domyślnie `unitary/toxic-bert`). Celowo **nie** pytamy modelu czatowego o werdykt w JSON — klasyfikator jest szybszy, tańszy i odporny na próby "zjailbreakowania" promptem w treści wiadomości.

Token Hugging Face (`hf_...`) jest wpisywany wyłącznie w Dashboardzie i trzymany w bazie zaszyfrowany AES-256-GCM (`utils/crypto.js`) — zgodnie z wymaganiem "config w Dashboardzie, nie w kodzie/komendach". System kredytów (`aiCreditService.js`) działa identycznie niezależnie od providera — liczy długość tekstu, nie sprawdza z jakiego API pochodzi odpowiedź.

## Status 15 mechanik uczelnianych

Wszystkie systemy z sekcji 6 specyfikacji poza Akademikami (usuniętymi na życzenie — nie wnosiły nic do rozgrywki) mają komplet: model w `prisma/schema.prisma`, serwis w `bot/src/services/`, i komendę.

| # | Mechanika | Serwis | Komenda |
|---|---|---|---|
| 1 | Sylabusy | — (odczyt bezpośredni) | `/sylabus` |
| 2 | Egzamin DM | `examService.js` | `/egzamin start` |
| 3 | Wirtualny Indeks (USOS) | — (odczyt bezpośredni) | `/usos` — **jedna komenda, zero podkomend**, panel dopasowany do roli (student/wykładowca/władze uczelni) przez przyciski i modale |
| 4 | Punkty ECTS | — (agregacja w komendzie) | `/ects` |
| 5 | Prefixy naukowe | `roleSyncService` (event `guildMemberUpdate`) | automatyczne |
| 6 | Legitymacja studencka | — (Canvas w komendzie) | `/legitymacja` |
| 7 | Frekwencja | — (ręczne wpisy, brak śledzenia głosowego) | wbudowana w panel `/usos` (przycisk "Wpisz frekwencję") |
| 8 | System stypendialny | `scholarshipService.js` | `/stypendium wyplac`, `/stypendium historia` |
| 9 | Biblioteka akademicka | `libraryService.js` | `/biblioteka wypozycz\|oddaj\|moje` |
| 10 | Zaliczenia warunkowe | `retakeService.js` | `/warunek zglos` |
| 11 | Koła naukowe | `koloService.js` (+ `koloScheduler.js`) | założenie: przycisk na kanale `KOLA_NAUKOWE`; zarządzanie: **panel na DM** (przyciski) i menu w kanale `⚒️zarządzaj-kołem` — bez komend slash |
| 12 | Prace dyplomowe | `thesisService.js` | `/praca zarejestruj\|status\|moja` |
| 13 | ~~Akademiki~~ | usunięte | — |
| 14 | Generator Dziekanatu | modal w `commands/admin/dziekanat.js`, obsługa w `interactionCreate.js` | `/dziekanat ogloszenie` |
| 15 | Kary dyscyplinarne | `punishmentService.js` | `/moderacja kara` |

## Koła naukowe — cykl życia i członkostwo

Koła żyją na **osobnym serwerze Discord** (`KOLA_GUILD_ID`), a zgłoszenie startuje przyciskiem na kanale `KOLA_NAUKOWE` (główny serwer). Statusy koła: `PENDING_MEMBERS` → `PENDING_REVIEW` → `ACTIVE`, oraz końcowe `REJECTED` / `DISSOLVED`.

**Zasada nadrzędna: wpis `KoloMember` znaczy coś TYLKO dopóki koło żyje** (`PENDING_MEMBERS`/`PENDING_REVIEW`/`ACTIVE`). Każdy kod pytający „czy ta osoba jest w kole?” idzie przez `koloService._findLiveMembership()`, które filtruje martwe statusy i przy okazji usuwa z bazy sieroty po kołach odrzuconych/rozwiązanych (dzięki temu nikt nie jest trwale zablokowany przez stary wpis — nie może ani założyć koła, ani przyjąć zaproszenia).

Zamknięcie koła zawsze przechodzi przez `_teardownKolo()` / `_dissolveKolo()`, które **najpierw sprzątają bazę** (status, zwolnienie unikalnej nazwy, usunięcie członków i ich przydziałów do badań, wygaszenie wiszących zaproszeń, zamknięcie otwartych próśb), a dopiero potem — best-effort — usuwają kategorię/kanały/role na serwerze Kół. Brak dostępu do tego serwera nie zatrzymuje już sprzątania członkostw.

| Sytuacja | Efekt |
|---|---|
| Zaproszeni odrzucą / zignorują zaproszenia (zgłoszenie bez kompletu) | start licznika `belowMinSince`; 72h na doproszenie kogoś (📨 Zaproś osobę na panelu DM), potem **auto-odrzucenie** zgłoszenia (`REJECTED`) i zwolnienie lidera oraz osób, które zaakceptowały |
| Admin odrzuca zgłoszenie | `REJECTED`, nazwa zwolniona, członkowie usunięci, DM do każdego z nich |
| Admin zatwierdza rozwiązanie koła / koło 72h poniżej minimum | `DISSOLVED`, infrastruktura usunięta, członkostwa i przydziały do badań wyczyszczone, DM do każdego |
| Lider zgłoszenia klika „Wycofaj zgłoszenie” na panelu DM | wycofanie całego zgłoszenia (`REJECTED`), zaproszeni dostają DM |
| Członek zgłoszenia klika „Wycofaj się ze zgłoszenia” | wypisuje się ze zgłoszenia w `PENDING_MEMBERS` (wcześniej był w nim zablokowany) |
| Koło bez aktywności dłużej niż `GeneralConfig.koloInactivityDays` | ostrzeżenie DM do zarządu i członków, a 72h później **auto-rozwiązanie** (`DISSOLVED`) |
| Klik w stary DM „Akceptuj” po śmierci koła | zaproszenie wygasa, nikt nie zostaje dopisany |

Limit „jedno koło na osobę” jest egzekwowany na żywych kołach przy zakładaniu, wyborze zapraszanych, wysyłce zaproszenia i akceptacji zaproszenia.

### Panel na DM (zamiast komend `/kolo`)

Komenda `/kolo` została usunięta — całe zarządzanie dzieje się przez przyciski na DM albo przez menu w kanale `⚒️zarządzaj-kołem`. Obie drogi wołają te same rdzenie (`_inviteCore`, `_kickCore`, `_leaveCore`, `_dissolveRequestCore`, `_createChangeRequest`, `_startResearchCore`), więc reguły są identyczne niezależnie od tego, którędy kliknięto.

Panel to **jedna wiadomość na osobę, edytowana w miejscu** (`refreshPanels`). Panel lidera ma trwałe ID w `Kolo.panelMessageId`, więc przeżywa restart bota, a scheduler dosyła go, jeśli użytkownik go usunie.

| Kto | Przyciski |
|---|---|
| Zarząd, zgłoszenie `PENDING_MEMBERS` | 📨 Zaproś osobę • ↩️ Cofnij zaproszenie • 🔄 Odśwież • 🚫 Wycofaj zgłoszenie |
| Zarząd, zgłoszenie `PENDING_REVIEW` | 🔄 Odśwież (decyduje administracja — przyciski akcji znikają, żeby nie było martwych klików) |
| Zarząd, koło `ACTIVE` | 📨 Zaproś • ↩️ Cofnij • 🔄 Odśwież • ⚒️ Zarządzaj kołem • 🔬 Badania • 💥 Rozwiąż koło |
| Zwykły członek | 🔄 Odśwież • 🚪 Opuść koło / Wycofaj się ze zgłoszenia |

Panel odświeża się po każdej zmianie stanu koła: przyjęciu/odrzuceniu/cofnięciu zaproszenia, przejściu zgłoszenia do administracji, zatwierdzeniu koła, potwierdzeniu dostępu, wyrzuceniu, wyjściu, zmianie wicelidera, zatwierdzeniu zmiany nazwy/logo/lidera/roli oraz przy starcie i zakończeniu badania.

Embed panelu pokazuje status koła, liczbę członków, listę oczekujących zaproszeń z czasem do wygaśnięcia, podsumowanie ✅/❌/⌛ oraz prowadzone badania. Akcje niszczące mają drugi krok potwierdzenia (`kolo_panel_confirm:*`).

### Uprawnienia zarządu na serwerze Kół

Lider jest administratorem **własnej kategorii** (`LEADER_ALLOW`: kanały, role, wiadomości, wątki, webhooki, moderacja, VC), wicelider moderatorem (`VICE_ALLOW`). Nadaje je `_applyKoloPermissions` — przy aktywacji koła i raz na proces dla kół starszych (`koloScheduler.maintainActiveKola`).

Nadpisywania ustawiane są **per rola** (`channel.permissionOverwrites.edit`), nie całym obiektem: `channels.edit({ permissionOverwrites })` zastąpiłoby całą listę i skasowało `everyone: DENY ViewChannel`, otwierając prywatne kanały koła całemu serwerowi.

### Cel utrzymania koła (wymóg aktywności)

Aktywne koło musi co `GeneralConfig.koloInactivityDays` dni (domyślnie 30, konfigurowane w Dashboardzie → *Tematy badań*, `0` wyłącza) wykazać aktywność: nowe badanie, ukończone badanie albo nowy członek — każde z nich woła `_noteActivity`. Po przekroczeniu limitu zarząd i członkowie dostają ostrzeżenie DM, a 72h później koło jest rozwiązywane (`_checkActivityRequirement`).

## Panel `/usos` — architektura

Zamiast podkomend (`/usos ocen`, `/usos indeks`...), `/usos` to jedna komenda bez argumentów. Bot sprawdza uprawnienia wywołującego (`RECTORATE_ACCESS`/`MANAGE_DEANERY` → władze uczelni, `MANAGE_GRADES` → wykładowca, inaczej → student) i pokazuje **inny embed z innymi przyciskami** w zależności od roli:

- **Student**: własne oceny, GPA, frekwencja + przycisk "Napisz do wykładowcy" (wysyła DM)
- **Wykładowca**: przyciski "Wystaw ocenę" i "Wpisz frekwencję" (oba otwierają Modal)
- **Władze uczelni**: to co wykładowca + "Zatrudnij"/"Zwolnij" (nadaje/zabiera rolę `WYKLADOWCA_ROLE`/`ADMINISTRACJA_ROLE`/`STUDENT_ROLE` z Dashboardu) i "Wygeneruj raport" (średnie GPA i frekwencja całej uczelni)

Szkoła Doktorska nie ma osobnego kodu — działa jak każdy inny wydział (`Faculty`) z własnymi przedmiotami, ocenami i frekwencją przez ten sam panel.

Uwagi projektowe:
- Progi i kwoty (opłata warunkowa, minimalne GPA do stypendium, wymagana pula ECTS/rok) mają sensowne wartości domyślne zgodne z realiami akademickimi, ale każda komenda pozwala je nadpisać parametrem — docelowo warto przenieść je do dedykowanych tabel konfiguracyjnych w Dashboardzie (analogicznie do `AiPricingTier`), jeśli mają być globalnie zarządzane bez pamiętania parametrów komendy.
- "Portfel IC" studenta to obecnie `Character.salaryIC` — czynsz akademika i opłaty warunkowe są z niego potrącane. Jeśli chcecie osobnego salda niezależnego od wynagrodzenia, to prosta zmiana schematu (dodanie `Character.walletIC`).
- `/warunek` i `/stypendium wyplac` wymagają uprawnienia `MANAGE_GRADES`/`MANAGE_DEANERY` — pamiętajcie o dodaniu odpowiednich wpisów w `RoleBinding` z Dashboardu, inaczej komendy będą permanentnie odmawiać dostępu nawet Dziekanatowi.

## Podania rekrutacyjne

**Przeniesione w całości do Dashboardu** (`dashboard/app/apply/`) — nie ma już komendy `/podanie` na Discordzie, bo Modal ma sztywny limit 5 pól, a web formularz nie ma żadnego limitu.

- `https://twoj-dashboard.onrender.com/apply` — publiczna sekcja (wymaga tylko zalogowania przez Discord, **nie** wymaga `DASHBOARD_ACCESS`) z formularzami Student/Wykładowca/Administracja, dłuższymi niż to co dało się zmieścić w Modalu.
- Po złożeniu: AI (Hugging Face, ten sam moduł co bramka czatu) generuje wstępną analizę zgłoszenia, potem embed z surowymi odpowiedziami + analizą AI + przyciskami **Akceptuj/Odrzuć** trafia na kanał `APPLICATIONS_<TYP>`.
- Rozpatrzenie (przyciski) wciąż dzieje się na Discordzie — wymaga `REVIEW_APPLICATIONS`, akceptacja nadaje rolę (`STUDENT_ROLE`/`WYKLADOWCA_ROLE`/`ADMINISTRACJA_ROLE`).
- `/apply/status` — student sprawdza status swoich podań (odpowiednik usuniętego `/podanie moje`).
- `/applications` w panelu admina — wgląd w podania bez szukania na kanałach Discorda (tylko odczyt, rozpatrywanie zostaje na Discordzie).
- Jeden nierozpatrzony wniosek danego typu na osobę na raz (blokada w `apply/actions.ts`).

## Integracje Social Media

Bramka pollingowa (`services/socialMediaService.js` + `scheduler/socialMediaScheduler.js`), **nie webhooki** — żadna z tych platform nie oferuje wygodnych webhooków dla zewnętrznych integracji, więc bot odpytuje w interwale z `SocialMediaConfig.pollIntervalMinutes` (edytowalnym w Dashboardzie, domyślnie 5 min) i porównuje `lastSeenId` per subskrypcja.

| Platforma | Status | Wymaga |
|---|---|---|
| Twitch | ✅ pełna integracja | Client ID + Client Secret (dev.twitch.tv), darmowe |
| YouTube | ✅ pełna integracja | Klucz YouTube Data API v3 (Google Cloud Console), darmowe w rozsądnych limitach |
| Instagram | ✅ integracja z zastrzeżeniem | Działa tylko dla kont **Business/Creator** połączonych ze Stroną FB (Graph API) — konta prywatne nie są obsługiwane przez żadne oficjalne API Meta |
| X (Twitter) | ⚠️ kod gotowy, wymaga płatnego API | Od 2023 darmowy tier X API nie ma dostępu do odczytu tweetów użytkownika — potrzebny płatny plan Basic+. Bez skonfigurowanego tokena subskrypcja jest po prostu pomijana, nie wywala cyklu pollingu. |
| TikTok | ❌ brak oficjalnego API do monitoringu | TikTok nie udostępnia publicznego API do śledzenia dowolnego konta — tylko kont, które same zalogowały się przez Waszą aplikację (OAuth). Szczegóły i opcje w komentarzu `tiktokConnector.js`. |

Konfiguracja subskrypcji (`SocialMediaSubscription`: platforma, handle/ID zewnętrzne, docelowy kanał Discord) oraz kluczy API (`SocialMediaConfig`, klucze szyfrowane AES-256-GCM jak w module AI) należy do Dashboardu — zgodnie z zasadą "config nie w komendach Discord", bot w tym module nie ma żadnej komendy konfiguracyjnej, tylko wysyła powiadomienia.

## Reaction Role / Autorole

- Konfiguracja grup i przycisków (`ReactionRoleGroup` + `ReactionRoleOption`: rola, etykieta, emoji, styl, kolejność) należy do Dashboardu — zgodnie z zasadą projektu, bot nigdy nie ma hardkodowanej listy "jaki przycisk = jaka rola".
- `/autorole panel [grupa]` — publikuje panel na bieżącym kanale (embed + do 25 przycisków w rzędach po 5, limit techniczny Discorda), wymaga uprawnienia `MANAGE_REACTION_ROLES`.
- `/autorole grupy` — pokazuje klucze grup skonfigurowanych w Dashboardzie (pomocne przy ustawianiu, żeby nie zgadywać nazwy).
- Kliknięcie przycisku togguje rolę (dodaje jeśli jej nie ma, zdejmuje jeśli ma) — obsługa generyczna w `interactionCreate.js` po prefiksie `reactionrole:`, działa identycznie niezależnie od tego, przez którą grupę przycisk został wygenerowany.
- Osobny mechanizm: autorole nadawane automatycznie **przy dołączeniu** (bez przycisków) to `events/guildMemberAdd.js` + klucz `ChannelBinding` `AUTOROLE_JSON` — to inny przypadek użycia niż panel i celowo nie są połączone (dołączeniowe autorole nie wymagają wyboru użytkownika).

## Nowe moduły dodane w tej iteracji

- `services/ticketService.js` + `commands/admin/ticket.js` — pełny cykl życia ticketu: kanał prywatny → przypisanie → zamknięcie z transkrypcją HTML wysyłaną na skonfigurowany kanał.
- `services/punishmentService.js` — dziennik kar dyscyplinarnych; severity `WYDALENIE` automatycznie zabiera rolę Studenta (rola wskazana przez `RoleBinding` z kluczem `STUDENT_ROLE`).
- `commands/admin/moderacja.js` — ban/kick/mute/clear/ogłoszenie/kara w jednej komendzie z podkomendami, każda akcja loguje się do `ActionLog`.
- `commands/academic/sylabus.js`, `commands/academic/usos.js` (`/usos` — panel bez podkomend) — realizują mechaniki 1, 3 i częściowo 4 z listy systemów.
- `commands/rp/legitymacja.js` — generator legitymacji studenckiej (Canvas) z uproszczonym kodem kreskowym opartym o hash numeru albumu.
