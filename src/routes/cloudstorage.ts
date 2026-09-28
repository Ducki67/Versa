import { Hono } from "hono";
import fs from "fs";
import path from "path";
import { store } from "../storage/store";
import { sha1, sha256 } from "../utils/funcs";
import { errorResponse } from "../utils/error";
import { shouldDisableEncryption } from "../data/version-compat";

const app = new Hono();
const CLOUD_DIR = path.join(import.meta.dir, "../../data/cloudstorage");

function ensureDir() { if (!fs.existsSync(CLOUD_DIR)) fs.mkdirSync(CLOUD_DIR, { recursive: true }); }

function getSystemFiles() {
  ensureDir();
  return fs.readdirSync(CLOUD_DIR).filter((f) => f.endsWith(".ini")).map((file) => {
    const content = fs.readFileSync(path.join(CLOUD_DIR, file));
    return { uniqueFilename: file, filename: file, hash: sha1(content), hash256: sha256(content), length: content.length, contentType: "application/octet-stream", uploaded: new Date().toISOString(), storageType: "S3", storageIds: {}, doNotCache: true };
  });
}

app.get("/fortnite/api/cloudstorage/system", (c) => c.json(getSystemFiles()));

app.get("/fortnite/api/cloudstorage/system/config", (c) => c.json({ sandboxes: [], disableCloudstorage: false }));

app.get("/fortnite/api/cloudstorage/system/:file", (c) => {
  const file = c.req.param("file");
  ensureDir();
  const filePath = path.join(CLOUD_DIR, file);
  if (!fs.existsSync(filePath)) return c.json(errorResponse("com.epicgames.cloudstorage", "errors.com.epicgames.cloudstorage.file_not_found", "File not found"), 404);
  let content = fs.readFileSync(filePath, "utf-8");
  const version = c.get("version") as { season: number; build: number } | undefined;
  if (version && shouldDisableEncryption(version.build)) content += "\n[WindowsClient]\nnet.AllowEncryption=0\n";
  return c.body(content, 200, { "Content-Type": "application/octet-stream" });
});

app.get("/fortnite/api/cloudstorage/user/:accountId", (c) => {
  const accountId = c.req.param("accountId");
  const files = store.listUserFiles(accountId);
  return c.json(files.map((f) => ({ uniqueFilename: f.filename, filename: f.filename, hash: sha1(f.content), hash256: sha256(f.content), length: f.content.length, contentType: "application/octet-stream", uploaded: f.uploaded, storageType: "S3", storageIds: {}, doNotCache: false })));
});

app.get("/fortnite/api/cloudstorage/user/:accountId/:file", (c) => {
  const accountId = c.req.param("accountId");
  const file = c.req.param("file");
  const stored = store.getUserFile(accountId, file);
  if (!stored) return c.json(errorResponse("com.epicgames.cloudstorage", "errors.com.epicgames.cloudstorage.file_not_found", "File not found"), 404);
  return c.body(new Uint8Array(stored.content), 200, { "Content-Type": "application/octet-stream" });
});

app.put("/fortnite/api/cloudstorage/user/:accountId/:file", async (c) => {
  const accountId = c.req.param("accountId");
  const file = c.req.param("file");
  const body = await c.req.arrayBuffer();
  store.saveUserFile(accountId, file, Buffer.from(body));
  return c.body(null, 204);
});

app.delete("/fortnite/api/cloudstorage/user/:accountId/:file", (c) => {
  store.deleteUserFile(c.req.param("accountId"), c.req.param("file"));
  return c.body(null, 204);
});

export default app;
