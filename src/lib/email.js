// Bulk email: who gets what. Builds the messages (subject, HTML, plain text);
// sending happens one message at a time through the sendEmail server function.
// Pure functions, unit-tested.
import { MATERIALS, formatDate, readyToFile, replacementPool, totalLines } from "./lcri.js";

export const EMAIL_KINDS = {
  notice: "Annual notice",
  report: "Report",
  assignment: "Field assignments",
  state: "State export",
};

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[a-z]{2,}$/i;
export const isEmail = (s) => EMAIL_RE.test(String(s || "").trim());

// "a@x.com, Bob <b@y.org>; bad" -> { valid: [...], invalid: [...] }, de-duplicated.
export function parseEmails(text) {
  const valid = [];
  const invalid = [];
  const seen = new Set();
  for (let part of String(text || "").split(/[,;\n]+/)) {
    part = part.trim();
    if (!part) continue;
    const m = /<([^>]+)>/.exec(part);
    const addr = (m ? m[1] : part).trim().toLowerCase();
    if (!isEmail(addr)) invalid.push(part);
    else if (!seen.has(addr)) {
      seen.add(addr);
      valid.push(addr);
    }
  }
  return { valid, invalid };
}

export const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const company = (c) => ({
  name: c?.business_name?.trim() || "",
  contact: [c?.phone, c?.email, c?.website].map((x) => (x || "").trim()).filter(Boolean).join(" · "),
  address: [c?.address_line1, c?.address_line2, [c?.city, [c?.state, c?.postal_code].filter(Boolean).join(" ")].filter(Boolean).join(", ")]
    .map((x) => (x || "").trim()).filter(Boolean).join(", "),
});

