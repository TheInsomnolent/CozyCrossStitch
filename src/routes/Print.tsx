import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import jsPDF from 'jspdf';
import { ArrowLeft, Download } from 'lucide-react';
import { loadPattern, type Pattern } from '../lib/storage';
import { estimateSkeins } from '../lib/skeins';

const PAGE_STITCHES = 50; // chart per page (50x50 cells)
const CELL_PT = 12;       // 12 PDF points per cell ≈ comfortable size

function pickSymbolColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return l > 0.6 ? '#222' : '#fff';
}

function renderChartPage(
  doc: jsPDF,
  p: Pattern,
  pageGx: number,
  pageGy: number,
  pageCols: number,
  pageRows: number,
  pageNumber: number,
  totalPages: number
) {
  const margin = 36;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(p.name, margin, margin - 12);
  doc.text(
    `Page ${pageNumber} of ${totalPages}  ·  cols ${pageGx + 1}-${pageGx + pageCols}  rows ${pageGy + 1}-${pageGy + pageRows}`,
    doc.internal.pageSize.getWidth() - margin,
    margin - 12,
    { align: 'right' }
  );

  const ox = margin + 18; // leave space for row labels
  const oy = margin + 18; // leave space for col labels
  const cell = CELL_PT;

  // fabric background
  doc.setFillColor(p.fabric.hex);
  doc.rect(ox, oy, pageCols * cell, pageRows * cell, 'F');

  // cells
  for (let y = 0; y < pageRows; y++) {
    for (let x = 0; x < pageCols; x++) {
      const gx = pageGx + x;
      const gy = pageGy + y;
      const idx = p.cells[gy * p.gridW + gx];
      if (idx === 0xff) continue;
      const entry = p.palette[idx];
      const px = ox + x * cell;
      const py = oy + y * cell;
      doc.setFillColor(entry.displayHex);
      if (entry.kind === 'full') {
        doc.rect(px, py, cell, cell, 'F');
      } else {
        doc.triangle(px, py, px + cell, py, px, py + cell, 'F');
      }
      // symbol
      doc.setTextColor(pickSymbolColor(entry.displayHex));
      doc.setFontSize(cell * 0.7);
      const sx = entry.kind === 'half' ? px + cell * 0.32 : px + cell / 2;
      const sy = entry.kind === 'half' ? py + cell * 0.5 : py + cell / 2 + 2.5;
      doc.text(entry.symbol, sx, sy, { align: 'center' });
    }
  }

  // grid lines
  doc.setLineWidth(0.25);
  doc.setDrawColor(140, 110, 110);
  for (let x = 0; x <= pageCols; x++) {
    const px = ox + x * cell;
    doc.line(px, oy, px, oy + pageRows * cell);
  }
  for (let y = 0; y <= pageRows; y++) {
    const py = oy + y * cell;
    doc.line(ox, py, ox + pageCols * cell, py);
  }
  // bold every 10
  doc.setLineWidth(0.9);
  doc.setDrawColor(70, 50, 50);
  for (let x = 0; x <= pageCols; x++) {
    const gx = pageGx + x;
    if (gx % 10 !== 0) continue;
    const px = ox + x * cell;
    doc.line(px, oy, px, oy + pageRows * cell);
  }
  for (let y = 0; y <= pageRows; y++) {
    const gy = pageGy + y;
    if (gy % 10 !== 0) continue;
    const py = oy + y * cell;
    doc.line(ox, py, ox + pageCols * cell, py);
  }

  // ruler labels
  doc.setTextColor(60, 40, 40);
  doc.setFontSize(8);
  for (let x = 0; x <= pageCols; x += 10) {
    const gx = pageGx + x;
    if (gx === 0) continue;
    const px = ox + x * cell;
    doc.text(String(gx), px, oy - 4, { align: 'center' });
  }
  for (let y = 0; y <= pageRows; y += 10) {
    const gy = pageGy + y;
    if (gy === 0) continue;
    const py = oy + y * cell;
    doc.text(String(gy), ox - 4, py + 3, { align: 'right' });
  }
}

