import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ListChecks, Printer, Paintbrush, Type as TypeIcon, Image as ImageIcon } from 'lucide-react';
import {
  getBit,
  loadPattern,
  popcount,
  savePattern,
  setBit,
  type Pattern,
} from '../lib/storage';

type ViewMode = 'color' | 'symbol' | 'both';

interface Viewport {
  /** stitch cell size in screen pixels */
  cell: number;
  /** translation in screen pixels (top-left of grid) */
  tx: number;
  ty: number;
}

const MIN_CELL = 4;
const MAX_CELL = 64;

export function Pattern() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [pattern, setPattern] = useState<Pattern | null>(null);
  const [view, setView] = useState<ViewMode>('both');
  const [highlight, setHighlight] = useState<number | null>(null); // palette index
  const [paintMode, setPaintMode] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<Viewport>({ cell: 18, tx: 0, ty: 0 });
  const completionRef = useRef<number[] | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!id) return;
    loadPattern(id).then((p) => {
      if (!p) {
        nav('/');
        return;
      }
      setPattern(p);
      completionRef.current = [...p.completion];
    });
  }, [id, nav]);

  // ------- viewport sizing & initial fit -------
  const fit = useCallback(() => {
    const stage = stageRef.current;
    const p = pattern;
    if (!stage || !p) return;
    const rect = stage.getBoundingClientRect();
    const padding = 32;
    const cw = (rect.width - padding * 2) / p.gridW;
    const ch = (rect.height - padding * 2) / p.gridH;
    const cell = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(Math.min(cw, ch))));
    const tx = (rect.width - cell * p.gridW) / 2;
    const ty = (rect.height - cell * p.gridH) / 2;
    viewportRef.current = { cell, tx, ty };
    requestDraw();
  }, [pattern]);

  useEffect(() => {
    if (!pattern) return;
    fit();
    const onResize = () => {
      requestDraw();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pattern, fit]);

  // ------- drawing -------
  const drawScheduledRef = useRef(false);
  // Hold the latest `draw` in a ref so requestDraw never invokes a stale closure.
  const drawRef = useRef<() => void>(() => {});
  const requestDraw = useCallback(() => {
    if (drawScheduledRef.current) return;
    drawScheduledRef.current = true;
    requestAnimationFrame(() => {
      drawScheduledRef.current = false;
      drawRef.current();
    });
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const p = pattern;
    const completion = completionRef.current;
    if (!canvas || !stage || !p || !completion) return;
    const rect = stage.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const { cell, tx, ty } = viewportRef.current;

    // fabric background under the grid
    ctx.fillStyle = p.fabric.hex;
    ctx.fillRect(tx, ty, p.gridW * cell, p.gridH * cell);

    // determine visible cell range
    const x0 = Math.max(0, Math.floor(-tx / cell));
    const y0 = Math.max(0, Math.floor(-ty / cell));
    const x1 = Math.min(p.gridW, Math.ceil((rect.width - tx) / cell));
    const y1 = Math.min(p.gridH, Math.ceil((rect.height - ty) / cell));

    const showColor = view !== 'symbol';
    const showSymbol = view !== 'color';

    // cells
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * p.gridW + x;
        const idx = p.cells[i];
        if (idx === 0xff) continue;
        const entry = p.palette[idx];
        const px = tx + x * cell;
        const py = ty + y * cell;
        if (showColor) {
          ctx.fillStyle = entry.displayHex;
          if (entry.kind === 'full') {
            ctx.fillRect(px, py, cell, cell);
          } else {
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + cell, py);
            ctx.lineTo(px, py + cell);
            ctx.closePath();
            ctx.fill();
          }
        } else {
          // symbol-only: white background
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(px, py, cell, cell);
        }
        // symbol overlay
        if (showSymbol && cell >= 9) {
          ctx.fillStyle = pickSymbolColor(entry.displayHex, showColor);
          ctx.font = `${Math.floor(cell * 0.7)}px ui-monospace, 'JetBrains Mono', monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          if (entry.kind === 'half') {
            // draw symbol in the colored triangle (top-left half)
            ctx.fillText(entry.symbol, px + cell * 0.32, py + cell * 0.32);
          } else {
            ctx.fillText(entry.symbol, px + cell / 2, py + cell / 2 + 1);
          }
        }
        // completion overlay
        if (getBit(completion, i)) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
          ctx.fillRect(px, py, cell, cell);
          ctx.strokeStyle = 'rgba(180, 90, 90, 0.7)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px + 3, py + 3);
          ctx.lineTo(px + cell - 3, py + cell - 3);
          ctx.moveTo(px + cell - 3, py + 3);
          ctx.lineTo(px + 3, py + cell - 3);
          ctx.stroke();
        }
        // highlight pulse
        if (highlight !== null && idx === highlight) {
          ctx.strokeStyle = 'rgba(184, 155, 198, 0.95)';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 1, py + 1, cell - 2, cell - 2);
        }
      }
    }

    // grid lines
    if (cell >= 6) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(60, 40, 40, 0.18)';
      ctx.beginPath();
      for (let x = x0; x <= x1; x++) {
        const px = Math.round(tx + x * cell) + 0.5;
        ctx.moveTo(px, ty + y0 * cell);
        ctx.lineTo(px, ty + y1 * cell);
      }
      for (let y = y0; y <= y1; y++) {
        const py = Math.round(ty + y * cell) + 0.5;
        ctx.moveTo(tx + x0 * cell, py);
        ctx.lineTo(tx + x1 * cell, py);
      }
      ctx.stroke();
    }
    // bold every 10
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(60, 40, 40, 0.55)';
    ctx.beginPath();
    for (let x = x0 - (x0 % 10); x <= x1; x += 10) {
      const px = Math.round(tx + x * cell) + 0.5;
      ctx.moveTo(px, ty);
      ctx.lineTo(px, ty + p.gridH * cell);
    }
    for (let y = y0 - (y0 % 10); y <= y1; y += 10) {
      const py = Math.round(ty + y * cell) + 0.5;
      ctx.moveTo(tx, py);
      ctx.lineTo(tx + p.gridW * cell, py);
    }
    ctx.stroke();

    // ruler labels every 10
    ctx.fillStyle = 'rgba(60, 40, 40, 0.7)';
    ctx.font = `600 11px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (let x = 10; x < p.gridW; x += 10) {
      const px = tx + x * cell;
      if (px > 12 && px < rect.width - 12) {
        ctx.fillText(String(x), px, ty - 2);
      }
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let y = 10; y < p.gridH; y += 10) {
      const py = ty + y * cell;
      if (py > 8 && py < rect.height - 8) {
        ctx.fillText(String(y), tx - 4, py);
      }
    }

    // center arrows
    drawCenterArrows(ctx, p.gridW, p.gridH, viewportRef.current, rect);
  }, [pattern, view, highlight]);

  // Keep the ref pointing at the latest draw function.
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  // redraw on view changes
  useEffect(() => {
    requestDraw();
  }, [view, highlight, requestDraw]);

  // ------- input: zoom + pan + tap -------
  // Single-pointer drag pans; two-pointer pinch zooms; wheel zooms about cursor.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; cx: number; cy: number; cell: number; tx: number; ty: number } | null>(null);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const stage = stageRef.current!;
    const rect = stage.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    pointersRef.current.set(e.pointerId, { x, y });
    if (pointersRef.current.size === 1) {
      dragRef.current = { x, y, moved: false };
    } else if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      pinchRef.current = {
        dist: Math.hypot(dx, dy),
        cx: (pts[0].x + pts[1].x) / 2,
        cy: (pts[0].y + pts[1].y) / 2,
        cell: viewportRef.current.cell,
        tx: viewportRef.current.tx,
        ty: viewportRef.current.ty,
      };
      dragRef.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    const stage = stageRef.current!;
    const rect = stage.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const prev = pointersRef.current.get(e.pointerId)!;
    pointersRef.current.set(e.pointerId, { x, y });

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy);
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      const start = pinchRef.current;
      const scale = dist / Math.max(1, start.dist);
      const newCell = Math.min(MAX_CELL, Math.max(MIN_CELL, start.cell * scale));
      // anchor zoom around the original midpoint
      const ratio = newCell / start.cell;
      viewportRef.current = {
        cell: newCell,
        tx: start.tx + (cx - start.cx) - (start.cx - start.tx) * (ratio - 1),
        ty: start.ty + (cy - start.cy) - (start.cy - start.ty) * (ratio - 1),
      };
      requestDraw();
      return;
    }

    if (pointersRef.current.size === 1 && dragRef.current) {
      const dx = x - prev.x;
      const dy = y - prev.y;
      viewportRef.current.tx += dx;
      viewportRef.current.ty += dy;
      if (Math.abs(x - dragRef.current.x) + Math.abs(y - dragRef.current.y) > 4) {
        dragRef.current.moved = true;
      }
      requestDraw();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const stage = stageRef.current!;
    const rect = stage.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const wasDrag = dragRef.current?.moved ?? false;
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) {
      if (!wasDrag) {
        toggleCellAt(x, y);
      }
      dragRef.current = null;
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const stage = stageRef.current!;
    const rect = stage.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const vp = viewportRef.current;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newCell = Math.min(MAX_CELL, Math.max(MIN_CELL, vp.cell * factor));
    const ratio = newCell / vp.cell;
    viewportRef.current = {
      cell: newCell,
      tx: x - (x - vp.tx) * ratio,
      ty: y - (y - vp.ty) * ratio,
    };
    requestDraw();
  };

  // React attaches onWheel as a passive listener, so preventDefault() warns and
  // page scroll happens. Bind a native non-passive listener instead.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const handler = (e: WheelEvent) => onWheel(e);
    stage.addEventListener('wheel', handler, { passive: false });
    return () => stage.removeEventListener('wheel', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pattern]);

  const toggleCellAt = (x: number, y: number) => {
    const p = pattern;
    const completion = completionRef.current;
    if (!p || !completion) return;
    const vp = viewportRef.current;
    const gx = Math.floor((x - vp.tx) / vp.cell);
    const gy = Math.floor((y - vp.ty) / vp.cell);
    if (gx < 0 || gy < 0 || gx >= p.gridW || gy >= p.gridH) return;
    const i = gy * p.gridW + gx;
    if (p.cells[i] === 0xff) return;
    if (paintMode) {
      // paint = mark completed (don't toggle off on tap during paint)
      setBit(completion, i, true);
    } else {
      setBit(completion, i, !getBit(completion, i));
    }
    requestDraw();
    scheduleSave();
  };

  const scheduleSave = () => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const p = pattern;
      const c = completionRef.current;
      if (!p || !c) return;
      const updated: Pattern = { ...p, completion: [...c] };
      savePattern(updated);
    }, 400);
  };

  // legend counts
  const counts = useMemo(() => {
    if (!pattern) return new Map<number, number>();
    const m = new Map<number, number>();
    for (let i = 0; i < pattern.cells.length; i++) {
      const v = pattern.cells[i];
      if (v === 0xff) continue;
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return m;
  }, [pattern]);

  const totalNonBlank = useMemo(() => {
    if (!pattern) return 0;
    let n = 0;
    for (let i = 0; i < pattern.cells.length; i++) if (pattern.cells[i] !== 0xff) n++;
    return n;
  }, [pattern]);
  const completedCount = completionRef.current
    ? popcount(completionRef.current)
    : 0;
  const pct = totalNonBlank ? Math.round((completedCount / totalNonBlank) * 100) : 0;

  if (!pattern) {
    return (
      <div className="container">
        <p className="muted">Loading pattern…</p>
      </div>
    );
  }

  return (
    <div className="pattern-page">
      <div className="pattern-toolbar">
        <Link to="/" className="btn btn-ghost btn-sm" aria-label="Back to library">
          <ArrowLeft size={16} /> Library
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: '1.1rem', fontWeight: 600, lineHeight: 1.1 }}>
            {pattern.name}
          </div>
          <div className="muted" style={{ fontSize: '0.78rem' }}>
            {pattern.gridW}×{pattern.gridH} · {pct}% complete
          </div>
        </div>
        <div className="seg" role="group" aria-label="View mode">
          <button className={view === 'color' ? 'active' : ''} onClick={() => setView('color')} title="Color only">
            <ImageIcon size={14} />
          </button>
          <button className={view === 'both' ? 'active' : ''} onClick={() => setView('both')} title="Color + symbols">
            Both
          </button>
          <button className={view === 'symbol' ? 'active' : ''} onClick={() => setView('symbol')} title="Symbols only">
            <TypeIcon size={14} />
          </button>
        </div>
        <button
          className={'btn btn-sm ' + (paintMode ? 'btn-primary' : 'btn-secondary')}
          onClick={() => setPaintMode((p) => !p)}
          title="Paint completed (drag to mark many)"
        >
          <Paintbrush size={14} />
        </button>
        <Link to={`/pattern/${pattern.id}/shopping`} className="btn btn-sm btn-secondary">
          <ListChecks size={14} /> <span className="hide-sm">Shopping</span>
        </Link>
        <Link to={`/pattern/${pattern.id}/print`} className="btn btn-sm btn-secondary">
          <Printer size={14} /> <span className="hide-sm">Print</span>
        </Link>
      </div>

      <div className="pattern-body">
        <div
          ref={stageRef}
          className="pattern-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <canvas ref={canvasRef} className="pattern-canvas" />
        </div>

        <aside className="legend">
          <div className="legend-handle" />
          <div className="row gap-2" style={{ justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <strong style={{ fontFamily: 'var(--font-serif)' }}>Key</strong>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setHighlight(null)}
              disabled={highlight === null}
            >
              Clear highlight
            </button>
          </div>
          {pattern.palette.map((e, idx) => {
            const count = counts.get(idx) ?? 0;
            if (count === 0) return null;
            return (
              <div
                key={idx}
                className={'legend-row' + (highlight === idx ? ' active' : '')}
                onClick={() => setHighlight(highlight === idx ? null : idx)}
                role="button"
                tabIndex={0}
              >
                <span className="swatch" style={{ background: e.displayHex }} />
                <span className="legend-symbol">{e.symbol}</span>
                <span className="legend-meta">
                  <span>
                    DMC {e.threadFloss}
                    {e.kind === 'half' ? ' ½' : ''}
                  </span>
                  <small>{e.threadName}</small>
                </span>
                <span className="legend-count">{count}</span>
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
}

function pickSymbolColor(bgHex: string, hasColorFill: boolean): string {
  if (!hasColorFill) return '#222';
  // luminance to choose contrast
  const r = parseInt(bgHex.slice(1, 3), 16);
  const g = parseInt(bgHex.slice(3, 5), 16);
  const b = parseInt(bgHex.slice(5, 7), 16);
  const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return l > 0.6 ? 'rgba(40,30,30,0.85)' : 'rgba(255,255,255,0.9)';
}

function drawCenterArrows(
  ctx: CanvasRenderingContext2D,
  gridW: number,
  gridH: number,
  vp: Viewport,
  rect: DOMRect
) {
  const cx = vp.tx + (gridW / 2) * vp.cell;
  const cy = vp.ty + (gridH / 2) * vp.cell;
  ctx.fillStyle = 'rgba(168, 109, 122, 0.95)';
  const s = 8;
  // top
  triangle(ctx, cx, Math.max(vp.ty - 2, 8), s, 'down');
  // bottom
  triangle(ctx, cx, Math.min(vp.ty + gridH * vp.cell + 2, rect.height - 8), s, 'up');
  // left
  triangle(ctx, Math.max(vp.tx - 2, 8), cy, s, 'right');
  // right
  triangle(ctx, Math.min(vp.tx + gridW * vp.cell + 2, rect.width - 8), cy, s, 'left');
}

function triangle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  dir: 'up' | 'down' | 'left' | 'right'
) {
  ctx.beginPath();
  if (dir === 'down') {
    ctx.moveTo(x - s, y - s);
    ctx.lineTo(x + s, y - s);
    ctx.lineTo(x, y);
  } else if (dir === 'up') {
    ctx.moveTo(x - s, y + s);
    ctx.lineTo(x + s, y + s);
    ctx.lineTo(x, y);
  } else if (dir === 'right') {
    ctx.moveTo(x - s, y - s);
    ctx.lineTo(x - s, y + s);
    ctx.lineTo(x, y);
  } else {
    ctx.moveTo(x + s, y - s);
    ctx.lineTo(x + s, y + s);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}
