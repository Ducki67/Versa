import { Hono } from "hono";
import { social } from "../services/social";
import { errorResponse } from "../utils/error";

const app = new Hono();

function toPublicFriend(f: { accountId: string; status: string; direction: string; created: string; favorite: boolean; alias: string }) {
  return { accountId: f.accountId, status: f.status, direction: f.direction, created: f.created, favorite: f.favorite, alias: f.alias };
}

app.get("/friends/api/public/friends/:accountId", async (c) => {
  const friends = await social.getFriends(c.req.param("accountId"));
  if (!friends) return c.json(errorResponse("com.epicgames.friends", "errors.com.epicgames.friends.account_not_found", "Account not found"), 404);
  return c.json(friends.map(toPublicFriend));
});

app.get("/friends/api/public/blocklist/:accountId", async (c) => {
  const blocklist = await social.getBlocklist(c.req.param("accountId"));
  if (!blocklist) return c.json(errorResponse("com.epicgames.friends", "errors.com.epicgames.friends.account_not_found", "Account not found"), 404);
  return c.json(blocklist.map((b) => b.accountId));
});

app.get("/friends/api/v1/:accountId/summary", async (c) => {
  const summary = await social.getSummary(c.req.param("accountId"));
  if (!summary) return c.json(errorResponse("com.epicgames.friends", "errors.com.epicgames.friends.account_not_found", "Account not found"), 404);
  return c.json({ friends: summary.friends, incoming: summary.incoming, outgoing: summary.outgoing, requests: summary.requests, suggested: summary.suggested, blocklist: summary.blocklist, settings: summary.settings });
});

app.get("/friends/api/v1/:accountId/settings", async (c) => {
  const summary = await social.getSummary(c.req.param("accountId"));
  if (!summary) return c.json(errorResponse("com.epicgames.friends", "errors.com.epicgames.friends.account_not_found", "Account not found"), 404);
  return c.json(summary.settings);
});

app.get("/friends/api/v1/:accountId/friends", async (c) => {
  const friends = await social.getFriends(c.req.param("accountId"));
  if (!friends) return c.json(errorResponse("com.epicgames.friends", "errors.com.epicgames.friends.account_not_found", "Account not found"), 404);
  return c.json(friends);
});

app.get("/friends/api/v1/:accountId/blocklist", async (c) => {
  const blocklist = await social.getBlocklist(c.req.param("accountId"));
  if (!blocklist) return c.json(errorResponse("com.epicgames.friends", "errors.com.epicgames.friends.account_not_found", "Account not found"), 404);
  return c.json(blocklist);
});

app.post("/friends/api/v1/:accountId/friends/:friendId", async (c) => {
  const result = await social.requestFriend(c.req.param("accountId"), c.req.param("friendId"));
  if (!result.ok) {
    if (result.reason === "account_missing") return c.json(errorResponse("com.epicgames.friends", "errors.com.epicgames.friends.account_not_found", "Account not found"), 404);
    if (result.reason === "self_relation") return c.json(errorResponse("com.epicgames.friends", "errors.com.epicgames.friends.self_relation", "Cannot befriend self"), 400);
    if (result.reason === "blocked") return c.json(errorResponse("com.epicgames.friends", "errors.com.epicgames.friends.blocked", "Blocked"), 403);
  }
  return c.body(null, 204);
});

app.delete("/friends/api/v1/:accountId/friends/:friendId", async (c) => {
  await social.removeFriend(c.req.param("accountId"), c.req.param("friendId"));
  return c.body(null, 204);
});

app.post("/friends/api/v1/:accountId/friends/:friendId/accept", async (c) => {
  await social.acceptFriend(c.req.param("accountId"), c.req.param("friendId"));
  return c.body(null, 204);
});

app.post("/friends/api/v1/:accountId/friends/:friendId/reject", async (c) => {
  await social.rejectFriend(c.req.param("accountId"), c.req.param("friendId"));
  return c.body(null, 204);
});

app.post("/friends/api/v1/:accountId/blocklist/:friendId", async (c) => {
  await social.blockFriend(c.req.param("accountId"), c.req.param("friendId"));
  return c.body(null, 204);
});

app.delete("/friends/api/v1/:accountId/blocklist/:friendId", async (c) => {
  await social.unblockFriend(c.req.param("accountId"), c.req.param("friendId"));
  return c.body(null, 204);
});

app.get("/friends/api/public/list/fortnite/:accountId/recentPlayers", (c) => c.json([]));

app.get("/friends/api/v1/:accountId/alias", (c) => c.json({}));

app.put("/friends/api/v1/:accountId/alias/:friendId", async (c) => c.body(null, 204));

app.delete("/friends/api/v1/:accountId/alias/:friendId", async (c) => c.body(null, 204));

export default app;
