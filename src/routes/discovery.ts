import { Hono } from "hono";

const app = new Hono();

app.post("/fortnite/api/game/v2/creative/discovery/surface/:accountId", (c) => c.json({ Panels: [], lastVisited: [] }));

app.post("/fortnite/api/discovery/surface/:surface", (c) => c.json({ Panels: [] }));

app.post("/api/v1/discovery/surface/:surface", (c) => c.json({ Panels: [] }));

app.post("/api/v2/discovery/surface/:surface", (c) => c.json({ Panels: [] }));

app.post("/api/v2/discovery/surface/:surface/page", (c) => c.json({ Panels: [] }));

app.get("/fortnite/api/discovery/accessToken/:branch", (c) => c.json({ branchName: c.req.param("branch"), token: "" }));

app.post("/links/api/fn/mnemonic", async (c) => c.json({}));

app.get("/links/api/fn/mnemonic/:playlist/related", (c) => c.json([]));

app.post("/api/v1/links/lock-status/:accountId/check", async (c) => c.json({}));

app.post("/fortnite/api/game/v2/creative/discovery/favorites/:accountId", (c) => c.json({ results: [] }));

export default app;
