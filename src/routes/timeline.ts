import { Hono } from "hono";
import { parseVersion } from "../data/version-compat";
import { getLobbyBgForBuild } from "../data/lobby-backgrounds";

const app = new Hono();

app.get("/fortnite/api/calendar/v1/timeline", (c) => {
  const version = c.get("version") as ReturnType<typeof parseVersion> | undefined;
  const season = version?.season || 1;

  return c.json({
    channels: {
      "stw-dev": {
        states: [{ validFrom: "2024-01-01T00:00:00.000Z", activeEvents: [], state: { calendarInfo: { week: 1, season } } }],
        cacheExpire: "9999-12-31T23:59:59.000Z",
      },
      "common-core": {
        states: [{ validFrom: "2024-01-01T00:00:00.000Z", activeEvents: [], state: { calendarInfo: { week: 1, season } } }],
        cacheExpire: "9999-12-31T23:59:59.000Z",
      },
    },
    events: [],
    posixTimestamps: true,
  });
});

app.get("/fortnite/api/game/v2/lobby-seasons", (c) => {
  const version = c.get("version") as ReturnType<typeof parseVersion> | undefined;
  const bg = version ? getLobbyBgForBuild(version.build) : getLobbyBgForBuild(1);
  return c.json({
    currentSeason: version?.season || 1,
    seasonNumber: version?.season || 1,
    lobbyBg: bg.templateId,
    lobbyBackground: bg.resourcePath,
  });
});

export default app;
