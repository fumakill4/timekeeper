const makeWASocketModule = require("@whiskeysockets/baileys");
const makeWASocket = makeWASocketModule.default || makeWASocketModule.makeWASocket;
const { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } = makeWASocketModule;
const QRCode = require("qrcode");
const pino = require("pino");
const { saveAttendance, undoLastAttendance } = require("./attendanceStore");
const { findOutlet } = require("./outlets");
const { looksLikeAttendanceMessage, parseAttendanceMessage } = require("./parser");
const { backupSession, restoreSession, sessionDir } = require("./sessionStore");
const { getEmployeePeriodReport } = require("./attendanceReport");
const { createPeriodExport } = require("./exportService");

let sock = null;
let currentQR = null;
let qrDataUrl = null;
let qrUpdatedAt = null;
let isConnected = false;
let isInitializing = false;
let lastError = null;
let restored = false;
let reconnectTimer = null;
let allowReconnect = true;
let backupTimer = null;
const UNDO_COMMANDS = new Set(["delete", "hapus", "batal"]);
const ACCESS_DENIED_MESSAGE = "Anda tidak memiliki izin untuk mengakses bot WhatsApp ini. 🚫🤖";

function allowedSenders() {
  const configured = String(process.env.TIMEKEEPER_ALLOWED_SENDERS || "")
    .split(",")
    .map((value) => value.replace(/\D/g, ""))
    .filter(Boolean);
  return configured;
}

function senderPhoneCandidates(message) {
  const key = message?.key || {};
  return [key.remoteJidAlt, key.participantAlt, key.senderPn, key.participantPn, key.remoteJid]
    .filter((value) => typeof value === "string")
    .map((value) => value.replace(/:\d+@/, "@").trim());
}

function phoneJid(value) {
  if (!value || !value.endsWith("@s.whatsapp.net")) return null;
  const digits = value.split("@")[0].replace(/\D/g, "");
  return digits.length >= 8 ? `${digits}@s.whatsapp.net` : null;
}

function collectReplyTargets(message) {
  const remoteJid = message?.key?.remoteJid;
  const candidates = senderPhoneCandidates(message).map(phoneJid).filter(Boolean);
  if (remoteJid?.endsWith("@lid")) return [...new Set([...candidates, remoteJid])];
  return [...new Set([remoteJid, ...candidates].filter(Boolean))];
}

function displaySender(message) {
  const target = senderPhoneCandidates(message).map(phoneJid).find(Boolean);
  return target || message?.key?.remoteJid || "unknown";
}

function isAllowedSender(sender) {
  const senderNumber = String(sender || "").split("@")[0].replace(/\D/g, "");
  return allowedSenders().some((value) => value === senderNumber);
}

async function sendSafeReply(message, text) {
  if (!sock) return;
  const remoteJid = message?.key?.remoteJid;
  for (const target of collectReplyTargets(message)) {
    const useQuote = !remoteJid?.endsWith("@lid") && target === remoteJid;
    try {
      await sock.sendMessage(target, { text }, useQuote ? { quoted: message } : undefined);
      if (target.endsWith("@s.whatsapp.net") || !remoteJid?.endsWith("@lid")) return;
    } catch (error) {
      lastError = `reply_failed:${error.message}`;
    }
  }
}

function formatAttendanceDate(workDate) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: process.env.TIMEKEEPER_TIMEZONE || "Asia/Makassar" }).format(new Date(`${workDate}T00:00:00+08:00`));
}

function parseRekapPeriod(text) {
  const normalized = String(text || "").toLowerCase().replace(/[–—]/g, "-").trim();
  const match = normalized.match(/^rekapan\s+(11\s*-\s*25|26\s*-\s*10)$/);
  if (!match) return null;
  return match[1].replace(/\s+/g, "");
}

function isEmployeeNameQuery(text) {
  const lines = String(text || "").split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.length === 1 && lines[0].length >= 2 && lines[0].length <= 60 && !/[=:>/\\]/.test(lines[0]);
}

