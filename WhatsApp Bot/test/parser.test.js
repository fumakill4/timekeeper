const test = require("node:test");
const assert = require("node:assert/strict");
const { parseAttendanceMessage } = require("../parser");

test("parses Indonesian attendance report and normalizes morning/evening time", () => {
  const result = parseAttendanceMessage("nama outlet -> Cuci Dewe\nnama karyawan -> Rizky\ntanggal dan jam kerja -> 27 Juli 7 pagi / 7 malam", new Date("2026-07-13T12:00:00+08:00"));
  assert.equal(result.ok, true);
  assert.equal(result.workDate, "2026-07-27");
  assert.equal(result.checkIn, "07.00");
  assert.equal(result.checkOut, "19.00");
});

test("parses siang time", () => {
  const result = parseAttendanceMessage("outlet: KLIN WASH\nkaryawan: Nia\ntanggal: 27 Juli 1 siang", new Date("2026-07-13T12:00:00+08:00"));
  assert.equal(result.ok, true);
  assert.equal(result.checkIn, "13.00");
});

test("parses the four-line check-in-only format", () => {
  const result = parseAttendanceMessage("Cuci Dewe\nRizky\n27 Juli\nMasuk 07.00", new Date("2026-07-13T12:00:00+08:00"));
  assert.equal(result.ok, true);
  assert.equal(result.outletName, "Cuci Dewe");
  assert.equal(result.employeeName, "Rizky");
  assert.equal(result.workDate, "2026-07-27");
  assert.equal(result.checkIn, "07.00");
  assert.equal(result.checkOut, null);
  assert.equal(result.checkOutMinutes, null);
});
