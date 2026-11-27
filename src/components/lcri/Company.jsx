import { useEffect, useRef, useState } from "react";
import { Building2, ImagePlus, Trash2 } from "lucide-react";
import { useData } from "@/lib/DataContext";
import { useCompanyProfile } from "@/lib/useCompanyProfile";
import { notify } from "@/components/lcri/notify";
import { addressLines, contactLine } from "@/lib/report";

const FIELDS = [
  ["business_name", "Business name", "Tri-County Water Services", 120],
  ["address_line1", "Street address", "412 Mill Rd", 120],
  ["address_line2", "Address line 2", "Suite 3", 120],
  ["city", "City", "Millersburg", 80],
  ["state", "State", "OH", 40],
  ["postal_code", "ZIP code", "44654", 20],
  ["phone", "Phone", "(330) 555-0142", 40],
  ["email", "Email", "office@example.com", 120],
  ["website", "Website", "example.com", 120],
  ["license_number", "Operator license or certification", "OH Class II #2041", 80],
];

const MAX_W = 600;
const MAX_H = 240;
const MAX_DATA_URL = 300 * 1024;

// Resize the logo in the browser to a small PNG (keeps transparency) for reports.
async function logoToDataUrl(file) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (PNG or JPG).");
  if (file.size > 10 * 1024 * 1024) throw new Error("That image is over 10 MB.");
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("Couldn't read that image. Try a PNG or JPG.");
  const s = Math.min(1, MAX_W / bitmap.width, MAX_H / bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * s);
  canvas.height = Math.round(bitmap.height * s);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  let url = canvas.toDataURL("image/png");
  if (url.length > MAX_DATA_URL) url = canvas.toDataURL("image/jpeg", 0.85);
  if (url.length > MAX_DATA_URL) throw new Error("That logo is too detailed. Try a simpler or smaller image.");
  return url;
}

export default function Company() {
  const { teamId } = useData();
  const { profile, loading, canEdit, save } = useCompanyProfile();
  const [v, setV] = useState({});
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (profile !== undefined) setV(profile || {});
  }, [profile]);

  if (loading) return <div className="spinner spinner--inline" aria-label="Loading company details" />;

  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));
  const dirty = FIELDS.some(([k]) => (v[k] || "") !== (profile?.[k] || "")) || (v.logo_data || "") !== (profile?.logo_data || "");

  const pickLogo = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      setV((p) => ({ ...p, logo_data: null }));
      const url = await logoToDataUrl(f);
      setV((p) => ({ ...p, logo_data: url }));
    } catch (err) {
      notify(err.message, "error");
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!String(v.business_name || "").trim()) return notify("Enter your business name.", "error");
    setSaving(true);
    try {
      const data = Object.fromEntries(FIELDS.map(([k]) => [k, String(v[k] || "").trim()]));
      data.logo_data = v.logo_data || null;
      await save(data);
      notify("Company details saved. They'll appear on every report.");
    } catch {
      notify("Couldn't save. Check your connection and try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const preview = { ...v };
  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Company</div>
        <h1>Business details on your reports</h1>
        <p className="note">
          Your logo, address and contact details appear at the top of every PDF report.
          {teamId && !canEdit ? " Only the team owner can change them." : ""}
        </p>
      </div>
      <div className="grid2">
        <form className="card pad" onSubmit={submit}>
          <fieldset className="plain" disabled={!canEdit}>
            <div className="field">
              <span className="field-label">Logo</span>
              <div className="logo-row">
                <div className="logo-box">{v.logo_data ? <img src={v.logo_data} alt="Your logo" /> : <Building2 size={28} aria-hidden="true" />}</div>
                <input ref={fileRef} id="logo-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={pickLogo} hidden />
                <button type="button" className="btn" onClick={() => fileRef.current?.click()}><ImagePlus size={15} /> {v.logo_data ? "Replace logo" : "Upload logo"}</button>
                {v.logo_data && <button type="button" className="btn btn--ghost" onClick={() => setV((p) => ({ ...p, logo_data: null }))}><Trash2 size={15} /> Remove</button>}
              </div>
              <small className="muted">PNG with a transparent background works best. It's resized automatically.</small>
            </div>
            <div className="company-grid">
              {FIELDS.map(([k, label, ph, max]) => (
                <div className={`field field--${k}`} key={k}>
                  <label htmlFor={`co-${k}`}>{label}</label>
                  <input id={`co-${k}`} value={v[k] || ""} onChange={set(k)} placeholder={ph} maxLength={max} />
                </div>
              ))}
            </div>
          </fieldset>
          {canEdit && (
            <div className="form-actions">
              <button type="submit" className="btn btn--primary" disabled={saving || !dirty}>{saving ? "Saving…" : "Save company details"}</button>
            </div>
          )}
        </form>
        <section className="card pad" aria-labelledby="lh-h">
          <div className="eyebrow" id="lh-h">Report letterhead preview</div>
          <div className="letterhead">
            <div className="lh-logo">{preview.logo_data && <img src={preview.logo_data} alt="" />}</div>
            <div className="lh-text">
              <b>{preview.business_name || "Your business name"}</b>
              {addressLines(preview).map((l) => <span key={l}>{l}</span>)}
              {contactLine(preview) && <span>{contactLine(preview)}</span>}
              {preview.license_number && <span>License / certification: {preview.license_number}</span>}
            </div>
          </div>
          <div className="lh-rule" />
          <span className="eyebrow lh-title">Lead service line compliance report</span>
          <b className="lh-sys">Cedar Hollow Water District</b>
        </section>
      </div>
    </div>
  );
}