async function buildPdf(p: Pattern): Promise<Blob> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });

  // Cover page
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  doc.setFillColor('#FBF6F0');
  doc.rect(0, 0, W, H, 'F');
  doc.setTextColor('#3B2A2A');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(32);
  doc.text(p.name, W / 2, H / 3, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.text(`${p.gridW} × ${p.gridH} stitches`, W / 2, H / 3 + 28, { align: 'center' });
  doc.text(`${p.aidaCount}-count Aida · ${p.fabric.name}`, W / 2, H / 3 + 50, { align: 'center' });
  const wIn = (p.gridW / p.aidaCount).toFixed(1);
  const hIn = (p.gridH / p.aidaCount).toFixed(1);
  doc.text(`Finished size: ${wIn}" × ${hIn}"`, W / 2, H / 3 + 72, { align: 'center' });
  doc.text(`${p.strands} strands per stitch`, W / 2, H / 3 + 94, { align: 'center' });

  // Shopping list page
  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Shopping List', 36, 60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const countsMap = new Map<string, { full: number; half: number; name: string; hex: string }>();
  for (let i = 0; i < p.cells.length; i++) {
    const v = p.cells[i];
    if (v === 0xff) continue;
    const e = p.palette[v];
    const r = countsMap.get(e.threadFloss) ?? { full: 0, half: 0, name: e.threadName, hex: e.threadHex };
    if (e.kind === 'full') r.full++;
    else r.half++;
    countsMap.set(e.threadFloss, r);
  }
  let yy = 90;
  doc.setFont('helvetica', 'bold');
  doc.text('Floss', 36, yy);
  doc.text('Name', 100, yy);
  doc.text('Full', 320, yy, { align: 'right' });
  doc.text('Half', 360, yy, { align: 'right' });
  doc.text('Skeins', 410, yy, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  yy += 6;
  doc.line(36, yy, 460, yy);
  yy += 14;
  for (const [floss, r] of countsMap) {
    if (yy > H - 60) {
      doc.addPage();
      yy = 60;
    }
    doc.setFillColor(r.hex);
    doc.rect(36, yy - 8, 10, 10, 'F');
    doc.setTextColor('#3B2A2A');
    doc.text(floss, 52, yy);
    doc.text(r.name.slice(0, 36), 100, yy);
    doc.text(String(r.full), 320, yy, { align: 'right' });
    doc.text(String(r.half), 360, yy, { align: 'right' });
    const sk = estimateSkeins({
      aidaCount: p.aidaCount,
      strands: p.strands,
      fullStitches: r.full,
      halfStitches: r.half,
    });
    doc.text(String(sk), 410, yy, { align: 'right' });
    yy += 16;
  }

  // Chart pages
  const pagesX = Math.ceil(p.gridW / PAGE_STITCHES);
  const pagesY = Math.ceil(p.gridH / PAGE_STITCHES);
  const totalChartPages = pagesX * pagesY;
  let n = 0;
  for (let py = 0; py < pagesY; py++) {
    for (let px = 0; px < pagesX; px++) {
      doc.addPage();
      n++;
      const gx = px * PAGE_STITCHES;
      const gy = py * PAGE_STITCHES;
      const cols = Math.min(PAGE_STITCHES, p.gridW - gx);
      const rows = Math.min(PAGE_STITCHES, p.gridH - gy);
      renderChartPage(doc, p, gx, gy, cols, rows, n, totalChartPages);
    }
  }

  // Key page
  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Symbol Key', 36, 60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let ky = 90;
  for (let i = 0; i < p.palette.length; i++) {
    const e = p.palette[i];
    const used = countsMap.has(e.threadFloss);
    if (!used) continue;
    if (ky > H - 60) {
      doc.addPage();
      ky = 60;
    }
    doc.setFillColor(e.displayHex);
    if (e.kind === 'full') doc.rect(36, ky - 10, 14, 14, 'F');
    else doc.triangle(36, ky - 10, 50, ky - 10, 36, ky + 4, 'F');
    doc.setTextColor('#3B2A2A');
    doc.text(e.symbol, 60, ky);
    doc.text(`DMC ${e.threadFloss}${e.kind === 'half' ? ' (½)' : ''}`, 80, ky);
    doc.text(e.threadName, 180, ky);
    ky += 16;
  }

  return doc.output('blob');
}

export function Print() {
  const { id } = useParams<{ id: string }>();
  const [pattern, setPattern] = useState<Pattern | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (id) loadPattern(id).then((p) => setPattern(p ?? null));
  }, [id]);

  const download = async () => {
    if (!pattern) return;
    setBusy(true);
    try {
      const blob = await buildPdf(pattern);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pattern.name.replace(/[^\w-]+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  if (!pattern) return <p className="muted">Loading…</p>;

  return (
    <section className="stack gap-3">
      <div className="row gap-2 wrap" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">
            <span className="script">Printable</span>
            PDF
          </h1>
          <p className="muted" style={{ marginTop: '0.25rem' }}>
            Cover, shopping list, tiled chart pages and a key — all in one tidy file.
          </p>
        </div>
        <div className="row gap-2 wrap">
          <Link to={`/pattern/${pattern.id}`} className="btn btn-secondary">
            <ArrowLeft size={16} /> Pattern
          </Link>
          <button className="btn btn-primary" onClick={download} disabled={busy}>
            <Download size={16} /> {busy ? 'Building…' : 'Download PDF'}
          </button>
        </div>
      </div>

      <div className="card stack gap-2">
        <h3>What's in the PDF</h3>
        <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--ink-muted)' }}>
          <li>Cover with finished size and fabric</li>
          <li>Shopping list with floss counts and skein estimates</li>
          <li>Chart tiled into {PAGE_STITCHES}×{PAGE_STITCHES}-stitch pages, with rulers every 10</li>
          <li>Symbol key</li>
        </ul>
      </div>
    </section>
  );
}
