const HTTP = "http://127.0.0.1:3551";
const XMPP = "ws://127.0.0.1:85";
const MM = "ws://127.0.0.1:80";
const DOMAIN = "prod.ol.epicgames.com";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}${detail ? "  " + detail : ""}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? "  " + detail : ""}`);
  }
}

async function login(email: string, password: string) {
  const res = await fetch(`${HTTP}/account/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "password", username: email, password }),
  });
  const json: any = await res.json();
  return { accountId: json.account_id, token: json.access_token, displayName: json.displayName };
}

class XmppClient {
  ws!: WebSocket;
  frames: string[] = [];
  constructor(public accountId: string, public token: string, public resource: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(XMPP, ["xmpp"]);
      this.ws.onmessage = (e) => this.frames.push(String(e.data));
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(new Error("xmpp socket error " + JSON.stringify(e)));
    });
  }

  send(data: string) {
    this.ws.send(data);
  }

  async waitFor(pred: (f: string) => boolean, ms = 3000): Promise<string | null> {
    const deadline = Date.now() + ms;
    for (;;) {
      const hit = this.frames.find(pred);
      if (hit) return hit;
      if (Date.now() > deadline) return null;
      await Bun.sleep(40);
    }
  }

  async handshake(): Promise<{ jid: string | null }> {
    this.send(`<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" to="${DOMAIN}" version="1.0"/>`);
    await this.waitFor((f) => f.includes("<open"), 2000);
    await this.waitFor((f) => f.includes("mechanism"), 2000);

    const sasl = Buffer.from(`\u0000${this.accountId}\u0000${this.token}`).toString("base64");
    this.send(
      `<auth mechanism="PLAIN" xmlns="urn:ietf:params:xml:ns:xmpp-sasl">${sasl}</auth>`
    );
    const success = await this.waitFor((f) => f.includes("<success"), 2000);
    if (!success) return { jid: null };

    this.frames = [];
    this.send(`<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" to="${DOMAIN}" version="1.0"/>`);
    await this.waitFor((f) => f.includes("bind"), 2000);

    this.send(
      `<iq id="_xmpp_bind1" type="set"><bind xmlns="urn:ietf:params:xml:ns:xmpp-bind"><resource>${this.resource}</resource></bind></iq>`
    );
    const bindRes = await this.waitFor((f) => f.includes("_xmpp_bind1"), 2000);
    const jid = bindRes?.match(/<jid>([^<]+)<\/jid>/)?.[1] ?? null;

    this.send(`<iq id="_xmpp_session1" type="set"><session xmlns="urn:ietf:params:xml:ns:xmpp-session"/></iq>`);
    await this.waitFor((f) => f.includes("_xmpp_session1"), 2000);

    return { jid };
  }
}

console.log("\n=== Versa XMPP + Matchmaker E2E ===\n");

console.log("[auth]");
const alice = await login("alice@versa.test", "pw123");
const bob = await login("bob@versa.test", "pw123");
check("alice got token", !!alice.token && !!alice.accountId, alice.accountId);
check("bob got token", !!bob.token && !!bob.accountId, bob.accountId);

console.log("\n[xmpp handshake]");
const a = new XmppClient(alice.accountId, alice.token, "V2:Fortnite:WIN::A1");
const b = new XmppClient(bob.accountId, bob.token, "V2:Fortnite:WIN::B1");
await a.connect();
await b.connect();

const aBind = await a.handshake();
const bBind = await b.handshake();
check("alice bound", aBind.jid === `${alice.accountId}@${DOMAIN}/V2:Fortnite:WIN::A1`, aBind.jid ?? "none");
check("bob bound", bBind.jid === `${bob.accountId}@${DOMAIN}/V2:Fortnite:WIN::B1`, bBind.jid ?? "none");

console.log("\n[xmpp auth rejection]");
const imposter = new XmppClient(alice.accountId, bob.token, "V2:Fortnite:WIN::X1");
await imposter.connect();
imposter.send(`<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" to="${DOMAIN}" version="1.0"/>`);
await imposter.waitFor((f) => f.includes("mechanism"), 2000);
const badSasl = Buffer.from(`\u0000${alice.accountId}\u0000${bob.token}`).toString("base64");
imposter.send(`<auth mechanism="PLAIN" xmlns="urn:ietf:params:xml:ns:xmpp-sasl">${badSasl}</auth>`);
const rejected = await imposter.waitFor((f) => f.includes("<close"), 2000);
check("token/account mismatch rejected", !!rejected);

