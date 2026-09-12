import { Hono } from "hono";
import { makeID, timeAsISO } from "../utils/funcs";
import { parseVersion } from "../data/version-compat";

const app = new Hono();

export interface MatchTicket {
  accountId: string;
  ticketId: string;
  sessionId: string;
  createdAt: number;
  state: "waiting" | "assigned" | "playing";
  buildVersion: string;
  region: string;
  platform: string;
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
}

export const tickets = new Map<string, MatchTicket>();
export const sessions = new Map<string, GameSession>();
export const playerSessions = new Map<string, string>();
const REGIONS = ["NA", "EU", "AS", "OC", "BR", "ME"];

const SERVER_IP = (process.env.GAMESERVER_IP || "127.0.0.1:7777").split(":")[0];
const SERVER_PORT = parseInt((process.env.GAMESERVER_IP || "127.0.0.1:7777").split(":")[1] || "7777");
const MATCHMAKER_URL = process.env.MATCHMAKER_IP || "ws://127.0.0.1";
const MATCHMAKER_PORT = parseInt(process.env.MATCHMAKER_PORT || "80");

export function createGameSession(accountId: string): GameSession {
  const sessionId = makeID();
  const session: GameSession = {
    sessionId,
    ownerId: accountId,
    serverAddress: SERVER_IP,
    serverPort: SERVER_PORT,
    maxPlayers: 100,
    numPlayers: 1,
    state: "InProgress",
    attributes: {
      playlistName: "Playlist_DefaultDuo",
      hospital: false,
      bServerStarted: true,
      ZoneWaitTime: 0,
      SeasonLevel: 1,
    },
    players: [accountId],
    createdAt: timeAsISO(),
  };
  sessions.set(sessionId, session);
  return session;
}

function getRegionFromRequest(c: any): string {
  const region = c.req.query("region");
  if (region && REGIONS.includes(region.toUpperCase())) return region.toUpperCase();
  return "NA";
}

app.get("/fortnite/api/game/v2/matchmakingservice/ticket/player/:accountId", (c) => {
  const accountId = c.req.param("accountId");
  const region = getRegionFromRequest(c);
  const version = c.get("version") as ReturnType<typeof parseVersion> | undefined;

  const ticketId = makeID();
  const session = createGameSession(accountId);

  const ticket: MatchTicket = {
    accountId,
    ticketId,
    sessionId: session.sessionId,
    createdAt: Date.now(),
    state: "assigned",
    buildVersion: version ? `${version.build}` : "1.0",
    region,
    platform: version?.platform || "Windows",
  };

  tickets.set(ticketId, ticket);
  playerSessions.set(accountId, session.sessionId);

  return c.json({
    serviceUrl: `${MATCHMAKER_URL}:${MATCHMAKER_PORT}`,
    ticketType: "mms-player",
    payload: Buffer.from(JSON.stringify({ ticketId, sessionId: session.sessionId, accountId, region })).toString("base64"),
    signature: "420=",
    platform: version?.platform || "Windows",
    buildId: version ? `${version.build}` : "1.0",
    region: region,
  });
});

app.get("/fortnite/api/matchmaking/session/:sessionId", (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);
  if (!session) {
    return c.json({
      id: sessionId,
      ownerId: makeID(),
      serverAddress: SERVER_IP,
      serverPort: SERVER_PORT,
    maxPlayers: 100,
      numPlayers: 0,
      state: "Waiting",
      attributes: {},
      players: [],
    });
  }
  return c.json({
    id: session.sessionId,
    ownerId: session.ownerId,
    serverAddress: session.serverAddress,
    serverPort: session.serverPort,
    maxPlayers: session.maxPlayers,
    numPlayers: session.numPlayers,
    state: session.state,
    attributes: session.attributes,
    players: session.players.map((p) => ({ accountId: p, status: "Ready" })),
  });
});

app.post("/fortnite/api/matchmaking/session/:sessionId/join", (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);
  if (session && session.numPlayers < session.maxPlayers) {
    session.numPlayers++;
  }
  return c.body(null, 204);
});

app.post("/fortnite/api/matchmaking/session/:sessionId/players", async (c) => {
  const sessionId = c.req.param("sessionId");
  const body = await c.req.json().catch(() => ({}));
  const session = sessions.get(sessionId);
  if (session) {
    const accountId = (body as Record<string, unknown>).accountId as string || makeID();
    if (!session.players.includes(accountId)) {
      session.players.push(accountId);
      session.numPlayers = session.players.length;
    }
  }
  return c.json({ status: "OK" });
});

app.post("/fortnite/api/matchmaking/session/:sessionId/quit", (c) => {
  const sessionId = c.req.param("sessionId");
  const session = sessions.get(sessionId);
  if (session) {
    session.numPlayers = Math.max(0, session.numPlayers - 1);
    if (session.numPlayers <= 0) session.state = "Terminated";
  }
  return c.body(null, 204);
});

app.post("/fortnite/api/matchmaking/session/matchMakingRequest", async (c) => {
  const accountId = c.req.header("x-forwarded-for") || makeID();
  const session = createGameSession(accountId);
  return c.json({
    sessionId: session.sessionId,
    ownerId: session.ownerId,
    serverAddress: session.serverAddress,
    serverPort: session.serverPort,
  });
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
      region: "NA",
      players: s.numPlayers,
      maxPlayers: s.maxPlayers,
    })),
    totalSessions: activeSessions.length,
  });
});

export default app;
