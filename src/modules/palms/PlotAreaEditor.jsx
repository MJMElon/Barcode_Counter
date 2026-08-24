import { useMemo, useRef, useState } from 'react';
import { areaIndexAt, bbox, dividerXAt, sortDividers, tidyDivider, weightsFromDividers } from './plotMaps.js';

const AREA_TINT = ['rgba(16,185,129,.30)', 'rgba(245,158,11,.30)', 'rgba(56,189,248,.30)', 'rgba(217,70,239,.30)', 'rgba(244,63,94,.30)'];

// Draw the dividing lines on the plot itself.
//
// The Field Conductor drags a line where the ground actually divides — the
// boundaries are rarely straight, so a percentage box could never describe
// them. Each area's share is then measured off the drawing rather than typed
// in: the plot's outline is sampled and the samples counted per side.
// `photoUrl` is a picture of this plot alone — when there is one the whole
// frame is the plot, so no outline or cropping is involved. Otherwise the
// nursery map is cropped to `poly`.
export default function PlotAreaEditor({ photoUrl, mapUrl, poly, areas, dividers, onChange, t }) {
  const ownPhoto = !!photoUrl;
  const wrapRef = useRef(null);
  const [drawing, setDrawing] = useState(null); // points of the line in progress
  const [imgAspect, setImgAspect] = useState(1.6);

  // Zoom the nursery map onto this plot, with a little breathing room.
  const view = useMemo(() => {
    if (ownPhoto || !poly) return { x: 0, y: 0, w: 100, h: 100 };
    const b = bbox(poly);
    const pad = Math.max(b.w, b.h) * 0.12;
    return {
      x: Math.max(0, b.x - pad),
      y: Math.max(0, b.y - pad),
      w: Math.min(100, b.w + pad * 2),
      h: Math.min(100, b.h + pad * 2),
    };
  }, [poly, ownPhoto]);

  // Pointer position as a percentage of the whole map image.
  function toImagePct(e) {
    const el = wrapRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    return { x: view.x + fx * view.w, y: view.y + fy * view.h };
  }

  function down(e) {
    if (areas.length < 2) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImagePct(e);
    if (p) setDrawing([p]);
  }
  function move(e) {
    if (!drawing) return;
    const p = toImagePct(e);
    if (!p) return;
    const last = drawing[drawing.length - 1];
    // Keep the stored line light — a point every ~1.5% of the view is plenty.
    if (Math.hypot(p.x - last.x, p.y - last.y) < view.w * 0.015) return;
    setDrawing([...drawing, p]);
  }
  function up() {
    if (!drawing) return;
    // A tap is not a line.
    if (drawing.length >= 2) {
      // Straightened on release: what was aimed at, not what the finger did.
      const next = [...(dividers || []), tidyDivider(drawing, view)].slice(0, areas.length - 1);
      onChange(sortDividers(next));
    }
    setDrawing(null);
  }

  const ready = (dividers || []).length === areas.length - 1;
  const weights = ready ? weightsFromDividers(areas, dividers, ownPhoto ? null : poly) : null;

  // Tint each area so the split is visible, by testing a grid of cells.
  const cells = useMemo(() => {
    if (!ready || areas.length < 2) return [];
    const out = [];
    const N = 26;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const pt = { x: view.x + ((i + 0.5) / N) * view.w, y: view.y + ((j + 0.5) / N) * view.h };
        out.push({ i, j, a: Math.min(areas.length - 1, areaIndexAt(dividers, pt)) });
      }
    }
    return out;
  }, [ready, dividers, areas.length, view]);

  const lines = sortDividers(dividers || []);

  return (
    <div>
      <div
        ref={wrapRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 touch-none select-none cursor-crosshair"
        style={{ aspectRatio: `${(view.w * imgAspect) / view.h}` }}
      >
        {/* the nursery map, scaled so this plot fills the frame */}
        <img
          src={photoUrl || mapUrl}
          alt=""
          draggable="false"
          onLoad={(e) => setImgAspect(e.target.naturalWidth / e.target.naturalHeight || 1.6)}
          className="absolute origin-top-left max-w-none block pointer-events-none"
          style={{
            width: `${(100 / view.w) * 100}%`,
            left: `${(-view.x / view.w) * 100}%`,
            top: `${(-view.y / view.h) * 100}%`,
            height: `${(100 / view.h) * 100}%`,
          }}
        />

        <svg
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          {/* area tints */}
          {cells.map((c) => (
            <rect
              key={`${c.i}-${c.j}`}
              x={view.x + (c.i / 26) * view.w}
              y={view.y + (c.j / 26) * view.h}
              width={view.w / 26}
              height={view.h / 26}
              fill={AREA_TINT[c.a % AREA_TINT.length]}
              clipPath={!ownPhoto && poly ? 'url(#plotclip)' : undefined}
            />
          ))}
          {!ownPhoto && poly && (
            <>
              <defs>
                <clipPath id="plotclip">
                  <polygon points={poly.map((p) => `${p.x},${p.y}`).join(' ')} />
                </clipPath>
              </defs>
              <polygon
                points={poly.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="#0f172a"
                strokeWidth={view.w * 0.006}
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
          {/* saved dividing lines */}
          {lines.map((line, i) => (
            <polyline
              key={i}
              points={line.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#ffffff"
              strokeWidth={view.w * 0.012}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {/* the line being drawn right now */}
          {drawing && drawing.length > 1 && (
            <polyline
              points={drawing.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#f43f5e"
              strokeWidth={view.w * 0.012}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>

        {/* area letters, placed at each band's midpoint */}
        {ready &&
          areas.map((a, i) => {
            const leftX = i === 0 ? view.x : dividerXAt(lines[i - 1], view.y + view.h / 2);
            const rightX = i === areas.length - 1 ? view.x + view.w : dividerXAt(lines[i], view.y + view.h / 2);
            const mid = (leftX + rightX) / 2;
            return (
              <span
                key={a}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-0.5 text-[12px] font-black bg-white/90 text-slate-800 shadow-sm pointer-events-none"
                style={{ left: `${((mid - view.x) / view.w) * 100}%`, top: '50%' }}
              >
                {a}
                {weights ? ` · ${weights[a]}%` : ''}
              </span>
            );
          })}
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-2">
        <span className="text-[11px] font-bold text-slate-500">
          {areas.length < 2
            ? t('set.drawNone')
            : ready
              ? t('set.drawDone', { n: areas.length })
              : t('set.drawHint', { n: areas.length - 1 - (dividers || []).length })}
        </span>
        <span className="flex-1" />
        {(dividers || []).length > 0 && (
          <button
            onClick={() => onChange(dividers.slice(0, -1))}
            className="bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 text-[11px] font-black uppercase tracking-wider rounded-lg px-3 py-2 cursor-pointer"
          >
            {t('set.undoLine')}
          </button>
        )}
      </div>
    </div>
  );
}
