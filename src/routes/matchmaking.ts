import { Hono } from "hono";
import { makeID, timeAsISO } from "../utils/funcs";
import { parseVersion, getPlaylistFromBuild } from "../data/version-compat";

const app = new Hono();

export interface MatchTicket {
  accountId: string;
  ticketId: string;
  sessionId: string;
  createdAt: number;
  state: "waiting" | "assigned" | "playing";
  buildVersion: string;
  buildUniqueId: string;
  region: string;
  playlist: string;
  platform: string;
  partyPlayerIds: string[];
}

export interface GameSession {
  sessionId: string;
  ownerId: string;
  serverAddress: string;
  serverPort: number;
  maxPlayers: number;
  numPlayers: number;
  state: "Waiting" | "InProgress" | "Terminated";
  attributes: Record<string, unknown>;
  players: string[];
  createdAt: string;
  region: string;
  playlist: string;
  buildUniqueId: string;
  platform: string;
}

export const tickets = new Map<string, MatchTicket>();
export const sessions = new Map<string, GameSession>();
export const playerSessions = new Map<string, string>();

const SERVER_IP = (process.env.GAMESERVER_IP || "127.0.0.1:7777").split(":")[0] || "127.0.0.1";
const SERVER_PORT = parseInt((process.env.GAMESERVER_IP || "127.0.0.1:7777").split(":")[1] || "7777", 10) || 7777;
const MATCHMAKER_RAW = process.env.MATCHMAKER_IP || "ws://127.0.0.1";

function matchmakerPort(): number {
  return parseInt(process.env.MATCHMAKER_PORT || "80", 10) || 80;
}

function serviceUrl(): string {
  if (/:\d+$/.test(MATCHMAKER_RAW)) return MATCHMAKER_RAW;
  return `${MATCHMAKER_RAW}:${matchmakerPort()}`;
}

function normalizeRegion(value: unknown): string {
  const v = String(value || "").toUpperCase();
  if (!v) return "NA";
  if (v.startsWith("NAE") || v === "NA-EAST" || v === "NA EAST") return "NAE";
  if (v.startsWith("NAW") || v === "NA-WEST") return "NAW";
  if (v.startsWith("NAC") || v === "NA-CENTRAL") return "NAC";
  if (v.startsWith("EU")) return "EU";
  if (v.startsWith("AS") || v === "ASIA") return "AS";
  if (v.startsWith("OC") || v === "OCE") return "OC";
  if (v.startsWith("BR")) return "BR";
  if (v.startsWith("ME")) return "ME";
  if (v === "NA") return "NA";
  return v.split(/[^A-Z]/)[0] || "NA";
}

function parseBucket(bucketId: unknown): { buildUniqueId: string; playlist: string; region: string } {
  const raw = String(bucketId || "");
  let buildUniqueId = "";
  let playlist = "";
  let region = "";
  if (!raw) return { buildUniqueId, playlist, region };
  const parts = raw.split(":");
  if (parts[0]) buildUniqueId = parts[0] as string;
  for (const part of parts) {
    if (part.startsWith("Playlist_")) playlist = part;
  }
  for (const part of parts) {
    const norm = normalizeRegion(part);
    if (["NA", "NAE", "NAW", "NAC", "EU", "AS", "OC", "BR", "ME"].includes(norm)) {
      region = norm;
      break;
    }
  }
  return { buildUniqueId, playlist, region };
}

