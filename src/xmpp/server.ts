import type { ServerWebSocket } from "bun";
import { store } from "../storage/store";
import { decodeToken } from "../middleware/auth";
import { logger } from "../utils/logger";
import { makeID } from "../utils/funcs";
import { parseXml, findChild, childContent, xml, isJSON, type XmlNode } from "./xml";

export const XMPP_DOMAIN = "prod.ol.epicgames.com";

interface SocketData {
  connectionId: string;
}

type Socket = ServerWebSocket<SocketData>;

interface XmppClient {
  ws: Socket;
  connectionId: string;
  accountId: string;
  displayName: string;
  resource: string;

  jid: string;

  id: string;
  streamId: string;
  authenticated: boolean;
  bound: boolean;
  lastPresence: { away: boolean; status: string };
}

type PendingState = Partial<XmppClient> & { streamId: string };

const clients = new Map<string, XmppClient>();

const pending = new Map<string, PendingState>();

function clientFor(ws: Socket): XmppClient | undefined {
  return clients.get(ws.data.connectionId);
}

function newStreamId(): string {
  return makeID().replace(/-/g, "").toUpperCase();
}

function closeStream(ws: Socket) {
  try {
    ws.send(xml({ name: "close", attrs: { xmlns: "urn:ietf:params:xml:ns:xmpp-framing" } }));
    ws.close();
  } catch {
  }
}

function presenceStanza(
  to: string,
  from: string,
  away: boolean,
  status: string,
  offline: boolean
): string {
  return xml({
    name: "presence",
    attrs: {
      to,
      from,
      xmlns: "jabber:client",
      type: offline ? "unavailable" : "available",
    },
    children: [away ? { name: "show", text: "away" } : null, { name: "status", text: status }],
  });
}

function broadcastPresence(sender: XmppClient, status: string, away: boolean, offline: boolean) {
  sender.lastPresence = { away, status };

  for (const peer of clients.values()) {
    try {
      peer.ws.send(presenceStanza(peer.jid, sender.jid, away, status, offline));
    } catch {
    }
  }
}

function sendAllPresenceTo(target: XmppClient) {
  for (const peer of clients.values()) {
    try {
      target.ws.send(
        presenceStanza(target.jid, peer.jid, peer.lastPresence.away, peer.lastPresence.status, false)
      );
    } catch {
    }
  }
}

export function sendToAccount(accountId: string, body: unknown): boolean {
  const target = [...clients.values()].find((c) => c.accountId === accountId);
  if (!target) return false;

  try {
    target.ws.send(
      xml({
        name: "message",
        attrs: { from: XMPP_DOMAIN, to: target.jid, xmlns: "jabber:client" },
        children: [{ name: "body", text: typeof body === "string" ? body : JSON.stringify(body) }],
      })
    );
    return true;
  } catch {
    return false;
  }
}

export function getConnectedAccounts(): string[] {
  return [...clients.values()].map((c) => c.accountId);
}

export function isOnline(accountId: string): boolean {
  return [...clients.values()].some((c) => c.accountId === accountId);
}

function handleOpen(ws: Socket, state: PendingState) {
  ws.send(
    xml({
      name: "open",
      attrs: {
        xmlns: "urn:ietf:params:xml:ns:xmpp-framing",
        from: XMPP_DOMAIN,
        id: state.streamId,
        version: "1.0",
        "xml:lang": "en",
      },
    })
  );

  if (state.authenticated) {
    ws.send(
      xml({
        name: "stream:features",
        attrs: { "xmlns:stream": "http://etherx.jabber.org/streams" },
        children: [
          { name: "ver", attrs: { xmlns: "urn:xmpp:features:rosterver" } },
          { name: "starttls", attrs: { xmlns: "urn:ietf:params:xml:ns:xmpp-tls" } },
          { name: "bind", attrs: { xmlns: "urn:ietf:params:xml:ns:xmpp-bind" } },
          {
            name: "compression",
            attrs: { xmlns: "http://jabber.org/features/compress" },
            children: [{ name: "method", text: "zlib" }],
          },
          { name: "session", attrs: { xmlns: "urn:ietf:params:xml:ns:xmpp-session" } },
        ],
      })
    );
    return;
  }

  ws.send(
    xml({
      name: "stream:features",
      attrs: { "xmlns:stream": "http://etherx.jabber.org/streams" },
      children: [
        {
          name: "mechanisms",
          attrs: { xmlns: "urn:ietf:params:xml:ns:xmpp-sasl" },
          children: [{ name: "mechanism", text: "PLAIN" }],
        },
        { name: "ver", attrs: { xmlns: "urn:xmpp:features:rosterver" } },
        { name: "starttls", attrs: { xmlns: "urn:ietf:params:xml:ns:xmpp-tls" } },
        {
          name: "compression",
          attrs: { xmlns: "http://jabber.org/features/compress" },
          children: [{ name: "method", text: "zlib" }],
        },
        { name: "auth", attrs: { xmlns: "http://jabber.org/features/iq-auth" } },
      ],
    })
  );
}

