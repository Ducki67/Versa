import type { ServerWebSocket } from "bun";
import { logger } from "../utils/logger";
import { makeID } from "../utils/funcs";
import { createGameSession, sessions, tickets } from "../routes/matchmaking";

interface SocketData {
  connectionId: string;

  accountId: string;
  ticketId: string;
  sessionId: string;
}

type Socket = ServerWebSocket<SocketData>;

interface TicketPayload {
  ticketId?: string;
  sessionId?: string;
  accountId?: string;
  region?: string;
}

function decodeTicket(authorization: string | null): TicketPayload | null {
  if (!authorization) return null;

  for (const candidate of authorization.split(/\s+/)) {
    if (candidate.length < 8) continue;
    try {
      const decoded = Buffer.from(candidate, "base64").toString("utf-8");
      if (!decoded.trimStart().startsWith("{")) continue;
      const parsed = JSON.parse(decoded) as TicketPayload;
      if (parsed && (parsed.sessionId || parsed.ticketId || parsed.accountId)) return parsed;
    } catch {
    }
  }
  return null;
}

function send(ws: Socket, name: string, payload: Record<string, unknown>): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify({ payload, name }));
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runQueue(ws: Socket) {
  const { accountId, ticketId, sessionId } = ws.data;
  const matchId = makeID().replace(/-/g, "");

  if (!send(ws, "StatusUpdate", { state: "Connecting" })) return;
  await sleep(600);

  if (!send(ws, "StatusUpdate", { totalPlayers: 1, connectedPlayers: 1, state: "Waiting" })) return;
  await sleep(800);

  if (
    !send(ws, "StatusUpdate", {
      ticketId,
      queuedPlayers: 0,
      estimatedWaitSec: 0,
      status: {},
      state: "Queued",
    })
  )
    return;
  await sleep(1500);

  if (!send(ws, "StatusUpdate", { matchId, state: "SessionAssignment" })) return;
  await sleep(1000);

  const session = sessions.get(sessionId);
  if (session) {
    session.state = "InProgress";
    if (accountId && !session.players.includes(accountId)) {
      session.players.push(accountId);
      session.numPlayers = session.players.length;
    }
  }

  const ticket = tickets.get(ticketId);
  if (ticket) ticket.state = "playing";

  if (!send(ws, "Play", { matchId, sessionId, joinDelaySec: 1 })) return;

  logger.success("Matchmaker sent Play", `session ${sessionId}`);
}

export function startMatchmaker(port: number) {
  const server = Bun.serve<SocketData>({
    port,
    fetch(req, srv) {
      const ticket = decodeTicket(req.headers.get("authorization"));

      let sessionId = ticket?.sessionId ?? "";
      const accountId = ticket?.accountId ?? "";
      if (!sessionId || !sessions.has(sessionId)) {
        const created = createGameSession(accountId || makeID());
        sessionId = created.sessionId;
      }

      const protocol = req.headers.get("sec-websocket-protocol");
      const upgraded = srv.upgrade(req, {
        data: {
          connectionId: makeID(),
          accountId,
          ticketId: ticket?.ticketId ?? makeID().replace(/-/g, ""),
          sessionId,
        },
        headers: protocol
          ? { "Sec-WebSocket-Protocol": protocol.split(",")[0].trim() }
          : undefined,
      });
      if (upgraded) return undefined;
      return new Response("Matchmaker endpoint - websocket upgrade required", { status: 426 });
    },
    websocket: {
      open(ws) {
        logger.info(
          "Matchmaker client connected",
          ws.data.accountId ? ws.data.accountId : "unidentified"
        );
        void runQueue(ws).catch((err) =>
          logger.error("Matchmaker queue error", err instanceof Error ? err.message : String(err))
        );
      },

      message() {
      },

      close(ws) {
        logger.info(
          "Matchmaker client disconnected",
          ws.data.accountId ? ws.data.accountId : "unidentified"
        );
      },
    },
  });

  logger.success("Matchmaker listening", `ws://localhost:${port}`);
  return server;
}