import { Hono } from "hono";
import { cors } from "hono/cors";
import { timing } from "hono/timing";
import { verifyClient } from "./middleware/auth";
import { versionCheck } from "./middleware/version";
import { logger } from "./utils/logger";
import { errorResponse } from "./utils/error";

import authRoutes from "./routes/auth";
import cloudstorageRoutes from "./routes/cloudstorage";
import mcpRoutes from "./routes/mcp";
import matchmakingRoutes from "./routes/matchmaking";
import storefrontRoutes from "./routes/storefront";
import timelineRoutes from "./routes/timeline";
import friendsRoutes from "./routes/friends";
import miscRoutes from "./routes/misc";
import contentRoutes from "./routes/content";

import { startXmpp } from "./xmpp/server";
import { startMatchmaker } from "./matchmaker/server";

const app = new Hono();

app.use("*", cors());
app.use("*", timing());
app.use("*", async (c, next) => {
  const start = performance.now();
  await next();
  const ms = (performance.now() - start).toFixed(1);
  const status = c.res.status;
  const method = c.req.method;
  const p = c.req.path;
  const statusColor = status >= 400 ? "\x1b[31m" : status >= 300 ? "\x1b[33m" : "\x1b[32m";
  console.log(`${"\x1b[90m"}${new Date().toISOString().slice(11, 19)}${"\x1b[0m"} ${statusColor}${status}${"\x1b[0m"} ${method} ${p} ${"\x1b[90m"}${ms}ms${"\x1b[0m"}`);
});
app.use("*", versionCheck);

app.route("/", authRoutes);
app.route("/", cloudstorageRoutes);
app.route("/", contentRoutes);

app.use("/fortnite/api/*", async (c, next) => {
  const p = c.req.path;
  if (p.startsWith("/fortnite/api/cloudstorage/")) return next();
  if (p.startsWith("/fortnite/api/game/v2/matchmaking")) return next();
  if (p.includes("/versioncheck")) return next();
  if (p.includes("/tryPlayOnPlatform")) return next();
  if (p.includes("/enabled_features")) return next();
  if (p.includes("/grant_access")) return next();
  return verifyClient(c, next);
});
app.use("/friends/api/*", verifyClient);

app.route("/", mcpRoutes);
app.route("/", matchmakingRoutes);
app.route("/", storefrontRoutes);
app.route("/", timelineRoutes);
app.route("/", friendsRoutes);
app.route("/", miscRoutes);

app.notFound((c) => {
  const p = c.req.path;
  if (p.includes("/hotconfigs/") || p.includes("/livefn")) {
    return c.json({});
  }
  if (p.includes("/sdk/v1/")) {
    return c.json({ clientId: "fortnite", scope: [], expiresAt: "9999-12-31T23:59:59.000Z" });
  }
  if (p.includes("/content/api/pages/")) {
    return c.json({ _title: "Fortnite", _activeDate: "2024-01-01T00:00:00.000Z", _locale: "en" });
  }
  return c.json(errorResponse("com.epicgames.common", "errors.com.epicgames.common.not_found", "The resource could not be found."), 404);
});

app.onError((err, c) => {
  logger.error("Unhandled error", err.message);
  return c.json(errorResponse("com.epicgames.common", "errors.com.epicgames.common.server_error", "Internal server error"), 500);
});

const PORT = parseInt(process.env.PORT || "3556");
const XMPP_PORT = parseInt(process.env.XMPP_PORT || "85");
const MATCHMAKER_PORT = parseInt(process.env.MATCHMAKER_PORT || "80");

Bun.serve({
  fetch: app.fetch,
  port: PORT,
});

logger.success(`Versa is running`, `http://localhost:${PORT}`);

if (XMPP_PORT === MATCHMAKER_PORT) {
  logger.warn(
    "XMPP_PORT and MATCHMAKER_PORT are identical",
    `only XMPP will bind :${XMPP_PORT}`
  );
  startXmpp(XMPP_PORT);
} else {
  startXmpp(XMPP_PORT);
  startMatchmaker(MATCHMAKER_PORT);
}
