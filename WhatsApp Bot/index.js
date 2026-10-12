require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { admin } = require("./firebaseAdmin");
const { initSession, status, stopSession } = require("./waService");
const { generateWorkbookBuffer } = require("./exportService");
const { activePeriodToDate, fullPeriodForLabel, localDateISO, queryAttendanceRange } = require("./attendanceReport");

const app = express();
const origins = String(process.env.TIMEKEEPER_ALLOWED_ORIGIN || "").split(",").map((value) => value.trim()).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true }));
app.use(express.json({ limit: "1mb" }));

const { createRequireAdmin } = require("./http-auth");
const requireFirebaseUser = createRequireAdmin((token, revoked) => admin.auth().verifyIdToken(token, revoked));

app.get("/health", (req, res) => res.json({ ok: true, service: "timekeeper-wa-bot" }));
app.get("/api/wa/status", requireFirebaseUser, (req, res) => res.json(status()));
app.post("/api/wa/connect", requireFirebaseUser, async (req, res) => {
  try { res.json(await initSession()); } catch (error) { res.status(500).json({ ...status(), error: error.message }); }
});
app.post("/api/wa/disconnect", requireFirebaseUser, async (req, res) => res.json(await stopSession()));
app.post("/api/export/period", requireFirebaseUser, async (req, res) => {
  try {
    const today = localDateISO(new Date());
    const requestedLabel = String(req.body?.label || "").trim();
    const period = requestedLabel === "11-25" || requestedLabel === "26-10"
      ? fullPeriodForLabel(requestedLabel, today)
      : activePeriodToDate(today);
    const records = await queryAttendanceRange(period.startDate, period.endDate);
    const workbook = await generateWorkbookBuffer(records, period);
    const filename = `${today.replace(/-/g, "")} - Rekapan Periode ${period.label}.xlsx`;
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    });
    return res.send(workbook.buffer);
  } catch (error) {
    console.error("TimeKeeper Excel export failed:", error.message);
    return res.status(500).json({ error: "File Excel TimeKeeper belum berhasil dibuat." });
  }
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  console.log(`TimeKeeper WhatsApp Bot listening on ${port}`);
  initSession().catch((error) => console.error("WA session initialization failed:", error.message));
});
