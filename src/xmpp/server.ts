import type { ServerWebSocket } from "bun";
import { store } from "../storage/store";
import { decodeToken } from "../middleware/auth";
import { logger } from "../utils/logger";
import { makeID } from "../utils/funcs";
import { parseXml, findChild, childContent, xml, isJSON, type XmlNode, type XmlElement } from "./xml";

export const XMPP_DOMAIN = "prod.ol.epicgames.com";
export const XMPP_MUC_DOMAIN = `muc.${XMPP_DOMAIN}`;
export const XMPP_CONFERENCE_DOMAIN = `conference.${XMPP_DOMAIN}`;

const mucRooms = new Map<string, Set<string>>();

function mucRoomOf(to: string): string | null {
  const at = to.indexOf("@");
  if (at === -1) return null;
  const host = to.slice(at + 1).split("/")[0].toLowerCase();
  if (host !== XMPP_MUC_DOMAIN && host !== XMPP_CONFERENCE_DOMAIN) return null;
  const room = to.slice(0, at).toLowerCase();
  return room || null;
}

function mucNick(room: string, client: XmppClient): string {
  return `${room}@${XMPP_MUC_DOMAIN}/${client.displayName}`;
}

function mucItem(nick: string, jid: string, code110: boolean, created: boolean): XmlElement {
  const statuses: XmlElement[] = [];
  if (code110) statuses.push({ name: "status", attrs: { code: "110" } });
  if (created) statuses.push({ name: "status", attrs: { code: "201" } });
  return {
    name: "x",
    attrs: { xmlns: "http://jabber.org/protocol/muc#user" },
    children: [
      { name: "item", attrs: { nick, jid, role: "participant", affiliation: "none" } },
      ...statuses,
    ],
  };
}

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
    logger.xmpp("replacing stale session", account.displayName);
    clients.delete(connectionId);
    broadcastPresence(existing, "{}", false, true);
    closeStream(existing.ws);
  }

  state.accountId = accountId;
  state.displayName = account.displayName;
  state.authenticated = true;

  logger.xmpp("auth success", `${account.displayName} (${accountId})`);
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

    logger.xmpp("client connected", `${client.displayName} (${clients.size} online)`);

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

  const rosterQuery = findChild(stanza, "query");
  if (rosterQuery && rosterQuery.attributes.xmlns === "jabber:iq:roster") {
    ws.send(
      xml({
        name: "iq",
        attrs: { to: client.jid, from: XMPP_DOMAIN, id: id ?? makeID(), xmlns: "jabber:client", type: "result" },
        children: [{ name: "query", attrs: { xmlns: "jabber:iq:roster", ver: "" } }],
      })
    );
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

  const groupRoom = mucRoomOf(to || "");
  if (groupRoom) {
    const members = mucRooms.get(groupRoom);
    if (!members || !members.has(sender.connectionId)) return;
    const groupBody = childContent(stanza, "body");
    if (groupBody === undefined) return;
    const from = mucNick(groupRoom, sender);
    for (const memberId of members) {
      const m = clients.get(memberId);
      if (!m) continue;
      try {
        m.ws.send(
          xml({
            name: "message",
            attrs: { to: m.jid, from, xmlns: "jabber:client", type: "groupchat" },
            children: [{ name: "body", text: groupBody }],
          })
        );
      } catch {}
    }
    return;
  }

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

  const dest = stanza.attributes.to || "";
  const room = mucRoomOf(dest);
  const joinX = stanza.children.some((ch) => ch.name === "x" || ch.name === "muc:x");
  if (room && (joinX || stanza.attributes.type === "unavailable")) {
    const members = mucRooms.get(room) ?? new Set<string>();
    const nick = mucNick(room, client);
    if (stanza.attributes.type === "unavailable") {
      members.delete(client.connectionId);
      if (members.size === 0) mucRooms.delete(room);
      else mucRooms.set(room, members);
      try {
        ws.send(
          xml({
            name: "presence",
            attrs: { to: client.jid, from: nick, xmlns: "jabber:client", type: "unavailable" },
            children: [mucItem(client.displayName, client.jid, true, false)],
          })
        );
      } catch {}
      return;
    }
    const created = members.size === 0;
    mucRooms.set(room, members);
    const isNew = !members.has(client.connectionId);
    members.add(client.connectionId);
    try {
      ws.send(
        xml({
          name: "presence",
          attrs: { to: client.jid, from: nick, xmlns: "jabber:client" },
          children: [mucItem(client.displayName, client.jid, true, created)],
        })
      );
    } catch {}
    for (const memberId of members) {
      const m = clients.get(memberId);
      if (!m || m.connectionId === client.connectionId) continue;
      try {
        ws.send(
          xml({
            name: "presence",
            attrs: { to: client.jid, from: mucNick(room, m), xmlns: "jabber:client" },
            children: [mucItem(m.displayName, m.jid, false, false)],
          })
        );
      } catch {}
      try {
        m.ws.send(
          xml({
            name: "presence",
            attrs: { to: m.jid, from: nick, xmlns: "jabber:client" },
            children: [mucItem(client.displayName, client.jid, false, false)],
          })
        );
      } catch {}
    }
    void isNew;
    return;
  }

  if (stanza.attributes.type === "unavailable") {
    broadcastPresence(client, "{}", false, true);
    return;
  }

  const status = childContent(stanza, "status");
  if (!isJSON(status)) return;

  broadcastPresence(client, status as string, findChild(stanza, "show") !== undefined, false);
}

