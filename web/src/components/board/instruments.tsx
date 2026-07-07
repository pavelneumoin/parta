"use client";

// Тела предметных инструментов доски. Каждый получает сериализуемое состояние
// и (у учителя) onState для коммита изменений; ученики видят read-only live.

import { useEffect, useRef, useState } from "react";
import {
  compilePlot, toBases, truthTable, treeChildren, layoutTree,
  pickNext, timerLeft, type TreeNode,
} from "@/lib/board/logic";

export type InstrumentProps = {
  state: Record<string, unknown>;
  onState: (patch: Record<string, unknown>) => void;
  readOnly: boolean;
};

const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/* ------------------------------------------------ общие мелкие детали */

function Mini({ on, disabled, onClick, children, title }: {
  on?: boolean; disabled?: boolean; onClick?: () => void; children: React.ReactNode; title?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition disabled:opacity-40 ${
        on ? "bg-accent text-paper" : "bg-chalk hover:bg-rule/70"
      }`}
    >
      {children}
    </button>
  );
}

function TextRow({ label, value, onCommit, readOnly, width = "flex-1", placeholder }: {
  label?: string; value: string; onCommit: (v: string) => void;
  readOnly: boolean; width?: string; placeholder?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className="flex items-center gap-2 mt-2">
      {label && <span className="text-[11px] text-dim whitespace-nowrap">{label}</span>}
      <input
        value={v}
        placeholder={placeholder}
        disabled={readOnly}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onCommit(v)}
        onKeyDown={(e) => e.key === "Enter" && onCommit(v)}
        className={`${width} px-2 py-1 rounded-lg border border-rule bg-paper text-xs outline-none focus:border-accent disabled:opacity-60`}
      />
    </div>
  );
}

/* ------------------------------------------------ МАТЕМАТИКА */

function Plot({ state, onState, readOnly }: InstrumentProps) {
  const expr = str(state.expr, "x");
  const cvRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = cvRef.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const W = cv.width, H = cv.height, ux = 24;
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = "#eee9dc"; ctx.lineWidth = 1;
    for (let gx = (W / 2) % ux; gx < W; gx += ux) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (let gy = (H / 2) % ux; gy < H; gy += ux) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
    ctx.strokeStyle = "#8f8878"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    const colors = ["#1e6f5c", "#1f5fc9", "#d11a2a"];
    expr.split(";").forEach((src, fi) => {
      const f = compilePlot(src);
      if (!f) return;
      ctx.strokeStyle = colors[fi % 3]!; ctx.lineWidth = 2.2; ctx.beginPath();
      let pen = false;
      for (let px = 0; px <= W; px++) {
        const yv = f((px - W / 2) / ux);
        if (!Number.isFinite(yv)) { pen = false; continue; }
        const py = H / 2 - yv * ux;
        if (py < -2000 || py > 2000) { pen = false; continue; }
        if (pen) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        pen = true;
      }
      ctx.stroke();
    });
  }, [expr]);
  return (
    <div>
      <canvas ref={cvRef} width={320} height={260} className="rounded-lg bg-paper" />
      <TextRow label="y =" value={expr} onCommit={(v) => onState({ expr: v })} readOnly={readOnly}
        placeholder="x^2/4 - 2; sin(x)" />
      <p className="text-[10px] text-dim mt-1.5">x, + − * / ^, sin cos tan sqrt abs ln, pi, e · несколько — через ;</p>
    </div>
  );
}

function NumLine({ state, onState, readOnly }: InstrumentProps) {
  const spec = str(state.spec, "");
  const X = (v: number) => 170 + v * 26;
  const tok = spec.match(/[\[(]\s*-?\d+(?:[.,]\d+)?/g) ?? [];
  const vals = tok.map((t) => ({ open: t[0] === "(", v: parseFloat(t.slice(1).replace(",", ".")) }));
  const pairs: { a: number; b: number }[] = [];
  for (let i = 0; i + 1 < vals.length; i += 2) pairs.push({ a: vals[i]!.v, b: vals[i + 1]!.v });
  return (
    <div>
      <svg width={340} height={80} viewBox="0 0 340 80" className="bg-paper rounded-lg">
        <line x1={8} y1={44} x2={332} y2={44} stroke="#0f1115" strokeWidth={1.6} />
        <path d="M332 44l-8-4v8z" fill="#0f1115" />
        {Array.from({ length: 12 }, (_, i) => i - 6).map((v) => (
          <g key={v}>
            <line x1={X(v)} y1={40} x2={X(v)} y2={48} stroke="#0f1115" />
            <text x={X(v)} y={64} textAnchor="middle" fontSize={10.5} fill="#6f6a5e">{v}</text>
          </g>
        ))}
        {pairs.map((p, i) => (
          <rect key={i} x={Math.min(X(p.a), X(p.b))} y={29} width={Math.abs(X(p.b) - X(p.a))} height={15}
            fill="rgba(30,111,92,.18)" />
        ))}
        {vals.map((p, i) => (
          <circle key={i} cx={X(p.v)} cy={44} r={5}
            fill={p.open ? "#fbfaf6" : "#1e6f5c"} stroke="#1e6f5c" strokeWidth={2} />
        ))}
      </svg>
      <TextRow label="Точки:" value={spec} onCommit={(v) => onState({ spec: v })} readOnly={readOnly} />
      <p className="text-[10px] text-dim mt-1.5">[a — закрашенная, (a — выколотая; пара подряд — интервал со штриховкой</p>
    </div>
  );
}

function Fraction({ state, onState, readOnly }: InstrumentProps) {
  const n = Math.max(0, Math.min(24, num(state.num, 3)));
  const d = Math.max(1, Math.min(24, num(state.den, 8)));
  const cx = 95, cy = 78, r = 60;
  const slice = (i: number) => {
    const a1 = -Math.PI / 2 + (i * 2 * Math.PI) / d;
    const a2 = a1 + (2 * Math.PI) / d;
    const large = a2 - a1 > Math.PI ? 1 : 0;
    return `M${cx},${cy} L${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a2)},${cy + r * Math.sin(a2)} Z`;
  };
  const whole = Math.floor(n / d), rest = n % d;
  const Step = ({ field, value }: { field: "num" | "den"; value: number }) => (
    <span className="inline-flex items-center gap-1">
      <Mini disabled={readOnly} onClick={() => onState({ [field]: Math.max(field === "den" ? 1 : 0, value - 1) })}>−</Mini>
      <b className="w-6 text-center tabular-nums">{value}</b>
      <Mini disabled={readOnly} onClick={() => onState({ [field]: Math.min(24, value + 1) })}>+</Mini>
    </span>
  );
  return (
    <div>
      <svg width={190} height={158} viewBox="0 0 190 158" className="bg-paper rounded-lg">
        {Array.from({ length: d }, (_, i) => (
          <path key={i} d={slice(i)} fill={i < Math.min(n, d) ? "rgba(30,111,92,.55)" : "#f4f1e8"}
            stroke="#1e6f5c" strokeWidth={1.4} />
        ))}
        <text x={95} y={152} textAnchor="middle" fontSize={14} fontWeight={700} fill="#134639">
          {n}/{d}{n > d ? ` = ${whole}${rest ? ` ${rest}/${d}` : ""}` : ""}
        </text>
      </svg>
      <div className="flex items-center justify-between mt-2 text-xs">
        <span className="text-dim">Закрашено</span><Step field="num" value={n} />
        <span className="text-dim">из</span><Step field="den" value={d} />
      </div>
    </div>
  );
}

function Trig({ state, onState, readOnly }: InstrumentProps) {
  const commitDeg = num(state.deg, 30);
  const [deg, setDeg] = useState(commitDeg);
  useEffect(() => setDeg(commitDeg), [commitDeg]);
  const S = 240, C = S / 2, R = 90;
  const rad = (deg * Math.PI) / 180;
  const px = C + R * Math.cos(rad), py = C - R * Math.sin(rad);
  const norm = ((deg % 360) + 360) % 360;
  const svgRef = useRef<SVGSVGElement>(null);
  const setFrom = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (S / r.width) - C;
    const my = C - (e.clientY - r.top) * (S / r.height);
    setDeg(Math.round((Math.atan2(my, mx) * 180) / Math.PI));
  };
  return (
    <div>
      <svg
        ref={svgRef} width={S} height={S} viewBox={`0 0 ${S} ${S}`}
        className={`bg-paper rounded-lg ${readOnly ? "" : "cursor-pointer"}`}
        style={{ touchAction: "none" }}
        onPointerDown={(e) => { if (readOnly) return; (e.target as Element).setPointerCapture?.(e.pointerId); setFrom(e); }}
        onPointerMove={(e) => { if (!readOnly && e.buttons) setFrom(e); }}
        onPointerUp={() => !readOnly && deg !== commitDeg && onState({ deg })}
      >
        <line x1={8} y1={C} x2={S - 8} y2={C} stroke="#c9c2b1" />
        <line x1={C} y1={8} x2={C} y2={S - 8} stroke="#c9c2b1" />
        <circle cx={C} cy={C} r={R} fill="none" stroke="#0f1115" strokeWidth={1.8} />
        <path
          d={`M${C + 24},${C} A24,24 0 ${norm > 180 ? 1 : 0} 0 ${C + 24 * Math.cos(rad)},${C - 24 * Math.sin(rad)}`}
          fill="none" stroke="#b07d1e" strokeWidth={2}
        />
        <line x1={px} y1={py} x2={px} y2={C} stroke="#d11a2a" strokeWidth={2} strokeDasharray="4 3" />
        <line x1={px} y1={py} x2={C} y2={py} stroke="#1f5fc9" strokeWidth={2} strokeDasharray="4 3" />
        <line x1={C} y1={C} x2={px} y2={py} stroke="#1e6f5c" strokeWidth={2.4} />
        <circle cx={px} cy={py} r={7} fill="#1e6f5c" />
      </svg>
      <div className="flex justify-between mt-2 text-xs tabular-nums">
        <b>α = {norm}° ≈ {((norm * Math.PI) / 180).toFixed(2)} рад</b>
        <span style={{ color: "#d11a2a" }}>sin {Math.sin(rad).toFixed(2)}</span>
        <span style={{ color: "#1f5fc9" }}>cos {Math.cos(rad).toFixed(2)}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------ ГЕОМЕТРИЯ */

type Pt = [number, number];

function Triangle({ state, onState, readOnly }: InstrumentProps) {
  const committed = (Array.isArray(state.pts) ? state.pts : [[60, 200], [250, 200], [120, 40]]) as Pt[];
  const [pts, setPts] = useState<Pt[]>(committed);
  useEffect(() => setPts(committed), [JSON.stringify(committed)]); // eslint-disable-line react-hooks/exhaustive-deps
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 300, H = 230;
  const names = ["A", "B", "C"];
  const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) / 24;
  const drag = (i: number) => (e: React.PointerEvent) => {
    if (readOnly) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = svgRef.current!.getBoundingClientRect();
      setPts((old) => {
        const next = old.map((p) => [...p] as Pt);
        next[i] = [
          Math.max(12, Math.min(W - 12, (ev.clientX - r.left) * (W / r.width))),
          Math.max(12, Math.min(H - 12, (ev.clientY - r.top) * (H / r.height))),
        ];
        return next;
      });
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      setPts((final) => { onState({ pts: final }); return final; });
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };
  return (
    <div>
      <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="bg-paper rounded-lg" style={{ touchAction: "none" }}>
        <polygon points={pts.map((p) => p.join(",")).join(" ")}
          fill="rgba(30,111,92,.10)" stroke="#1e6f5c" strokeWidth={2.2} strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p[0]} cy={p[1]} r={8} fill="#fff" stroke="#1e6f5c" strokeWidth={2.4}
              className={readOnly ? "" : "cursor-grab"} onPointerDown={drag(i)} />
            <text x={p[0] + (i === 2 ? 0 : i === 0 ? -15 : 15)} y={p[1] + (i === 2 ? -13 : 5)}
              textAnchor="middle" fontSize={14} fontWeight={700}>{names[i]}</text>
          </g>
        ))}
      </svg>
      <p className="text-[11px] text-dim mt-1.5 tabular-nums">
        AB = {dist(pts[0]!, pts[1]!).toFixed(1)} · BC = {dist(pts[1]!, pts[2]!).toFixed(1)} · AC = {dist(pts[0]!, pts[2]!).toFixed(1)} (в клетках)
      </p>
    </div>
  );
}

function CircleTool({ state, onState, readOnly }: InstrumentProps) {
  const committed = Math.max(20, Math.min(115, num(state.r, 84)));
  const [r, setR] = useState(committed);
  useEffect(() => setR(committed), [committed]);
  const S = 250;
  const svgRef = useRef<SVGSVGElement>(null);
  const rc = r / 24;
  return (
    <div>
      <svg ref={svgRef} width={S} height={S} viewBox={`0 0 ${S} ${S}`} className="bg-paper rounded-lg" style={{ touchAction: "none" }}>
        <circle cx={S / 2} cy={S / 2} r={r} fill="rgba(31,95,201,.07)" stroke="#1f5fc9" strokeWidth={2.2} />
        <circle cx={S / 2} cy={S / 2} r={3} fill="#0f1115" />
        <text x={S / 2 - 11} y={S / 2 - 8} fontSize={13} fontWeight={700}>O</text>
        <line x1={S / 2} y1={S / 2} x2={S / 2 + r} y2={S / 2} stroke="#0f1115" strokeWidth={1.8} />
        <circle
          cx={S / 2 + r} cy={S / 2} r={8} fill="#fff" stroke="#1f5fc9" strokeWidth={2.4}
          className={readOnly ? "" : "cursor-ew-resize"}
          onPointerDown={(e) => {
            if (readOnly) return;
            (e.target as Element).setPointerCapture?.(e.pointerId);
            const move = (ev: PointerEvent) => {
              const rect = svgRef.current!.getBoundingClientRect();
              setR(Math.max(20, Math.min(115, (ev.clientX - rect.left) * (S / rect.width) - S / 2)));
            };
            const up = () => {
              removeEventListener("pointermove", move);
              removeEventListener("pointerup", up);
              setR((f) => { onState({ r: f }); return f; });
            };
            addEventListener("pointermove", move);
            addEventListener("pointerup", up);
          }}
        />
      </svg>
      <p className="text-[11px] text-dim mt-1.5 tabular-nums">
        R = {rc.toFixed(1)} кл · C = 2πR ≈ {(2 * Math.PI * rc).toFixed(1)} · S = πR² ≈ {(Math.PI * rc * rc).toFixed(1)}
      </p>
    </div>
  );
}

function Protractor({ state, onState, readOnly }: InstrumentProps) {
  const rot = num(state.rot, 0);
  return (
    <div>
      <svg width={310} height={172} viewBox="0 0 310 172" className="bg-paper rounded-lg">
        <g transform={`rotate(${rot} 155 146)`}>
          <path d="M29 146a126 126 0 0 1 252 0z" fill="rgba(255,255,255,.8)" stroke="#0f1115" strokeWidth={1.5} />
          {Array.from({ length: 19 }, (_, k) => k * 10).map((a) => {
            const t = (Math.PI * a) / 180, r1 = a % 30 ? 114 : 106;
            return (
              <g key={a}>
                <line
                  x1={155 - r1 * Math.cos(t)} y1={146 - r1 * Math.sin(t)}
                  x2={155 - 126 * Math.cos(t)} y2={146 - 126 * Math.sin(t)}
                  stroke="#0f1115" strokeWidth={a % 30 ? 1 : 1.6}
                />
                {a % 30 === 0 && (
                  <text x={155 - 92 * Math.cos(t)} y={150 - 92 * Math.sin(t)} fontSize={10.5}
                    textAnchor="middle" fill="#6f6a5e">{a}</text>
                )}
              </g>
            );
          })}
          <line x1={29} y1={146} x2={281} y2={146} stroke="#0f1115" strokeWidth={1.5} />
          <circle cx={155} cy={146} r={3} fill="#d11a2a" />
        </g>
      </svg>
      <div className="flex items-center gap-2 mt-2">
        <Mini disabled={readOnly} onClick={() => onState({ rot: rot - 15 })}>⟲ −15°</Mini>
        <span className="text-xs font-semibold tabular-nums w-10 text-center">{rot}°</span>
        <Mini disabled={readOnly} onClick={() => onState({ rot: rot + 15 })}>⟳ +15°</Mini>
      </div>
    </div>
  );
}

function Ruler(_p: InstrumentProps) {
  return (
    <div>
      <svg width={330} height={60} viewBox="0 0 330 60" className="rounded-lg">
        <rect x={5} y={8} width={320} height={44} rx={5} fill="rgba(255,236,178,.85)" stroke="#b07d1e" strokeWidth={1.3} />
        {Array.from({ length: 51 }, (_, k) => k * 2).map((mm) => {
          const px = 11 + mm * 3.08, h = mm % 10 ? (mm % 10 === 5 ? 12 : 7) : 17;
          return (
            <g key={mm}>
              <line x1={px} y1={8} x2={px} y2={8 + h} stroke="#0f1115" strokeWidth={mm % 10 ? 0.8 : 1.3} />
              {mm % 10 === 0 && <text x={px} y={40} fontSize={10.5} textAnchor="middle">{mm / 10}</text>}
            </g>
          );
        })}
      </svg>
      <p className="text-[10px] text-dim mt-1">1 см = 1 большая клетка · двигайте виджет за шапку</p>
    </div>
  );
}

/* ------------------------------------------------ ИНФОРМАТИКА */

function CodeCard({ state, onState, readOnly }: InstrumentProps) {
  const committed = str(state.src, "");
  const [v, setV] = useState(committed);
  useEffect(() => setV(committed), [committed]);
  return (
    <div>
      <textarea
        value={v}
        disabled={readOnly}
        spellCheck={false}
        rows={Math.min(16, Math.max(6, v.split("\n").length + 1))}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== committed && onState({ src: v })}
        className="w-72 rounded-lg bg-ink text-chalk font-mono text-xs leading-relaxed p-3 outline-none resize-none disabled:opacity-90"
      />
      {!readOnly && <p className="text-[10px] text-dim mt-1">Сохраняется при клике вне поля · запуск в песочнице — v2</p>}
    </div>
  );
}

function Bases({ state, onState, readOnly }: InstrumentProps) {
  const value = str(state.value, "156");
  const from = num(state.from, 10);
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const res = toBases(v, from);
  return (
    <div className="w-56">
      <div className="flex items-center gap-2">
        <input
          value={v} disabled={readOnly}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => v !== value && onState({ value: v })}
          onKeyDown={(e) => e.key === "Enter" && onState({ value: v })}
          className="flex-1 px-2 py-1 rounded-lg border border-rule bg-paper text-sm tabular-nums outline-none focus:border-accent disabled:opacity-60"
        />
        <select
          value={from} disabled={readOnly}
          onChange={(e) => onState({ from: Number(e.target.value), value: v })}
          className="px-2 py-1 rounded-lg border border-rule bg-paper text-xs"
        >
          {[2, 8, 10, 16].map((b) => <option key={b} value={b}>из {b}</option>)}
        </select>
      </div>
      <div className="mt-2 space-y-1">
        {[2, 8, 10, 16].map((base) => (
          <div key={base} className="flex justify-between text-sm tabular-nums">
            <span className="text-dim text-xs pt-0.5">{base}:</span>
            <b className={base === from ? "text-dim font-normal" : ""}>
              {res ? res[base] : "—"}<sub className="text-[9px] text-dim">{base}</sub>
            </b>
          </div>
        ))}
      </div>
      {!res && <p className="text-[10px] text-red mt-1">Не число в базе {from}</p>}
    </div>
  );
}

function Tree({ state, onState, readOnly }: InstrumentProps) {
  const root = (state.root ?? { label: "2", children: [] }) as TreeNode;
  const W = 320, H = 220;
  const nodes = layoutTree(root);
  const grow = (target: TreeNode) => {
    if (readOnly || target.children.length) return;
    const clone = structuredClone(root);
    // находим тот же узел в клоне по пути
    const path: number[] = [];
    (function find(n: TreeNode, p: number[]): boolean {
      if (n === target) { path.push(...p); return true; }
      return n.children.some((c, i) => find(c, [...p, i]));
    })(root, []);
    let node = clone;
    for (const i of path) node = node.children[i]!;
    node.children = treeChildren(node.label);
    onState({ root: clone });
  };
  return (
    <div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="bg-paper rounded-lg">
        {nodes.map((n, i) =>
          n.parent === null ? null : (
            <line key={"l" + i}
              x1={nodes[n.parent]!.x * W} y1={26 + nodes[n.parent]!.y * (H - 56)}
              x2={n.x * W} y2={26 + n.y * (H - 56)}
              stroke="#8f8878" strokeWidth={1.5} />
          ),
        )}
        {nodes.map((n, i) => (
          <g key={"n" + i} className={readOnly || n.node.children.length ? "" : "cursor-pointer"}
            onClick={() => grow(n.node)}>
            <circle cx={n.x * W} cy={26 + n.y * (H - 56)} r={14}
              fill={n.node.children.length ? "#fff" : "#e6f0ec"} stroke="#1e6f5c" strokeWidth={2} />
            <text x={n.x * W} y={30 + n.y * (H - 56)} textAnchor="middle" fontSize={11.5} fontWeight={700}>
              {n.node.label}
            </text>
          </g>
        ))}
      </svg>
      <p className="text-[10px] text-dim mt-1.5">
        {readOnly ? "Учитель ветвит дерево: потомки n+1 и n·2" : "Клик по листу — потомки n+1 и n·2 (задания 19–21)"}
      </p>
    </div>
  );
}

function Truth({ state, onState, readOnly }: InstrumentProps) {
  const expr = str(state.expr, "A and B");
  const t = truthTable(expr);
  return (
    <div>
      <TextRow label="F =" value={expr} onCommit={(v) => onState({ expr: v })} readOnly={readOnly} width="w-52" />
      {t ? (
        <table className="mt-2 border-collapse text-xs tabular-nums">
          <thead>
            <tr>
              {t.vars.map((v) => <th key={v} className="border border-rule bg-chalk px-2.5 py-0.5">{v}</th>)}
              <th className="border border-rule bg-chalk px-2.5 py-0.5">F</th>
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r, i) => (
              <tr key={i}>
                {r.bits.map((b, j) => <td key={j} className="border border-rule px-2.5 py-0.5 text-center">{b}</td>)}
                <td className="border border-rule px-2.5 py-0.5 text-center font-bold bg-accent/10 text-accent">{r.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-[11px] text-red mt-2">Не разобрала: A, B, C и and / or / not / xor / -&gt;</p>
      )}
    </div>
  );
}

/* ------------------------------------------------ ВЕРОЯТНОСТЬ */

const DIE = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

function Dice({ state, onState, readOnly }: InstrumentProps) {
  const face = str(state.face, "") || null;
  const history = (Array.isArray(state.history) ? state.history : []) as string[];
  const roll = (v: string) => onState({ face: v, history: [...history, v].slice(-14) });
  return (
    <div className="w-52 text-center">
      <div className="text-5xl min-h-[52px] leading-none">{face ?? "🎲"}</div>
      <div className="flex justify-center gap-2 mt-2">
        <Mini on disabled={readOnly} onClick={() => roll(DIE[Math.floor(Math.random() * 6)]!)}>Бросить кубик</Mini>
        <Mini disabled={readOnly} onClick={() => roll(Math.random() < 0.5 ? "О" : "Р")}>Монета</Mini>
      </div>
      <p className="text-[10px] text-dim mt-2 break-words">История: {history.length ? history.join(" ") : "—"}</p>
    </div>
  );
}

function Chart({ state, onState, readOnly }: InstrumentProps) {
  const data = str(state.data, "");
  const vals = data.split(/[,;\s]+/).map(Number).filter((v) => Number.isFinite(v)).slice(0, 12);
  const mx = Math.max(...vals, 1);
  const W = 300, H = 170;
  const bw = vals.length ? Math.min(44, (W - 20) / vals.length - 8) : 0;
  return (
    <div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="bg-paper rounded-lg">
        <line x1={8} y1={H - 20} x2={W - 8} y2={H - 20} stroke="#0f1115" strokeWidth={1.3} />
        {vals.map((v, i) => {
          const h = (H - 50) * (v / mx);
          const bx = 16 + i * ((W - 24) / vals.length);
          return (
            <g key={i}>
              <rect x={bx} y={H - 20 - h} width={bw} height={h} rx={3}
                fill={i % 2 ? "rgba(31,95,201,.65)" : "rgba(30,111,92,.65)"} />
              <text x={bx + bw / 2} y={H - 26 - h} textAnchor="middle" fontSize={10.5} fontWeight={700}>{v}</text>
            </g>
          );
        })}
      </svg>
      <TextRow label="Данные:" value={data} onCommit={(v) => onState({ data: v })} readOnly={readOnly} />
    </div>
  );
}

/* ------------------------------------------------ УРОК */

function Timer({ state, onState, readOnly }: InstrumentProps) {
  const [, force] = useState(0);
  const running = state.running === true;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const left = timerLeft(state as { running?: boolean; endsAt?: number | null; leftSec?: number; durSec?: number }, Date.now());
  const dur = num(state.durSec, 900);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return (
    <div className="w-56 text-center">
      <div className={`text-4xl font-bold tabular-nums ${left === 0 ? "text-red" : left <= 60 ? "text-amber-600" : ""}`}>
        {mm}:{ss}
      </div>
      {!readOnly && (
        <>
          <div className="flex justify-center gap-1.5 mt-2">
            {[5, 10, 15].map((m) => (
              <Mini key={m} on={dur === m * 60}
                onClick={() => onState({ running: false, endsAt: null, durSec: m * 60, leftSec: m * 60 })}>
                {m} мин
              </Mini>
            ))}
          </div>
          <div className="flex justify-center gap-1.5 mt-1.5">
            <Mini on onClick={() =>
              running
                ? onState({ running: false, endsAt: null, leftSec: left })
                : onState({ running: true, endsAt: Date.now() + left * 1000 })
            }>
              {running ? "Пауза" : "Старт"}
            </Mini>
            <Mini onClick={() => onState({ running: false, endsAt: null, leftSec: dur })}>Сброс</Mini>
          </div>
        </>
      )}
      {readOnly && <p className="text-[10px] text-dim mt-1">{running ? "Идёт отсчёт" : "На паузе"}</p>}
    </div>
  );
}

function Picker({ state, onState, readOnly }: InstrumentProps) {
  const names = str(state.names, "");
  const current = str(state.current, "") || null;
  const used = (Array.isArray(state.used) ? state.used : []) as string[];
  const list = names.split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean);
  return (
    <div className="w-60 text-center">
      <div className="text-xl font-bold min-h-[30px] text-accent">{current ?? "—"}</div>
      {!readOnly && (
        <>
          <Mini on onClick={() => {
            const r = pickNext(list, used);
            if (r) onState({ current: r.name, used: r.used });
          }}>
            Выбрать
          </Mini>
          <TextRow value={names} onCommit={(v) => onState({ names: v, used: [] })}
            readOnly={false} placeholder="Имена через запятую" />
        </>
      )}
      <p className="text-[10px] text-dim mt-1.5">
        {list.length ? `${list.length} учеников · без повторов до полного круга (спрошено ${used.length})` : "Учитель вводит список имён"}
      </p>
    </div>
  );
}

const LIGHTS = [
  { c: "#d11a2a", t: "Тишина — работаем сами" },
  { c: "#b07d1e", t: "Шёпотом — с соседом" },
  { c: "#1e6f5c", t: "Обсуждаем всем классом" },
];

function Light({ state, onState, readOnly }: InstrumentProps) {
  const idx = Math.max(0, Math.min(2, num(state.idx, 0)));
  return (
    <div className="w-48 text-center">
      <div className="flex flex-col items-center gap-2">
        {LIGHTS.map((l, i) => (
          <button
            key={i} type="button" disabled={readOnly}
            onClick={() => onState({ idx: i })}
            aria-label={l.t}
            className="w-10 h-10 rounded-full border-2 transition disabled:cursor-default"
            style={{
              background: l.c,
              borderColor: i === idx ? "transparent" : "#e3dfd1",
              opacity: i === idx ? 1 : 0.22,
              boxShadow: i === idx ? `0 0 14px ${l.c}` : "none",
            }}
          />
        ))}
      </div>
      <p className="text-[11px] text-dim mt-2">{LIGHTS[idx]!.t}</p>
    </div>
  );
}

/* ------------------------------------------------ диспатч */

const BODIES: Record<string, (p: InstrumentProps) => React.ReactNode> = {
  plot: Plot, numline: NumLine, fraction: Fraction, trig: Trig,
  triangle: Triangle, circle: CircleTool, protractor: Protractor, ruler: Ruler,
  code: CodeCard, bases: Bases, tree: Tree, truth: Truth,
  dice: Dice, chart: Chart,
  timer: Timer, picker: Picker, light: Light,
};

export function InstrumentBody({ kind, ...props }: InstrumentProps & { kind: string }) {
  const Body = BODIES[kind];
  if (!Body) return <p className="text-xs text-dim p-2">Неизвестный инструмент: {kind}</p>;
  return <Body {...props} />;
}