export function createGameSession(accountId: string, opts?: { playlist?: string; region?: string; buildVersion?: string; buildUniqueId?: string; platform?: string; partyPlayerIds?: string[] }): GameSession {
  const sessionId = makeID().replace(/-/g, "");
  const playlist = opts?.playlist || "Playlist_DefaultDuo";
  const region = normalizeRegion(opts?.region || "NA");
  const buildUniqueId = opts?.buildUniqueId || "0";
  const platform = opts?.platform || "Windows";
  const session: GameSession = {
    sessionId,
    ownerId: accountId,
    serverAddress: SERVER_IP,
    serverPort: SERVER_PORT,
    maxPlayers: 100,
    numPlayers: 1,
    state: "InProgress",
    attributes: {
      playlistName: playlist,
      PLAYLISTNAME_s: playlist,
      REGION_s: region,
      GAMEMODE_s: "FORTATHENA",
      ALLOWBROADCASTING_b: true,
      SUBREGION_s: region,
      TENANT_s: "Fortnite",
      tenant_s: "Fortnite",
      MATCHMAKINGPOOL_s: "Any",
      STORMSHIELDDEFENSETYPE_i: 0,
      HOTFIXVERSION_i: 0,
      SESSIONKEY_s: makeID().replace(/-/g, "").toUpperCase(),
      BEACONPORT_i: 15009,
      hospital: false,
      bServerStarted: true,
      ZoneWaitTime: 0,
      SeasonLevel: 1,
      platform,
    },
    players: [accountId],
    createdAt: timeAsISO(),
    region,
    playlist,
    buildUniqueId,
    platform,
  };
  sessions.set(sessionId, session);
  playerSessions.set(accountId, sessionId);
  return session;
}

function sessionPayload(session: GameSession, buildUniqueIdOverride?: string): Record<string, unknown> {
  const buildUniqueId = buildUniqueIdOverride || session.buildUniqueId || "0";
  return {
    id: session.sessionId,
    ownerId: session.ownerId,
    ownerName: `[DS]fortnite-${session.region.toLowerCase()}-${session.sessionId.slice(0, 8)}`,
    serverName: `[DS]fortnite-${session.region.toLowerCase()}-${session.sessionId.slice(0, 8)}`,
    serverAddress: session.serverAddress,
    serverPort: session.serverPort,
    maxPublicPlayers: session.maxPlayers,
    openPublicPlayers: Math.max(0, session.maxPlayers - session.numPlayers),
    maxPrivatePlayers: 0,
    openPrivatePlayers: 0,
    maxPlayers: session.maxPlayers,
    numPlayers: session.numPlayers,
    totalPlayers: session.numPlayers,
    state: session.state,
    attributes: session.attributes,
    publicPlayers: session.players,
    privatePlayers: [],
    players: session.players.map((p) => ({ accountId: p, status: "Ready" })),
    allowJoinInProgress: false,
    shouldAdvertise: false,
    isDedicated: false,
    usesStats: false,
    allowInvites: false,
    usesPresence: false,
    allowJoinViaPresence: true,
    allowJoinViaPresenceFriendsOnly: false,
    buildUniqueId,
    lastUpdated: timeAsISO(),
    started: session.state === "InProgress",
  };
}

function currentBuildUniqueId(c: { req: { header: (n: string) => string | undefined } }): string {
  const cookie = c.req.header("cookie") || "";
  const m = cookie.match(/currentbuildUniqueId=([^;]+)/);
  return m?.[1] || "0";
}

app.get("/fortnite/api/game/v2/matchmakingservice/ticket/player/:accountId", (c) => {
  const accountId = c.req.param("accountId");
  const version = c.get("version") as ReturnType<typeof parseVersion> | undefined;
  const build = version?.build ?? 999;
  const bucket = parseBucket(c.req.query("bucketId"));
  const playlist = c.req.query("playlist") || bucket.playlist || getPlaylistFromBuild(build);
  const region = normalizeRegion(c.req.query("region") || bucket.region || "NA");
  const buildUniqueId = bucket.buildUniqueId || (version?.CL ?? "0");
  const partyRaw = c.req.query("partyPlayerIds") || "";
  const partyPlayerIds = partyRaw ? String(partyRaw).split(",").filter(Boolean) : [accountId];
  const platform = version?.platform || c.req.query("playerPlatform") || "Windows";
  const session = createGameSession(accountId, { playlist, region, buildVersion: `${build}`, buildUniqueId, platform, partyPlayerIds });
  const ticketId = makeID().replace(/-/g, "");
  const ticket: MatchTicket = {
    accountId,
    ticketId,
    sessionId: session.sessionId,
    createdAt: Date.now(),
    state: "assigned",
    buildVersion: `${build}`,
    buildUniqueId,
    region,
    playlist,
    platform,
    partyPlayerIds,
  };
  tickets.set(ticketId, ticket);
  playerSessions.set(accountId, session.sessionId);
  c.header("Set-Cookie", `currentbuildUniqueId=${buildUniqueId}; Path=/; HttpOnly`);
  return c.json({
    serviceUrl: serviceUrl(),
    ticketType: "mms-player",
    payload: Buffer.from(JSON.stringify({ ticketId, sessionId: session.sessionId, accountId, region, playlist, buildUniqueId, partyPlayerIds })).toString("base64"),
    signature: "420=",
    platform,
    buildId: `${build}`,
    buildUniqueId,
    region,
    playlist,
  });
});

