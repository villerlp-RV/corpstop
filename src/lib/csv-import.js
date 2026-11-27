// Import service-line addresses from a CSV (a billing export, a GIS export or a
// spreadsheet saved as CSV). Pure functions so they can be tested in Node.

import { combineSides } from "./pipes.js";
import { isEmail } from "./email.js";

export const MAX_IMPORT_ROWS = 5000;
export const IMPORT_TEMPLATE = "address,material,identification_method,connector,system_side_material,customer_side_material,customer_name,customer_email\n" +
  "12 Oak St,unknown,,,,,Ann Lee,ann.lee@example.com\n" +
  "14 Oak St,copper,Tap card,none,,,,\n" +
  "16 Oak St,lead,Potholing,lead,,,Raj Patel,raj@example.com\n" +
  "18 Oak St,,Potholing,non_lead,copper,galvanized requiring replacement,,\n";

// RFC 4180 style: quoted fields, doubled quotes, CRLF, and a delimiter picked
// from the first line (comma, semicolon or tab).
export function parseCsv(text) {
  const src = String(text || "").replace(/^\uFEFF/, "");
  const first = src.split(/\r?\n/, 1)[0] || "";
  const delim = [",", ";", "\t"].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ""));
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const addressKey = (a) =>
  norm(a)
    .replace(/\bstreet\b/g, "st").replace(/\bavenue\b/g, "ave").replace(/\broad\b/g, "rd")
    .replace(/\bdrive\b/g, "dr").replace(/\blane\b/g, "ln").replace(/\bcourt\b/g, "ct")
    .replace(/\bboulevard\b/g, "blvd").replace(/\bplace\b/g, "pl");

const HEADERS = {
  address: ["address", "service address", "service line address", "street address", "site address", "premise address", "property address", "location", "service location", "addr"],
  number: ["house number", "house no", "street number", "number", "house", "st no", "street no"],
  street: ["street", "street name", "road"],
  unit: ["unit", "apt", "apartment", "suite"],
  material: ["material", "line material", "service line material", "material classification", "classification", "pipe material", "lead status", "status"],
  customerEmail: ["customer email", "email", "email address", "e mail", "customer e mail", "owner email", "account email"],
  customerName: ["customer name", "customer", "account name", "owner name", "resident", "occupant"],
  connector: ["connector", "connector material", "lead connector", "gooseneck", "pigtail", "gooseneck pigtail", "connector status"],
  systemSide: ["system side material", "system side", "system owned material", "system owned portion", "utility side material", "utility side", "public side material", "public side"],
  customerSide: ["customer side material", "customer side", "customer owned material", "customer owned portion", "private side material", "private side"],
  method: ["identification method", "how identified", "method", "identified by", "verification method", "source"],
};

