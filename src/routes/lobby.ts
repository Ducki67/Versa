import { Hono } from "hono";
import { parseVersion, getSeasonFromBuild, getMCPResponseVersion } from "../data/version-compat";
import { getLobbyBgForBuild } from "../data/lobby-backgrounds";
import { getCatalogSummary } from "../services/catalog";

const app = new Hono();

function getLobbyData(version: ReturnType<typeof parseVersion>) {
  const season = version.season;
  const build = version.build;
  const catalog = getCatalogSummary();
  const bg = getLobbyBgForBuild(build);
  return {
    season,
    seasonNumber: season,
    build,
    platform: version.platform || "Windows",
    lobbyBg: bg.templateId,
    lobbyBackground: bg.resourcePath,
    catalogId: catalog.catalogId,
    activeDate: catalog.activationDate,
    expirationDate: catalog.expirationDate,
  };
}

app.get("/fortnite/api/game/v2/lobby-seasons", (c) => {
  const version = c.get("version") as ReturnType<typeof parseVersion> | undefined;
  const data = getLobbyData(version || { season: 1, build: 1, CL: "0", lobby: "", isMobile: false, platform: "Windows" });
  return c.json({
    currentSeason: data.season,
    seasonNumber: data.seasonNumber,
    build: data.build,
    platform: data.platform,
    lobbyBg: data.lobbyBg,
    lobbyBackground: data.lobbyBackground,
    catalogId: data.catalogId,
    activeDate: data.activeDate,
    expirationDate: data.expirationDate,
  });
});

app.get("/fortnite/api/game/v2/lobby/:accountId", (c) => {
  const version = c.get("version") as ReturnType<typeof parseVersion> | undefined;
  const data = getLobbyData(version || { season: 1, build: 1, CL: "0", lobby: "", isMobile: false, platform: "Windows" });
  return c.json({
    accountId: c.req.param("accountId"),
    ...data,
    isInLobby: true,
    gameMode: "Fortnite:BattleRoyale",
    playlistContext: {
      playlistName: "Playlist_DefaultDuo",
      gameMode: "FortniteGame!AthenaGameMode",
      era: data.season,
      subGameMode: [],
    },
    partyRestriction: false,
    banReasons: [],
    banned: false,
    restrictions: [],
  });
});

app.get("/fortnite/api/game/v2/lobby-state", (c) => {
  const version = c.get("version") as ReturnType<typeof parseVersion> | undefined;
  const data = getLobbyData(version || { season: 1, build: 1, CL: "0", lobby: "", isMobile: false, platform: "Windows" });
  return c.json({
    state: "Lobby",
    season: data.season,
    build: data.build,
    platform: data.platform,
    lobbyBg: data.lobbyBg,
    lobbyBackground: data.lobbyBackground,
    catalogId: data.catalogId,
  });
});

app.get("/fortnite/api/game/v2/matchmaking/playlist", (c) => {
  const version = c.get("version") as ReturnType<typeof parseVersion> | undefined;
  const build = version?.build || 1;
  return c.json({
    playlists: [
      { id: "Playlist_DefaultDuo", name: "Battle Royale", icon: "/Game/UI/Home/Playlist/Icons/SQ_Pair_128x128", sortIndex: 0, imageSize: { width: 128, height: 128 }, gameMode: "FortniteGame!AthenaGameMode", playlistContext: { playlistName: "Playlist_DefaultDuo", gameMode: "FortniteGame!AthenaGameMode" }, disabled: false, isTemporary: false, build: build },
      { id: "Playlist_DefaultSolo", name: "Battle Royale Solo", icon: "/Game/UI/Home/Playlist/Icons/SQ_Solo_128x128", sortIndex: 1, imageSize: { width: 128, height: 128 }, gameMode: "FortniteGame!AthenaGameMode", playlistContext: { playlistName: "Playlist_DefaultSolo", gameMode: "FortniteGame!AthenaGameMode" }, disabled: false, isTemporary: false, build: build },
      { id: "Playlist_DefaultTeam", name: "Battle Royale Team", icon: "/Game/UI/Home/Playlist/Icons/SQ_Team_128x128", sortIndex: 2, imageSize: { width: 128, height: 128 }, gameMode: "FortniteGame!AthenaGameMode", playlistContext: { playlistName: "Playlist_DefaultTeam", gameMode: "FortniteGame!AthenaGameMode" }, disabled: false, isTemporary: false, build: build },
      { id: "Playlist_Arenas", name: "Arenas", icon: "/Game/UI/Home/Playlist/Icons/SQ_Arena_128x128", sortIndex: 3, imageSize: { width: 128, height: 128 }, gameMode: "FortniteGame!AthenaGameMode", playlistContext: { playlistName: "Playlist_Arenas", gameMode: "FortniteGame!AthenaGameMode" }, disabled: false, isTemporary: false, build: build },
      { id: "Playlist_Creative", name: "Creative", icon: "/Game/UI/Home/Playlist/Icons/SQ_Creative_128x128", sortIndex: 4, imageSize: { width: 128, height: 128 }, gameMode: "FortniteGame!CreativeGameMode", playlistContext: { playlistName: "Playlist_Creative", gameMode: "FortniteGame!CreativeGameMode" }, disabled: false, isTemporary: false, build: build },
    ],
  });
});