export type XmppSocket = ServerWebSocket<{ connectionId: string } & Record<string, unknown>>;

export function xmppStreamOpened(ws: XmppSocket) {
  const sock = ws as unknown as Socket;
  let state = clientFor(sock) ?? pending.get(sock.data.connectionId);
  if (!state) {
    state = { streamId: newStreamId() };
    pending.set(sock.data.connectionId, state);
  }
  handleOpen(sock, state);
}

export function xmppOpen(ws: XmppSocket) {
  pending.set(ws.data.connectionId as string, { streamId: newStreamId() });
}

export function xmppMessage(ws: XmppSocket, raw: string | Buffer | ArrayBuffer | Uint8Array) {
  const text = typeof raw === "string" ? raw : Buffer.from(raw as Uint8Array).toString("utf-8");
  const stanza = parseXml(text);
  if (!stanza) return closeStream(ws as Socket);
  const sock = ws as unknown as Socket;
  let state: PendingState | undefined = clientFor(sock) ?? pending.get(sock.data.connectionId);
  if (!state) {
    state = { streamId: newStreamId() };
    pending.set(sock.data.connectionId, state);
  }

  try {
    switch (stanza.name) {
      case "open":
        handleOpen(sock, state);
        break;
      case "auth":
        handleAuth(sock, stanza, state);
        break;
      case "iq":
        handleIq(sock, stanza, state);
        break;
      case "message":
        handleMessage(sock, stanza);
        break;
      case "presence":
        handlePresence(sock, stanza);
        break;
      case "close":
        closeStream(sock);
        break;
      default:
        break;
    }
  } catch (err) {
    logger.error("XMPP stanza error", err instanceof Error ? err.message : String(err));
  }
}

export function xmppClose(ws: XmppSocket) {
  const sock = ws as unknown as Socket;
  const client = clientFor(sock);
  pending.delete(sock.data.connectionId);
  if (!client) return;

  clients.delete(sock.data.connectionId);
  broadcastPresence(client, "{}", false, true);
  logger.xmpp("client disconnected", `${client.displayName} (${clients.size} online)`);
}

export function upgradeXmppSocket(req: Request, srv: { upgrade: (req: Request, opts: { data: { connectionId: string }; headers?: Record<string, string> }) => boolean }): boolean {
  const protocol = req.headers.get("sec-websocket-protocol");
  return srv.upgrade(req, {
    data: { connectionId: makeID() },
    headers: protocol
      ? { "Sec-WebSocket-Protocol": protocol.split(",")[0].trim() }
      : undefined,
  });
}

export function startXmpp(port: number) {
  const server = Bun.serve<SocketData>({
    port,
    fetch(req, srv) {
      const upgraded = upgradeXmppSocket(req, srv);
      if (upgraded) return undefined;
      return new Response("XMPP endpoint - websocket upgrade required", { status: 426 });
    },
    websocket: {
      open(ws) {
        xmppOpen(ws as unknown as XmppSocket);
      },

      message(ws, raw) {
        xmppMessage(ws as unknown as XmppSocket, raw as Buffer);
      },

      close(ws) {
        xmppClose(ws as unknown as XmppSocket);
      },
    },
  });

  logger.xmpp("listening", `ws://localhost:${port}`);
  return server;
}