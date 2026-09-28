import { Hono } from "hono";
import bcrypt from "bcrypt";
import { store } from "../storage/store";
import { createToken, extractBearerToken, decodeToken } from "../middleware/auth";
import { errorResponse } from "../utils/error";
import { makeID, generateExchangeCode } from "../utils/funcs";

const app = new Hono();
const exchangeCodes = new Map<string, { accountId: string; clientId: string; expiresAt: number }>();

const CLIENT_NAMES: Record<string, string> = {
  ec684b8c687f479fadea3cb2ad83f5c6: "Fortnite PC Game Client",
  fortnitePCGameClient: "Fortnite PC Game Client",
  "3446cd72694c4a4485d81b77adbb2141": "Fortnite iOS Game Client",
  fortniteIOSGameClient: "Fortnite iOS Game Client",
  "3f69e56c7649492c8cc29f1af08a8a12": "Fortnite Android Game Client",
  fortniteAndroidGameClient: "Fortnite Android Game Client",
  "6e31bdbae6a44f258474733db74f39ba": "Fortnite CN Game Client",
  fortniteCNGameClient: "Fortnite CN Game Client",
  "34a02cf8f4414e29b15921876da36f9a": "Launcher App Client 2",
  launcherAppClient2: "Launcher App Client 2",
  xyza7891343Fr4ZSPkQZ3kaL3I2sX8B5: "prod-fn",
  "5229dcd3ac3845208b496649092f251b": "Fortnite Switch Game Client",
  fortniteSwitchGameClient: "Fortnite Switch Game Client",
};