const unknown = new XmppClient("deadbeefdeadbeefdeadbeefdeadbeef", "junk", "V2:Fortnite:WIN::Y1");
await unknown.connect();
unknown.send(`<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" to="${DOMAIN}" version="1.0"/>`);
await unknown.waitFor((f) => f.includes("mechanism"), 2000);
const unknownSasl = Buffer.from(`\u0000deadbeefdeadbeefdeadbeefdeadbeef\u0000junk`).toString("base64");
unknown.send(`<auth mechanism="PLAIN" xmlns="urn:ietf:params:xml:ns:xmpp-sasl">${unknownSasl}</auth>`);
check("unknown account rejected", !!(await unknown.waitFor((f) => f.includes("<close"), 2000)));

console.log("\n[presence]");
b.frames = [];
const status = JSON.stringify({ Status: "Battle Royale Lobby", bIsPlaying: false, Properties: {} });
a.send(`<presence><status>${status.replace(/"/g, "&quot;")}</status></presence>`);
const gotPresence = await b.waitFor(
  (f) => f.includes("<presence") && f.includes(a.accountId) && f.includes("Battle Royale Lobby"),
  3000
);
check("bob receives alice presence", !!gotPresence);

a.frames = [];
b.send(`<presence><show>away</show><status>${status.replace(/"/g, "&quot;")}</status></presence>`);
const gotAway = await a.waitFor((f) => f.includes("<presence") && f.includes("away"), 3000);
check("alice receives bob away presence", !!gotAway);

console.log("\n[chat + party relay]");
b.frames = [];
a.send(
  `<message to="${bob.accountId}@${DOMAIN}" type="chat"><body>hello from alice</body></message>`
);
const gotChat = await b.waitFor((f) => f.includes("hello from alice"), 3000);
check("bob receives whisper from alice", !!gotChat);

b.frames = [];
const invite = JSON.stringify({ type: "com.epicgames.party.invitation", partyId: "testparty" });
a.send(`<message to="${bob.accountId}@${DOMAIN}" id="inv1"><body>${invite.replace(/"/g, "&quot;")}</body></message>`);
const gotInvite = await b.waitFor((f) => f.includes("com.epicgames.party.invitation"), 3000);
check("bob receives party invitation from alice", !!gotInvite);

console.log("\n[disconnect presence]");
a.frames = [];
b.ws.close();
const gotOffline = await a.waitFor(
  (f) => f.includes("<presence") && f.includes("unavailable") && f.includes(bob.accountId),
  3000
);
check("alice sees bob go unavailable", !!gotOffline);

console.log("\n[matchmaker]");
const ticketRes = await fetch(
  `${HTTP}/fortnite/api/game/v2/matchmakingservice/ticket/player/${alice.accountId}?region=EU`,
  { headers: { Authorization: `bearer ${alice.token}` } }
);
const ticket: any = await ticketRes.json();
check("ticket issued", !!ticket.payload && !!ticket.serviceUrl, ticket.serviceUrl);

const ticketPayload = JSON.parse(Buffer.from(ticket.payload, "base64").toString("utf-8"));
check("ticket payload carries sessionId", !!ticketPayload.sessionId, ticketPayload.sessionId);

const mmFrames: any[] = [];
const mmDone = Promise.withResolvers<void>();
const mmWs = new WebSocket(MM, {
  headers: {
    Authorization: `Epic-Signed mms-player ${ticket.payload} ${ticket.signature}`,
  },
} as any);
mmWs.onmessage = (e) => {
  const msg = JSON.parse(String(e.data));
  mmFrames.push(msg);
  if (msg.name === "Play") mmDone.resolve();
};
mmWs.onerror = () => mmDone.resolve();

const timeout = setTimeout(() => mmDone.resolve(), 12000);
await mmDone.promise;
clearTimeout(timeout);

const states = mmFrames.map((f) => f.payload?.state ?? f.name);
check("queue progression observed", states.length >= 4, states.join(" -> "));
check("reached Connecting", states.includes("Connecting"));
check("reached Waiting", states.includes("Waiting"));
check("reached Queued", states.includes("Queued"));
check("reached SessionAssignment", states.includes("SessionAssignment"));

const play = mmFrames.find((f) => f.name === "Play");
check("received Play", !!play);
check(
  "Play sessionId matches HTTP ticket session",
  play?.payload?.sessionId === ticketPayload.sessionId,
  `${play?.payload?.sessionId} vs ${ticketPayload.sessionId}`
);

if (play) {
  const sessRes = await fetch(`${HTTP}/fortnite/api/matchmaking/session/${play.payload.sessionId}`, {
    headers: { Authorization: `bearer ${alice.token}` },
  });
  const sess: any = await sessRes.json();
  check("session resolves over HTTP after Play", sess.id === play.payload.sessionId, sess.id);
  check("session has a server address", !!sess.serverAddress && !!sess.serverPort, `${sess.serverAddress}:${sess.serverPort}`);
  check("alice is in the session players list", JSON.stringify(sess.players).includes(alice.accountId));
}

mmWs.close();
a.ws.close();

console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
process.exit(failed === 0 ? 0 : 1);