app.get("/fortnite/api/matchmaking/session/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);
  if (!session) {
    return c.json(sessionPayload({ sessionId, ownerId: makeID().replace(/-/g, "").toUpperCase(), serverAddress: SERVER_IP, serverPort: SERVER_PORT, maxPlayers: 100, numPlayers: 0, state: "Waiting", attributes: { PLAYLISTNAME_s: "Playlist_DefaultSolo", REGION_s: "NA" }, players: [], createdAt: timeAsISO(), region: "NA", playlist: "Playlist_DefaultSolo", buildUniqueId: currentBuildUniqueId(c), platform: "Windows" }, currentBuildUniqueId(c)));
  }
  return c.json(sessionPayload(session, currentBuildUniqueId(c) !== "0" ? currentBuildUniqueId(c) : session.buildUniqueId));
});

app.post("/fortnite/api/matchmaking/session/:sessionId/join", (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);
  if (session && session.numPlayers < session.maxPlayers) {
    session.numPlayers = session.players.length + 1;
    if (!session.players.includes("joining")) session.numPlayers = Math.min(session.maxPlayers, session.numPlayers);
  }
  return c.body(null, 204);
});

app.post("/fortnite/api/matchmaking/session/:sessionId/players", async (c) => {
  const sessionId = c.req.param("sessionId");
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const session = sessions.get(sessionId);
  if (session) {
    const accountId = (body.accountId as string) || makeID();
    if (!session.players.includes(accountId)) {
      session.players.push(accountId);
      session.numPlayers = session.players.length;
      playerSessions.set(accountId, sessionId);
    }
  }
  return c.json({ status: "OK" });
});

app.post("/fortnite/api/matchmaking/session/:sessionId/quit", (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);
  if (session) {
    session.numPlayers = Math.max(0, session.numPlayers - 1);
    if (session.players.length > 0) session.players.pop();
    session.numPlayers = session.players.length;
    if (session.numPlayers <= 0) session.state = "Terminated";
  }
  return c.body(null, 204);
});

app.post("/fortnite/api/matchmaking/session/matchMakingRequest", async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const accountId = (body.accountId as string) || c.req.header("x-forwarded-for") || makeID();
  const version = c.get("version") as ReturnType<typeof parseVersion> | undefined;
  const session = createGameSession(accountId, { playlist: (body.playlist as string) || getPlaylistFromBuild(version?.build ?? 999), region: normalizeRegion((body.region as string) || "NA"), buildUniqueId: version?.CL || "0", platform: version?.platform || "Windows" });
  return c.json(sessionPayload(session));
});

app.get("/fortnite/api/game/v2/matchmaking/session/:sessionId/status", (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);
  return c.json({
    status: session?.state || "Waiting",
    totalPlayers: session?.numPlayers || 0,
    estimatedWaitTime: 0,
  });
});

app.get("/fortnite/api/game/v2/matchmaking/list", (c) => {
  const activeSessions = Array.from(sessions.values()).filter((s) => s.state !== "Terminated");
  return c.json({
    sessions: activeSessions.map((s) => ({
      id: s.sessionId,
      region: s.region,
      playlist: s.playlist,
      players: s.numPlayers,
      maxPlayers: s.maxPlayers,
    })),
    totalSessions: activeSessions.length,
  });
});

app.get("/fortnite/api/matchmaking/session/findPlayer/*", (c) => c.json([]));

app.get("/fortnite/api/game/v2/matchmaking/account/:accountId/session/:sessionId", (c) => {
  return c.json({
    accountId: c.req.param("accountId"), sessionId: c.req.param("sessionId"), key: "none",
  });
});

export default app;
