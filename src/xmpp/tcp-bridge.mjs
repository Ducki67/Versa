import net from "node:net";
import tls from "node:tls";
import fs from "node:fs";
import crypto from "node:crypto";

const TCP_PORT = parseInt(process.env.XMPP_TCP_PORT || "5222", 10) || 5222;
const BRIDGE_URL = process.env.VERSA_BRIDGE_URL || "ws://127.0.0.1:3551/internal/xmpp-bridge";
const SECRET = process.env.XMPP_BRIDGE_SECRET || "";
const CERT_FILE = process.env.XMPP_CERT_FILE || "";
const KEY_FILE = process.env.XMPP_KEY_FILE || "";

if (!SECRET) {
  console.log("[tcp-xmpp] missing bridge secret");
  process.exit(1);
}

let creds = null;
try {
  creds = { cert: fs.readFileSync(CERT_FILE), key: fs.readFileSync(KEY_FILE) };
  console.log("[tcp-xmpp] certs loaded");
} catch {
  console.log("[tcp-xmpp] cert files missing, exiting");
  process.exit(1);
}

let bridge = null;
const outbox = [];

function bridgeSend(obj) {
  const text = JSON.stringify(obj);
  if (bridge && bridge.readyState === 1) {
    try { bridge.send(text); return; } catch {}
  }
  if (outbox.length < 500) outbox.push(text);
}

function connectBridge() {
  let ws;
  try {
    ws = new WebSocket(BRIDGE_URL, { headers: { "x-bridge-secret": SECRET } });
  } catch {
    setTimeout(connectBridge, 3000);
    return;
  }
  ws.onopen = () => {
    bridge = ws;
    while (outbox.length) {
      const text = outbox.shift();
      try { ws.send(text); } catch { outbox.unshift(text); break; }
    }
    console.log("[tcp-xmpp] bridge connected");
  };
  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(String(e.data)); } catch { return; }
    const sock = sockets.get(msg.id);
    if (!sock) return;
    if (msg.t === "send" && typeof msg.text === "string") {
      try { sock.sink.write(msg.text); } catch {}
    } else if (msg.t === "close") {
      try { sock.sink.destroy(); } catch {}
      sockets.delete(msg.id);
    }
  };
  const down = () => {
    if (bridge === ws) bridge = null;
    try { ws.close(); } catch {}
    setTimeout(connectBridge, 3000);
  };
  ws.onclose = down;
  ws.onerror = down;
}

const sockets = new Map();

function splitUnits(buffer) {
  const units = [];
  let rest = buffer.replace(/^\s+/, "").replace(/^<\?xml[^?]*\?>\s*/, "");
  for (;;) {
    rest = rest.replace(/^\s+/, "");
    if (!rest) break;
    if (rest.startsWith("</stream:stream")) {
      const end = rest.indexOf(">");
      if (end === -1) break;
      units.push({ kind: "end" });
      rest = rest.slice(end + 1);
      continue;
    }
    if (!rest.startsWith("<")) break;
    if (rest.startsWith("<stream:stream")) {
      const end = rest.indexOf(">");
      if (end === -1) break;
      units.push({ kind: "stream" });
      rest = rest.slice(end + 1);
      continue;
    }
    const m = /^<([A-Za-z_][\w:.-]*)/.exec(rest);
    if (!m) break;
    const name = m[1];
    let i = m[0].length;
    let quote = null;
    let tagEnd = -1;
    let selfClose = false;
    for (; i < rest.length; i++) {
      const ch = rest[i];
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === ">") { tagEnd = i; break; }
    }
    if (tagEnd === -1) break;
    if (rest[tagEnd - 1] === "/") {
      units.push({ kind: "stanza", text: rest.slice(0, tagEnd + 1) });
      rest = rest.slice(tagEnd + 1);
      continue;
    }
    const openTag = `<${name}`;
    const closeTag = `</${name}>`;
    let depth = 0;
    let j = 0;
    let done = -1;
    while (j < rest.length) {
      if (!quote && rest.startsWith(openTag, j) && /[\s/>]/.test(rest[j + openTag.length] || " ")) {
        let k = j + openTag.length;
        let q = null;
        let sc = false;
        for (; k < rest.length; k++) {
          const c2 = rest[k];
          if (q) { if (c2 === q) q = null; continue; }
          if (c2 === '"' || c2 === "'") { q = c2; continue; }
          if (c2 === ">") {
            if (rest[k - 1] === "/") { sc = true; }
            k++;
            break;
          }
        }
        if (!sc) depth++;
        j = k;
        continue;
      }
      if (rest.startsWith(closeTag, j)) {
        depth--;
        j += closeTag.length;
        if (depth === 0) { done = j; break; }
        continue;
      }
      j++;
    }
    if (done === -1) break;
    units.push({ kind: "stanza", text: rest.slice(0, done) });
    rest = rest.slice(done);
  }
  return { units, rest };
}

