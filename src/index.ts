import { Hono } from "hono";
import { cors } from "hono/cors";
import { timing } from "hono/timing";
import { execSync } from "child_process";
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
import lobbyRoutes from "./routes/lobby";
import partyRoutes from "./routes/party";
import discoveryRoutes from "./routes/discovery";
import { startXmpp } from "./xmpp/server";
import { startMatchmaker } from "./matchmaker/server";
import { bridgePeerOpened, bridgePeerMessage, bridgePeerGone } from "./xmpp/bridge";
import crypto from "crypto";
import path from "path";

const BRIDGE_SECRET = crypto.randomUUID();

const app = new Hono();

app.use("*", cors());
app.use("*", timing());
app.use("*", async (c, next) => {
  const start = performance.now();
  await next();
  const ms = performance.now() - start;
  const v = c.get("version") as { season?: number; build?: number } | undefined;
  logger.request({ method: c.req.method, path: c.req.path, status: c.res.status, ms, season: v?.season, build: v?.build });
});
app.use("*", versionCheck);

app.route("/", authRoutes);
app.route("/", cloudstorageRoutes);
app.route("/", contentRoutes);

app.use("/fortnite/api/*", async (c, next) => {
  const p = c.req.path;
  if (p.startsWith("/fortnite/api/cloudstorage/")) return next();
  if (p.startsWith("/fortnite/api/game/v2/matchmaking")) return next();
  if (p.startsWith("/fortnite/api/calendar/v1/timeline")) return next();
  if (p.includes("/recommendGeneralChatRooms")) return next();
  if (p.includes("/versioncheck")) return next();
  if (p.includes("/tryPlayOnPlatform")) return next();
  if (p.includes("/enabled_features")) return next();
  if (p.includes("/grant_access")) return next();
  return verifyClient(c, next);
});
app.use("/friends/api/*", verifyClient);
app.use("/party/api/*", verifyClient);
app.use("/links/api/*", verifyClient);

app.route("/", mcpRoutes);
app.route("/", matchmakingRoutes);
app.route("/", storefrontRoutes);
app.route("/", timelineRoutes);
app.route("/", friendsRoutes);
app.route("/", partyRoutes);
app.route("/", discoveryRoutes);
app.route("/", miscRoutes);
app.route("/", lobbyRoutes);

app.notFound((c) => {
  const p = c.req.path;
  if (p.includes("/hotconfigs/") || p.includes("/livefn")) return c.json({});
  if (p.includes("/sdk/v1/")) return c.json({ clientId: "fortnite", scope: [], expiresAt: "9999-12-31T23:59:59.000Z" });
  if (p.includes("/content/api/pages/")) return c.json({ _title: "Fortnite", _activeDate: "2024-01-01T00:00:00.000Z", _locale: "en" });
  return c.json(errorResponse("com.epicgames.common", "errors.com.epicgames.common.not_found", "The resource could not be found."), 404);
});

app.onError((err, c) => {
  logger.error("Unhandled error", err.message);
  return c.json(errorResponse("com.epicgames.common", "errors.com.epicgames.common.server_error", "Internal server error"), 500);
});

function freePort(port: number) {
  try {
    if (process.platform === "win32") {
      const out = execSync(`powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
      const pids = [...new Set(out.split(/[^0-9]+/).map((s) => parseInt(s)).filter((n) => Number.isFinite(n) && n > 0 && n !== process.pid))];
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
          logger.warn(`Freed port ${port}`, `killed PID ${pid}`);
        } catch {}
      }
    } else {
      try {
        execSync(`fuser -k ${port}/tcp`, { stdio: "ignore" });
        logger.warn(`Freed port ${port}`, "fuser");
      } catch {}
    }
  } catch {}
}

const KILL_PORTS = (process.env.KILL_OCCUPIED_PORTS || "true").toLowerCase() !== "false";

let PORT = parseInt(process.env.PORT || "3551");
let XMPP_PORT = parseInt(process.env.XMPP_PORT || "85");
let MATCHMAKER_PORT = parseInt(process.env.MATCHMAKER_PORT || "80");
let XMPP_TCP_PORT = parseInt(process.env.XMPP_TCP_PORT || "5222");

if (KILL_PORTS) {
  freePort(PORT);
  freePort(XMPP_PORT);
  freePort(MATCHMAKER_PORT);
  freePort(XMPP_TCP_PORT);
} else {
  PORT += 1;
  XMPP_PORT += 1;
  MATCHMAKER_PORT += 1;
  XMPP_TCP_PORT += 1;
  process.env.PORT = String(PORT);
  process.env.XMPP_PORT = String(XMPP_PORT);
  process.env.MATCHMAKER_PORT = String(MATCHMAKER_PORT);
  process.env.XMPP_TCP_PORT = String(XMPP_TCP_PORT);
  logger.info("Port shift enabled", `HTTP :${PORT} XMPP :${XMPP_PORT} MM :${MATCHMAKER_PORT} TCP :${XMPP_TCP_PORT}`);
}

Bun.serve<{ bridge?: boolean }>({
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/internal/xmpp-bridge") {
      if (req.headers.get("x-bridge-secret") !== BRIDGE_SECRET) return new Response("forbidden", { status: 403 });
      const ok = srv.upgrade(req, { data: { bridge: true } });
      if (ok) return undefined;
      return new Response("upgrade required", { status: 426 });
    }
    return app.fetch(req);
  },
  websocket: {
    open(ws) {
      if ((ws.data as Record<string, unknown>)?.bridge === true) bridgePeerGone();
    },
    message(ws, raw) {
      if ((ws.data as Record<string, unknown>)?.bridge !== true) return;
      const text = typeof raw === "string" ? raw : Buffer.from(raw as Uint8Array).toString("utf-8");
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return;
      }
      if (msg.t === "open" && typeof msg.id === "string") {
        bridgePeerOpened(msg.id, (out: string) => {
          try { ws.send(out); } catch {}
        });
      } else if ((msg.t === "stream" || msg.t === "data" || msg.t === "close") && typeof msg.id === "string") {
        bridgePeerMessage(msg.id, msg.t as string, (msg.text as string) || "");
      }
    },
    close(ws) {
      if ((ws.data as Record<string, unknown>)?.bridge === true) bridgePeerGone();
    },
  },
  port: PORT,
});
logger.banner(PORT, XMPP_PORT, MATCHMAKER_PORT);

if (XMPP_PORT === MATCHMAKER_PORT) {
  logger.warn("XMPP_PORT and MATCHMAKER_PORT are identical", `combined mm+xmpp on :${MATCHMAKER_PORT}`);
  startMatchmaker(MATCHMAKER_PORT);
} else {
  startXmpp(XMPP_PORT);
  startMatchmaker(MATCHMAKER_PORT);
}

try {
  const certDir = path.join(process.cwd(), "certs");
  const child = Bun.spawn(["node", "src/xmpp/tcp-bridge.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      XMPP_TCP_PORT: String(XMPP_TCP_PORT),
      VERSA_BRIDGE_URL: `ws://127.0.0.1:${PORT}/internal/xmpp-bridge`,
      XMPP_BRIDGE_SECRET: BRIDGE_SECRET,
      XMPP_CERT_FILE: path.join(certDir, "fullchain.pem"),
      XMPP_KEY_FILE: path.join(certDir, "privkey.pem"),
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  logger.xmpp("tcp bridge spawned", `tcp :${XMPP_TCP_PORT} pid ${child.pid}`);
} catch {
  logger.warn("TCP XMPP disabled", "node runtime not available");
}