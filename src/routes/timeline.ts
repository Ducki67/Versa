import { Hono } from "hono";
import { parseVersion } from "../data/version-compat";
import { getLobbyBgForBuild } from "../data/lobby-backgrounds";
import { getCatalogSummary } from "../services/catalog";

const app = new Hono();

app.get("/fortnite/api/calendar/v1/timeline", (c) => {
  const version = c.get("version") as ReturnType<typeof parseVersion> | undefined;
  const season = version?.season || 1;
  const build = version?.build || 1;
  const catalog = getCatalogSummary();
  const seasonTemplateId = `AthenaSeason:athenaseason${season}`;
  const eventFlags = [`Season${season}`, `LobbySeason${season}`];
  const calendarInfo = {
    week: 1,
    season,
    seasonNumber: season,
    build,
    platform: version?.platform || "Windows",
    catalogId: catalog.catalogId,
  };

  return c.json({
    channels: {
      "stw-dev": {
        states: [{ validFrom: catalog.activationDate, activeEvents: [], state: { calendarInfo } }],
        cacheExpire: catalog.expirationDate,
      },
      "common-core": {
        states: [{ validFrom: catalog.activationDate, activeEvents: [], state: { calendarInfo } }],
        cacheExpire: catalog.expirationDate,
      },
      "client-events": {
        states: [
          {
            validFrom: catalog.activationDate,
            activeEvents: [],
            state: {
              calendarInfo,
              seasonTemplateId,
              eventFlags,
              storefront: {
                catalogId: catalog.catalogId,
                expiration: catalog.expirationDate,
                storefronts: catalog.storefronts,
              },
            },
          },
        ],
        cacheExpire: catalog.expirationDate,
      },
    },
    events: [],
    posixTimestamps: true,
  });
});

app.get("/fortnite/api/game/v2/lobby-seasons", (c) => {
  const version = c.get("version") as ReturnType<typeof parseVersion> | undefined;
  const build = version?.build || 1;
  const season = version?.season || 1;
  const bg = getLobbyBgForBuild(build);
  const catalog = getCatalogSummary();
  return c.json({
    currentSeason: season,
    seasonNumber: season,
    build,
    platform: version?.platform || "Windows",
    lobbyBg: bg.templateId,
    lobbyBackground: bg.resourcePath,
    catalogId: catalog.catalogId,
    activeDate: catalog.activationDate,
    expirationDate: catalog.expirationDate,
  });
});

export default app;