function handleUnits(sock, units) {
  for (const u of units) {
    if (u.kind === "stream") {
      bridgeSend({ t: "stream", id: sock.id });
    } else if (u.kind === "end") {
      bridgeSend({ t: "close", id: sock.id });
      try { sock.sink.destroy(); } catch {}
      sockets.delete(sock.id);
      return;
    } else {
      const stanza = u.text;
      if (!sock.secure && /<starttls[\s/>]/.test(stanza)) {
        try { sock.sink.write('<proceed xmlns="urn:ietf:params:xml:ns:xmpp-tls"/>'); } catch {}
        try {
          const tlsSock = new tls.TLSSocket(sock.raw, {
            isServer: true,
            cert: creds.cert,
            key: creds.key,
          });
          sock.sink = tlsSock;
          sock.secure = true;
          sock.buffer = "";
          tlsSock.on("data", (chunk) => onSocketData(sock, chunk));
          tlsSock.on("error", () => {});
          tlsSock.on("close", () => dropSocket(sock.id));
        } catch {
          try { sock.raw.destroy(); } catch {}
          sockets.delete(sock.id);
          return;
        }
        continue;
      }
      bridgeSend({ t: "data", id: sock.id, text: stanza });
    }
  }
}

function onSocketData(sock, chunk) {
  const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf-8");
  sock.buffer += text;
  const { units, rest } = splitUnits(sock.buffer);
  sock.buffer = rest;
  if (sock.buffer.length > 262144) {
    try { sock.sink.destroy(); } catch {}
    sockets.delete(sock.id);
    bridgeSend({ t: "close", id: sock.id });
    return;
  }
  handleUnits(sock, units);
}

function dropSocket(id) {
  if (!sockets.has(id)) return;
  sockets.delete(id);
  bridgeSend({ t: "close", id });
}

const server = net.createServer((raw) => {
  const id = crypto.randomUUID();
  const sock = { id, raw, sink: raw, buffer: "", secure: false, first: true };
  sockets.set(id, sock);
  bridgeSend({ t: "open", id });
  raw.on("data", (chunk) => {
    if (sock.first) {
      sock.first = false;
      const b0 = chunk[0];
      if (b0 === 0x16 && creds) {
        try {
          const tlsSock = new tls.TLSSocket(raw, { isServer: true, cert: creds.cert, key: creds.key });
          sock.sink = tlsSock;
          sock.secure = true;
          tlsSock.on("data", (c2) => onSocketData(sock, c2));
          tlsSock.on("error", () => {});
          tlsSock.on("close", () => dropSocket(id));
          return;
        } catch {
          try { raw.destroy(); } catch {}
          sockets.delete(id);
          return;
        }
      }
    }
    if (sock.sink !== raw) return;
    onSocketData(sock, chunk);
  });
  raw.on("error", () => {});
  raw.on("close", () => dropSocket(id));
});

server.on("error", (e) => {
  console.log("[tcp-xmpp] listen error", e.message);
  process.exit(1);
});

server.listen(TCP_PORT, "0.0.0.0", () => {
  console.log(`[tcp-xmpp] listening on 0.0.0.0:${TCP_PORT}`);
  connectBridge();
});
