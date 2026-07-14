export const ATTENDANCE_CONFIG = {
  timezone: "Asia/Makassar",
  lateToleranceMinutes: 10,
  minimumExtraMinutesForOvertime: 60,
  overtimeRatePerHour: 10000,
  overtimeRounding: "FULL_HOUR_FLOOR",
  normalWorkHours: 10,
};

export const SHIFTS = [
  { id: "shift-1", code: "SHIFT_1", name: "Shift 1", startTime: "07:00", endTime: "17:00", crossesMidnight: false, scheduledMinutes: 600 },
  { id: "shift-2", code: "SHIFT_2", name: "Shift 2", startTime: "13:00", endTime: "23:00", crossesMidnight: false, scheduledMinutes: 600 },
  { id: "shift-3", code: "SHIFT_3", name: "Shift 3", startTime: "23:00", endTime: "07:00", crossesMidnight: true, scheduledMinutes: 480 },
];

const asMakassarDate = (dateString, timeString) => new Date(`${dateString}T${timeString}:00+08:00`);

export function buildScheduledDateTimes(workDate, shift, timezone = ATTENDANCE_CONFIG.timezone) {
  const scheduledCheckInAt = asMakassarDate(workDate, shift.startTime);
  const scheduledCheckOutAt = asMakassarDate(workDate, shift.endTime);
  if (shift.crossesMidnight) scheduledCheckOutAt.setUTCDate(scheduledCheckOutAt.getUTCDate() + 1);
  return { scheduledCheckInAt, scheduledCheckOutAt, timezone };
}

export function calculateLateStatus(actualCheckIn, scheduledCheckIn, toleranceMinutes = ATTENDANCE_CONFIG.lateToleranceMinutes) {
  const threshold = new Date(scheduledCheckIn.getTime() + toleranceMinutes * 60_000);
  if (actualCheckIn <= threshold) return { punctualityStatus: "ON_TIME", lateMinutes: 0 };
  return { punctualityStatus: "LATE", lateMinutes: Math.floor((actualCheckIn - scheduledCheckIn) / 60_000) };
}

export function calculateWorkedMinutes(actualCheckIn, actualCheckOut) {
  if (!actualCheckIn || !actualCheckOut) return 0;
  return Math.max(0, Math.floor((actualCheckOut - actualCheckIn) / 60_000));
}

export function calculateExtraMinutes(actualCheckOut, scheduledCheckOut) {
  if (!actualCheckOut || actualCheckOut <= scheduledCheckOut) return 0;
  return Math.floor((actualCheckOut - scheduledCheckOut) / 60_000);
}

export function calculatePaidOvertimeHours(extraMinutes, minimumExtraMinutes = ATTENDANCE_CONFIG.minimumExtraMinutesForOvertime) {
  if (extraMinutes <= minimumExtraMinutes) return 0;
  return Math.floor(extraMinutes / 60);
}

export function calculateOvertimeAmount(paidOvertimeHours, ratePerHour = ATTENDANCE_CONFIG.overtimeRatePerHour) {
  return paidOvertimeHours * ratePerHour;
}

export function determineOvertimeType(totalWorkedMinutes, paidOvertimeHours) {
  if (paidOvertimeHours <= 0) return "NO_OVERTIME";
  if (totalWorkedMinutes >= 24 * 60) return "OVERTIME_24H";
  if (totalWorkedMinutes >= 16 * 60) return "OVERTIME_16H";
  if (totalWorkedMinutes >= 12 * 60) return "OVERTIME_12H";
  return "REGULAR_OVERTIME";
}

export function resolveAttendancePeriod(workDate) {
  const [year, month, day] = workDate.split("-").map(Number);
  if (day >= 11 && day <= 25) return { type: "PERIOD_11_25", startDate: `${workDate.slice(0, 8)}11`, endDate: `${workDate.slice(0, 8)}25` };
  if (day >= 26) {
    const next = new Date(Date.UTC(year, month, 10));
    return { type: "PERIOD_26_10", startDate: `${workDate.slice(0, 8)}26`, endDate: toDateString(next) };
  }
  const previous = new Date(Date.UTC(year, month - 2, 26));
  return { type: "PERIOD_26_10", startDate: toDateString(previous), endDate: `${workDate.slice(0, 8)}10` };
}

export function normalizeBotCommand(message) {
  return message.trim().toLowerCase();
}

export function createAttendanceRecord({ id, employee, workDate, shift, checkIn, checkOut, status = "PRESENT", paymentStatus = "UNPAID" }) {
  const { scheduledCheckInAt, scheduledCheckOutAt } = buildScheduledDateTimes(workDate, shift);
  if (status === "DAY_OFF") {
    return { id, employeeId: employee.id, employeeNameSnapshot: employee.name, storeId: employee.storeId, shiftId: shift.id, workDate, scheduledCheckInAt, scheduledCheckOutAt, actualCheckInAt: null, actualCheckOutAt: null, attendanceStatus: "DAY_OFF", punctualityStatus: "NOT_APPLICABLE", lateMinutes: 0, scheduledMinutes: shift.scheduledMinutes, workedMinutes: 0, extraMinutes: 0, overtimeEligible: false, paidOvertimeHours: 0, overtimeRate: ATTENDANCE_CONFIG.overtimeRatePerHour, overtimeAmount: 0, overtimeType: "NO_OVERTIME", overtimePaymentStatus: "CANCELLED", overtimePaidAt: null, attendancePeriodId: resolveAttendancePeriod(workDate).type };
  }
  const actualCheckInAt = checkIn ? asMakassarDate(workDate, checkIn) : null;
  let actualCheckOutAt = checkOut ? asMakassarDate(workDate, checkOut) : null;
  if (actualCheckOutAt && actualCheckInAt && actualCheckOutAt < actualCheckInAt) actualCheckOutAt.setUTCDate(actualCheckOutAt.getUTCDate() + 1);
  const late = actualCheckInAt ? calculateLateStatus(actualCheckInAt, scheduledCheckInAt) : { punctualityStatus: "NOT_APPLICABLE", lateMinutes: 0 };
  const workedMinutes = calculateWorkedMinutes(actualCheckInAt, actualCheckOutAt);
  const extraMinutes = calculateExtraMinutes(actualCheckOutAt, scheduledCheckOutAt);
  const paidOvertimeHours = calculatePaidOvertimeHours(extraMinutes);
  return { id, employeeId: employee.id, employeeNameSnapshot: employee.name, storeId: employee.storeId, shiftId: shift.id, workDate, scheduledCheckInAt, scheduledCheckOutAt, actualCheckInAt, actualCheckOutAt, attendanceStatus: status, ...late, scheduledMinutes: shift.scheduledMinutes, workedMinutes, extraMinutes, overtimeEligible: paidOvertimeHours > 0, paidOvertimeHours, overtimeRate: ATTENDANCE_CONFIG.overtimeRatePerHour, overtimeAmount: calculateOvertimeAmount(paidOvertimeHours), overtimeType: determineOvertimeType(workedMinutes, paidOvertimeHours), overtimePaymentStatus: paymentStatus, overtimePaidAt: paymentStatus === "PAID_CASH" ? new Date().toISOString() : null, attendancePeriodId: resolveAttendancePeriod(workDate).type };
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

export function formatRupiah(value) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value).replace("Rp", "Rp ");
}

export function formatWorkedMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}j ${remaining.toString().padStart(2, "0")}m`;
}
