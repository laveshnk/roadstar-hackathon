/** Circular SVG progress gauge for HOS countdowns. */

interface CircularGaugeProps {
  label: string;
  remaining: number; // remaining value
  limit: number; // max value
  unit: string;
  color: string;
  size?: number;
}

export default function CircularGauge({
  label,
  remaining,
  limit,
  unit,
  color,
  size = 88,
}: CircularGaugeProps) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, ((limit - remaining) / limit) * 100));
  const dashOffset = circumference * (1 - pct / 100);
  const isLow = remaining < 1; // less than 1 hour
  const strokeColor = isLow ? "#ef4444" : color;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="h-full w-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#1e293b"
            strokeWidth={6}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-mono text-sm font-bold ${isLow ? "text-red-400" : "text-slate-100"}`}>
            {remaining.toFixed(1)}
          </span>
          <span className="text-[9px] text-slate-500">{unit} left</span>
        </div>
      </div>
      <span className="mt-1 text-[10px] font-medium text-slate-400">{label}</span>
      <span className="text-[8px] text-slate-600">
        {(limit - remaining).toFixed(1)} / {limit}
        {unit}
      </span>
    </div>
  );
}
