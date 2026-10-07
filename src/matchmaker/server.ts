import type { ServerWebSocket } from "bun";
import { logger } from "../utils/logger";
import { makeID } from "../utils/funcs";
import { createGameSession, sessions, tickets } from "../routes/matchmaking";
import { xmppOpen, xmppMessage, xmppClose } from "../xmpp/server";

interface SocketData { kind: "mm"; connectionId: string; accountId: string; ticketId: string; sessionId: string; }
interface XmppSocketData { kind: "xmpp"; connectionId: string; }
type Socket = ServerWebSocket<SocketData>;
type AnySocket = ServerWebSocket<SocketData | XmppSocketData>;

interface TicketPayload { ticketId?: string; sessionId?: string; accountId?: string; region?: string; playlist?: string; buildUniqueId?: string; partyPlayerIds?: string[]; platform?: string; }

function decodeTicket(authorization: string | null): TicketPayload | null {
  if (!authorization) return null;
  const parts = authorization.split(/\s+/);
  for (const candidate of parts) {
    const token = candidate.startsWith("eg1~") ? candidate.slice(4) : candidate;
    if (token.length < 4) continue;
    if (token === "mms-player" || token.toLowerCase() === "epic-signed" || token.toLowerCase() === "bearer") continue;
    try {
      const norm = token.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = Buffer.from(norm, "base64").toString("utf-8");
      if (!decoded.trimStart().startsWith("{")) continue;
      const parsed = JSON.parse(decoded) as TicketPayload;
      if (parsed && (parsed.sessionId || parsed.ticketId || parsed.accountId)) return parsed;
    } catch { }
  }
  return null;
}

function send(ws: Socket, name: string, payload: Record<string, unknown>): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  try { ws.send(JSON.stringify({ payload, name })); return true; } catch { return false; }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runQueue(ws: Socket) {
  const { accountId, ticketId, sessionId } = ws.data;
  const matchId = makeID().replace(/-/g, "");

  if (!send(ws, "StatusUpdate", { state: "Connecting" })) return;
  await sleep(600);
  if (!send(ws, "StatusUpdate", { totalPlayers: 1, connectedPlayers: 1, state: "Waiting" })) return;
  await sleep(800);
  if (!send(ws, "StatusUpdate", { ticketId, queuedPlayers: 0, estimatedWaitSec: 0, status: {}, state: "Queued" })) return;
  await sleep(1500);
  if (!send(ws, "StatusUpdate", { matchId, state: "SessionAssignment" })) return;
  await sleep(1000);

  const session = sessions.get(sessionId);
  if (session) {
    session.state = "InProgress";
    if (accountId && !session.players.includes(accountId)) { session.players.push(accountId); session.numPlayers = session.players.length; }
  }
  const ticket = tickets.get(ticketId);
  if (ticket) ticket.state = "playing";
  if (!send(ws, "Play", { matchId, sessionId, joinDelaySec: 1 })) return;
  logger.mm("sent Play", `session ${sessionId}`);
}

export function wantsXmpp(req: Request): boolean {
  const protocol = req.headers.get("sec-websocket-protocol") || "";
  return protocol.toLowerCase().includes("xmpp");
}

export function startMatchmaker(port: number) {
  const server = Bun.serve<SocketData | XmppSocketData>({
    port,
    fetch(req, srv) {
      const protocol = req.headers.get("sec-websocket-protocol");
      const echo = protocol ? { "Sec-WebSocket-Protocol": protocol.split(",")[0].trim() } : undefined;
      if (wantsXmpp(req)) {
        logger.mm("xmpp upgrade attempt", `${req.url} proto=${protocol}`);
        const upgraded = srv.upgrade(req, { data: { kind: "xmpp", connectionId: makeID() } as XmppSocketData, headers: echo });
        if (upgraded) return undefined;
        return new Response("XMPP endpoint - websocket upgrade required", { status: 426 });
      }
      const ticket = decodeTicket(req.headers.get("authorization"));
      let sessionId = ticket?.sessionId || "";
      let ticketId = ticket?.ticketId || "";
      let accountId = ticket?.accountId || "";
      if (ticketId && tickets.has(ticketId)) {
        const known = tickets.get(ticketId) as { sessionId: string; accountId: string };
        sessionId = known.sessionId;
        accountId = known.accountId || accountId;
      }
      if (!sessionId || !sessions.has(sessionId)) {
        const created = createGameSession(accountId || makeID(), { playlist: ticket?.playlist, region: ticket?.region, buildUniqueId: ticket?.buildUniqueId, platform: ticket?.platform });
        sessionId = created.sessionId;
        if (!accountId) accountId = created.ownerId;
      }
      if (!ticketId) ticketId = makeID().replace(/-/g, "");
      if (!tickets.has(ticketId)) {
        tickets.set(ticketId, { accountId, ticketId, sessionId, createdAt: Date.now(), state: "waiting", buildVersion: "1.0", buildUniqueId: ticket?.buildUniqueId || "0", region: ticket?.region || "NA", playlist: ticket?.playlist || "Playlist_DefaultDuo", platform: ticket?.platform || "Windows", partyPlayerIds: ticket?.partyPlayerIds || (accountId ? [accountId] : []) });
      }
      const mmProtocol = req.headers.get("sec-websocket-protocol");
      const upgraded = srv.upgrade(req, {
        data: { kind: "mm", connectionId: makeID(), accountId, ticketId, sessionId } as SocketData,
        headers: mmProtocol ? { "Sec-WebSocket-Protocol": mmProtocol.split(",")[0].trim() } : undefined,
      });
      if (upgraded) return undefined;
      return new Response("Matchmaker endpoint - websocket upgrade required", { status: 426 });
    },
    websocket: {
      open(ws: AnySocket) {
        if (ws.data.kind === "xmpp") return xmppOpen(ws as never);
        logger.mm("client connected", (ws.data as SocketData).accountId ? (ws.data as SocketData).accountId : "unidentified");
        void runQueue(ws as unknown as Socket).catch((err) => logger.error("Matchmaker queue error", err instanceof Error ? err.message : String(err)));
      },
      message(ws: AnySocket, raw: string | Buffer) {
        if (ws.data.kind === "xmpp") return xmppMessage(ws as never, raw as never);
      },
      close(ws: AnySocket) {
        if (ws.data.kind === "xmpp") return xmppClose(ws as never);
        logger.mm("client disconnected", (ws.data as SocketData).accountId ? (ws.data as SocketData).accountId : "unidentified");
      },
    },
  });
  logger.mm("listening", `ws://localhost:${port} (mm + xmpp)`);
  return server;
}
