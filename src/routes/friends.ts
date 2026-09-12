import { Hono } from "hono";

const app = new Hono();

app.get("/friends/api/public/friends/:accountId", (c) => c.json([]));

app.get("/friends/api/v1/:accountId/summary", (c) => c.json({ friends: [], requests: [], suggested: [], blocklist: [], settings: { acceptFriendRequests: true } }));

app.get("/friends/api/v1/:accountId/friends", (c) => c.json([]));

app.post("/friends/api/v1/:accountId/friends/:friendId", async (c) => c.body(null, 204));

app.delete("/friends/api/v1/:accountId/friends/:friendId", async (c) => c.body(null, 204));

app.post("/friends/api/v1/:accountId/friends/:friendId/accept", async (c) => c.body(null, 204));

app.post("/friends/api/v1/:accountId/friends/:friendId/reject", async (c) => c.body(null, 204));

app.post("/friends/api/v1/:accountId/blocklist/:friendId", async (c) => c.body(null, 204));

app.delete("/friends/api/v1/:accountId/blocklist/:friendId", async (c) => c.body(null, 204));

export default app;