function findColumns(header) {
  const h = header.map(norm);
  const pick = (names) => {
    for (const n of names) {
      const i = h.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  return Object.fromEntries(Object.entries(HEADERS).map(([k, names]) => [k, pick(names)]));
}

// Specific non-lead materials (kept alongside the Non-lead category).
export function nonLeadTypeFrom(value) {
  const v = norm(value);
  if (/^(copper|cu)$/.test(v)) return "copper";
  if (/^(plastic|pvc|pe|hdpe|pex|polyethylene|polybutylene|cpvc)$/.test(v)) return "plastic";
  if (/^(galvanized not grr|galvanized non grr|galvanized never downstream of lead|non grr galvanized)$/.test(v)) return "galvanized";
  if (/^(ductile iron|di|cast iron|ci|iron)$/.test(v)) return "iron";
  if (/^(brass|bronze)$/.test(v)) return "brass";
  if (/^(steel|other non lead)$/.test(v)) return "other";
  return null;
}

export function connectorFrom(value) {
  const v = norm(value);
  if (!v) return null;
  if (/^(none|no connector|no connector present|not present|n a|na|no)$/.test(v)) return "none";
  if (/^(lead|l|pb|lead connector|lead gooseneck|lead pigtail|yes)$/.test(v)) return "lead";
  if (/^(unknown|unk|u|tbd)$/.test(v)) return "unknown";
  if (/^(non lead|nonlead|nl|not lead|copper|cu|galvanized|galv|brass|plastic|iron)$/.test(v)) return "non_lead";
  return undefined;
}

// Spellings seen in utility inventories, mapped to LineTally materials.
export function materialFrom(value) {
  const v = norm(value);
  if (!v) return "unknown";
  if (/^(unknown|unk|u|lead status unknown|unknown material|tbd|not known)$/.test(v)) return "unknown";
  if (/^(grr|galvanized|galv|galvanised|g|galvanized requiring replacement|galvanized requiring replacement grr)$/.test(v)) return "grr";
  if (/^(lead|l|pb|lead service line|lsl)$/.test(v)) return "lead";
  if (/^(non lead|nonlead|non_lead|nl|not lead|other non lead)$/.test(v) || nonLeadTypeFrom(v)) return "non_lead";
  return null;
}

// existing: addresses already on file for the system (duplicates are skipped).
export function planImport(text, existing = []) {
  const rows = parseCsv(text);
  const result = { lines: [], skipped: [], warnings: [], columns: null, tooMany: false };
  if (!rows.length) return result;
  let cols = findColumns(rows[0]);
  let body = rows.slice(1);
  let firstRow = 2;
  const hasAddress = cols.address >= 0 || cols.street >= 0;
  if (!hasAddress) {
    // No recognisable header: use the first column, and keep the first row unless it reads like a header.
    cols = { address: 0, number: -1, street: -1, unit: -1, material: rows[0].length > 1 ? 1 : -1, method: rows[0].length > 2 ? 2 : -1, connector: -1, systemSide: -1, customerSide: -1, customerEmail: -1, customerName: -1 };
    const looksLikeHeader = !/\d/.test(rows[0][0]);
    body = looksLikeHeader ? rows.slice(1) : rows;
    firstRow = looksLikeHeader ? 2 : 1;
  }
  result.columns = cols;
  if (body.length > MAX_IMPORT_ROWS) {
    result.tooMany = true;
    body = body.slice(0, MAX_IMPORT_ROWS);
  }
  const seen = new Set(existing.map(addressKey));
  body.forEach((r, i) => {
    const rowNo = i + firstRow;
    const cell = (k) => (cols[k] >= 0 ? r[cols[k]] || "" : "");
    let address = cell("address");
    if (!address && cols.street >= 0) address = [cell("number"), cell("street")].filter(Boolean).join(" ");
    if (address && cols.unit >= 0 && cell("unit")) address = `${address} ${/^\d/.test(cell("unit")) ? "#" : ""}${cell("unit")}`;
    address = address.replace(/\s+/g, " ").trim().slice(0, 200);
    if (!address) return result.skipped.push({ row: rowNo, reason: "No address" });
    const key = addressKey(address);
    if (seen.has(key)) return result.skipped.push({ row: rowNo, address, reason: "Already on file or repeated" });
    seen.add(key);
    const warn = (reason) => result.warnings.push({ row: rowNo, address, reason });
    const readMaterial = (k, label) => {
      const m = materialFrom(cell(k));
      if (m === null) warn(`${label} "${cell(k)}" not recognised, set to Unknown`);
      return m ?? "unknown";
    };
    const split = !!(cell("systemSide") || cell("customerSide"));
    const line = { address };
    if (split) {
      line.ownership = "split";
      line.system_side = readMaterial("systemSide", "System-side material");
      line.customer_side = readMaterial("customerSide", "Customer-side material");
      line.material = combineSides(line.system_side, line.customer_side);
      line.material_type = nonLeadTypeFrom(cell("systemSide")) || nonLeadTypeFrom(cell("customerSide")) || null;
    } else {
      line.material = readMaterial("material", "Material");
      line.material_type = line.material === "non_lead" ? nonLeadTypeFrom(cell("material")) : null;
    }
    if (!line.material_type) delete line.material_type;
    const connector = connectorFrom(cell("connector"));
    if (connector === undefined) warn(`Connector "${cell("connector")}" not recognised, left blank`);
    else if (connector) line.connector = connector;
    const email = cell("customerEmail").trim().toLowerCase();
    if (email && isEmail(email)) line.customer_email = email;
    else if (email) warn(`Email "${cell("customerEmail")}" not valid, left blank`);
    if (cell("customerName")) line.customer_name = cell("customerName").slice(0, 120);
    const method = cell("method").slice(0, 80);
    line.identification_method = line.material === "unknown" && !split ? "" : method || "Records review";
    result.lines.push(line);
  });
  return result;
}

export function importTally(lines) {
  const t = { lead: 0, grr: 0, unknown: 0, non_lead: 0 };
  for (const l of lines) t[l.material]++;
  return t;
}
