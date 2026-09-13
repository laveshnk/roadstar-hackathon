"use client";

/** CSS-based 2D top-down floor plan view of the 53ft trailer. */

const PALLET_ROWS = 13;
const PALLET_COLS = 2;

export default function TopDownFloorPlan({ pallets, isReefer }: { pallets: number; isReefer: boolean }) {
  const bgColor = isReefer ? "bg-sky-100 ring-sky-300" : "bg-amber-100 ring-amber-300";
  const labelColor = isReefer ? "text-sky-700" : "text-amber-700";

  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm">
        {/* Trailer outline */}
        <div className="relative rounded-lg border-2 border-slate-400 bg-white p-2 shadow-md" style={{ aspectRatio: "53 / 8.5" }}>
          {/* Front wall label */}
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] font-bold text-slate-400">FRONT (Tractor)</div>
          {/* Rear doors label */}
          <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] font-bold text-slate-400">REAR DOORS</div>
          {/* Pallet grid */}
          <div className="grid h-full gap-0.5" style={{ gridTemplateColumns: `repeat(${PALLET_COLS}, 1fr)`, gridTemplateRows: `repeat(${PALLET_ROWS}, 1fr)` }}>
            {Array.from({ length: PALLET_ROWS * PALLET_COLS }).map((_, i) => {
              const filled = i < pallets;
              return (
                <div key={i} className={`flex items-center justify-center rounded-sm text-[7px] font-bold ${filled ? `${bgColor} ring-1 ${labelColor}` : "bg-slate-100 text-slate-300"}`}>
                  {filled ? i + 1 : "·"}
                </div>
              );
            })}
          </div>
        </div>
        {/* Capacity bar */}
        <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500">
          <span>Pallet Utilization: <span className="font-bold text-slate-700">{pallets} / {PALLET_ROWS * PALLET_COLS}</span></span>
          <span>{Math.round((pallets / (PALLET_ROWS * PALLET_COLS)) * 100)}% full</span>
        </div>
      </div>
    </div>
  );
}
