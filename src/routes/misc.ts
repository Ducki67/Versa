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

app.all("/datarouter/api/v1/public/*", async (c) => c.body(null, 204));

app.get("/presence/api/v1/_/:accountId/settings/subscriptions", (c) => c.body(null, 204));

function generalChatRooms(c: { json: (v: unknown) => Response }) {
  return c.json({ GlobalChatRooms: [{ RoomName: "versa-general" }], bShouldJoinGlobalChat: true, bIsGlobalChatEnabled: true, ClanChatRooms: [], bIsClanChatEnabled: false });
}

app.get("/fortnite/api/game/v2/chat/:accountId/recommendGeneralChatRooms/:namespace/:platform", generalChatRooms);

app.post("/fortnite/api/game/v2/chat/:accountId/recommendGeneralChatRooms/:namespace/:platform", generalChatRooms);

app.get("/socialban/api/public/v1/:accountId", (c) => c.body(null, 204));

app.get("/content-controls/:accountId", (c) => c.body(null, 204));

app.get("/fortnite/api/game/v2/privacy/account/:accountId", (c) => c.json({ accountId: c.req.param("accountId"), optOutOfPublicLeaderboards: false }));

app.all("/fortnite/api/game/v2/br-inventory/account/:accountId", (c) => c.json({ stash: { globalcash: 0 } }));

app.get("/catalog/api/shared/bulk/offers", (c) => {
  const desc = "Fortnite V-Bucks are a premium in-game currency you can spend on outfits, gliders, pickaxes, emotes and the Battle Pass.";
  const packs: Record<string, { price: number; title: string }> = {
    "offer://MtxPack1000": { price: 999, title: "1,000 V-Bucks" },
    "offer://MtxPack2800": { price: 2499, title: "2,800 V-Bucks" },
    "offer://MtxPack7500": { price: 5999, title: "7,500 V-Bucks" },
    "offer://MtxPack13500": { price: 9999, title: "13,500 V-Bucks" },
  };
  let ids: string[] = [];
  try {
    const q = c.req.queries("id") as unknown as string[] | undefined;
    if (Array.isArray(q)) ids = q;
  } catch {}
  if (ids.length === 0) {
    const single = c.req.query("id");
    if (single) ids = [single];
  }
  if (ids.length === 0) ids = Object.keys(packs);
  const out: Record<string, unknown> = {};
  for (const id of ids) {
    const p = packs[id];
    if (!p) continue;
    out[id] = { id, title: p.title, description: desc, longDescription: desc, shortDescription: "", keyImages: [], currencyCode: "EUR", basePriceCurrencyCode: "EUR", basePrice: p.price, currentPrice: p.price, price: p.price, creationDate: "0000-00-00T00:00:00.000Z" };
  }
  return c.json(out);
});

app.get("/api/v1/assets/Fortnite/:version/", (c) => c.json([]));

app.post("/api/v1/assets/Fortnite/:version/:netcl", (c) => c.json({ FortPlaylistAthena: { meta: { promotion: 0 }, assets: {} } }));

app.get("/fortnite/api/game/v2/creative/history/:accountId", (c) => c.json({ results: [], hasMore: false }));

app.get("/fortnite/api/game/v2/creative/favorites/:accountId", (c) => c.json({ results: [], hasMore: false }));

app.get("/launcher/api/public/distributionpoints/", (c) => c.json({ distributions: ["https://download.epicgames.com/", "https://download2.epicgames.com/", "https://download3.epicgames.com/", "https://download4.epicgames.com/", "https://epicgames-download1.akamaized.net/", "https://fastly-download.epicgames.com/"] }));

app.get("/waitingroom/api/waitingroom", (c) => c.json({ status: "disabled" }));

app.post("/api/v1/user/setting", async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const accountId = String((body as Record<string, unknown>).accountId || "");
  return c.json([
    { accountId, key: "avatar", value: "cid_003_athena_commando_f_default" },
    { accountId, key: "avatarBackground", value: "[\"#B4F2FE\",\"#00ACF2\",\"#005679\"]" },
    { accountId, key: "appInstalled", value: "init" },
  ]);
});

app.get("/region", (c) => c.json({ region: "NA", subregion: "US-East" }));

app.all("/v1/epic-settings/public/users/:accountId/values", (c) => c.json({ response: { settings: [{ namespace: "profile", settingName: "allow-non-squad-users-to-see-my-username", effectiveValue: true, effectiveSource: "preference", parentLimit: true }, { namespace: "profile", settingName: "can-see-player-usernames-from-other-squads", effectiveValue: true, effectiveSource: "preference", parentLimit: true }, { namespace: "chat", settingName: "filter-out-mature-language", effectiveValue: false, effectiveSource: "preference", parentLimit: false }, { namespace: "chat", settingName: "text", effectiveValue: "everybody", effectiveSource: "preference", parentLimit: "everybody" }, { namespace: "chat", settingName: "voice", effectiveValue: "everybody", effectiveSource: "preference", parentLimit: "everybody" }] }, meta: { requestId: "", timestamp: new Date().toISOString() } }));
app.get("/api/v1/user/:accountId/settings", (c) => c.json({ avatar: "cid_003_athena_commando_f_default", avatarBackground: "[\"#B4F2FE\",\"#00ACF2\",\"#005679\"]", appInstalled: "init" }));
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
