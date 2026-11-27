import test from "node:test";
import assert from "node:assert/strict";
import { assignmentEmail, escapeHtml, isEmail, noticeEmail, parseEmails, planAssignments, planNotices, reportEmail, stateEmail, textToBase64 } from "../src/lib/email.js";

const sys = { id: "s", name: "Cedar Hollow", pwsid: "OH2140117", state: "OH", lead_count: 2, grr_count: 1, unknown_count: 3, nonlead_count: 10, field_tech: "D. Alvarez", connectors_inventoried: true, plan_drafted: true };
const co = { business_name: "Tri-County Water", phone: "(330) 555-0142", city: "Millersburg", state: "OH" };

test("email addresses", () => {
  assert.ok(isEmail("a.b+c@town.oh.us"));
  assert.ok(!isEmail("nope@"));
  assert.deepEqual(parseEmails("Board <Board@Cedar.org>; manager@cedar.org, board@cedar.org\nbad, "), { valid: ["board@cedar.org", "manager@cedar.org"], invalid: ["bad"] });
  assert.equal(escapeHtml(`<b>"x" & 'y'</b>`), "&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;");
});

test("annual notices go to lines in the pool with a customer email", () => {
  const lines = [
    { id: "1", address: "1 A St", material: "lead", customer_email: "Ann@X.com", customer_name: "Ann <script>" },
    { id: "2", address: "2 A St", material: "non_lead", customer_email: "b@x.com" },
    { id: "3", address: "3 A St", material: "unknown" },
    { id: "4", address: "4 A St", material: "grr", customer_email: "not-an-email" },
  ];
  const plan = planNotices([sys], { s: lines });
  assert.deepEqual(plan.messages.map((m) => m.line.id), ["1"]);
  assert.deepEqual(plan.perSystem, [{ systemId: "s", inPool: 6, onFile: 3, withEmail: 1 }]);
  const m = noticeEmail({ system: sys, line: lines[0], profile: co });
  assert.equal(m.to, "ann@x.com");
  assert.equal(m.subject, "Important information about lead in your drinking water: 1 A St");
  assert.match(m.html, /Dear Ann &lt;script&gt;/);
  assert.match(m.html, /is <b>lead<\/b>/);
  assert.match(m.html, /\(330\) 555-0142/);
  assert.match(m.text, /OH2140117/);
});

test("reports, assignments and state exports", () => {
  const r = reportEmail({ system: sys, profile: co, types: ["system", "plan"] });
  assert.equal(r.subject, "Cedar Hollow: lead service line report and replacement plan");
  assert.match(r.html, /16 service lines/);
  const members = [{ id: "u2", name: "Jo Okafor", email: "JO@x.com" }];
  const lines = [
    { id: "a", system_id: "s", address: "9 Main", assignment_status: "open", assigned_to: "u2", assigned_at: "2026-11-20T00:00:00Z" },
    { id: "b", system_id: "s", address: "1 Elm", assignment_status: "open", assigned_to: "u2" },
    { id: "c", system_id: "s", address: "5 Oak", assignment_status: "done", assigned_to: "u2" },
    { id: "d", system_id: "s", address: "7 Oak", assignment_status: "open", assigned_to: "u9", assigned_to_name: "Gone" },
  ];
  const techs = planAssignments(lines, [sys], members);
  assert.deepEqual(techs.map((t) => [t.name, t.email, t.lines.map((l) => l.address)]), [["Gone", "", ["7 Oak"]], ["Jo Okafor", "jo@x.com", ["1 Elm", "9 Main"]]]);
  const a = assignmentEmail({ tech: techs[1], profile: co, appUrl: "https://app.linetally.com" });
  assert.equal(a.subject, "2 open field visits in LineTally");
  assert.match(a.html, /href="https:\/\/app.linetally.com\/field"/);
  assert.match(a.text, /- 1 Elm/);
  const st = stateEmail({ state: "OH", systems: [sys], profile: co });
  assert.equal(st.subject, "Service line inventory, OH: 1 water system");
  assert.match(st.html, /1 of 1 have connectors/);
  assert.equal(Buffer.from(textToBase64("a,é"), "base64").toString(), "a,é");
});

import { checkMessage, isLimitError, sendOne } from "../src/lib/email-service.js";

test("sending checks permission, validates, sends and logs", async () => {
  const sent = [];
  const logs = [];
  const sender = { integrations: { Core: { SendEmail: async (p) => { if (p.to === "full@x.com") throw new Error("Hourly sending limit reached"); sent.push(p); } } } };
  const admin = { entities: { EmailLog: { create: async (r) => logs.push(r) } } };
  const owner = { id: "o", full_name: "Dana", team_id: "t", team_role: "owner" };
  const writer = { id: "w", team_id: "t", team_role: "member", perm_read: true, perm_write: true, perm_edit: false };
  const msg = { kind: "report", to: "Board@Cedar.org", subject: "Report", html: "<p>x</p>", text: "x", systemId: "s", attachments: [{ filename: "r.pdf", content: "JVBERi0=" }] };

  await assert.rejects(sendOne(sender, admin, writer, msg), /need Edit access/);
  const r = await sendOne(sender, admin, owner, { ...msg, fromName: "Tri-County" }, new Date("2026-11-27T12:00:00Z"));
  assert.deepEqual(r, { status: "sent", error: null, limited: false });
  assert.equal(sent[0].from_name, "Tri-County");
  assert.deepEqual(sent[0].attachments, [{ filename: "r.pdf", content: "JVBERi0=" }]);
  assert.deepEqual(
    [logs[0].team_id, logs[0].sender_id, logs[0].to, logs[0].status, logs[0].attachments, logs[0].sent_by],
    ["t", "o", "board@cedar.org", "sent", ["r.pdf"], "Dana"]
  );
  const f = await sendOne(sender, admin, owner, { ...msg, to: "full@x.com" });
  assert.deepEqual([f.status, f.limited], ["failed", true]);
  assert.equal(logs[1].status, "failed");

  assert.match(checkMessage({ ...msg, to: "x" }), /isn't a valid email/);
  assert.match(checkMessage({ ...msg, attachments: [{ filename: "a.exe", content: "" }] }), /can't be attached/);
  assert.match(checkMessage({ ...msg, attachments: [{ filename: "a.pdf", content: "A".repeat(7_000_002) }] }), /over 5 MB/);
  assert.equal(isLimitError("This email didn't pass sending checks"), false);
});
