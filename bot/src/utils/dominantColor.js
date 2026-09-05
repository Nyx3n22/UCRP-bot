/**
 * utils/dominantColor.js
 * Wykrywa dominujący kolor obrazka (logo koła) przez próbkowanie pikseli,
 * i mapuje go na najbliższy kolorowy emoji kółka używany w nazwach
 * kategorii kół naukowych. Bez loga -> biały (domyślny).
 */

const { loadImage, createCanvas } = require("@napi-rs/canvas");

// Emoji kółek dostępne w Discordzie + ich przybliżone wartości RGB do porównania.
const PALETTE = [
  { emoji: "⚫", hex: "#000000", rgb: [0, 0, 0] },
  { emoji: "🔵", hex: "#3B88C3", rgb: [59, 136, 195] },
  { emoji: "🟤", hex: "#8B4513", rgb: [139, 69, 19] },
  { emoji: "🟢", hex: "#77B255", rgb: [119, 178, 85] },
  { emoji: "🟠", hex: "#F4900C", rgb: [244, 144, 12] },
  { emoji: "🟡", hex: "#FDCB58", rgb: [253, 203, 88] },
  { emoji: "⚪", hex: "#FFFFFF", rgb: [255, 255, 255] },
  { emoji: "🔴", hex: "#DD2E44", rgb: [221, 46, 68] },
  { emoji: "🟣", hex: "#9266CC", rgb: [146, 102, 204] },
];

const DEFAULT_RESULT = { emoji: "⚪", hex: "#FFFFFF" };

function nearest(rgb) {
  let best = PALETTE[0];
  let bestDist = Infinity;
  for (const color of PALETTE) {
    const dist = (rgb[0] - color.rgb[0]) ** 2 + (rgb[1] - color.rgb[1]) ** 2 + (rgb[2] - color.rgb[2]) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = color;
    }
  }
  return { emoji: best.emoji, hex: best.hex };
}

/**
 * Zwraca { emoji, hex } - najbliższy kolor z palety na podstawie
 * najczęściej występującego (nie licząc prawie-białych/prawie-czarnych
 * pikseli tła, żeby uniknąć zdominowania przez przezroczyste/białe tło
 * PNG) koloru na obrazku. Przy braku logo lub błędzie -> biały.
 */
async function detectDominantColor(imageUrl) {
  if (!imageUrl) return DEFAULT_RESULT;

  try {
    const image = await loadImage(imageUrl);
    const size = 32; // wystarczy małe próbkowanie
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    const buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 100) continue; // pomijamy przezroczyste piksele
      // pomijamy prawie-białe i prawie-czarne (zwykle tło, nie sam motyw)
      const brightness = (r + g + b) / 3;
      if (brightness > 240 || brightness < 15) continue;

      const key = `${Math.round(r / 24)}-${Math.round(g / 24)}-${Math.round(b / 24)}`;
      const entry = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
      entry.count++;
      entry.r += r;
      entry.g += g;
      entry.b += b;
      buckets.set(key, entry);
    }

    if (buckets.size === 0) return DEFAULT_RESULT;

    let topBucket = null;
    for (const entry of buckets.values()) {
      if (!topBucket || entry.count > topBucket.count) topBucket = entry;
    }

    const avgRgb = [topBucket.r / topBucket.count, topBucket.g / topBucket.count, topBucket.b / topBucket.count];
    return nearest(avgRgb);
  } catch (err) {
    console.error("[dominantColor] Błąd analizy logo, używam domyślnego koloru:", err.message);
    return DEFAULT_RESULT;
  }
}

module.exports = { detectDominantColor, PALETTE };
