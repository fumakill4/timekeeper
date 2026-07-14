const OUTLETS = [
  ["BALI WASH GALANG", "Selatan"],
  ["CL SESETAN", "Selatan"],
  ["DIY", "Selatan"],
  ["GRIYA ANYAR", "Selatan"],
  ["JCL BYPASS", "Selatan"],
  ["JCL PEMOGAN", "Selatan"],
  ["JCL SESETAN", "Selatan"],
  ["JCL SIDAKARYA", "Selatan"],
  ["KLIN WASH", "Selatan"],
  ["LONDRI DEWE", "Selatan"],
  ["CUCI DEWE", "Utara"],
  ["GEDE LONDRI", "Utara"],
  ["JCL AYANI", "Utara"],
  ["LONDRI DEWE ANTASURA", "Utara"],
  ["BALI WASH", "Barat"],
  ["JCL NUSA KAMBANGAN", "Barat"],
  ["MERPATI", "Barat"],
  ["MONANG MANING", "Barat"],
  ["RINJANI WASH", "Barat"],
].map(([name, region]) => ({ name, region }));

// Alias sengaja dibuat eksplisit agar input WhatsApp tetap mudah dipahami
// tanpa membuat pencarian berbasis tebakan yang berisiko salah outlet.
const OUTLET_ALIASES = {
  CD: "CUCI DEWE",
  LDA: "LONDRI DEWE ANTASURA",
  ANTASURA: "LONDRI DEWE ANTASURA",
  BW: "BALI WASH",
  NK: "JCL NUSA KAMBANGAN",
  MM: "MONANG MANING",
  RW: "RINJANI WASH",
  GRIYA: "GRIYA ANYAR",
  SIDAKARYA: "JCL SIDAKARYA",
  KW: "KLIN WASH",
  BWG: "BALI WASH GALANG",
  LD: "LONDRI DEWE",
  BYPASS: "JCL BYPASS",
  PEMOGAN: "JCL PEMOGAN",
  AYANI: "JCL AYANI",
  GL: "GEDE LONDRI",
  SESETAN: "JCL SESETAN",
  CL: "CL SESETAN",
  MERPATI: "MERPATI",
};

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function findOutlet(value) {
  const normalized = normalizeName(value);
  const canonicalName = OUTLET_ALIASES[normalized] || normalized;
  return OUTLETS.find((outlet) => normalizeName(outlet.name) === canonicalName) || null;
}

module.exports = { OUTLETS, OUTLET_ALIASES, findOutlet, normalizeName };
