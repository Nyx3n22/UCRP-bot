/**
 * utils/legitymacja.js
 * Wspólna logika ważności legitymacji studenckiej: nowa postać dostaje
 * 365 dni ważności od momentu zatwierdzenia weryfikacji; dziekanat może
 * ją przedłużyć (/dziekanat legitymacja-przedluz).
 */

const VALIDITY_DAYS = 365;

function computeInitialValidUntil() {
  return new Date(Date.now() + VALIDITY_DAYS * 24 * 60 * 60 * 1000);
}

/** Przedłuża o VALIDITY_DAYS od DZIŚ (nie od starej daty ważności) - jeśli
 * ktoś odnawia legitymację po jej wygaśnięciu, dostaje pełny nowy okres
 * liczony od teraz, a nie "dogonienie" starego terminu. */
function computeRenewedValidUntil() {
  return new Date(Date.now() + VALIDITY_DAYS * 24 * 60 * 60 * 1000);
}

function isValid(legitValidUntil) {
  if (!legitValidUntil) return false;
  return legitValidUntil.getTime() > Date.now();
}

module.exports = { VALIDITY_DAYS, computeInitialValidUntil, computeRenewedValidUntil, isValid };
