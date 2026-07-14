const { db, admin } = require("./firebaseAdmin");
const { findOutlet, normalizeName } = require("./outlets");
const { calculateAttendance } = require("./timeRules");

function keyPart(value) {
  return normalizeName(value).toLowerCase().replace(/\s+/g, "-") || "unknown";
}

function snapshotForUndo(data) {
  if (!data) return null;
  const { undoSnapshot, ...snapshot } = data;
  return snapshot;
}

async function saveAttendance(record, meta = {}) {
  const outlet = findOutlet(record.outletName);
  if (!outlet) {
    const error = new Error(`Outlet tidak terdaftar: ${record.outletName}`);
    error.code = "UNKNOWN_OUTLET";
    throw error;
  }

  const docId = `${record.workDate}__${keyPart(outlet.name)}__${keyPart(record.employeeName)}`;
  const ref = db.collection("timekeeperAttendance").doc(docId);
  const existing = await ref.get();
  const calculated = await calculateAttendance(record);
  const employeeId = keyPart(record.employeeName);
  const outletRef = db.collection("timekeeperOutlets").doc(keyPart(outlet.name));
  const employeeRef = db.collection("timekeeperEmployees").doc(employeeId);
  const now = admin.firestore.FieldValue.serverTimestamp();
  await outletRef.set({
    id: outletRef.id,
    name: outlet.name,
    region: outlet.region,
    area: outlet.region,
    color: outlet.region === "Utara" ? "purple" : outlet.region === "Barat" ? "orange" : "teal",
    updatedAt: now,
  }, { merge: true });
  await employeeRef.set({
    id: employeeRef.id,
    name: record.employeeName.trim(),
    initials: record.employeeName.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    role: "Karyawan",
    storeId: outletRef.id,
    shiftId: calculated.shift.id,
    active: true,
    updatedAt: now,
  }, { merge: true });
  const previous = existing.data() || {};
  await ref.set({
    id: ref.id,
    employeeId,
    outletName: outlet.name,
    outletRegion: outlet.region,
    outletKey: keyPart(outlet.name),
    storeId: outletRef.id,
    employeeName: record.employeeName.trim(),
    employeeKey: keyPart(record.employeeName),
    workDate: record.workDate,
    shiftId: calculated.shift.id,
    checkIn: record.checkIn,
    checkInMinutes: record.checkInMinutes,
    checkOut: record.checkOut,
    checkOutMinutes: record.checkOutMinutes,
    scheduledCheckInAt: admin.firestore.Timestamp.fromDate(calculated.scheduledCheckInAt),
    scheduledCheckOutAt: admin.firestore.Timestamp.fromDate(calculated.scheduledCheckOutAt),
    actualCheckInAt: calculated.actualCheckInAt ? admin.firestore.Timestamp.fromDate(calculated.actualCheckInAt) : null,
    actualCheckOutAt: calculated.actualCheckOutAt ? admin.firestore.Timestamp.fromDate(calculated.actualCheckOutAt) : null,
    attendanceStatus: calculated.attendanceStatus,
    punctualityStatus: calculated.punctualityStatus,
    lateMinutes: calculated.lateMinutes,
    scheduledMinutes: calculated.shift.scheduledMinutes,
    workedMinutes: calculated.workedMinutes,
    extraMinutes: calculated.extraMinutes,
    overtimeEligible: calculated.overtimeEligible,
    paidOvertimeHours: calculated.paidOvertimeHours,
    overtimeRate: calculated.overtimeRate || 10000,
    overtimeAmount: calculated.overtimeAmount,
    overtimeType: calculated.overtimeType,
    overtimePaymentStatus: previous.overtimePaymentStatus || "UNPAID",
    overtimePaidAt: previous.overtimePaidAt || null,
    overtimePaidStoreId: previous.overtimePaidStoreId || null,
    overtimeConfirmedBy: previous.overtimeConfirmedBy || null,
    attendancePeriodId: calculated.attendancePeriodId,
    source: "whatsapp",
    sourceMessageId: meta.messageId || null,
    senderJid: meta.senderJid || null,
    updatedAt: now,
    undoSnapshot: existing.exists ? snapshotForUndo(previous) : null,
    ...(existing.exists ? {} : { createdAt: now }),
  }, { merge: true });
  return { id: ref.id, created: !existing.exists, outlet };
}

async function undoLastAttendance(senderJid) {
  const snapshot = await db.collection("timekeeperAttendance")
    .orderBy("updatedAt", "desc")
    .limit(50)
    .get();
  const candidate = snapshot.docs.find((doc) => {
    const data = doc.data();
    return data.source === "whatsapp" && data.senderJid === senderJid;
  });
  if (!candidate) return { found: false };

  return db.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(candidate.ref);
    const current = currentSnapshot.data();
    if (!current || current.source !== "whatsapp" || current.senderJid !== senderJid) return { found: false };

    if (current.undoSnapshot) {
      transaction.set(candidate.ref, current.undoSnapshot, { merge: false });
      return { found: true, restored: true, record: current };
    }

    transaction.delete(candidate.ref);
    return { found: true, restored: false, record: current };
  });
}

module.exports = { saveAttendance, undoLastAttendance };
