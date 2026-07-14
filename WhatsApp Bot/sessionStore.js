const fs = require("node:fs/promises");
const path = require("node:path");
const { Storage } = require("@google-cloud/storage");

const sessionDir = path.resolve(process.env.TIMEKEEPER_WA_SESSION_DIR || path.join(__dirname, "sessions"));
const bucketName = process.env.TIMEKEEPER_WA_SESSION_BUCKET;
const prefix = process.env.TIMEKEEPER_WA_SESSION_PREFIX || "timekeeper-wa-sessions/";
const storage = bucketName ? new Storage() : null;

async function ensureSessionDir() {
  await fs.mkdir(sessionDir, { recursive: true });
}

async function restoreSession() {
  await ensureSessionDir();
  if (!storage || !bucketName) return;
  const [files] = await storage.bucket(bucketName).getFiles({ prefix });
  await Promise.all(files.map(async (file) => {
    const relative = file.name.slice(prefix.length);
    if (!relative || relative.includes("..")) return;
    const target = path.join(sessionDir, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await file.download({ destination: target });
  }));
}

async function backupSession() {
  if (!storage || !bucketName) return;
  await ensureSessionDir();
  const entries = await fs.readdir(sessionDir, { withFileTypes: true });
  await Promise.all(entries.filter((entry) => entry.isFile()).map((entry) => storage.bucket(bucketName).upload(path.join(sessionDir, entry.name), {
    destination: `${prefix}${entry.name}`,
    resumable: false,
    metadata: { cacheControl: "no-store" },
  })));
}

module.exports = { backupSession, ensureSessionDir, restoreSession, sessionDir };