async function handleUndoMessage(message, sender) {
  if (!isAllowedSender(sender)) {
    await sendSafeReply(message, ACCESS_DENIED_MESSAGE);
    return;
  }
  try {
    const result = await undoLastAttendance(sender);
    if (!result.found) {
      await sendSafeReply(message, "Tidak ada absensi terakhir yang bisa dibatalkan.");
      return;
    }
    const record = result.record;
    const details = [
      "Absensi berhasil dibatalkan ✅",
      `Outlet: ${record.outletName || "—"}`,
      `Karyawan: ${record.employeeName || "—"}`,
      `Tanggal: ${formatAttendanceDate(record.workDate)}`,
      `Jam: ${record.checkIn || "—"}`,
    ];
    await sendSafeReply(message, details.join("\n"));
  } catch (error) {
    lastError = `attendance_undo_failed:${error.message}`;
    await sendSafeReply(message, "Absensi belum berhasil dibatalkan. Data tetap aman, silakan coba lagi.");
  }
}

async function handleEmployeeReportMessage(message, sender, employeeName) {
  if (!isAllowedSender(sender)) {
    await sendSafeReply(message, ACCESS_DENIED_MESSAGE);
    return;
  }
  try {
    const report = await getEmployeePeriodReport(employeeName);
    if (!report.found) {
      const suggestion = report.suggestions?.length ? `\nNama yang mirip: ${report.suggestions.join(", ")}` : "";
      await sendSafeReply(message, `Karyawan “${employeeName}” belum ditemukan di data TimeKeeper.${suggestion}`);
      return;
    }
    await sendSafeReply(message, report.text);
  } catch (error) {
    lastError = `employee_report_failed:${error.message}`;
    await sendSafeReply(message, "Rekap karyawan belum berhasil dibaca. Silakan coba lagi beberapa saat lagi.");
  }
}

async function handleRekapMessage(message, sender, periodLabel) {
  if (!isAllowedSender(sender)) {
    await sendSafeReply(message, ACCESS_DENIED_MESSAGE);
    return;
  }
  try {
    const result = await createPeriodExport(periodLabel);
    const lines = [
      `Rekapan Periode ${periodLabel} siap ✅`,
      `Periode data: ${formatAttendanceDate(result.period.startDate)} - ${formatAttendanceDate(result.period.endDate)}`,
      `Data tersusun: ${result.count} record${result.truncated ? " (dibatasi 500 record)" : ""}`,
      `Download: ${result.url}`,
      `Link berlaku sekitar ${result.expiresInMinutes} menit.`,
    ];
    await sendSafeReply(message, lines.join("\n"));
  } catch (error) {
    lastError = `attendance_export_failed:${error.message}`;
    await sendSafeReply(message, "Rekapan belum berhasil dibuat. Pastikan koneksi database dan penyimpanan export TimeKeeper aktif, lalu coba lagi.");
  }
}

function textFromMessage(message) {
  return message?.message?.conversation || message?.message?.extendedTextMessage?.text || message?.message?.imageMessage?.caption || "";
}

function status() {
  return {
    service: "timekeeper-wa-bot",
    state: isConnected ? "connected" : currentQR ? "qr" : isInitializing ? "connecting" : lastError ? "error" : "disconnected",
    isConnected,
    hasQr: Boolean(qrDataUrl),
    qrDataUrl,
    qrUpdatedAt,
    lastError,
  };
}

function scheduleBackup() {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => backupSession().catch((error) => { lastError = `session_backup_failed:${error.message}`; }), 1200);
}

