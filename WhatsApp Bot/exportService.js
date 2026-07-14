const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const JSZip = require("jszip");
const { Storage } = require("@google-cloud/storage");
const {
  formatDayMonth,
  formatPeriod,
  fullPeriodForLabel,
  localDateISO,
  queryAttendanceRange,
} = require("./attendanceReport");

const TEMPLATE_PATH = path.join(__dirname, "templates", "TimeKeeper_Export_Rekap.xlsx");
const CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
const STORAGE = new Storage(projectId ? { projectId } : {});

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function replaceCellValue(xml, ref, value, type = "str") {
  const pattern = new RegExp(`<x:c r="${ref}"([^/>]*?)>([\\s\\S]*?)</x:c>`);
  const makeReplacement = (attrs) => {
    const cleanAttrs = attrs.replace(/\s+t="[^"]*"/g, "");
    return `<x:c r="${ref}"${cleanAttrs}${type === "str" ? ' t="str"' : ""}><x:v>${escapeXml(value)}</x:v></x:c>`;
  };
  if (pattern.test(xml)) return xml.replace(pattern, (_match, attrs) => makeReplacement(attrs));
  const blankPattern = new RegExp(`<x:c r="${ref}"([^/>]*?)\\s*/>`);
  return xml.replace(blankPattern, (_match, attrs) => makeReplacement(attrs));
}

function setCellValue(xml, ref, value, type = "str") {
  return replaceCellValue(xml, ref, value, type);
}

function excelSerialForISO(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

function timeFraction(value) {
  const match = String(value || "").match(/^(\d{1,2})[.:](\d{2})$/);
  if (!match) return null;
  return (Number(match[1]) * 60 + Number(match[2])) / 1440;
}

function shiftName(record) {
  if (record.shiftId === "shift-2") return "Shift 2";
  if (record.shiftId === "shift-3") return "Shift 3";
  if (record.shiftId === "shift-1") return "Shift 1";
  const minutes = Number(record.checkInMinutes);
  if (minutes >= 690 && minutes <= 870) return "Shift 2";
  if (minutes >= 1320 || minutes < 180) return "Shift 3";
  return "Shift 1";
}

function sortRecords(records) {
  return [...records].sort((left, right) => {
    const dateOrder = String(left.workDate || "").localeCompare(String(right.workDate || ""));
    if (dateOrder) return dateOrder;
    const outletOrder = String(left.outletName || "").localeCompare(String(right.outletName || ""));
    if (outletOrder) return outletOrder;
    return String(left.employeeName || "").localeCompare(String(right.employeeName || ""));
  });
}

function fillInputSheet(xml, records) {
  const maxRows = 500;
  const rows = sortRecords(records).slice(0, maxRows).map((record) => ({
    date: excelSerialForISO(record.workDate),
    outlet: record.outletName || "",
    employee: record.employeeName || "",
    shift: shiftName(record),
    checkIn: timeFraction(record.checkIn),
    checkOut: timeFraction(record.checkOut),
    status: record.attendanceStatus === "DAY_OFF" ? "LIBUR" : "HADIR",
    payment: record.overtimeEligible ? "BELUM DIBAYAR" : "—",
    note: record.source === "whatsapp" ? "Input WhatsApp TimeKeeper" : "Data TimeKeeper",
  }));

  let output = xml;
  rows.forEach((record, index) => {
    const row = index + 6;
    output = setCellValue(output, `A${row}`, record.date, "num");
    output = setCellValue(output, `C${row}`, record.outlet);
    output = setCellValue(output, `E${row}`, record.employee);
    output = setCellValue(output, `F${row}`, record.shift);
    if (record.checkIn != null) output = setCellValue(output, `I${row}`, record.checkIn, "num");
    if (record.checkOut != null) output = setCellValue(output, `J${row}`, record.checkOut, "num");
    output = setCellValue(output, `K${row}`, record.status);
    output = setCellValue(output, `Q${row}`, record.payment);
    output = setCellValue(output, `R${row}`, record.note);
  });
  return { xml: output, count: rows.length, truncated: sortRecords(records).length > maxRows };
}

function setRecalculation(xml) {
  if (/<x:calcPr\b/.test(xml)) return xml.replace(/<x:calcPr\b[^>]*\/>/, '<x:calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1" />');
  return xml.replace("</x:workbook>", '<x:calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1" /></x:workbook>');
}

async function generateWorkbookBuffer(records, period) {
  const template = await fs.readFile(TEMPLATE_PATH);
  const zip = await JSZip.loadAsync(template);
  const inputSheet = await zip.file("xl/worksheets/sheet4.xml").async("string");
  const filled = fillInputSheet(inputSheet, records);
  zip.file("xl/worksheets/sheet4.xml", filled.xml);

  let dashboard = await zip.file("xl/worksheets/sheet1.xml").async("string");
  dashboard = setCellValue(dashboard, "E10", `${formatPeriod(period)}`);
  dashboard = setCellValue(dashboard, "F10", process.env.TIMEKEEPER_TIMEZONE || "Asia/Makassar");
  zip.file("xl/worksheets/sheet1.xml", dashboard);

  let workbook = await zip.file("xl/workbook.xml").async("string");
  zip.file("xl/workbook.xml", setRecalculation(workbook));
  return { buffer: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), count: filled.count, truncated: filled.truncated };
}

function safePeriodLabel(label) {
  return label.replace(/[^0-9-]/g, "");
}

async function createPeriodExport(label, now = new Date()) {
  const today = localDateISO(now);
  const period = fullPeriodForLabel(label, today);
  const records = await queryAttendanceRange(period.startDate, period.endDate);
  const workbook = await generateWorkbookBuffer(records, period);
  const bucketName = String(process.env.TIMEKEEPER_WA_SESSION_BUCKET || "").trim();
  if (!bucketName) throw new Error("TIMEKEEPER_WA_SESSION_BUCKET belum dikonfigurasi");

  const prefix = String(process.env.TIMEKEEPER_WA_EXPORT_PREFIX || "timekeeper-wa-exports/").replace(/^\/+|\/+$/g, "");
  const dateStamp = today.replace(/-/g, "");
  const filename = `${dateStamp} - Rekapan Periode ${safePeriodLabel(label)}.xlsx`;
  const objectName = `${prefix}/${dateStamp}-${safePeriodLabel(label)}-${crypto.randomUUID()}.xlsx`;
  const file = STORAGE.bucket(bucketName).file(objectName);
  await file.save(workbook.buffer, {
    resumable: false,
    contentType: CONTENT_TYPE,
    metadata: { cacheControl: "private, max-age=900" },
  });
  const ttlMinutes = Math.max(5, Number(process.env.TIMEKEEPER_WA_EXPORT_TTL_MINUTES || 15));
  const [url] = await file.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + ttlMinutes * 60_000,
    responseDisposition: `attachment; filename="${filename}"`,
    responseType: CONTENT_TYPE,
  });

  return { filename, period, url, count: workbook.count, truncated: workbook.truncated, expiresInMinutes: ttlMinutes };
}

module.exports = { createPeriodExport, fillInputSheet, generateWorkbookBuffer };
