import { Hono } from "hono";
import { type VersionInfo } from "../data/version-compat";
import { getCatalogSummary } from "../services/catalog";

const app = new Hono();

function backgroundStage(season: number, build: number): string {
  if (season === 10) return "seasonx";
  if (build === 11.31 || build === 11.4) return "winter19";
  if (build === 19.01) return "winter2021";
  if (build === 11.1) return "fortnitemares";
  if (season >= 21) return `season${season}00`;
  if (season === 9) return "default";
  return `season${season}`;
}

function pageContext(version?: VersionInfo) {
  const catalog = getCatalogSummary();
  const season = version?.season ?? 1;
  const build = version?.build ?? 1;
  const platform = version?.platform ?? "Windows";
  return {
    _activeDate: catalog.activationDate,
    _lastModified: catalog.activationDate,
    _locale: "en",
    season,
    build,
    platform,
    catalog,
  };
}

app.get("/content/api/pages/fortnite-game", (c) => {
  const context = pageContext(c.get("version") as VersionInfo | undefined);
  const stage = backgroundStage(context.season, context.build);
  return c.json({
    _title: "Fortnite Game",
    ...context,
    subgameinfo: {
      battleRoyale: { title: "Battle Royale", enabled: true, season: context.season },
      saveTheWorld: { title: "Save the World", enabled: true },
      creative: { title: "Creative", enabled: true },
    },
    dynamicbackgrounds: {
      backgrounds: {
        _type: "DynamicBackground",
        backgrounds: [
          { stage, _type: "DynamicBackgroundData", key: "lobby" },
          { stage, _type: "DynamicBackgroundData", key: "vault" },
        ],
      },
    },
    lobby: { stage, backgroundimage: "" },
  });
});

app.get("/content/api/pages/fortnite-game/news", (c) => {
  const context = pageContext(c.get("version") as VersionInfo | undefined);
  return c.json({
    _title: "News",
    ...context,
    news: {
      messages: [],
      season: context.season,
      build: context.build,
    },
  });
});

app.get("/content/api/pages/fortnite-game/spark-tracks", (c) => {
  const context = pageContext(c.get("version") as VersionInfo | undefined);
  return c.json({ _title: "Spark Tracks", ...context, sparkTracks: [] });
});

app.get("/content/api/pages/fortnite-game/seasonpasses", (c) => {
  const context = pageContext(c.get("version") as VersionInfo | undefined);
  return c.json({ _title: "Season Passes", ...context, seasonPasses: [] });
});

app.get("/content/api/pages/fortnite-game/radio-stations", (c) => {
  const context = pageContext(c.get("version") as VersionInfo | undefined);
  return c.json({ _title: "Radio Stations", ...context, stations: [] });
});

app.get("/content/api/pages/fortnite-game/current-storefront", (c) => {
  const context = pageContext(c.get("version") as VersionInfo | undefined);
  return c.json({
    _title: "Current Storefront",
    ...context,
    storefront: {
      catalogId: context.catalog.catalogId,
      activationDate: context.catalog.activationDate,
      expirationDate: context.catalog.expirationDate,
      storefronts: context.catalog.storefronts,
    },
  });
});

app.get("/content/api/pages/fortnite-game/*", (c) => {
  const context = pageContext(c.get("version") as VersionInfo | undefined);
  return c.json({ _title: "Fortnite", ...context });
});

export default app;
