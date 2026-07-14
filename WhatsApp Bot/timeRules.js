const SHIFTS = [
  { id: "shift-1", code: "SHIFT_1", name: "Shift 1", startTime: "07:00", endTime: "17:00", crossesMidnight: false, scheduledMinutes: 600 },
  { id: "shift-2", code: "SHIFT_2", name: "Shift 2", startTime: "13:00", endTime: "23:00", crossesMidnight: false, scheduledMinutes: 600 },
  { id: "shift-3", code: "SHIFT_3", name: "Shift 3", startTime: "23:00", endTime: "07:00", crossesMidnight: true, scheduledMinutes: 480 },
];

const { db } = require("./firebaseAdmin");
let settingsCache = { expiresAt: 0, value: null };

async function getTimekeeperSettings() {
  if (settingsCache.value && settingsCache.expiresAt > Date.now()) return settingsCache.value;
  try {
    const snapshot = await db.collection("timekeeperSettings").doc("global").get();
    const data = snapshot.exists ? snapshot.data() : {};
    const value = {
      shifts: Array.isArray(data.shifts) && data.shifts.length ? data.shifts : SHIFTS,
      lateToleranceMinutes: Number.isFinite(Number(data.lateToleranceMinutes)) ? Math.max(0, Number(data.lateToleranceMinutes)) : 10,
      overtimeRate: Number.isFinite(Number(data.overtimeRate)) ? Math.max(0, Number(data.overtimeRate)) : 10000,
    };
    settingsCache = { value, expiresAt: Date.now() + 30_000 };
    return value;
  } catch {
    return { shifts: SHIFTS, lateToleranceMinutes: 10, overtimeRate: 10000 };
  }
}

function toDate(workDate, time, nextDay = false) {
  const date = new Date(`${workDate}T${String(time).replace(".", ":")}:00+08:00`);
  if (nextDay) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function shiftFor(checkInMinutes, shifts = SHIFTS) {
  return [...shifts].sort((left, right) => {
    const leftDistance = circularDistance(checkInMinutes, timeToMinutes(left.startTime));
    const rightDistance = circularDistance(checkInMinutes, timeToMinutes(right.startTime));
    return leftDistance - rightDistance;
  })[0] || SHIFTS[0];
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || "00:00").replace(".", ":").split(":").map(Number);
  return (hours * 60) + minutes;
}

function circularDistance(left, right) {
  const difference = Math.abs(left - right);
  return Math.min(difference, 1440 - difference);
}

function periodFor(workDate) {
  const [year, month, day] = workDate.split("-").map(Number);
  if (day >= 11 && day <= 25) return { id: "PERIOD_11_25", startDate: `${workDate.slice(0, 8)}11`, endDate: `${workDate.slice(0, 8)}25` };
  if (day >= 26) {
    const next = new Date(Date.UTC(year, month, 10));
    return { id: "PERIOD_26_10", startDate: `${workDate.slice(0, 8)}26`, endDate: next.toISOString().slice(0, 10) };
  }
  const previous = new Date(Date.UTC(year, month - 2, 26));
  return { id: "PERIOD_26_10", startDate: previous.toISOString().slice(0, 10), endDate: `${workDate.slice(0, 8)}10` };
}

async function calculateAttendance(record) {
  const settings = await getTimekeeperSettings();
  const shift = shiftFor(record.checkInMinutes, settings.shifts);
  const scheduledCheckInAt = toDate(record.workDate, shift.startTime);
  const scheduledCheckOutAt = toDate(record.workDate, shift.endTime, shift.crossesMidnight);
  const actualCheckInAt = record.checkIn ? toDate(record.workDate, record.checkIn) : null;
  const crossesMidnight = record.checkOutMinutes != null && record.checkInMinutes != null && record.checkOutMinutes < record.checkInMinutes;
  const actualCheckOutAt = record.checkOut ? toDate(record.workDate, record.checkOut, crossesMidnight) : null;
  const lateMinutes = actualCheckInAt && actualCheckInAt > new Date(scheduledCheckInAt.getTime() + settings.lateToleranceMinutes * 60_000) ? Math.floor((actualCheckInAt - scheduledCheckInAt) / 60_000) : 0;
  const workedMinutes = actualCheckInAt && actualCheckOutAt ? Math.max(0, Math.floor((actualCheckOutAt - actualCheckInAt) / 60_000)) : 0;
  const extraMinutes = actualCheckOutAt && actualCheckOutAt > scheduledCheckOutAt ? Math.floor((actualCheckOutAt - scheduledCheckOutAt) / 60_000) : 0;
  const paidOvertimeHours = extraMinutes > 60 ? Math.floor(extraMinutes / 60) : 0;
  const overtimeType = paidOvertimeHours <= 0 ? "NO_OVERTIME" : workedMinutes >= 1440 ? "OVERTIME_24H" : workedMinutes >= 960 ? "OVERTIME_16H" : workedMinutes >= 720 ? "OVERTIME_12H" : "REGULAR_OVERTIME";
  return {
    shift,
    scheduledCheckInAt,
    scheduledCheckOutAt,
    actualCheckInAt,
    actualCheckOutAt,
    attendanceStatus: actualCheckInAt && actualCheckOutAt ? "PRESENT" : actualCheckInAt ? "INCOMPLETE" : "ABSENT",
    punctualityStatus: actualCheckInAt ? (lateMinutes ? "LATE" : "ON_TIME") : "NOT_APPLICABLE",
    lateMinutes,
    workedMinutes,
    extraMinutes,
    overtimeEligible: paidOvertimeHours > 0,
    paidOvertimeHours,
    overtimeRate: settings.overtimeRate,
    overtimeAmount: paidOvertimeHours * settings.overtimeRate,
    overtimeType,
    attendancePeriodId: periodFor(record.workDate).id,
  };
}

module.exports = { SHIFTS, calculateAttendance, periodFor, shiftFor };
