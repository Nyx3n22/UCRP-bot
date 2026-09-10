/**
 * services/socialMediaService.js
 * Odpytuje wszystkie aktywne subskrypcje (SocialMediaSubscription) i wysyła
 * embedy powiadomień na skonfigurowany kanał Discorda, gdy wykryje nową treść.
 *
 * Wzorzec: Strategy — każdy connector ma ten sam kształt zwracanej treści
 * (id + metadane), więc dodanie nowej platformy = dopisanie 1 case'a + connectora,
 * bez zmian w logice porównywania lastSeenId.
 */

const prisma = require("../lib/prisma");
const { decrypt } = require("../utils/crypto");
const { EmbedBuilder } = require("discord.js");

const twitchConnector = require("./socialMedia/twitchConnector");
const youtubeConnector = require("./socialMedia/youtubeConnector");
const instagramConnector = require("./socialMedia/instagramConnector");
const twitterConnector = require("./socialMedia/twitterConnector");
const tiktokConnector = require("./socialMedia/tiktokConnector");

const PLATFORM_COLORS = {
  TWITCH: 0x9146ff,
  YOUTUBE: 0xff0000,
  INSTAGRAM: 0xe1306c,
  TWITTER: 0x000000,
  TIKTOK: 0x010101,
};

class SocialMediaService {
  async pollAll(client) {
    const config = await prisma.socialMediaConfig.findUnique({ where: { id: "singleton" } });
    if (!config) return;

    const subscriptions = await prisma.socialMediaSubscription.findMany({ where: { enabled: true } });

    for (const sub of subscriptions) {
      try {
        await this._pollOne(client, config, sub);
      } catch (err) {
        console.error(`[socialMediaService] Błąd przy subskrypcji ${sub.platform}/${sub.externalHandle}:`, err.message);
      }
    }
  }

  async _pollOne(client, config, sub) {
    const latest = await this._fetchLatest(config, sub);
    if (!latest) return;
    if (latest.id === sub.lastSeenId) return; // nic nowego

    const channel = await client.channels.fetch(sub.discordChannelId).catch(() => null);
    if (channel) {
      await channel.send({ embeds: [this._buildEmbed(sub, latest)] });
    }

    await prisma.socialMediaSubscription.update({
      where: { id: sub.id },
      data: { lastSeenId: latest.id },
    });
  }

  async _fetchLatest(config, sub) {
    switch (sub.platform) {
      case "TWITCH": {
        if (!config.twitchClientId || !config.twitchClientSecretEncrypted) return null;
        return twitchConnector.checkLiveStatus({
          clientId: config.twitchClientId,
          clientSecret: decrypt(config.twitchClientSecretEncrypted),
          username: sub.externalHandle,
        });
      }
      case "YOUTUBE": {
        if (!config.youtubeApiKeyEncrypted) return null;
        return youtubeConnector.getLatestVideo({
          apiKey: decrypt(config.youtubeApiKeyEncrypted),
          channelId: sub.externalHandle,
        });
      }
      case "INSTAGRAM": {
        if (!config.instagramAccessTokenEncrypted) return null;
        return instagramConnector.getLatestMedia({
          accessToken: decrypt(config.instagramAccessTokenEncrypted),
          igUserId: sub.externalHandle,
        });
      }
      case "TWITTER": {
        if (!config.twitterBearerTokenEncrypted) return null; // brak płatnego API -> pomijamy zamiast failować
        return twitterConnector.getLatestTweet({
          bearerToken: decrypt(config.twitterBearerTokenEncrypted),
          userId: sub.externalHandle,
        });
      }
      case "TIKTOK":
        return tiktokConnector.getLatestPost({ username: sub.externalHandle });
      default:
        return null;
    }
  }

  _buildEmbed(sub, latest) {
    const platformLabel = {
      TWITCH: `🟣 ${sub.externalHandle} jest LIVE na Twitchu!`,
      YOUTUBE: `▶️ Nowy film na YouTube — ${sub.externalHandle}`,
      INSTAGRAM: `📸 Nowy post na Instagramie — ${sub.externalHandle}`,
      TWITTER: `🐦 Nowy wpis na X — @${sub.externalHandle}`,
      TIKTOK: `🎵 Nowy TikTok — @${sub.externalHandle}`,
    }[sub.platform];

    const embed = new EmbedBuilder()
      .setTitle(platformLabel ?? sub.platform)
      .setColor(PLATFORM_COLORS[sub.platform] ?? 0x5865f2);

    // Guardy ?? / warunkowe settery: connectory czasem zwracają null w
    // polach (np. brak miniaturki), a discord.js RZUCA na undefined w
    // setDescription/setURL/setImage. Bez tego jeden zły rekord blokowałby
    // aktualizację lastSeenId i spamował błędem co cykl.
    const safeUrl = (url) => (typeof url === "string" && url.startsWith("http") ? url : null);

    if (sub.platform === "TWITCH") {
      embed.setDescription((latest.title ?? "(bez tytułu)").slice(0, 4000));
      if (safeUrl(latest.url)) embed.setURL(latest.url);
      if (safeUrl(latest.thumbnailUrl)) embed.setImage(latest.thumbnailUrl);
      embed.addFields({ name: "Gra", value: (latest.gameName ?? "—").slice(0, 1000) });
    } else if (sub.platform === "YOUTUBE") {
      embed.setDescription((latest.title ?? "(bez tytułu)").slice(0, 4000));
      if (safeUrl(latest.url)) embed.setURL(latest.url);
      if (safeUrl(latest.thumbnailUrl)) embed.setImage(latest.thumbnailUrl);
    } else if (sub.platform === "INSTAGRAM") {
      embed.setDescription((latest.caption ?? "(bez opisu)").slice(0, 4000));
      if (safeUrl(latest.permalink)) embed.setURL(latest.permalink);
      if (safeUrl(latest.mediaUrl)) embed.setImage(latest.mediaUrl);
    } else if (sub.platform === "TWITTER") {
      embed.setDescription((latest.text ?? "(brak treści)").slice(0, 4000));
      if (safeUrl(latest.url)) embed.setURL(latest.url);
    } else if (sub.platform === "TIKTOK") {
      // Connector na razie zawsze zwraca null (brak publicznego API TikToka),
      // ale gdyby ktoś go kiedyś zaimplementował, embed ma być kompletny.
      embed.setDescription((latest.text ?? latest.title ?? "(nowy post)").slice(0, 4000));
      if (safeUrl(latest.url)) embed.setURL(latest.url);
      if (safeUrl(latest.thumbnailUrl)) embed.setImage(latest.thumbnailUrl);
    } else {
      embed.setDescription((latest.text ?? latest.title ?? "(nowa treść)").slice(0, 4000));
      if (safeUrl(latest.url)) embed.setURL(latest.url);
    }

    embed.setFooter({ text: "Uniwersytet Centralny RP • Social Media" }).setTimestamp();
    return embed;
  }
}

module.exports = new SocialMediaService();
