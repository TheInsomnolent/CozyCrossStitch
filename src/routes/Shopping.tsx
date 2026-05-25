import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, Printer } from 'lucide-react';
import { getBit, loadPattern, type Pattern } from '../lib/storage';
import { estimateSkeins, estimateThreadInches } from '../lib/skeins';

interface Row {
  floss: string;
  name: string;
  hex: string;
  full: number;
  half: number;
  completedFull: number;
  completedHalf: number;
  skeins: number;
  inches: number;
  done: boolean;
}

export function Shopping() {
  const { id } = useParams<{ id: string }>();
  const [pattern, setPattern] = useState<Pattern | null>(null);

  useEffect(() => {
    if (id) loadPattern(id).then((p) => setPattern(p ?? null));
  }, [id]);

  const rows = useMemo<Row[]>(() => {
    if (!pattern) return [];
    const map = new Map<string, Row>();
    for (let i = 0; i < pattern.cells.length; i++) {
      const v = pattern.cells[i];
      if (v === 0xff) continue;
      const e = pattern.palette[v];
      const key = e.threadFloss;
      let row = map.get(key);
      if (!row) {
        row = {
          floss: e.threadFloss,
          name: e.threadName,
          hex: e.threadHex,
          full: 0,
          half: 0,
          completedFull: 0,
          completedHalf: 0,
          skeins: 0,
          inches: 0,
          done: false,
        };
        map.set(key, row);
      }
      const isComplete = getBit(pattern.completion, i);
      if (e.kind === 'full') {
        row.full++;
        if (isComplete) row.completedFull++;
      } else {
        row.half++;
        if (isComplete) row.completedHalf++;
      }
    }
    for (const row of map.values()) {
      row.inches = estimateThreadInches({
        aidaCount: pattern.aidaCount,
        strands: pattern.strands,
        fullStitches: row.full,
        halfStitches: row.half,
      });
      row.skeins = estimateSkeins({
        aidaCount: pattern.aidaCount,
        strands: pattern.strands,
        fullStitches: row.full,
        halfStitches: row.half,
      });
      row.done =
        row.full + row.half > 0 &&
        row.completedFull >= row.full &&
        row.completedHalf >= row.half;
    }
    return [...map.values()].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return b.full + b.half - (a.full + a.half);
    });
  }, [pattern]);

  const totalSkeins = rows.reduce((s, r) => s + r.skeins, 0);

  const copyText = () => {
    if (!pattern) return;
    const header = `Shopping list — ${pattern.name}\n${pattern.gridW}×${pattern.gridH} on ${pattern.aidaCount}ct ${pattern.fabric.name} · ${pattern.strands} strands\n\n`;
    const lines = rows.map(
      (r) =>
        `DMC ${r.floss.padEnd(6)} ${r.hex}  ${r.name.padEnd(30)}  full:${r.full}  half:${r.half}  skeins:${r.skeins}`
    );
    navigator.clipboard.writeText(header + lines.join('\n'));
  };

  if (!pattern) return <p className="muted">Loading…</p>;

  return (
    <section className="stack gap-3">
      <div className="row gap-2 wrap" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">
            <span className="script">Shopping</span>
            List
          </h1>
          <p className="muted" style={{ marginTop: '0.25rem' }}>
            For <strong>{pattern.name}</strong> · {pattern.gridW}×{pattern.gridH} on{' '}
            {pattern.aidaCount}ct {pattern.fabric.name} · {pattern.strands} strands
          </p>
        </div>
        <div className="row gap-2 wrap">
          <Link to={`/pattern/${pattern.id}`} className="btn btn-secondary">
            <ArrowLeft size={16} /> Pattern
          </Link>
          <Link to={`/pattern/${pattern.id}/print`} className="btn btn-secondary">
            <Printer size={16} /> Print
          </Link>
          <button className="btn btn-primary" onClick={copyText}>
            <Copy size={16} /> Copy as text
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="thread-table">
          <thead>
            <tr>
              <th></th>
              <th>Floss</th>
              <th>Name</th>
              <th>Hex</th>
              <th style={{ textAlign: 'right' }}>Full</th>
              <th style={{ textAlign: 'right' }}>Half</th>
              <th style={{ textAlign: 'right' }} title="Estimated length needed">
                Inches
              </th>
              <th style={{ textAlign: 'right' }} title="Skeins (8m DMC) needed, including waste factor">
                Skeins
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.floss} className={r.done ? 'thread-row-done' : undefined}>
                <td>
                  <span className="swatch" style={{ background: r.hex }} />
                </td>
                <td><strong>{r.floss}</strong></td>
                <td>{r.name}</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{r.hex}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.full}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.half}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{Math.round(r.inches)}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}><strong>{r.skeins}</strong></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7} style={{ textAlign: 'right' }}><strong>Total skeins</strong></td>
              <td style={{ textAlign: 'right' }}><strong>{totalSkeins}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="muted" style={{ fontSize: '0.85rem' }}>
        Skein estimates assume a standard DMC 6-strand 8m skein, your chosen{' '}
        {pattern.strands} strand{pattern.strands === 1 ? '' : 's'} per stitch, and a 15% waste factor
        for tails and travel. Half stitches count as half a full stitch's length.
        Round up generously for very large solid areas.
      </p>
    </section>
  );
}
