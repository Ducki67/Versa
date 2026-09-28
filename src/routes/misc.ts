import { Hono } from "hono";

const app = new Hono();

app.get("/hotconfigs/v2/livefn.json", (c) => c.json({}));

app.get("/hotconfigs/v2/*", (c) => c.json({}));

app.get("/fortnite/api/versioncheck", (c) => c.json({ type: "NO_UPDATE" }));

app.get("/fortnite/api/versioncheck*", (c) => c.json({ type: "NO_UPDATE" }));

app.get("/fortnite/api/v2/versioncheck", (c) => c.json({ type: "NO_UPDATE" }));

app.get("/fortnite/api/v2/versioncheck/:platform", (c) => c.json({ type: "NO_UPDATE" }));

app.get("/fortnite/api/v2/versioncheck*", (c) => c.json({ type: "NO_UPDATE" }));

app.get("/sdk/v1/default", (c) => c.json({ clientId: "fortnite", scope: [], expiresAt: "9999-12-31T23:59:59.000Z" }));

app.get("/sdk/v1/accounts/:accountId/sdk", (c) => c.json({ clientId: "fortnite", scope: [], expiresAt: "9999-12-31T23:59:59.000Z" }));

app.get("/lightswitch/api/service/Fortnite/status", (c) => c.json({ serviceInstanceId: "fortnite", status: "UP", message: `Versa is online`, maintenanceUri: null, overrideCatalogIds: ["a7f138b2e51945ffbfdacc1af0541053"], allowedActions: [], banned: false, launcherInfoDTO: { appName: "Fortnite", catalogItemId: "4fe75bbc5a674f4f9b356b5c90567da5", namespace: "fn" } }));

app.get("/lightswitch/api/service/bulk/status", (c) => c.json([{ serviceInstanceId: "fortnite", status: "UP", message: "fortnite is up.", maintenanceUri: null, overrideCatalogIds: ["a7f138b2e51945ffbfdacc1af0541053"], allowedActions: ["PLAY", "DOWNLOAD"], banned: false, launcherInfoDTO: { appName: "Fortnite", catalogItemId: "4fe75bbc5a674f4f9b356b5c90567da5", namespace: "fn" } }]));

app.post("/datarouter/api/v1/public/data", async (c) => c.body(null, 204));

app.get("/waitingroom/api/waitingroom", (c) => c.json({ status: "disabled" }));
app.post("/api/v1/user/setting", async (c) => c.body(null, 204));

app.get("/region", (c) => c.json({ region: "NA", subregion: "US-East" }));

app.get("/v1/epic-settings/public/users/:accountId/values", (c) => c.json({}));
app.get("/api/v1/user/:accountId/settings", (c) => c.json({}));
app.post("/api/v1/user/:accountId/settings", async (c) => c.body(null, 204));
app.post("/fortnite/api/game/v2/profileToken/verify/:accountId", async (c) => c.body(null, 204));
app.get("/fortnite/api/stats/account/:accountId", (c) => c.json({}));
app.post("/fortnite/api/statsv2/query", async (c) => c.json([]));
app.get("/fortnite/api/statsv2/account/:accountId", (c) => c.json({}));
app.get("/api/v1/events/Fortnite/download/:accountId", (c) => c.json({}));

app.get("/account/api/epicdomains/ssodomains", (c) => c.json(["unrealengine.com", "unrealtournament.com", "fortnite.com", "epicgames.com"]));

app.get("/fortnite/api/game/v2/restrictions/:accountId", (c) => c.json({ restrictions: [] }));

app.get("/fortnite/api/game/v2/banned/:accountId", (c) => c.json({ isBanned: false, banReasons: [], banMessage: "" }));

app.get("/fortnite/api/notifications/v1/fortnite/search", (c) => c.json({ notifications: [] }));

app.get("/fortnite/api/game/v2/world/info", (c) => c.json({ campaigns: {}, worldInfo: {} }));

app.get("/fortnite/api/game/v2/creative/maps/:accountId", (c) => c.json({ maps: [] }));

app.get("/fortnite/api/game/v2/twitch/:accountId", (c) => c.json({}));

app.get("/fortnite/api/receipts/v1/account/:accountId/receipts", (c) => c.json([]));

app.get("/fortnite/api/game/v2/enabled_features", (c) => c.json([]));

app.post("/fortnite/api/game/v2/grant_access/:accountId", (c) => c.body(null, 204));

app.get("/fortnite/api/matchmaking/*", (c) => c.json({}));

app.post("/fortnite/api/game/v2/tryPlayOnPlatform/account/:accountId", (c) => c.body("true", 200, { "Content-Type": "text/plain" }));

app.get("/eulatracking/api/shared/agreements/fn", (c) => c.json({}));

app.get("/eulatracking/api/shared/agreements", (c) => c.json({ agreements: [] }));

export default app;
