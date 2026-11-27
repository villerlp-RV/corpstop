// Sends one email and records it. Called by the sendEmail server function with
// the caller's Base44 client (for SendEmail) and the service role (for the log,
// which users can't write). Edit access is required: these go to people outside
// the team.
import { permissionsOf } from "./permissions.js";
import { teamIdOf } from "./team.js";
import { isEmail } from "./email.js";

export const ATTACH_EXT = ["csv", "docx", "gif", "ics", "jpeg", "jpg", "md", "pdf", "png", "txt", "webp", "xlsx"];
const MB = 1024 * 1024;
const decodedSize = (b64) => Math.floor((String(b64).replace(/=+$/, "").length * 3) / 4);

export class EmailError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function checkMessage(m) {
  if (!isEmail(m.to)) return `"${m.to}" isn't a valid email address.`;
  if (!m.subject?.trim()) return "The email needs a subject.";
  const files = m.attachments || [];
  if (files.length > 5) return "Up to 5 attachments per email.";
  let total = 0;
  for (const f of files) {
    const ext = (/\.([a-z0-9]+)$/i.exec(f.filename || "")?.[1] || "").toLowerCase();
    if (!ATTACH_EXT.includes(ext)) return `${f.filename} can't be attached (use PDF, CSV, Word, Excel, text or an image).`;
    const size = decodedSize(f.content || "");
    if (size > 5 * MB) return `${f.filename} is over 5 MB.`;
    total += size;
  }
  if (total > 10 * MB) return "Attachments are over 10 MB in total.";
  return null;
}

// A send that failed because of Base44's sending limits; stop the batch.
export const isLimitError = (msg) => /limit|too many|paused|quota|rate/i.test(String(msg || ""));

export async function sendOne(sender, admin, me, m, now = new Date()) {
  if (!permissionsOf(me).edit) throw new EmailError("You need Edit access to send email from LineTally.", 403);
  const problem = checkMessage(m);
  if (problem) throw new EmailError(problem);
  let status = "sent";
  let error = null;
  try {
    await sender.integrations.Core.SendEmail({
      to: m.to.trim(),
      subject: m.subject.trim().slice(0, 200),
      html: m.html,
      text: m.text,
      ...(m.fromName ? { from_name: m.fromName.slice(0, 80) } : {}),
      ...(m.attachments?.length ? { attachments: m.attachments.map((f) => ({ filename: f.filename, content: f.content })) } : {}),
    });
  } catch (err) {
    status = "failed";
    error = String(err?.message || err?.data?.message || "Sending failed").slice(0, 500);
  }
  await admin.entities.EmailLog.create({
    team_id: teamIdOf(me) || null,
    sender_id: me.id,
    kind: m.kind,
    to: m.to.trim().toLowerCase(),
    subject: m.subject.trim().slice(0, 200),
    system_id: m.systemId || null,
    line_id: m.lineId || null,
    status,
    error,
    attachments: (m.attachments || []).map((f) => f.filename),
    sent_at: now.toISOString(),
    sent_by: me.full_name || me.email || "",
  }).catch(() => {});
  return { status, error, limited: status === "failed" && isLimitError(error) };
}
