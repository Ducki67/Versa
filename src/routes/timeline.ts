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
  const seasonTemplateId = season < 2 ? `AthenaSeason:AthenaSeason${String(season).padStart(2, "0")}` : `AthenaSeason:athenaseason${season}`;
  const validFrom = catalog.activationDate;
  const cacheExpire = catalog.expirationDate;
  const calendarInfo = {
    week: 1,
    season,
    seasonNumber: season,
    build,
    platform: version?.platform || "Windows",
    catalogId: catalog.catalogId,
  };
  const clientState = {
    activeStorefronts: [],
    eventNamedWeights: {},
    activeEvents: [],
    seasonNumber: season,
    seasonTemplateId,
    matchXpBonusPoints: 0,
    eventPunchCardTemplateId: "",
    seasonBegin: cacheExpire,
    seasonEnd: cacheExpire,
    seasonDisplayedEnd: cacheExpire,
    weeklyStoreEnd: cacheExpire,
    stwEventStoreEnd: cacheExpire,
    stwWeeklyStoreEnd: cacheExpire,
    dailyStoreEnd: cacheExpire,
    eventFlags: [`Season${season}`, `LobbySeason${season}`],
    calendarInfo,
    storefront: {
      catalogId: catalog.catalogId,
      expiration: cacheExpire,
      storefronts: catalog.storefronts,
    },
  };

  return c.json({
    channels: {
      "standalone-store": {},
      "client-matchmaking": {},
      "tk-daily-quests": {
        states: [{ validFrom, activeEvents: [], state: {} }],
        cacheExpire,
      },
      tk: {},
      "featured-islands": {},
      "community-votes": {},
      stw: {
        states: [{ validFrom, activeEvents: [], state: { calendarInfo } }],
        cacheExpire,
      },
      "stw-dev": {
        states: [{ validFrom, activeEvents: [], state: { calendarInfo } }],
        cacheExpire,
      },
      "common-core": {
        states: [{ validFrom, activeEvents: [], state: { calendarInfo } }],
        cacheExpire,
      },
      "client-events": {
        states: [
          {
            validFrom,
            activeEvents: [
              {
                eventType: `EventFlag.LobbySeason${season}`,
                activeUntil: cacheExpire,
                activeSince: validFrom,
              },
            ],
            state: clientState,
          },
        ],
        cacheExpire,
      },
    },
    events: [],
    cacheIntervalMins: 99999,
    currentTime: new Date().toISOString(),
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