async function handleMessage(message) {
  if (!message?.message || message.key?.remoteJid === "status@broadcast") return;
  const text = textFromMessage(message).trim();
  if (!text) return;
  const sender = displaySender(message);
  if (!isAllowedSender(sender)) return sendSafeReply(message, ACCESS_DENIED_MESSAGE);

  const lower = text.toLowerCase();
  if (lower === "ping") return sendSafeReply(message, "Pong! TimeKeeper Bot aktif. 🤖");
  if (["help", "bantuan", "menu"].includes(lower)) return sendSafeReply(message, "Format absensi TimeKeeper:\nCuci Dewe\nRizky\n27 Juli\nMasuk 07.00\n\nKirim nama karyawan untuk melihat periode berjalan.\nKirim: rekapan 26-10 atau rekapan 11-25 untuk link Excel.\nUntuk membatalkan input terakhir: batal / hapus / delete");

  if (UNDO_COMMANDS.has(lower)) return handleUndoMessage(message, sender);
  const periodLabel = parseRekapPeriod(text);
  if (periodLabel) return handleRekapMessage(message, sender, periodLabel);
  if (isEmployeeNameQuery(text)) return handleEmployeeReportMessage(message, sender, text.trim());
  if (!looksLikeAttendanceMessage(text)) return;

  if (!isAllowedSender(sender)) {
    return sendSafeReply(message, ACCESS_DENIED_MESSAGE);
  }

  const parsed = parseAttendanceMessage(text);
  if (!parsed.ok) return sendSafeReply(message, `Data belum tersimpan. ${parsed.message}\nKetik bantuan untuk melihat contoh format.`);
  const outlet = findOutlet(parsed.outletName);
  if (!outlet) return sendSafeReply(message, `Outlet “${parsed.outletName}” belum ada di daftar TimeKeeper. Cek menu Outlet terlebih dahulu.`);

  try {
    const saved = await saveAttendance(parsed, { messageId: message.key?.id, senderJid: sender });
    const reply = [`${saved.created ? "Absensi tersimpan" : "Absensi diperbarui"} ✅`, `Outlet: ${outlet.name}`, `Karyawan: ${parsed.employeeName}`, `Tanggal: ${formatAttendanceDate(parsed.workDate)}`, `Jam masuk: ${parsed.checkIn}`];
    if (parsed.checkOut) reply.push(`Jam pulang: ${parsed.checkOut}`);
    await sendSafeReply(message, reply.join("\n"));
  } catch (error) {
    lastError = `attendance_write_failed:${error.message}`;
    await sendSafeReply(message, "Data diterima, tetapi belum berhasil disimpan. Admin perlu memeriksa koneksi database.");
  }
}

async function initSession() {
  allowReconnect = true;
  if (isInitializing || isConnected) return status();
  isInitializing = true;
  lastError = null;
  try {
    if (!restored) {
      await restoreSession();
      restored = true;
    }
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    let version;
    try { ({ version } = await fetchLatestBaileysVersion()); } catch { version = undefined; }
    sock = makeWASocket({ auth: state, version, logger: pino({ level: "warn" }), printQRInTerminal: false, markOnlineOnConnect: false });
    sock.ev.on("creds.update", async () => { await saveCreds(); scheduleBackup(); });
    sock.ev.on("messages.upsert", async ({ messages }) => { for (const message of messages) await handleMessage(message); });
    sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        currentQR = qr;
        qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        qrUpdatedAt = new Date().toISOString();
        isConnected = false;
        console.log(`WhatsApp QR updated at ${qrUpdatedAt}`);
      }
      if (connection === "open") {
        isConnected = true;
        isInitializing = false;
        currentQR = null;
        qrDataUrl = null;
        qrUpdatedAt = null;
        lastError = null;
        console.log("WhatsApp session connected");
        scheduleBackup();
      }
      if (connection === "close") {
        isConnected = false;
        isInitializing = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        console.warn(`WhatsApp session closed with code ${code || "unknown"}`);
        if (code === DisconnectReason.loggedOut) {
          currentQR = null;
          qrDataUrl = null;
          lastError = "logged_out_scan_required";
          return;
        }
        if (allowReconnect) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => initSession().catch(() => {}), code === 428 ? 15000 : 2000);
        }
      }
    });
    isInitializing = false;
  } catch (error) {
    isInitializing = false;
    lastError = error.message;
    throw error;
  }
  return status();
}

async function stopSession() {
  allowReconnect = false;
  clearTimeout(reconnectTimer);
  if (sock) {
    try { sock.ws?.close(); } catch {}
  }
  sock = null;
  isConnected = false;
  isInitializing = false;
  currentQR = null;
  qrDataUrl = null;
  return status();
}

module.exports = { initSession, status, stopSession };
