const test = require("node:test");
const assert = require("node:assert/strict");
const { findOutlet } = require("../outlets");

test("resolves outlet aliases without case sensitivity", () => {
  assert.equal(findOutlet("cd").name, "CUCI DEWE");
  assert.equal(findOutlet("Lda").name, "LONDRI DEWE ANTASURA");
  assert.equal(findOutlet("antasura").name, "LONDRI DEWE ANTASURA");
  assert.equal(findOutlet("bw").name, "BALI WASH");
  assert.equal(findOutlet("BWG").name, "BALI WASH GALANG");
  assert.equal(findOutlet("gl").name, "GEDE LONDRI");
  assert.equal(findOutlet("Sesetan").name, "JCL SESETAN");
  assert.equal(findOutlet("cl").name, "CL SESETAN");
});

test("resolves full outlet names with any capitalization", () => {
  assert.equal(findOutlet("cuci dewe").name, "CUCI DEWE");
  assert.equal(findOutlet("jCl NuSa KaMbAnGaN").name, "JCL NUSA KAMBANGAN");
  assert.equal(findOutlet("Merpati").name, "MERPATI");
});
