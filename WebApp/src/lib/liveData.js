import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

const TIMEZONE = "Asia/Makassar";

export function getBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || TIMEZONE;
}

function slug(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDateTime(workDate, time, nextDay = false) {
  if (!workDate || !time) return null;
  const normalized = String(time).replace(".", ":");
  const date = new Date(`${workDate}T${normalized}:00+08:00`);
  if (nextDay) date.setUTCDate(date.getUTCDate() + 1);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getTodayIsoDate(date = new Date(), timeZone = getBrowserTimeZone()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function inferShiftId(minutes) {
  if (minutes == null) return "shift-1";
  if (minutes >= 690 && minutes <= 870) return "shift-2";
  if (minutes >= 1320 || minutes < 180) return "shift-3";
  return "shift-1";
}

function normalizeRecord(snapshot) {
  const data = snapshot.data();
  const checkIn = data.checkIn || null;
  const checkOut = data.checkOut || null;
  const crossesMidnight = data.checkInMinutes != null && data.checkOutMinutes != null && data.checkOutMinutes < data.checkInMinutes;
  return {
    id: snapshot.id,
    employeeId: data.employeeId || data.employeeKey || slug(data.employeeName || data.employeeNameSnapshot),
    employeeNameSnapshot: data.employeeNameSnapshot || data.employeeName || "",
    storeId: data.storeId || data.outletKey || slug(data.outletName),
    outletName: data.outletName || "",
    senderJid: data.senderJid || "",
    shiftId: data.shiftId || inferShiftId(data.checkInMinutes),
    workDate: data.workDate || "",
    actualCheckInAt: toDate(data.actualCheckInAt) || localDateTime(data.workDate, checkIn),
    actualCheckOutAt: toDate(data.actualCheckOutAt) || localDateTime(data.workDate, checkOut, crossesMidnight),
    attendanceStatus: data.attendanceStatus || (checkIn ? "PRESENT" : "INCOMPLETE"),
    punctualityStatus: data.punctualityStatus || "NOT_APPLICABLE",
    lateMinutes: Number(data.lateMinutes || 0),
    workedMinutes: Number(data.workedMinutes || 0),
    extraMinutes: Number(data.extraMinutes || 0),
    overtimeEligible: Boolean(data.overtimeEligible),
    paidOvertimeHours: Number(data.paidOvertimeHours || 0),
    overtimeAmount: Number(data.overtimeAmount || 0),
    overtimePaymentStatus: data.overtimePaymentStatus || "UNPAID",
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function normalizeOutlet(snapshot) {
  const data = snapshot.data();
  const name = data.name || data.outletName || snapshot.id;
  const region = data.region || data.outletRegion || "Lainnya";
  return { id: snapshot.id, name, region, area: data.area || region, color: data.color || (region === "Utara" ? "purple" : region === "Barat" ? "orange" : "teal"), active: data.active !== false };
}

function normalizeEmployee(snapshot) {
  const data = snapshot.data();
  const name = data.name || data.employeeName || snapshot.id;
  return { id: snapshot.id, name, initials: data.initials || name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(), role: data.role || "Karyawan", phone: data.phone || "", senderJid: data.senderJid || "", storeId: data.storeId || data.outletKey || "", shiftId: data.shiftId || inferShiftId(data.defaultCheckInMinutes), accent: data.accent || "blue", active: data.active !== false };
}

export function buildLiveOutlets(outletDocs, records) {
  const byId = new Map(outletDocs.map((outlet) => [outlet.id, { ...outlet }]));
  records.forEach((record) => {
    const id = record.storeId || slug(record.outletName);
    if (!id || byId.has(id)) return;
    byId.set(id, { id, name: record.outletName || id, region: "Lainnya", area: "", color: "teal" });
  });
  return [...byId.values()].filter((outlet) => outlet.active !== false).sort((a, b) => a.name.localeCompare(b.name));
}

export function buildLiveEmployees(employeeDocs, records, outlets, today = getTodayIsoDate()) {
  const outletById = Object.fromEntries(outlets.map((outlet) => [outlet.id, outlet]));
  const byId = new Map(employeeDocs.map((employee) => [employee.id, { ...employee }]));
  records.forEach((record) => {
    const id = record.employeeId;
    if (!id || byId.has(id)) return;
    byId.set(id, { id, name: record.employeeNameSnapshot || id, initials: (record.employeeNameSnapshot || id).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(), role: "Karyawan", phone: "", senderJid: record.senderJid || "", storeId: record.storeId, shiftId: record.shiftId, accent: "blue", active: true });
  });
  return [...byId.values()].filter((employee) => employee.active !== false).map((employee) => {
    const employeeRecords = records.filter((record) => record.employeeId === employee.id);
    const todayRecord = employeeRecords.find((record) => record.workDate === today);
    const status = todayRecord?.attendanceStatus === "DAY_OFF" ? "absent" : todayRecord?.punctualityStatus === "LATE" ? "late" : todayRecord?.overtimeEligible ? "overtime" : todayRecord && !todayRecord.actualCheckOutAt ? "working" : todayRecord ? "present" : "absent";
    return { ...employee, phone: employee.phone || todayRecord?.senderJid || employeeRecords.find((record) => record.senderJid)?.senderJid || "", senderJid: employee.senderJid || todayRecord?.senderJid || employeeRecords.find((record) => record.senderJid)?.senderJid || "", storeId: employee.storeId || todayRecord?.storeId || "", shiftId: employee.shiftId || todayRecord?.shiftId || "shift-1", storeName: outletById[employee.storeId]?.name || todayRecord?.outletName || "Belum ditentukan", status, totalLate: employeeRecords.filter((record) => record.punctualityStatus === "LATE").length, totalOvertime: employeeRecords.reduce((sum, record) => sum + record.paidOvertimeHours, 0), totalLeave: employeeRecords.filter((record) => record.attendanceStatus === "DAY_OFF").length };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function useLiveTimekeeperData(userId) {
  const [raw, setRaw] = useState({ employees: [], outlets: [], records: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!db || !userId) return undefined;
    setLoading(true);
    setError("");
    let loaded = 0;
    const markLoaded = () => { loaded += 1; if (loaded >= 3) setLoading(false); };
    const subscribe = (name, key, mapper) => onSnapshot(collection(db, name), (snapshot) => { setRaw((current) => ({ ...current, [key]: snapshot.docs.map(mapper) })); markLoaded(); }, (snapshotError) => { setError(snapshotError.message || "Data Firebase gagal dimuat"); setLoading(false); });
    const unsubEmployees = subscribe("timekeeperEmployees", "employees", normalizeEmployee);
    const unsubOutlets = subscribe("timekeeperOutlets", "outlets", normalizeOutlet);
    const unsubRecords = subscribe("timekeeperAttendance", "records", normalizeRecord);
    return () => { unsubEmployees(); unsubOutlets(); unsubRecords(); };
  }, [userId]);

  const outlets = buildLiveOutlets(raw.outlets, raw.records);
  const employees = buildLiveEmployees(raw.employees, raw.records, outlets);
  return { employees, outlets, records: raw.records, loading, error };
}