function handleAuth(ws: Socket, stanza: XmlNode, state: PendingState) {
  if (!stanza.content) return closeStream(ws);

  let decoded: string;
  try {
    decoded = Buffer.from(stanza.content, "base64").toString("utf-8");
  } catch {
    return closeStream(ws);
  }

  if (!decoded.includes("\u0000")) return closeStream(ws);
  const parts = decoded.split("\u0000");
  if (parts.length !== 3) return closeStream(ws);

  const accountId = parts[1];
  const token = parts[2];
  if (!accountId) return closeStream(ws);

  const account = store.getAccount(accountId);
  if (!account) {
    logger.warn("XMPP auth rejected", `unknown account ${accountId}`);
    return closeStream(ws);
  }
  if (account.banned) {
    logger.warn("XMPP auth rejected", `${account.displayName} is banned`);
    return closeStream(ws);
  }

  const bare = token.startsWith("eg1~") ? token.slice(4) : token;
  const claims = decodeToken(bare);
  if (claims && typeof claims.sub === "string" && claims.sub !== accountId) {
    logger.warn("XMPP auth rejected", `token/account mismatch for ${accountId}`);
    return closeStream(ws);
  }

  for (const [connectionId, existing] of [...clients]) {
    if (existing.accountId !== accountId) continue;
    logger.info("XMPP replacing stale session", account.displayName);
    clients.delete(connectionId);
    broadcastPresence(existing, "{}", false, true);
    closeStream(existing.ws);
  }

  state.accountId = accountId;
  state.displayName = account.displayName;
  state.authenticated = true;

  ws.send(xml({ name: "success", attrs: { xmlns: "urn:ietf:params:xml:ns:xmpp-sasl" } }));
}

function handleIq(ws: Socket, stanza: XmlNode, state: PendingState) {
  const id = stanza.attributes.id;

  if (id === "_xmpp_bind1") {
    if (!state.authenticated || !state.accountId) return closeStream(ws);

    const resource = childContent(findChild(stanza, "bind"), "resource");
    if (!resource) return;

    const jid = `${state.accountId}@${XMPP_DOMAIN}/${resource}`;
    const bareJid = `${state.accountId}@${XMPP_DOMAIN}`;

    const client: XmppClient = {
      ws,
      connectionId: ws.data.connectionId,
      accountId: state.accountId,
      displayName: state.displayName ?? state.accountId,
      resource,
      jid,
      id: bareJid,
      streamId: state.streamId,
      authenticated: true,
      bound: true,
      lastPresence: { away: false, status: "{}" },
    };
    clients.set(ws.data.connectionId, client);
    pending.delete(ws.data.connectionId);

    logger.info("XMPP client connected", `${client.displayName} (${clients.size} online)`);

    ws.send(
      xml({
        name: "iq",
        attrs: { to: jid, id: "_xmpp_bind1", xmlns: "jabber:client", type: "result" },
        children: [
          {
            name: "bind",
            attrs: { xmlns: "urn:ietf:params:xml:ns:xmpp-bind" },
            children: [{ name: "jid", text: jid }],
          },
        ],
      })
    );
    return;
  }

  const client = clientFor(ws);
  if (!client) return closeStream(ws);

  if (id === "_xmpp_session1") {
    ws.send(
      xml({
        name: "iq",
        attrs: {
          to: client.jid,
          from: XMPP_DOMAIN,
          id: "_xmpp_session1",
          xmlns: "jabber:client",
          type: "result",
        },
      })
    );
    sendAllPresenceTo(client);
    return;
  }

  ws.send(
    xml({
      name: "iq",
      attrs: {
        to: client.jid,
        from: XMPP_DOMAIN,
        id: id ?? makeID(),
        xmlns: "jabber:client",
        type: "result",
      },
    })
  );
}

