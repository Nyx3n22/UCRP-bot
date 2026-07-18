/**
 * utils/captcha.js
 * Generuje prosty kod alfanumeryczny + render PNG z zaszumionym tłem (canvas).
 */

const { createCanvas } = require("@napi-rs/canvas");
const { AttachmentBuilder } = require("discord.js");

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // bez znaków mylących (0/O, 1/I)

function randomCode(length = 6) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return out;
}

function generateCaptcha() {
  const code = randomCode();
  const width = 260;
  const height = 90;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // tło
  ctx.fillStyle = "#1e1f22";
  ctx.fillRect(0, 0, width, height);

  // szum - linie
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.1 + Math.random() * 0.2})`;
    ctx.beginPath();
    ctx.moveTo(Math.random() * width, Math.random() * height);
    ctx.lineTo(Math.random() * width, Math.random() * height);
    ctx.stroke();
  }

  // tekst z lekką rotacją każdej litery
  ctx.font = "bold 40px sans-serif";
  ctx.textBaseline = "middle";
  const charSpacing = width / (code.length + 1);
  for (let i = 0; i < code.length; i++) {
    ctx.save();
    const x = charSpacing * (i + 1);
    const y = height / 2 + (Math.random() * 10 - 5);
    ctx.translate(x, y);
    ctx.rotate((Math.random() * 30 - 15) * (Math.PI / 180));
    ctx.fillStyle = `hsl(${Math.random() * 360}, 70%, 65%)`;
    ctx.fillText(code[i], -12, 0);
    ctx.restore();
  }

  const buffer = canvas.toBuffer("image/png");
  const attachment = new AttachmentBuilder(buffer, { name: "captcha.png" });

  return { code, attachment };
}

module.exports = { generateCaptcha };
