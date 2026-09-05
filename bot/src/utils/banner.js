/**
 * utils/banner.js
 * Generuje baner (Canvas) do użycia jako embed.image w kluczowych panelach
 * bota (weryfikacja, koła naukowe, aplikacje, partnerstwo, tickety).
 * Styl nawiązuje do herbu uczelni: ciemne tło, złoty orzeł w wieńcu
 * laurowym, tytuł na dole.
 */

const { createCanvas } = require("@napi-rs/canvas");

const WIDTH = 900;
const HEIGHT = 260;

function drawLaurelBranch(ctx, cx, cy, mirror) {
  ctx.save();
  ctx.translate(cx, cy);
  if (mirror) ctx.scale(-1, 1);
  ctx.strokeStyle = "#d9b872";
  ctx.fillStyle = "#d9b872";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(30, -10, 55, -55);
  ctx.stroke();

  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const x = 55 * t;
    const y = -55 * t * t * 1.1;
    const leafAngle = -0.6 - t * 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(leafAngle);
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawEmblem(ctx, cx, cy, scale = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  // wieniec laurowy
  drawLaurelBranch(ctx, -6, 40, false);
  drawLaurelBranch(ctx, 6, 40, true);

  // korpus ptaka (uproszczony orzeł/feniks)
  ctx.fillStyle = "#efe3c0";
  ctx.beginPath();
  ctx.moveTo(0, 45);
  ctx.quadraticCurveTo(-14, 10, -6, -20);
  ctx.quadraticCurveTo(0, -30, 6, -20);
  ctx.quadraticCurveTo(14, 10, 0, 45);
  ctx.fill();

  // skrzydła
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.scale(dir, 1);
    ctx.beginPath();
    ctx.moveTo(4, -10);
    ctx.quadraticCurveTo(40, -20, 55, -70);
    ctx.quadraticCurveTo(45, -35, 35, -25);
    ctx.quadraticCurveTo(50, -35, 60, -65);
    ctx.quadraticCurveTo(48, -30, 32, -12);
    ctx.quadraticCurveTo(45, -15, 55, -35);
    ctx.quadraticCurveTo(38, -5, 10, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // głowa + korona
  ctx.beginPath();
  ctx.ellipse(0, -32, 9, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-7, -42);
  ctx.lineTo(-4, -50);
  ctx.lineTo(0, -44);
  ctx.lineTo(4, -50);
  ctx.lineTo(7, -42);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Generuje baner PNG jako Buffer.
 * @param {string} title - tytuł nałożony na dole banera
 * @param {string} [colorHex] - akcentowy kolor (np. kolor koła), domyślnie złoty
 */
function generateBanner(title, colorHex = "#d9b872") {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, "#0d0f16");
  bg.addColorStop(0.5, "#1a2a6c");
  bg.addColorStop(1, "#0d0f16");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // subtelne "kolumny" tła (nawiązanie do fasady budynku uczelni)
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 3;
  for (let x = 40; x < WIDTH; x += 70) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }

  // winieta
  const vignette = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT / 4, WIDTH / 2, HEIGHT / 2, WIDTH / 1.2);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // emblemat
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = colorHex;
  drawEmblem(ctx, WIDTH / 2, HEIGHT / 2 - 18, 1.15);
  ctx.restore();

  // tytuł
  ctx.textAlign = "center";
  ctx.fillStyle = "#f4efe2";
  ctx.font = "bold 34px serif";
  ctx.fillText(title, WIDTH / 2, HEIGHT - 34);

  ctx.strokeStyle = colorHex;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(WIDTH / 2 - 90, HEIGHT - 20);
  ctx.lineTo(WIDTH / 2 + 90, HEIGHT - 20);
  ctx.stroke();

  return canvas.toBuffer("image/png");
}

module.exports = { generateBanner };
