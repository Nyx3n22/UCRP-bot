/**
 * services/socialMedia/tiktokConnector.js
 *
 * WAŻNE OGRANICZENIE TECHNICZNE:
 * TikTok nie udostępnia żadnego oficjalnego, publicznego API pozwalającego
 * monitorować nowe posty DOWOLNEGO twórcy. TikTok Display API pozwala
 * odczytać wyłącznie treści konta, które samo autoryzowało Waszą aplikację
 * (OAuth po stronie twórcy) — nie nadaje się do pasywnego śledzenia
 * zewnętrznych kont, tak jak Twitch/YouTube/Instagram.
 *
 * Realne opcje dla tej platformy:
 *  1) Twórca łączy swoje konto przez TikTok Login Kit i autoryzuje aplikację
 *     -> wtedy Display API (/v2/video/list/) faktycznie działa i ten plik
 *     można rozbudować analogicznie do instagramConnector.js.
 *  2) Skorzystanie z płatnego, zewnętrznego serwisu pośredniczącego
 *     (np. RSS-bridge z własnym hostingiem, lub komercyjne API typu
 *     RapidAPI TikTok scrapers) — świadomie pomijamy to tutaj, bo to
 *     nieoficjalne API bez gwarancji stabilności i zgodności z ToS TikToka.
 *
 * Ten connector zwraca więc zawsze null i loguje ostrzeżenie, żeby
 * socialMediaService nie failował cyklu pollingu — TikTok subskrypcje
 * pozostają "przygotowane" w bazie, ale nieaktywne dopóki nie wybierzecie
 * jednej z opcji powyżej.
 */

async function getLatestPost({ username }) {
  console.warn(
    `[tiktokConnector] Pominięto sprawdzenie @${username} — TikTok nie ma publicznego API do monitoringu dowolnych kont. Zobacz komentarz w tiktokConnector.js.`
  );
  return null;
}

module.exports = { getLatestPost };
