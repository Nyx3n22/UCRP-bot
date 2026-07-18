/**
 * healthServer.js
 * Bot Discorda NIE potrzebuje serwera HTTP do działania — trzyma stałe
 * połączenie WebSocket z Discordem, nie odpowiada na żądania jak strona.
 *
 * Ten plik istnieje wyłącznie z powodów hostingowych: darmowy plan Render.com
 * obsługuje tylko "Web Service" (usługi HTTP) za darmo. Wystawiając ten
 * malutki endpoint, Render widzi bota jako zwykłą stronę i wpuszcza go za darmo,
 * a zewnętrzny serwis (UptimeRobot) może go regularnie pingować, żeby Render
 * nie uśpił procesu z powodu braku ruchu.
 */

const http = require("http");

function startHealthServer() {
  const port = process.env.PORT || 3001;

  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bot UWRP RP - działa.");
  });

  server.on("error", (err) => {
    console.error("❌ Health server nie mógł się uruchomić:", err);
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`🌐 Health server nasłuchuje na 0.0.0.0:${port} (tylko dla Render/UptimeRobot).`);
  });
}

module.exports = { startHealthServer };