function handleMessage(ws: Socket, stanza: XmlNode) {
  const sender = clientFor(ws);
  if (!sender) return closeStream(ws);

  const body = childContent(stanza, "body");
  if (body === undefined) return;

  const to = stanza.attributes.to;

  if (stanza.attributes.type === "chat") {
    if (!to) return;
    const receiver = [...clients.values()].find((c) => c.id === to || c.jid === to);
    if (!receiver || receiver.connectionId === sender.connectionId) return;

    receiver.ws.send(
      xml({
        name: "message",
        attrs: { to: receiver.jid, from: sender.jid, xmlns: "jabber:client", type: "chat" },
        children: [{ name: "body", text: body }],
      })
    );
    return;
  }

  if (!isJSON(body)) return;
  const payload = JSON.parse(body) as Record<string, unknown>;
  if (typeof payload.type !== "string") return;

  if (to) {
    const receiver = [...clients.values()].find((c) => c.id === to || c.jid === to);
    if (receiver) {
      receiver.ws.send(
        xml({
          name: "message",
          attrs: {
            from: sender.jid,
            id: stanza.attributes.id,
            to: receiver.jid,
            xmlns: "jabber:client",
          },
          children: [{ name: "body", text: body }],
        })
      );
      return;
    }
  }

  ws.send(
    xml({
      name: "message",
      attrs: { from: sender.jid, id: stanza.attributes.id, to: sender.jid, xmlns: "jabber:client" },
      children: [{ name: "body", text: body }],
    })
  );
}

function handlePresence(ws: Socket, stanza: XmlNode) {
  const client = clientFor(ws);
  if (!client) return closeStream(ws);

  if (stanza.attributes.type === "unavailable") {
    broadcastPresence(client, "{}", false, true);
    return;
  }

  const status = childContent(stanza, "status");
  if (!isJSON(status)) return;

  broadcastPresence(client, status as string, findChild(stanza, "show") !== undefined, false);
}

export function startXmpp(port: number) {
  const server = Bun.serve<SocketData>({
    port,
    fetch(req, srv) {
      const protocol = req.headers.get("sec-websocket-protocol");
      const upgraded = srv.upgrade(req, {
        data: { connectionId: makeID() },
        headers: protocol
          ? { "Sec-WebSocket-Protocol": protocol.split(",")[0].trim() }
          : undefined,
      });
      if (upgraded) return undefined;
      return new Response("XMPP endpoint - websocket upgrade required", { status: 426 });
    },
    websocket: {
      open(ws) {
        pending.set(ws.data.connectionId, { streamId: newStreamId() });
      },

      message(ws, raw) {
        const text = typeof raw === "string" ? raw : Buffer.from(raw).toString("utf-8");
        const stanza = parseXml(text);
        if (!stanza) return closeStream(ws);

        let state: PendingState | undefined = clientFor(ws) ?? pending.get(ws.data.connectionId);
        if (!state) {
          state = { streamId: newStreamId() };
          pending.set(ws.data.connectionId, state);
        }

        try {
          switch (stanza.name) {
            case "open":
              handleOpen(ws, state);
              break;
            case "auth":
              handleAuth(ws, stanza, state);
              break;
            case "iq":
              handleIq(ws, stanza, state);
              break;
            case "message":
              handleMessage(ws, stanza);
              break;
            case "presence":
              handlePresence(ws, stanza);
              break;
            case "close":
              closeStream(ws);
              break;
            default:
              break;
          }
        } catch (err) {
          logger.error("XMPP stanza error", err instanceof Error ? err.message : String(err));
        }
      },

      close(ws) {
        const client = clientFor(ws);
        pending.delete(ws.data.connectionId);
        if (!client) return;

        clients.delete(ws.data.connectionId);
        broadcastPresence(client, "{}", false, true);
        logger.info("XMPP client disconnected", `${client.displayName} (${clients.size} online)`);
      },
    },
  });

  logger.success("XMPP listening", `ws://localhost:${port}`);
  return server;
}