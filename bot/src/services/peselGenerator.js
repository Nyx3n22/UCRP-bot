/**
 * peselGenerator.js
 *
 * Generuje fikcyjny numer PESEL "in character" zgodny ze strukturą
 * prawdziwego algorytmu (do celów czysto RP — nie jest to walidator
 * ani generator realnych danych osobowych).
 *
 * Struktura: RRMMDDPPPPK
 *  RRMMDD - data urodzenia (miesiąc kodowany wg wieku/stulecia)
 *  PPPP   - numer seryjny losowy, ostatnia cyfra koduje płeć (parzysta=K, nieparzysta=M)
 *  K      - cyfra kontrolna wg wag [1,3,7,9,1,3,7,9,1,3]
 */

const CENTURY_OFFSETS = [
  { from: 1900, to: 1999, monthOffset: 0 },
  { from: 2000, to: 2099, monthOffset: 20 },
  { from: 1800, to: 1899, monthOffset: 80 },
  { from: 2100, to: 2199, monthOffset: 40 },
  { from: 2200, to: 2299, monthOffset: 60 },
];

const WEIGHTS = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];

function pad(num, len = 2) {
  return String(num).padStart(len, "0");
}

function resolveMonthOffset(year) {
  const bracket = CENTURY_OFFSETS.find((c) => year >= c.from && year <= c.to);
  if (!bracket) throw new Error(`Rok ${year} poza obsługiwanym zakresem PESEL.`);
  return bracket.monthOffset;
}

function computeChecksum(digits10) {
  const sum = digits10.reduce((acc, d, i) => acc + d * WEIGHTS[i], 0);
  return sum % 10;
}

/**
 * @param {Date} birthDate
 * @param {"MALE"|"FEMALE"} gender
 * @returns {string} 11-cyfrowy PESEL IC
 */
function generatePesel(birthDate, gender) {
  const year = birthDate.getFullYear();
  const month = birthDate.getMonth() + 1;
  const day = birthDate.getDate();

  const encodedMonth = month + resolveMonthOffset(year);
  const datePart = `${pad(year % 100)}${pad(encodedMonth)}${pad(day)}`;

  // 3 losowe cyfry seryjne + 1 cyfra płci (parzysta = kobieta, nieparzysta = mężczyzna)
  const serial = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  let genderDigit = Math.floor(Math.random() * 10);
  const wantsOdd = gender === "MALE";
  if (wantsOdd && genderDigit % 2 === 0) genderDigit = (genderDigit + 1) % 10;
  if (!wantsOdd && genderDigit % 2 === 1) genderDigit = (genderDigit + 1) % 10;

  const first10 = `${datePart}${serial}${genderDigit}`.split("").map(Number);
  const checksum = computeChecksum(first10);

  return `${first10.join("")}${checksum}`;
}

module.exports = { generatePesel };
