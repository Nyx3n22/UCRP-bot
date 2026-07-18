# Dashboard — Uniwersytet Warszawski RP

Next.js 14 (App Router, Server Actions — bez osobnego warstwy REST API do CRUD-ów, mutacje idą wprost do Prisma z komponentów serwerowych). Dzieli bazę danych z botem przez wspólny `../prisma/schema.prisma`.

## Uruchomienie

```bash
cd dashboard
npm install
cp .env.example .env   # uzupełnij wartości
npm run prisma:generate
npm run dev
```

`ENCRYPTION_KEY` **musi być identyczny** jak w `bot/.env` — Dashboard szyfruje token Hugging Face przy zapisie, a bot go odszyfrowuje przy każdym użyciu. Różne klucze = bot dostanie nieczytelny ciąg znaków i wywali błąd przy wywołaniu API.

## Logowanie i uprawnienia

Zero osobnego systemu kont — logowanie to Discord OAuth2 (`next-auth`). Po zalogowaniu `lib/permissions.ts` pyta bota REST API (tokenem bota, nie usera) o role członka na serwerze, i sprawdza je względem tabeli `RoleBinding` — **dokładnie tego samego mechanizmu**, którego bot używa do `hasPermission()` w Discordzie. Jeden punkt prawdy o uprawnieniach dla całego projektu.

Jedyny wyjątek: klucz uprawnienia `DASHBOARD_ACCESS` (pełny dostęp do panelu) trzeba wpisać do `RoleBinding` ręcznie przy pierwszym uruchomieniu (np. przez `prisma studio` albo krótki seed script) — bo z definicji nikt nie może się jeszcze zalogować do Dashboardu, żeby nadać to uprawnienie sobie samemu.

## Strony

| Ścieżka | Funkcja |
|---|---|
| `/` | Przegląd — kluczowe liczniki (postacie, tickety, podania, kary, egzaminy) |
| `/channels` | Przypisania kanałów (`ChannelBinding`) — klucz → ID kanału, w tym listy JSON (autorole przy dołączeniu, sale wykładowe) |
| `/ai-module` | Token Hugging Face (zapis szyfrowany, nigdy nie wyświetlany), modele czatu/automodu, próg automodu, dozwolone kanały, progi kredytów |
| `/exams` | Wybór przedmiotu + CRUD pytań egzaminacyjnych (`ExamQuestion`) używanych przez `/egzamin start` |
| `/syllabuses` | Edycja treści sylabusu per przedmiot (markdown, czytany przez `/sylabus`) |
| `/reaction-roles` | Grupy i opcje paneli autoról (`ReactionRoleGroup`/`Option`), publikowane komendą `/autorole panel` |
| `/characters` | Przeglądarka bazy postaci z wyszukiwarką (imię, nazwisko, PESEL, nr albumu) |
| `/logs` | Ostatnie 200 wpisów `ActionLog` (moderacja, automod, akcje administracyjne) |

## Czego świadomie brakuje

- **Zarządzanie `RoleBinding`** (mapowanie roli Discord → klucz uprawnienia) nie ma jeszcze własnej strony — to najbardziej wrażliwa tabela w systemie (błędny wpis = ktoś niepowołany dostaje dostęp do Dashboardu albo uprawnień moderacyjnych), więc zanim dodacie do niej UI, warto rozważyć dodatkowe zabezpieczenie (np. wymóg `MANAGE_PROJECT`, nie samego `DASHBOARD_ACCESS`, i log każdej zmiany).
- Strony dla pozostałych mechanik uczelnianych z odczytem/edycją z Dashboardu (biblioteka, koła naukowe, akademiki itd.) — obecnie zarządzane wyłącznie komendami na Discordzie zgodnie z `punishmentService`-owym wzorcem; jeśli chcecie ich edycji też z Dashboardu, to kolejne strony analogiczne do `/exams`.
- Zarządzanie subskrypcjami `SocialMediaSubscription`/`SocialMediaConfig` — schemat i backend (`socialMediaService.js`) są gotowe po stronie bota, ale nie ma jeszcze formularza w Dashboardzie do ich dodawania — obecnie trzeba je wstawiać bezpośrednio przez `prisma studio` lub seed.
