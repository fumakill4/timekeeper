const { db } = require("./firebaseAdmin");
const { normalizeName } = require("./outlets");

const MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function timeZone() {
  return process.env.TIMEKEEPER_TIMEZONE || "Asia/Makassar";
}

function localDateISO(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isoParts(isoDate) {
  const [year, month, day] = String(isoDate).split("-").map(Number);
  return { year, month, day };
}

function isoDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const parts = isoParts(iso);
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function periodLabelForDate(iso) {
  return isoParts(iso).day >= 11 && isoParts(iso).day <= 25 ? "11-25" : "26-10";
}

function activePeriodToDate(iso) {
  const { year, month, day } = isoParts(iso);
  if (day >= 11 && day <= 25) return { label: "11-25", startDate: isoDate(year, month, 11), endDate: iso };
  if (day >= 26) return { label: "26-10", startDate: isoDate(year, month, 26), endDate: iso };
  return { label: "26-10", startDate: isoDate(year, month - 1, 26), endDate: iso };
}

function fullPeriodForLabel(label, referenceISO) {
  const { year, month, day } = isoParts(referenceISO);
  if (label === "11-25") {
    const usePreviousMonth = day <= 10;
    const targetMonth = usePreviousMonth ? month - 1 : month;
    const targetYear = new Date(Date.UTC(year, targetMonth - 1, 1)).getUTCFullYear();
    const normalizedMonth = new Date(Date.UTC(year, targetMonth - 1, 1)).getUTCMonth() + 1;
    return { label, startDate: isoDate(targetYear, normalizedMonth, 11), endDate: isoDate(targetYear, normalizedMonth, 25) };
  }

  if (day <= 10) return { label, startDate: isoDate(year, month - 1, 26), endDate: isoDate(year, month, 10) };
  if (day >= 26) return { label, startDate: isoDate(year, month, 26), endDate: isoDate(year, month + 1, 10) };
  return { label, startDate: isoDate(year, month - 1, 26), endDate: isoDate(year, month, 10) };
}

function formatDayMonth(iso) {
  const { month, day } = isoParts(iso);
  return `${day} ${MONTH_NAMES[month - 1]}`;
}

function formatPeriod(period) {
  return `${formatDayMonth(period.startDate)} - ${formatDayMonth(period.endDate)}`;
}

function keyPart(value) {
  return normalizeName(value).toLowerCase().replace(/\s+/g, "-") || "unknown";
}

function editDistance(left, right) {
  const a = String(left);
  const b = String(right);
  const previous = Array.from({ length: b.length + 1 }, (_value, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1),
      );
    }
    for (let column = 0; column <= b.length; column += 1) previous[column] = current[column];
  }
  return previous[b.length];
}

async function queryAttendanceRange(startDate, endDate) {
  const snapshot = await db.collection("timekeeperAttendance")
    .where("workDate", ">=", startDate)
    .where("workDate", "<=", endDate)
    .get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

function reportLine(iso, record) {
  if (!record || record.attendanceStatus === "DAY_OFF") return `${formatDayMonth(iso)} Tidak Masuk/Libur`;
  const late = record.punctualityStatus === "LATE" || Number(record.lateMinutes) > 0;
  return `${formatDayMonth(iso)} masuk jam ${record.checkIn || "—"}${late ? " (terlambat)" : ""}`;
}

function lateSummary(lateCount) {
  if (!lateCount) return "Karyawan tidak terlambat ✅";
  if (lateCount > 2) return `Karyawan ${lateCount}x datang terlambat ⚠️‼️`;
  return `Karyawan ${lateCount}x datang terlambat ⚠️`;
}

async function findEmployee(employeeName, records) {
  const normalized = normalizeName(employeeName);
  const exactRecords = records.filter((record) => normalizeName(record.employeeName) === normalized);
  const employeeRef = await db.collection("timekeeperEmployees").doc(keyPart(employeeName)).get();
  if (employeeRef.exists) return { found: true, name: employeeRef.data().name || employeeName, records: exactRecords };
  if (exactRecords.length) return { found: true, name: exactRecords[0].employeeName || employeeName, records: exactRecords };

  const employees = await db.collection("timekeeperEmployees").limit(100).get();
  const names = employees.docs
    .map((doc) => doc.data().name)
    .filter(Boolean);
  const fuzzyMatches = names.filter((name) => editDistance(normalizeName(name), normalized) <= 1);
  if (fuzzyMatches.length === 1) {
    const matchedName = fuzzyMatches[0];
    return {
      found: true,
      name: matchedName,
      records: records.filter((record) => normalizeName(record.employeeName) === normalizeName(matchedName)),
    };
  }
  const suggestions = names
    .filter((name) => normalizeName(name).includes(normalized) || normalized.includes(normalizeName(name)))
    .slice(0, 5);
  return { found: false, name: employeeName, records: [], suggestions };
}

async function getEmployeePeriodReport(employeeName, now = new Date()) {
  const today = localDateISO(now);
  const period = activePeriodToDate(today);
  const records = await queryAttendanceRange(period.startDate, period.endDate);
  const employee = await findEmployee(employeeName, records);
  if (!employee.found) return { found: false, requestedName: employeeName, period, suggestions: employee.suggestions };

  const byDate = new Map(employee.records.map((record) => [record.workDate, record]));
  const rows = [];
  let lateCount = 0;
  for (let date = period.startDate; date <= period.endDate; date = addDays(date, 1)) {
    const record = byDate.get(date);
    if (record && (record.punctualityStatus === "LATE" || Number(record.lateMinutes) > 0)) lateCount += 1;
    rows.push(reportLine(date, record));
  }

  return {
    found: true,
    name: employee.name,
    period,
    lateCount,
    rows,
    text: [employee.name, `Periode: ${formatPeriod(period)}`, ...rows, lateSummary(lateCount)].join("\n"),
  };
}

module.exports = {
  activePeriodToDate,
  addDays,
  formatDayMonth,
  formatPeriod,
  fullPeriodForLabel,
  getEmployeePeriodReport,
  lateSummary,
  localDateISO,
  periodLabelForDate,
  queryAttendanceRange,
};