// Branded, table-free HTML that renders in every mail client.
export function wrapHtml(profile, title, bodyHtml) {
  const co = company(profile);
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f2f5f7;">
<div style="max-width:620px;margin:0 auto;padding:24px 16px;font-family:Arial,Helvetica,sans-serif;color:#14191d;font-size:15px;line-height:1.5;">
<div style="background:#ffffff;border:1px solid #d9e1e7;border-radius:8px;padding:24px;">
${co.name ? `<div style="font-weight:bold;font-size:16px;">${escapeHtml(co.name)}</div>` : ""}
${co.address ? `<div style="color:#5b6770;font-size:13px;">${escapeHtml(co.address)}</div>` : ""}
<h1 style="font-size:20px;margin:18px 0 12px;color:#14191d;">${escapeHtml(title)}</h1>
${bodyHtml}
</div>
<div style="color:#5b6770;font-size:12px;padding:12px 4px;">${escapeHtml([co.name, co.contact].filter(Boolean).join(" · ") || "Sent with LineTally")}</div>
</div></body></html>`;
}

const p = (s) => `<p style="margin:0 0 12px;">${s}</p>`;
const ul = (items) => `<ul style="margin:0 0 12px;padding-left:20px;">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;

const NOTICE_PHRASE = { lead: "lead", grr: "galvanized pipe that requires replacement", unknown: "of unknown material" };

// Annual notice (40 CFR 141.85(e)) to the customer at one service line.
export function noticeEmail({ system, line, profile }) {
  const phrase = NOTICE_PHRASE[line.material] || "lead, galvanized or of unknown material";
  const contact = company(profile).contact || system.field_tech || "your water system";
  const subject = `Important information about lead in your drinking water: ${line.address}`;
  const greeting = line.customer_name ? `Dear ${escapeHtml(line.customer_name)},` : `To the resident at ${escapeHtml(line.address)},`;
  const html = wrapHtml(profile, "Important information about lead in your drinking water", [
    p(greeting),
    p(`${escapeHtml(system.name)} (PWS ID ${escapeHtml(system.pwsid || "—")}) records show the service line connecting <b>${escapeHtml(line.address)}</b> to the water main is <b>${escapeHtml(phrase)}</b>. Lead can enter drinking water from these pipes.`),
    p("Steps you can take now to reduce your exposure:"),
    ul([
      "Run your tap for a few minutes when water has sat for several hours.",
      "Use only cold water for drinking, cooking and making baby formula.",
      "Use a filter certified to reduce lead.",
    ]),
    p(`We plan to replace lead and galvanized service lines over the next ten years. To find out when your line is scheduled, or to let us inspect it, contact ${escapeHtml(contact)}.`),
    p(`<span style="color:#5b6770;font-size:13px;">You are receiving this annual notice because of the service line at ${escapeHtml(line.address)}.</span>`),
  ].join(""));
  const text = [
    line.customer_name ? `Dear ${line.customer_name},` : `To the resident at ${line.address},`,
    "",
    `${system.name} (PWS ID ${system.pwsid || "-"}) records show the service line connecting ${line.address} to the water main is ${phrase}. Lead can enter drinking water from these pipes.`,
    "",
    "Steps you can take now to reduce your exposure:",
    "- Run your tap for a few minutes when water has sat for several hours.",
    "- Use only cold water for drinking, cooking and making baby formula.",
    "- Use a filter certified to reduce lead.",
    "",
    `We plan to replace lead and galvanized service lines over the next ten years. To find out when your line is scheduled, or to let us inspect it, contact ${contact}.`,
  ].join("\n");
  return { kind: "notice", to: line.customer_email.trim().toLowerCase(), subject, html, text, systemId: system.id, lineId: line.id };
}

// Which lines get an emailed notice: lead, GRR or unknown, with a customer email.
export function planNotices(systems, linesBySystem) {
  const messages = [];
  const perSystem = [];
  for (const s of systems) {
    const pool = (linesBySystem[s.id] || []).filter((l) => ["lead", "grr", "unknown"].includes(l.material));
    const withEmail = pool.filter((l) => isEmail(l.customer_email));
    perSystem.push({ systemId: s.id, inPool: replacementPool(s), onFile: pool.length, withEmail: withEmail.length });
    for (const line of withEmail) messages.push({ system: s, line });
  }
  return { messages, perSystem };
}

export const REPORT_TYPES = [
  { value: "system", label: "System report" },
  { value: "plan", label: "Draft replacement plan" },
];

export function reportEmail({ system, profile, types, preparedBy }) {
  const names = REPORT_TYPES.filter((t) => types.includes(t.value)).map((t) => t.label.toLowerCase());
  const co = company(profile).name || preparedBy || "your operator";
  const subject = `${system.name}: lead service line ${names.length > 1 ? "report and replacement plan" : names[0] || "report"}`;
  const html = wrapHtml(profile, subject, [
    p("Hello,"),
    p(`Attached is the latest ${escapeHtml(names.join(" and "))} for <b>${escapeHtml(system.name)}</b>${system.pwsid ? ` (PWS ID ${escapeHtml(system.pwsid)})` : ""}, prepared by ${escapeHtml(co)}.`),
    ul([
      `${totalLines(system).toLocaleString("en-US")} service lines in the inventory`,
      ...MATERIALS.filter((m) => Number(system[m.field]) > 0).map((m) => `${Number(system[m.field]).toLocaleString("en-US")} ${m.label.toLowerCase()}`),
    ]),
    p("Reply to this email with any questions."),
  ].join(""));
  const text = `Hello,\n\nAttached is the latest ${names.join(" and ")} for ${system.name}${system.pwsid ? ` (PWS ID ${system.pwsid})` : ""}, prepared by ${co}.\n\nReply to this email with any questions.`;
  return { kind: "report", subject, html, text, systemId: system.id };
}

// Open field work for each tech, as one email each.
export function planAssignments(lines, systems, members) {
  const byId = new Map(systems.map((s) => [s.id, s]));
  const memberById = new Map(members.map((m) => [m.id, m]));
  const groups = new Map();
  for (const l of lines) {
    if (l.assignment_status !== "open" || !l.assigned_to) continue;
    if (!groups.has(l.assigned_to)) groups.set(l.assigned_to, []);
    groups.get(l.assigned_to).push(l);
  }
  return [...groups.entries()].map(([id, ls]) => {
    const m = memberById.get(id);
    return {
      techId: id,
      name: m?.name || ls[0].assigned_to_name || "Unknown",
      email: m?.email && isEmail(m.email) ? m.email.toLowerCase() : "",
      lines: ls
        .map((l) => ({ ...l, systemName: byId.get(l.system_id)?.name || "" }))
        .sort((a, b) => a.systemName.localeCompare(b.systemName) || a.address.localeCompare(b.address)),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function assignmentEmail({ tech, profile, appUrl }) {
  const n = tech.lines.length;
  const subject = `${n} open field ${n === 1 ? "visit" : "visits"} in LineTally`;
  const bySystem = new Map();
  for (const l of tech.lines) {
    if (!bySystem.has(l.systemName)) bySystem.set(l.systemName, []);
    bySystem.get(l.systemName).push(l);
  }
  const sections = [...bySystem.entries()].map(([name, ls]) =>
    `<div style="margin:0 0 12px;"><b>${escapeHtml(name)}</b>${ul(ls.map((l) => `${escapeHtml(l.address)}${l.assigned_at ? ` <span style="color:#5b6770;">· assigned ${escapeHtml(formatDate(l.assigned_at.slice(0, 10)))}</span>` : ""}`))}</div>`);
  const html = wrapHtml(profile, subject, [
    p(`Hi ${escapeHtml(tech.name.split(" ")[0])},`),
    p(`You have ${n} service ${n === 1 ? "line" : "lines"} to visit:`),
    ...sections,
    p(`<a href="${escapeHtml(appUrl)}/field" style="display:inline-block;background:#1f6f99;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:bold;">Open Field work</a>`),
    p(`<span style="color:#5b6770;font-size:13px;">Record each visit in LineTally on your phone. It works without signal and uploads when you're back online.</span>`),
  ].join(""));
  const text = [`Hi ${tech.name.split(" ")[0]},`, "", `You have ${n} service ${n === 1 ? "line" : "lines"} to visit:`, ""]
    .concat([...bySystem.entries()].flatMap(([name, ls]) => [name, ...ls.map((l) => `- ${l.address}`), ""]))
    .concat([`Open Field work: ${appUrl}/field`])
    .join("\n");
  return { kind: "assignment", to: tech.email, subject, html, text };
}

export function stateEmail({ state, systems, profile, preparedBy }) {
  const ready = systems.filter(readyToFile).length;
  const co = company(profile).name || preparedBy || "the operator";
  const subject = `Service line inventory, ${state}: ${systems.length} water ${systems.length === 1 ? "system" : "systems"}`;
  const html = wrapHtml(profile, subject, [
    p("Hello,"),
    p(`Attached is the service line inventory summary for ${systems.length} water ${systems.length === 1 ? "system" : "systems"} in ${escapeHtml(state)} operated by ${escapeHtml(co)}. ${ready} of ${systems.length} have connectors inventoried and a replacement plan drafted.`),
    ul(systems.map((s) => `${escapeHtml(s.name)}${s.pwsid ? ` (${escapeHtml(s.pwsid)})` : ""}`)),
    p("Please let us know if you need the inventory in a different format."),
  ].join(""));
  const text = `Hello,\n\nAttached is the service line inventory summary for ${systems.length} water systems in ${state} operated by ${co}. ${ready} of ${systems.length} have connectors inventoried and a replacement plan drafted.\n\n${systems.map((s) => `- ${s.name}${s.pwsid ? ` (${s.pwsid})` : ""}`).join("\n")}`;
  return { kind: "state", subject, html, text };
}

// base64 for an attachment built in the browser (CSV text).
export const textToBase64 = (s) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
