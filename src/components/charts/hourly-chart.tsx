"use client";

import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatSignedCurrency } from "@/lib/formatting";

export type HourlyDatum = { hour: number; orders: number; result: number };

const GREEN = "#34d399";
const RED = "#f87171";

/** Positive bars green, negative red, with a visible zero line. Values are cents. */
export function HourlyChart({ data }: { data: HourlyDatum[] }) {
  const rows = data.map((d) => ({ ...d, label: `${String(d.hour).padStart(2, "0")}:00` }));
  return (
    <div className="h-52 w-full" role="img" aria-label="Resultado por horário de aprovação">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fill: "#8b919c", fontSize: 10 }} tickLine={false} axisLine={false} interval={2} />
          <YAxis hide />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{ background: "#111318", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#8b919c" }}
            formatter={(value, _name, item) => [
              formatSignedCurrency(Number(value)),
              `${(item.payload as HourlyDatum).orders} venda(s)`,
            ]}
          />
          <Bar dataKey="result" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.hour} fill={r.result < 0 ? RED : GREEN} fillOpacity={r.result === 0 ? 0.15 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
