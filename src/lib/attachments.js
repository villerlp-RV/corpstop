// Files attached to a service line: tap cards, permits, invoices, records
// reviews, customer letters. Stored privately; each is
// { uri, name, type, size, added_at, added_by }. Pure helpers, unit-tested.

export const MAX_ATTACHMENTS = 20; // per line
export const MAX_PER_ENTRY = 5; // per upload or field visit
export const MAX_BYTES = 20 * 1024 * 1024;

const EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "heic", "heif", "webp", "gif", "doc", "docx", "xls", "xlsx", "csv", "txt", "rtf", "odt", "ods"];
export const ACCEPT = EXTENSIONS.map((e) => `.${e}`).join(",");

export const extOf = (name) => (/\.([a-z0-9]+)$/i.exec(name || "")?.[1] || "").toLowerCase();

// null when the file can be attached, otherwise why not.
export function checkFile(file) {
  if (!file) return "Choose a file.";
  if (!EXTENSIONS.includes(extOf(file.name))) return `${file.name}: use PDF, image, Word, Excel, CSV or text files.`;
  if (file.size > MAX_BYTES) return `${file.name} is over 20 MB.`;
  if (!file.size) return `${file.name} is empty.`;
  return null;
}

export const cleanName = (name) =>
  [...String(name || "file")].map((c) => (c.charCodeAt(0) < 32 ? "_" : c)).join("").replace(/[\\/:*?"<>|]+/g, "_").trim().slice(0, 120) || "file";

export function attachmentRecord({ uri, name, type, size }, user, now = new Date()) {
  return {
    uri,
    name: cleanName(name),
    type: type || "application/octet-stream",
    size: Number(size) || 0,
    added_at: now.toISOString(),
    added_by: user?.full_name || user?.email || "",
  };
}

export const attachmentsOf = (line) => (Array.isArray(line?.attachments) ? line.attachments.filter((a) => a?.uri) : []);

export function addAttachmentsPatch(line, records) {
  const have = attachmentsOf(line);
  const seen = new Set(have.map((a) => a.uri));
  const added = (records || []).filter((r) => r?.uri && !seen.has(r.uri));
  return { attachments: [...have, ...added].slice(-MAX_ATTACHMENTS) };
}

export const removeAttachmentPatch = (line, uri) => ({ attachments: attachmentsOf(line).filter((a) => a.uri !== uri) });

export const roomFor = (line) => Math.max(0, MAX_ATTACHMENTS - attachmentsOf(line).length);

export function formatBytes(n) {
  if (!n) return "0 KB";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
