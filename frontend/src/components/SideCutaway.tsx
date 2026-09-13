"use client";

/** CSS-based 2D side cutaway view of the 53ft trailer. */

const PALLET_ROWS = 13;

export default function SideCutaway({ pallets, isReefer }: { pallets: number; isReefer: boolean }) {
  const palletColor = isReefer ? "bg-sky-400" : "bg-amber-400";
  const palletTop = isReefer ? "bg-sky-300" : "bg-amber-300";

  return (
    <div className="flex h-full w-full items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center text-[8px] font-bold text-slate-400 mb-1">53&apos; SEMI-TRAILER — SIDE CUTAWAY</div>
        {/* Trailer body */}
        <div className="relative rounded-md border-2 border-slate-400 bg-white/50" style={{ aspectRatio: "53 / 8.5" }}>
          {/* Floor */}
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-slate-500" />
          {/* Roof line */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-slate-300" />
          {/* Pallets as stacked blocks */}
          <div className="absolute inset-0 flex items-end justify-around p-1">
            {Array.from({ length: PALLET_ROWS }).map((_, i) => {
              const filled = i < Math.ceil(pallets / 2);
              return (
                <div key={i} className="flex h-[60%] w-[5%] flex-col justify-end">
                  {filled && (
                    <>
                      <div className={`h-[8%] w-full rounded-t-sm ${palletTop}`} />
                      <div className={`h-[92%] w-full rounded-b-sm ${palletColor} opacity-80`} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {/* Wheels */}
          <div className="absolute -bottom-3 left-[8%] flex gap-1">
            <div className="h-6 w-6 rounded-full border-2 border-slate-600 bg-slate-700" />
            <div className="h-6 w-6 rounded-full border-2 border-slate-600 bg-slate-700" />
          </div>
          <div className="absolute -bottom-3 left-[75%] flex gap-1">
            <div className="h-6 w-6 rounded-full border-2 border-slate-600 bg-slate-700" />
            <div className="h-6 w-6 rounded-full border-2 border-slate-600 bg-slate-700" />
          </div>
          {/* Labels */}
          <div className="absolute -top-4 left-0 text-[7px] font-bold text-slate-400">FRONT</div>
          <div className="absolute -top-4 right-0 text-[7px] font-bold text-slate-400">REAR</div>
        </div>
      </div>
    </div>
  );
}
