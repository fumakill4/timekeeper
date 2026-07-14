const test = require("node:test");
const assert = require("node:assert/strict");
const {
  activePeriodToDate,
  fullPeriodForLabel,
  lateSummary,
} = require("../attendanceReport");
const { generateWorkbookBuffer } = require("../exportService");

test("employee report period on September 1 starts August 26", () => {
  assert.deepEqual(activePeriodToDate("2026-09-01"), {
    label: "26-10",
    startDate: "2026-08-26",
    endDate: "2026-09-01",
  });
});

test("full period labels follow the nearest work cycle", () => {
  assert.deepEqual(fullPeriodForLabel("26-10", "2026-09-01"), {
    label: "26-10",
    startDate: "2026-08-26",
    endDate: "2026-09-10",
  });
  assert.deepEqual(fullPeriodForLabel("11-25", "2026-07-14"), {
    label: "11-25",
    startDate: "2026-07-11",
    endDate: "2026-07-25",
  });
});

test("late summary uses the requested warning levels", () => {
  assert.equal(lateSummary(0), "Karyawan tidak terlambat ✅");
  assert.equal(lateSummary(2), "Karyawan 2x datang terlambat ⚠️");
  assert.equal(lateSummary(3), "Karyawan 3x datang terlambat ⚠️‼️");
});

test("Excel export fills the template without breaking XML or formulas", async () => {
  const result = await generateWorkbookBuffer([
    {
      workDate: "2026-08-26",
      outletName: "CUCI DEWE",
      employeeName: "Rizky",
      shiftId: "shift-1",
      checkIn: "07.00",
      checkInMinutes: 420,
      checkOut: null,
      attendanceStatus: "INCOMPLETE",
      source: "whatsapp",
    },
  ], { label: "26-10", startDate: "2026-08-26", endDate: "2026-09-10" });
  const JSZip = require("jszip");
  const zip = await JSZip.loadAsync(result.buffer);
  const xml = await zip.file("xl/worksheets/sheet4.xml").async("string");
  assert.equal(result.count, 1);
  assert.match(xml, /r="A6"[^>]*>\s*<x:v>46260<\/x:v>/);
  assert.match(xml, /<x:c r="C6"[^>]*t="str"[^>]*>\s*<x:v>CUCI DEWE<\/x:v>/);
  assert.match(xml, /<x:f>IF\(F6=/);
  assert.doesNotMatch(xml, /\/ t="str"/);
});
