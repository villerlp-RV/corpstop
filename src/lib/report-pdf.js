// Draws a report (from src/lib/report.js) as a PDF with jsPDF. Browser only;
// jsPDF is loaded on demand so it stays out of the main bundle.

const INK = [21, 35, 45];
const MUTED = [90, 107, 118];
const LINE = [214, 223, 229];
const WATER = [31, 111, 154];
const SUNK = [240, 244, 247];
const STATUS = { ready: [47, 125, 79], on_track: [31, 111, 154], at_risk: [168, 107, 0], behind: [179, 57, 47] };

function imageSize(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export async function renderReportPdf(report) {
  const { jsPDF } = await import("jspdf");
  const landscape = report.kind === "portfolio";
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: landscape ? "landscape" : "portrait" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48; // page margin
  const CW = W - M * 2;
  const BOTTOM = H - 56;
  let y = M;

  const font = (size, style = "normal", color = INK) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const ensure = (needed) => {
    if (y + needed > BOTTOM) {
      doc.addPage();
      y = M;
      return true;
    }
    return false;
  };

  // ---- Letterhead
  doc.setFillColor(...WATER);
  doc.rect(0, 0, W, 6, "F");
  const lh = report.letterhead;
  let logoBottom = y;
  let textLeft = M;
  if (lh.logo) {
    const size = await imageSize(lh.logo);
    if (size) {
      const maxW = 150;
      const maxH = 60;
      const s = Math.min(maxW / size.w, maxH / size.h);
      const w = size.w * s;
      const h = size.h * s;
      try {
        doc.addImage(lh.logo, lh.logo.startsWith("data:image/jpeg") ? "JPEG" : "PNG", M, y, w, h);
        logoBottom = y + h;
        textLeft = M + w + 16;
      } catch {
        /* unreadable logo: letterhead text only */
      }
    }
  }
  const right = W - M;
  let ty = y + 4;
  if (lh.name) {
    font(14, "bold");
    doc.text(lh.name, right, ty + 10, { align: "right", maxWidth: right - textLeft });
    ty += 18;
  }
  font(9, "normal", MUTED);
  for (const line of [...lh.address, lh.contact, lh.license].filter(Boolean)) {
    doc.text(line, right, ty + 8, { align: "right", maxWidth: right - textLeft });
    ty += 12;
  }
  y = Math.max(logoBottom, ty) + 18;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.8);
  doc.line(M, y, right, y);
  y += 26;

  // ---- Title
  font(9, "bold", WATER);
  doc.text(report.title.toUpperCase(), M, y, { charSpace: 0.6 });
  y += 22;
  font(20, "bold");
  const titleLines = doc.splitTextToSize(report.subtitle, CW - 120);
  doc.text(titleLines, M, y);
  if (report.status) {
    const label = report.status.label.toUpperCase();
    font(9, "bold", STATUS[report.status.key]);
    const pw = doc.getTextWidth(label) + 22;
    doc.setDrawColor(...STATUS[report.status.key]);
    doc.setLineWidth(1);
    doc.roundedRect(right - pw, y - 13, pw, 18, 9, 9, "S");
    doc.text(label, right - pw / 2, y, { align: "center" });
  }
  y += titleLines.length * 22 + 8;

  // ---- Meta (label/value grid)
  const cols = landscape ? 3 : 2;
  const colW = CW / cols;
  report.meta.forEach(([k, v], i) => {
    const cx = M + (i % cols) * colW;
    if (i % cols === 0 && i > 0) y += 30;
    font(8, "normal", MUTED);
    doc.text(k.toUpperCase(), cx, y, { charSpace: 0.4 });
    font(10.5, "normal");
    doc.text(String(v), cx, y + 13, { maxWidth: colW - 12 });
  });
  y += 40;

  // ---- Tiles
  const n = report.tiles.length;
  const gap = 8;
  const tw = (CW - gap * (n - 1)) / n;
  report.tiles.forEach(([k, v], i) => {
    const tx = M + i * (tw + gap);
    doc.setFillColor(...SUNK);
    doc.roundedRect(tx, y, tw, 54, 4, 4, "F");
    font(16, "bold");
    doc.text(String(v), tx + 10, y + 24, { maxWidth: tw - 20 });
    font(8, "normal", MUTED);
    doc.text(k, tx + 10, y + 42, { maxWidth: tw - 20 });
  });
  y += 54 + 26;

  const heading = (text) => {
    ensure(80);
    font(12, "bold");
    doc.text(text, M, y);
    doc.setDrawColor(...WATER);
    doc.setLineWidth(1.5);
    doc.line(M, y + 6, M + 28, y + 6);
    y += 22;
  };

  const kvRows = (rows) => {
    for (const [k, v] of rows) {
      ensure(18);
      font(10, "normal", MUTED);
      doc.text(k, M, y);
      font(10, "bold");
      doc.text(String(v), right, y, { align: "right" });
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.5);
      doc.line(M, y + 6, right, y + 6);
      y += 20;
    }
    y += 10;
  };

  const table = ({ columns, widths, rows }) => {
    const ws = widths.map((f) => f * CW);
    const pad = 5;
    const drawHeader = () => {
      doc.setFillColor(...WATER);
      doc.rect(M, y, CW, 20, "F");
      font(8, "bold", [255, 255, 255]);
      let x = M;
      columns.forEach((c, i) => {
        doc.text(c.toUpperCase(), x + pad, y + 13, { maxWidth: ws[i] - pad * 2, charSpace: 0.3 });
        x += ws[i];
      });
      y += 20;
    };
    // Keep the header with at least its first row.
    font(9, "normal");
    const firstH = rows.length ? Math.max(...rows[0].map((v, i) => doc.splitTextToSize(String(v ?? ""), ws[i] - pad * 2).length)) * 11 + 9 : 0;
    ensure(20 + firstH);
    drawHeader();
    rows.forEach((row, r) => {
      font(9, "normal");
      const cells = row.map((v, i) => doc.splitTextToSize(String(v ?? ""), ws[i] - pad * 2));
      const h = Math.max(...cells.map((c) => c.length)) * 11 + 9;
      if (ensure(h)) drawHeader();
      if (r % 2 === 1) {
        doc.setFillColor(...SUNK);
        doc.rect(M, y, CW, h, "F");
      }
      font(9, "normal");
      let x = M;
      cells.forEach((c, i) => {
        doc.text(c, x + pad, y + 13);
        x += ws[i];
      });
      y += h;
    });
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.line(M, y, right, y);
    y += 14;
  };

  if (report.kind === "system") {
    heading("Readiness for 1 November 2027");
    for (const item of report.checklist) {
      ensure(30);
      doc.setDrawColor(...(item.done ? STATUS.ready : LINE));
      doc.setFillColor(...(item.done ? STATUS.ready : [255, 255, 255]));
      doc.circle(M + 6, y - 3, 5, item.done ? "FD" : "S");
      if (item.done) {
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(1.4);
        doc.line(M + 3.5, y - 3, M + 5.5, y - 1);
        doc.line(M + 5.5, y - 1, M + 9, y - 5.5);
      }
      font(10.5, "bold");
      doc.text(item.label, M + 20, y);
      font(9, "normal", MUTED);
      doc.text(`${item.done ? "Done" : "Not done"} · ${item.detail}`, M + 20, y + 12);
      y += 30;
    }
    y += 6;
    heading("Replacement pace");
    kvRows(report.pace);
    heading("Service lines");
    table(report.lines);
    font(9, "normal", MUTED);
    ensure(16);
    doc.text(report.lines.note, M, y);
    y += 22;
    if (report.notes.length) {
      heading("Field notes");
      for (const [addr, note] of report.notes) {
        const body = doc.splitTextToSize(note, CW - 150);
        ensure(body.length * 12 + 10);
        font(9.5, "bold");
        doc.text(addr, M, y);
        font(9.5, "normal");
        doc.text(body, M + 150, y);
        y += body.length * 12 + 8;
      }
    }
  } else {
    heading("Systems");
    table(report.systems);
  }

  // ---- Disclaimer and footer on every page
  font(8.5, "italic", MUTED);
  const disclaimer = doc.splitTextToSize(report.disclaimer, CW);
  // The footer rule sits at H - 36; the disclaimer only needs to clear it.
  if (y + 8 + (disclaimer.length - 1) * 11 > H - 46) {
    doc.addPage();
    y = M;
  }
  doc.text(disclaimer, M, y + 8);
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.line(M, H - 36, right, H - 36);
    font(8, "normal", MUTED);
    doc.text([lh.name, report.subtitle].filter(Boolean).join(" · "), M, H - 22, { maxWidth: CW - 140 });
    doc.text(`Page ${p} of ${pages} · Generated with Linetally`, right, H - 22, { align: "right" });
  }
  return doc;
}

export async function downloadReport(report) {
  const doc = await renderReportPdf(report);
  doc.save(report.filename);
}
