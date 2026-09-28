import { Hono } from "hono";
import { partyService } from "../services/party";
import { errorResponse } from "../utils/error";

const app = new Hono();

function selfId(c: { get: (key: string) => string }): string {
  return c.get("accountId") || "";
}

app.get("/party/api/v1/Fortnite/user/:accountId", (c) => {
  return c.json(partyService.getUserParties(c.req.param("accountId")));
});

app.get("/party/api/v1/Fortnite/user/:accountId/notifications/undelivered/count", (c) => {
  const data = partyService.getUserParties(c.req.param("accountId"));
  return c.json(data.invites.length + data.pings.length);
});

app.get("/party/api/v1/Fortnite/parties/:partyId", (c) => {
  const party = partyService.getParty(c.req.param("partyId"));
  if (!party) return c.json(errorResponse("com.epicgames.party", "errors.com.epicgames.party.party_not_found", "Party not found"), 404);
  return c.json(partyService.toPublic(party));
});

app.post("/party/api/v1/Fortnite/parties", async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const party = partyService.createParty(selfId(c), (body.config as Record<string, unknown>) || {}, (body.join_info as Record<string, unknown>) || {}, (body.meta as Record<string, unknown>) || {});
  return c.json(partyService.toPublic(party));
});

app.patch("/party/api/v1/Fortnite/parties/:partyId", async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const party = partyService.patchParty(c.req.param("partyId"), (body.config as Record<string, unknown>) || {}, ((body.meta as Record<string, unknown>)?.update as Record<string, unknown>) || (body.meta as Record<string, unknown>) || {}, (((body.meta as Record<string, unknown>)?.delete as string[]) || []) as string[]);
  if (!party) return c.json(errorResponse("com.epicgames.party", "errors.com.epicgames.party.party_not_found", "Party not found"), 404);
  return c.json(partyService.toPublic(party));
});

app.delete("/party/api/v1/Fortnite/parties/:partyId", (c) => {
  partyService.deleteParty(c.req.param("partyId"));
  return c.body(null, 204);
});

app.post("/party/api/v1/Fortnite/parties/:partyId/members/:accountId/join", async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const party = partyService.joinParty(c.req.param("partyId"), c.req.param("accountId"), (body.join_info as Record<string, unknown>) || (body.connection as Record<string, unknown>) || {}, (body.meta as Record<string, unknown>) || {});
  if (!party) return c.json(errorResponse("com.epicgames.party", "errors.com.epicgames.party.party_not_found", "Party not found"), 404);
  return c.json(partyService.toPublic(party));
});

app.delete("/party/api/v1/Fortnite/parties/:partyId/members/:accountId", (c) => {
  partyService.leaveParty(c.req.param("partyId"), c.req.param("accountId"));
  return c.body(null, 204);
});

app.patch("/party/api/v1/Fortnite/parties/:partyId/members/:accountId/meta", async (c) => {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  const member = partyService.patchMember(c.req.param("partyId"), c.req.param("accountId"), (body.update as Record<string, unknown>) || {}, ((body.delete as string[]) || []) as string[]);
  if (!member) return c.json(errorResponse("com.epicgames.party", "errors.com.epicgames.party.member_not_found", "Member not found"), 404);
  return c.json(member);
});

app.post("/party/api/v1/Fortnite/parties/:partyId/members/:accountId/promote", (c) => {
  const ok = partyService.promoteMember(c.req.param("partyId"), c.req.param("accountId"));
  if (!ok) return c.json(errorResponse("com.epicgames.party", "errors.com.epicgames.party.member_not_found", "Member not found"), 404);
  return c.body(null, 204);
});

app.post("/party/api/v1/Fortnite/parties/:partyId/invites/:accountId", (c) => {
  const invite = partyService.invite(c.req.param("partyId"), selfId(c), c.req.param("accountId"), c.req.query("sendPing") === "true");
  if (!invite) return c.json(errorResponse("com.epicgames.party", "errors.com.epicgames.party.party_not_found", "Party not found"), 404);
  return c.json(invite);
});

app.post("/party/api/v1/Fortnite/parties/:partyId/invites/:accountId/decline", (c) => {
  partyService.declineInvite(c.req.param("partyId"), c.req.param("accountId"));
  return c.body(null, 204);
});

app.delete("/party/api/v1/Fortnite/parties/:partyId/invites/:accountId", (c) => {
  partyService.declineInvite(c.req.param("partyId"), c.req.param("accountId"));
  return c.body(null, 204);
});

app.get("/party/api/v1/Fortnite/user/:accountId/pings/:pinger", (c) => {
  const data = partyService.getUserParties(c.req.param("accountId"));
  return c.json(data.pings.filter((p) => p.pingerId === c.req.param("pinger")));
});

app.post("/party/api/v1/Fortnite/user/:accountId/pings/:pinger", (c) => c.body(null, 204));

app.delete("/party/api/v1/Fortnite/user/:accountId/pings/:pinger", (c) => c.body(null, 204));

app.post("/party/api/v1/Fortnite/user/:accountId/pings/:pinger/join", (c) => c.body(null, 204));

app.post("/party/api/v1/Fortnite/members/:accountId/intentions/:sender", (c) => c.body(null, 204));

app.post("/party/api/v1/Fortnite/parties/:partyId/members/:accountId/intentions/:sender", (c) => {
  partyService.intention(c.req.param("partyId"), c.req.param("sender"), c.req.param("accountId"));
  return c.body(null, 204);
});

app.post("/party/api/v1/Fortnite/parties/:partyId/members/:accountId/conferences/connection", (c) => c.json({}));

app.all("/party/api/v1/Fortnite/parties/*", (c) => c.body(null, 204));

export default app;
