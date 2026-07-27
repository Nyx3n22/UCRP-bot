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
│   │   ├── config/
│   │   │   ├── env.js               # walidacja zmiennych środowiskowych (zod)
│   │   │   └── roles.js             # mapa hierarchii ról -> stałe/permissiony
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
    ├── lib/                           # prisma.ts, auth.ts, discord.ts, permissions.ts
    ├── components/                    # Sidebar, SessionProviderWrapper
    └── package.json
```

## Wzorce projektowe zastosowane w kodzie

- **Repository Pattern** — cała logika Prisma odizolowana od komend Discorda (łatwe testy, łatwa podmiana ORM).
- **Service Layer** — `examService`, `aiCreditService`, `verificationService` nie znają się nawzajem z `interactionCreate`; komenda tylko woła serwis.
- **Strategy Pattern** — koszt operacji AI liczony wg progów długości tekstu (tablica strategii, łatwo edytowalna z Dashboardu bez redeployu, bo progi trzymane w tabeli `AiPricingTier`).
- **Event-driven sync** — `guildMemberUpdate` nasłuchuje zmiany ról i deleguje do `roleSyncService`, który aktualizuje `Character.title`/`Character.faculty` bez ręcznej komendy.

## Hierarchia ról (skrót logiki uprawnień)

Role nie są hardkodowane po ID w kodzie bota — Dashboard zapisuje mapowanie `RoleBinding { discordRoleId, permissionKey }` w bazie, a `config/roles.js` tylko definiuje **klucze uprawnień** używane w kodzie (`MANAGE_EXAMS`, `MANAGE_SYLLABUS`, `MODERATE`, `MANAGE_DEANERY`, `DONATE_UNLIMITED_AI` itd.). Dzięki temu zmiana ID roli na serwerze nie wymaga zmiany kodu — tylko wpisu w Dashboardzie.

Poziomy (od najwyższych uprawnień technicznych/administracyjnych do społeczności):
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
| 11 | Koła naukowe | `circleService.js` | `/kolo utworz\|dolacz\|opusc\|budzet\|status` |
| 12 | Prace dyplomowe | `thesisService.js` | `/praca zarejestruj\|status\|moja` |
| 13 | ~~Akademiki~~ | usunięte | — |
| 14 | Generator Dziekanatu | modal w `commands/admin/dziekanat.js`, obsługa w `interactionCreate.js` | `/dziekanat ogloszenie` |
| 15 | Kary dyscyplinarne | `punishmentService.js` | `/moderacja kara` |

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
