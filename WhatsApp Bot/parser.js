const MONTHS = new Map([
  ["januari", 1], ["februari", 2], ["maret", 3], ["april", 4],
  ["mei", 5], ["juni", 6], ["juli", 7], ["agustus", 8],
  ["september", 9], ["oktober", 10], ["november", 11], ["desember", 12],
]);

function normalizeText(value) {
  return String(value || "").replace(/\r/g, "").trim();
}

function getLocalDateParts(date = new Date(), timeZone = process.env.TIMEKEEPER_TIMEZONE || "Asia/Makassar") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function parseDate(value, now = new Date()) {
  const text = normalizeText(value).toLowerCase();
  const numeric = text.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?\b/);
  let day;
  let month;
  let year;
  let endIndex;

  if (numeric) {
    day = Number(numeric[1]);
    month = Number(numeric[2]);
    year = numeric[3] ? Number(numeric[3]) : Number(getLocalDateParts(now).year);
    endIndex = numeric.index + numeric[0].length;
  } else {
    const named = text.match(/\b(\d{1,2})\s*(januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember)(?:\s*(\d{4}))?\b/);
    if (!named) return null;
    day = Number(named[1]);
    month = MONTHS.get(named[2]);
    year = named[3] ? Number(named[3]) : Number(process.env.TIMEKEEPER_DEFAULT_YEAR || getLocalDateParts(now).year);
    endIndex = named.index + named[0].length;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  return { isoDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, endIndex };
}

function normalizeTime(hour, minute = 0, period = "") {
  let hours = Number(hour);
  const minutes = Number(minute);
  const label = String(period || "").toLowerCase();
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) return null;
  if (label === "am" || label === "pagi") hours = hours === 12 ? 0 : hours;
  if (["pm", "siang", "sore", "malam"].includes(label) && hours < 12) hours += 12;
  if (hours > 23) return null;
  return { value: `${String(hours).padStart(2, "0")}.${String(minutes).padStart(2, "0")}`, minutes: hours * 60 + minutes };
}

function parseTimes(value) {
  return [...normalizeText(value).matchAll(/\b(\d{1,2})(?:[.:](\d{2}))?\s*(pagi|siang|sore|malam|am|pm)?\b/gi)]
    .map((match) => normalizeTime(match[1], match[2] || 0, match[3] || ""))
    .filter(Boolean)
    .filter((time, index, all) => index === all.findIndex((candidate) => candidate.value === time.value));
}

function parseFields(message) {
  const fields = {};
  const lines = normalizeText(message).split("\n").map((item) => item.trim()).filter(Boolean);
  const labeled = lines.some((line) => /(?:->|:|=)/.test(line));
  if (!labeled && lines.length === 4) {
    return { outlet: lines[0], employee: lines[1], work: `${lines[2]} ${lines[3]}` };
  }
  for (const line of lines) {
    const match = line.match(/^(.+?)\s*(?:->|:|=)\s*(.+)$/);
    if (!match) continue;
    const label = match[1].toLowerCase();
    const value = match[2].trim();
    if (label.includes("outlet")) fields.outlet = value;
    else if (label.includes("karyawan") || label.includes("pegawai") || label.includes("nama")) fields.employee = value;
    else if (label.includes("tanggal") || label.includes("jam kerja") || label.includes("waktu")) fields.work = value;
  }
  return fields;
}

function parseAttendanceMessage(message, now = new Date()) {
  const fields = parseFields(message);
  if (!fields.outlet || !fields.employee || !fields.work) {
    return { ok: false, code: "INCOMPLETE", fields, message: "Format belum lengkap." };
  }
  const date = parseDate(fields.work, now);
  if (!date) return { ok: false, code: "INVALID_DATE", fields, message: "Tanggal belum terbaca. Contoh: 27 Juli 2026." };
  const times = parseTimes(fields.work.slice(date.endIndex));
  if (!times.length) return { ok: false, code: "INVALID_TIME", fields, message: "Jam belum terbaca. Contoh: 7 pagi / 7 malam." };
  return {
    ok: true,
    outletName: fields.outlet,
    employeeName: fields.employee,
    workDate: date.isoDate,
    checkIn: times[0].value,
    checkInMinutes: times[0].minutes,
    checkOut: times[1]?.value || null,
    checkOutMinutes: times[1]?.minutes ?? null,
  };
}

function looksLikeAttendanceMessage(message) {
  const text = normalizeText(message).toLowerCase();
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return text.includes("outlet") || text.includes("karyawan") || text.includes("jam kerja") || text.includes("tanggal") || lines.length === 4;
}

module.exports = { looksLikeAttendanceMessage, normalizeTime, parseAttendanceMessage, parseDate, parseFields, parseTimes };
