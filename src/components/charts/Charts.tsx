"use client";

import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, ErrorBar, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis,
} from "recharts";

const C = { series: "#3c83f6", context: "#afb3c4", grid: "#ecedf1", axis: "#8a8d96", ref: "#8a8d96", surface: "#ffffff" };
const tick = { fill: C.axis, fontSize: 11 };
const pctTick = (v: number) => `${Math.round(v * 100)}%`;

function TT({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="chart-tooltip">
      <div className="tt-title">{title}</div>
      {rows.map(([k, v]) => <div className="tt-row" key={k}><span>{k}</span><b>{v}</b></div>)}
    </div>
  );
}

/* ------------------------------------------------------------------ calibration */
export type CalPoint = { lo: number; hi: number; n: number; meanPredicted: number; observed: number; ciLo: number; ciHi: number; sufficient: boolean };

export function CalibrationChart({ points, height = 340 }: { points: CalPoint[]; height?: number }) {
  const data = points.map((p) => ({ ...p, x: p.meanPredicted, y: p.observed, err: [p.observed - p.ciLo, p.ciHi - p.observed] }));
  const solid = data.filter((d) => d.sufficient);
  return (
    <div className="chart-box" role="img" aria-label={`Calibration curve with ${points.length} probability bands. ${solid.map((d) => `${pctTick(d.lo)}–${pctTick(d.hi)}: predicted ${pctTick(d.x)}, observed ${pctTick(d.y)} (n=${d.n})`).join("; ")}`}>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart margin={{ top: 12, right: 18, bottom: 28, left: 18 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis type="number" dataKey="x" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tickFormatter={pctTick} tick={tick} axisLine={{ stroke: C.grid }} tickLine={false}
            label={{ value: "Predicted probability of favorable resolution", position: "insideBottom", offset: -16, fill: C.axis, fontSize: 11 }} />
          <YAxis type="number" dataKey="y" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tickFormatter={pctTick} tick={tick} axisLine={false} tickLine={false} width={44}
            label={{ value: "Observed favorable", angle: -90, position: "left", offset: 6, fill: C.axis, fontSize: 11, style: { textAnchor: "middle" } }} />
          <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke={C.ref} strokeDasharray="4 4" strokeWidth={1.2} ifOverflow="extendDomain" />
          <Line data={solid} type="linear" dataKey="y" stroke={C.series} strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />
          <Scatter data={data} isAnimationActive={false}
            shape={(props: { cx?: number; cy?: number; payload?: { sufficient: boolean } }) => (
              <circle cx={props.cx} cy={props.cy} r={5} fill={props.payload?.sufficient ? C.series : C.context} stroke={C.surface} strokeWidth={2} />
            )}>
            <ErrorBar dataKey="err" direction="y" width={6} stroke={C.context} strokeWidth={1} />
          </Scatter>
          <Tooltip cursor={false} content={({ payload }) => {
            const d = payload?.[0]?.payload as (typeof data)[number] | undefined;
            if (!d || d.n == null) return null;
            return <TT title={`Predicted ${pctTick(d.lo)}–${pctTick(d.hi)}`} rows={[["Predictions", String(d.n)], ["Mean predicted", pctTick(d.x)], ["Observed favorable", pctTick(d.y)], ["95% interval", `${pctTick(d.ciLo)}–${pctTick(d.ciHi)}`], ...(d.sufficient ? [] : [["Sample", "Too small to rely on"] as [string, string]])]} />;
          }} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        <span><i className="swatch" /> Your firm</span>
        <span><i className="swatch-ref" /> Perfect calibration</span>
        <span><i className="swatch-dot" style={{ background: C.context }} /> Fewer than 5 predictions</span>
        <span>Bars: 95% interval</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ horizontal bars */
export type BarDatum = { key: string; label: string; value: number | null; display: string; detail?: [string, string][]; muted?: boolean };

/** Named formats: functions cannot cross the server→client boundary. */
export type BarFormat = "multiple" | "brier" | "pct" | "usd";
const FORMATS: Record<BarFormat, (v: number) => string> = {
  multiple: (v) => `${v.toFixed(2)}×`,
  brier: (v) => v.toFixed(3),
  pct: (v) => `${Math.round(v * 100)}%`,
  usd: (v) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1000)}K`),
};

export function HBarChart({ data, format: fmt, reference, referenceLabel, height }: {
  data: BarDatum[]; format: BarFormat; reference?: number | null; referenceLabel?: string; height?: number;
}) {
  const format = FORMATS[fmt];
  const rows = data.filter((d) => d.value != null);
  const h = height ?? Math.max(120, rows.length * 34 + 40);
  return (
    <div className="chart-box" role="img" aria-label={rows.map((d) => `${d.label}: ${d.display}`).join("; ")}>
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 64, bottom: 4, left: 8 }} barCategoryGap={8}>
          <CartesianGrid stroke={C.grid} horizontal={false} />
          <XAxis type="number" tickFormatter={format} tick={tick} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="label" width={170} tick={{ ...tick, fill: "#5e616e", fontSize: 12 }} axisLine={false} tickLine={false} />
          {reference != null ? <ReferenceLine x={reference} stroke={C.ref} strokeDasharray="4 4" label={{ value: referenceLabel ?? "", position: "top", fill: C.axis, fontSize: 11 }} /> : null}
          <Bar dataKey="value" maxBarSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}
            label={{ position: "right", fill: "#18181b", fontSize: 12, formatter: (v: unknown) => (typeof v === "number" ? format(v) : "") }}>
            {rows.map((d) => <Cell key={d.key} fill={d.muted ? C.context : C.series} />)}
          </Bar>
          <Tooltip cursor={{ fill: "rgba(60,131,246,0.06)" }} content={({ payload }) => {
            const d = payload?.[0]?.payload as BarDatum | undefined;
            if (!d) return null;
            return <TT title={d.label} rows={[["Value", d.display], ...(d.detail ?? [])]} />;
          }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ histogram */
export function Histogram({ bins, xLabel, height = 240 }: { bins: { label: string; count: number }[]; xLabel: string; height?: number }) {
  return (
    <div className="chart-box" role="img" aria-label={`${xLabel}: ${bins.map((b) => `${b.label} ${b.count}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={bins} margin={{ top: 16, right: 8, bottom: 22, left: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="label" tick={tick} axisLine={{ stroke: C.grid }} tickLine={false} interval={0}
            label={{ value: xLabel, position: "insideBottom", offset: -14, fill: C.axis, fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} width={34} />
          <Bar dataKey="count" fill={C.series} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Tooltip cursor={{ fill: "rgba(60,131,246,0.06)" }} content={({ payload }) => {
            const d = payload?.[0]?.payload as { label: string; count: number } | undefined;
            return d ? <TT title={d.label} rows={[["Matters", String(d.count)]]} /> : null;
          }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