app.get("/fortnite/api/game/v2/restrictions/:accountId", (c) => {
  return c.json({ restrictions: [] });
});

app.get("/fortnite/api/game/v2/banned/:accountId", (c) => {
  return c.json({ isBanned: false, banReasons: [], banMessage: "" });
});

app.get("/fortnite/api/notifications/v1/fortnite/search", (c) => {
  return c.json({ notifications: [] });
});

app.get("/fortnite/api/game/v2/world/info", (c) => {
  return c.json({ campaigns: {}, worldInfo: {} });
});

app.get("/fortnite/api/game/v2/creative/maps/:accountId", (c) => {
  return c.json({ maps: [] });
});

app.get("/fortnite/api/game/v2/twitch/:accountId", (c) => {
  return c.json({});
});

app.get("/fortnite/api/receipts/v1/account/:accountId/receipts", (c) => {
  return c.json([]);
});

app.get("/fortnite/api/game/v2/enabled_features", (c) => {
  return c.json([]);
});

app.post("/fortnite/api/game/v2/grant_access/:accountId", (c) => c.body(null, 204));

app.post("/fortnite/api/game/v2/tryPlayOnPlatform/account/:accountId", (c) => c.body("true", 200, { "Content-Type": "text/plain" }));

app.get("/waitingroom/api/waitingroom", (c) => c.json({ status: "disabled" }));

app.get("/region", (c) => c.json({ region: "NA", subregion: "US-East" }));

app.get("/v1/epic-settings/public/users/:accountId/values", (c) => c.json({}));

app.get("/account/api/epicdomains/ssodomains", (c) => c.json(["unrealengine.com", "unrealtournament.com", "fortnite.com", "epicgames.com"]));

app.get("/eulatracking/api/shared/agreements/fn", (c) => c.json({}));

app.get("/eulatracking/api/shared/agreements", (c) => c.json({ agreements: [] }));

app.get("/lightswitch/api/service/Fortnite/status", (c) => c.json({ serviceInstanceId: "fortnite", status: "UP", message: `Versa is online`, maintenanceUri: null, overrideCatalogIds: ["a7f138b2e51945ffbfdacc1af0541053"], allowedActions: [], banned: false, launcherInfoDTO: { appName: "Fortnite", catalogItemId: "4fe75bbc5a674f4f9b356b5c90567da5", namespace: "fn" } }));

app.get("/lightswitch/api/service/bulk/status", (c) => c.json([{ serviceInstanceId: "fortnite", status: "UP", message: "fortnite is up.", maintenanceUri: null, overrideCatalogIds: ["a7f138b2e51945ffbfdacc1af0541053"], allowedActions: ["PLAY", "DOWNLOAD"], banned: false, launcherInfoDTO: { appName: "Fortnite", catalogItemId: "4fe75bbc5a674f4f9b356b5c90567da5", namespace: "fn" } }]));

app.get("/fortnite/api/versioncheck", (c) => c.json({ type: "NO_UPDATE" }));

app.get("/fortnite/api/versioncheck*", (c) => c.json({ type: "NO_UPDATE" }));

app.get("/fortnite/api/v2/versioncheck", (c) => c.json({ type: "NO_UPDATE" }));

app.get("/fortnite/api/v2/versioncheck/:platform", (c) => c.json({ type: "NO_UPDATE" }));

app.get("/fortnite/api/v2/versioncheck*", (c) => c.json({ type: "NO_UPDATE" }));

app.get("/sdk/v1/default", (c) => c.json({ clientId: "fortnite", scope: [], expiresAt: "9999-12-31T23:59:59.000Z" }));

app.get("/sdk/v1/accounts/:accountId/sdk", (c) => c.json({ clientId: "fortnite", scope: [], expiresAt: "9999-12-31T23:59:59.000Z" }));

app.get("/hotconfigs/v2/livefn.json", (c) => c.json({}));

app.get("/hotconfigs/v2/*", (c) => c.json({}));

app.get("/fortnite/api/matchmaking/*", (c) => c.json({}));

app.post("/datarouter/api/v1/public/data", async (c) => c.body(null, 204));

app.post("/fortnite/api/game/v2/offer-redemption/:offerId/redeem", async (c) => c.body(null, 204));

app.get("/fortnite/api/game/v2/account/:accountId/history", (c) => c.json([]));

app.post("/fortnite/api/game/v2/lobby/:accountId/join", async (c) => c.body(null, 204));

app.post("/fortnite/api/game/v2/lobby/:accountId/leave", async (c) => c.body(null, 204));

app.get("/fortnite/api/game/v2/lobby/:accountId/playlist", (c) => c.json({
  playlist: "Playlist_DefaultDuo",
  gameMode: "FortniteGame!AthenaGameMode",
}));

app.post("/fortnite/api/game/v2/lobby/:accountId/playlist", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  return c.json({
    playlist: body.playlist || "Playlist_DefaultDuo",
    gameMode: "FortniteGame!AthenaGameMode",
    success: true,
  });
});

app.get("/fortnite/api/game/v2/lobby/:accountId/matchmaking", (c) => c.json({
  isMatchmaking: false,
  playlist: "Playlist_DefaultDuo",
  searchDelay: 0,
}));

export default app;