async function handleToken(c: any) {
  let clientId = "fortnitePCGameClient";
  let clientSecret = "";
  const authHeader = c.req.header("authorization") || "";
  if (authHeader.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
      const colonIdx = decoded.indexOf(":");
      if (colonIdx !== -1) {
        clientId = decoded.slice(0, colonIdx) || clientId;
        clientSecret = decoded.slice(colonIdx + 1) || "";
      }
    } catch {}
  }

  let body: Record<string, unknown>;
  const contentType = c.req.header("content-type") || "";
  if (contentType.includes("application/json")) {
    body = await c.req.json().catch(() => ({}));
  } else {
    body = await c.req.parseBody().catch(() => ({}));
  }
  const grantType = body.grant_type as string;
  if (body.client_id && !authHeader.toLowerCase().startsWith("basic ")) {
    clientId = body.client_id as string;
  }

  let accountId = "";
  let displayName = CLIENT_NAMES[clientId] || clientId;
  let authMethod = "client_credentials";
  const deviceId = (body.device_id as string) || makeID();

  switch (grantType) {
    case "client_credentials": {
      accountId = makeID();
      displayName = CLIENT_NAMES[clientId] || clientId;
      authMethod = "client_credentials";
      break;
    }
    case "password": {
      const email = body.username as string;
      const password = body.password as string;
      if (!email || !password) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.oauth.exchange_code_absent", "Missing credentials"), 400);
      let user = store.getAccountByEmail(email);
      if (!user) {
        const name = email.includes("@") ? email.split("@")[0] : email;
        const passwordHash = await bcrypt.hash(password, 10);
        user = store.createAccount(email, name, passwordHash);
      }
      accountId = user.accountId;
      displayName = user.displayName;
      authMethod = "password";
      break;
    }
    case "exchange_code": {
      const exchangeCode = body.exchange_code as string;
      if (!exchangeCode) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.oauth.exchange_code_absent", "Exchange code missing"), 400);
      const data = exchangeCodes.get(exchangeCode);
      if (!data || Date.now() > data.expiresAt) { exchangeCodes.delete(exchangeCode); return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.oauth.exchange_code_expired", "Exchange code expired"), 400); }
      const user = store.getAccount(data.accountId);
      if (!user) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.not_found", "Account not found"), 404);
      accountId = user.accountId;
      displayName = user.displayName;
      authMethod = "exchange_code";
      exchangeCodes.delete(exchangeCode);
      break;
    }
    case "authorization_code": {
      const code = body.code as string;
      if (!code) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.oauth.authorization_code_absent", "Authorization code missing"), 400);
      const data = exchangeCodes.get(code);
      if (!data || Date.now() > data.expiresAt) { exchangeCodes.delete(code); return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.oauth.authorization_code_expired", "Authorization code expired"), 400); }
      const user = store.getAccount(data.accountId);
      if (!user) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.not_found", "Account not found"), 404);
      accountId = user.accountId;
      displayName = user.displayName;
      authMethod = "authorization_code";
      exchangeCodes.delete(code);
      break;
    }
    case "device_auth": {
      const devId = body.device_id as string;
      const devAccountId = body.account_id as string;
      if (!devId || !devAccountId) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.oauth.device_auth_missing", "Device auth missing"), 400);
      const user = store.getAccount(devAccountId);
      if (!user) {
        accountId = devAccountId;
        displayName = "Device User";
        authMethod = "device_auth";
        break;
      }
      accountId = user.accountId;
      displayName = user.displayName;
      authMethod = "device_auth";
      break;
    }
    case "refresh_token": {
      const refreshTokenValue = body.refresh_token as string;
      if (!refreshTokenValue) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.oauth.refresh_token_missing", "Refresh token missing"), 400);
      const rawToken = refreshTokenValue.startsWith("eg1~") ? refreshTokenValue.slice(4) : refreshTokenValue;
      const decoded = decodeToken(rawToken);
      if (!decoded) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.oauth.refresh_token_invalid", "Invalid refresh token"), 400);
      const dbToken = store.getToken(rawToken);
      if (!dbToken || dbToken.type !== "refresh") return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.oauth.refresh_token_invalid", "Token not found"), 400);
      const user = store.getAccount(dbToken.accountId);
      if (!user) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.not_found", "Account not found"), 404);
      accountId = user.accountId;
      displayName = user.displayName;
      authMethod = "refresh_token";
      store.deleteToken(rawToken);
      break;
    }
    default:
      accountId = makeID();
      displayName = CLIENT_NAMES[clientId] || clientId;
      authMethod = grantType || "client_credentials";
      break;
  }

  const accessHours = grantType === "client_credentials" ? 4 : 8;
  const refreshHours = 24;
  const accessToken = createToken(accountId, clientId, deviceId, authMethod, displayName, "s", accessHours);
  const refreshToken = createToken(accountId, clientId, deviceId, authMethod, displayName, "r", refreshHours);
  const now = new Date();

  store.saveToken({ accountId, token: accessToken, type: "access", clientId, deviceId, authMethod, displayName, expiresAt: new Date(now.getTime() + accessHours * 3600000).toISOString() });
  store.saveToken({ accountId, token: refreshToken, type: "refresh", clientId, deviceId, authMethod, displayName, expiresAt: new Date(now.getTime() + refreshHours * 3600000).toISOString() });

  return c.json({
    access_token: `eg1~${accessToken}`,
    expires_in: accessHours * 3600,
    expires_at: new Date(now.getTime() + accessHours * 3600000).toISOString(),
    token_type: "bearer",
    refresh_token: `eg1~${refreshToken}`,
    refresh_expires_in: refreshHours * 3600,
    refresh_expires_at: new Date(now.getTime() + refreshHours * 3600000).toISOString(),
    account_id: accountId,
    client_id: clientId,
    internal_client: true,
    client_service: "fortnite",
    app: "fortnite",
    in_app_id: accountId,
  });
}

app.post("/account/api/oauth/token", handleToken);
app.post("/auth/v1/oauth/token", handleToken);
app.post("/epic/oauth/v2/token", handleToken);

app.get("/account/api/oauth/verify", async (c) => {
  const rawToken = extractBearerToken(c.req.header("authorization"));
  if (!rawToken) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.authorization_token_missing", "Token missing"), 401);
  const decoded = decodeToken(rawToken);
  if (!decoded) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.authorization_token_invalid", "Invalid token"), 401);
  return c.json({ token: `eg1~${rawToken}`, token_type: "bearer", client_id: decoded.clid, internal_client: true, client_service: "fortnite", account_id: decoded.sub, app: "fortnite", in_app_id: decoded.sub, expires_in: 28800, expires_at: new Date(Date.now() + 28800000).toISOString() });
});

app.delete("/account/api/oauth/sessions/kill/:token?", (c) => c.body(null, 204));

app.delete("/account/api/oauth/sessions/kill", async (c) => {
  const accountId = c.req.query("account_id");
  if (accountId) store.deleteAccountTokens(accountId);
  return c.body(null, 204);
});

app.get("/account/api/public/account", (c) => {
  const ids = c.req.query("accountId")?.split(",") || [];
  const accounts = store.getAccounts(ids);
  return c.json(accounts.map((a) => ({ id: a.accountId, displayName: a.displayName, email: a.email, externallyVerified: false, externalAuths: {} })));
});

app.get("/account/api/public/account/:accountId", (c) => {
  const user = store.getAccount(c.req.param("accountId"));
  if (!user) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.not_found", "Account not found"), 404);
  return c.json({ id: user.accountId, displayName: user.displayName, email: user.email, created: user.createdAt, externallyVerified: false, externalAuths: {} });
});

app.get("/account/api/public/account/displayName/:displayName", (c) => {
  const user = store.getAccountByDisplayName(c.req.param("displayName"));
  if (!user) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.not_found", "Account not found"), 404);
  return c.json({ id: user.accountId, displayName: user.displayName, email: user.email, externallyVerified: false, externalAuths: {} });
});

app.get("/id/api/redirect", (c) => {
  const clientId = c.req.query("clientId") || "fortnitePCGameClient";
  const accountId = c.req.query("account_id");
  if (!accountId) return c.text("Missing account_id", 400);
  const code = generateExchangeCode();
  exchangeCodes.set(code, { accountId, clientId, expiresAt: Date.now() + 300000 });
  return c.redirect(`${c.req.query("redirectUrl") || "https://www.epicgames.com/id/api/redirect"}?code=${code}`);
});

app.get("/account/api/oauth/authorization", async (c) => {
  const rawToken = extractBearerToken(c.req.header("authorization"));
  if (!rawToken) return c.json({ error: "invalid_token" }, 401);
  const decoded = decodeToken(rawToken);
  if (!decoded) return c.json({ error: "invalid_token" }, 401);
  return c.json({ sandbox_id: "fn", token_type: "bearer", client_id: decoded.clid, expires_in: 28800, expires_at: new Date(Date.now() + 28800000).toISOString(), app: "fortnite", in_app_id: decoded.sub, account_id: decoded.sub });
});

app.post("/account/api/public/account/:accountId/device-auth", async (c) => {
  const accountId = c.req.param("accountId");
  const user = store.getAccount(accountId);
  if (!user) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.not_found", "Account not found"), 404);
  const device = { deviceId: makeID().replace(/-/g, ""), accountId, secret: generateExchangeCode(), created: new Date().toISOString(), lastAccess: new Date().toISOString() };
  store.saveDeviceAuth(device);
  return c.json(device);
});

app.get("/account/api/public/account/:accountId/device-auth", (c) => c.json(store.listDeviceAuths(c.req.param("accountId"))));

app.get("/account/api/public/account/:accountId/device-auth/:deviceId", (c) => {
  const device = store.getDeviceAuth(c.req.param("accountId"), c.req.param("deviceId"));
  if (!device) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.not_found", "Device auth not found"), 404);
  return c.json(device);
});

app.delete("/account/api/public/account/:accountId/device-auth/:deviceId", (c) => {
  store.deleteDeviceAuth(c.req.param("accountId"), c.req.param("deviceId"));
  return c.body(null, 204);
});

app.get("/account/api/public/account/:accountId/externalAuths", (c) => c.json([]));

app.get("/account/api/public/account/email/:email", (c) => {
  const user = store.getAccountByEmail(c.req.param("email"));
  if (!user) return c.json(errorResponse("com.epicgames.account", "errors.com.epicgames.account.not_found", "Account not found"), 404);
  return c.json({ id: user.accountId, displayName: user.displayName, email: user.email, externallyVerified: false, externalAuths: {} });
});

export default app;
