/**
 * aiCreditService.js
 *
 * Odpowiada za:
 *  - wyliczenie kosztu operacji AI na podstawie długości wiadomości
 *    (progi trzymane w tabeli AiPricingTier -> edytowalne z Dashboardu,
 *    z fallbackiem na wartości domyślne ze specyfikacji)
 *  - sprawdzenie, czy użytkownik ma rolę dającą nielimitowany dostęp
 *  - odejmowanie / odnawianie kredytów
 *
 * Wzorzec: Service Layer + Strategy (progi cenowe jako dane, nie ifologia)
 */

const prisma = require("../lib/prisma");
const { hasPermission } = require("../config/roles");

const DEFAULT_TIERS = [
  { minChars: 0, maxChars: 10, creditCost: 0.2 },
  { minChars: 10, maxChars: 50, creditCost: 0.4 },
  { minChars: 50, maxChars: 100, creditCost: 0.5 },
  { minChars: 100, maxChars: null, creditCost: 0.8 },
];

const DAILY_FREE_CREDITS = 2;

class AiCreditService {
  /** Zwraca listę progów - z bazy jeśli skonfigurowane, inaczej domyślne */
  async getPricingTiers() {
    const tiers = await prisma.aiPricingTier.findMany({ orderBy: { minChars: "asc" } });
    return tiers.length > 0 ? tiers : DEFAULT_TIERS;
  }

  async calculateCost(text) {
    const len = text.length;
    const tiers = await this.getPricingTiers();
    const tier = tiers.find(
      (t) => len >= t.minChars && (t.maxChars === null || len <= t.maxChars)
    );
    // fallback: jeśli nic nie pasuje (np. dziura w konfiguracji), bierz najwyższy próg
    return tier ? tier.creditCost : tiers[tiers.length - 1].creditCost;
  }

  /** Czy member ma rolę oznaczoną w Dashboardzie jako DONATE_UNLIMITED_AI */
  async hasUnlimitedAccess(member) {
    return hasPermission(member, "DONATE_UNLIMITED_AI");
  }

  /**
   * Główna bramka wywoływana z messageCreate przed zapytaniem do AI.
   * Rzuca CreditError jeśli brak środków.
   */
  async chargeForMessage(member, text) {
    const unlimited = await this.hasUnlimitedAccess(member);

    const user = await this._ensureUserWithResetCheck(member.id);

    if (unlimited) {
      await prisma.aiUsageLog.create({
        data: {
          userId: member.id,
          channelId: "n/a",
          charCount: text.length,
          creditCost: 0,
          unlimited: true,
        },
      });
      return { charged: 0, remaining: user.aiCredits, unlimited: true };
    }

    const cost = await this.calculateCost(text);

    if (user.aiCredits < cost) {
      throw new CreditError(
        `Za mało kredytów AI. Potrzebne: ${cost}, dostępne: ${user.aiCredits.toFixed(2)}.`
      );
    }

    const updated = await prisma.discordUser.update({
      where: { id: member.id },
      data: { aiCredits: { decrement: cost } },
    });

    await prisma.aiUsageLog.create({
      data: {
        userId: member.id,
        channelId: "n/a",
        charCount: text.length,
        creditCost: cost,
        unlimited: false,
      },
    });

    return { charged: cost, remaining: updated.aiCredits, unlimited: false };
  }

  /**
   * Odnawia kredyty raz na okres (domyślnie 24h) do wartości bazowej.
   * Wołane leniwie przy każdej próbie użycia, więc nie trzeba osobnego crona
   * (choć cron też można podpiąć dla czystości danych na Dashboardzie).
   */
  async _ensureUserWithResetCheck(discordId) {
    let user = await prisma.discordUser.findUnique({ where: { id: discordId } });

    if (!user) {
      user = await prisma.discordUser.create({
        data: { id: discordId, aiCredits: DAILY_FREE_CREDITS },
      });
    }

    const hoursSinceReset =
      (Date.now() - new Date(user.aiCreditsResetAt).getTime()) / (1000 * 60 * 60);

    if (hoursSinceReset >= 24 && user.aiCredits < DAILY_FREE_CREDITS) {
      user = await prisma.discordUser.update({
        where: { id: discordId },
        data: { aiCredits: DAILY_FREE_CREDITS, aiCreditsResetAt: new Date() },
      });
    }

    return user;
  }
}

class CreditError extends Error {}

module.exports = { AiCreditService: new AiCreditService(), CreditError };
