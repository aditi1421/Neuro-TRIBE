"use client";
import type { Region } from "@/lib/neurosim";
export default function ResponseChart({
  region,
  times,
}: {
  region: Region;
  times: number[];
}) {
  const values = [...region.series_a, ...region.series_b];
  const min = Math.min(0, ...values),
    max = Math.max(0.1, ...values);
  const span = max - min || 1;
  const y = (v: number) => 170 - ((v - min) / span) * 135;
  const x = (i: number) => 45 + (i / (times.length - 1 || 1)) * 560;
  const line = (v: number[]) =>
    v
      .map((n, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(n).toFixed(2)}`)
      .join(" ");
  return (
    <svg
      className="response-chart"
      viewBox="0 0 640 210"
      role="img"
      aria-label={`Response over time for ${region.name}. Condition A mean ${region.a.toFixed(3)}, condition B mean ${region.b.toFixed(3)}.`}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line
            x1={45}
            x2={610}
            y1={y(min + t * span)}
            y2={y(min + t * span)}
            stroke="#29303a"
            strokeDasharray="3 5"
          />
          <text x={33} y={y(min + t * span) + 4} textAnchor="end">
            {(min + t * span).toFixed(1)}
          </text>
        </g>
      ))}
      <path
        d={line(region.series_a)}
        stroke="#ef9b6d"
        fill="none"
        strokeWidth={2.4}
      />
      <path
        d={line(region.series_b)}
        stroke="#67c7c5"
        fill="none"
        strokeWidth={2.4}
      />
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <text key={t} x={45 + t * 560} y={195} textAnchor="middle">
          {(times[0] + t * (times.at(-1)! - times[0])).toFixed(0)}s
        </text>
      ))}
    </svg>
  );
}
