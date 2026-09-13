"use client";

import { STATUS_META } from "@/lib/ui";
import type { TruckStatusType } from "@/lib/types";

export default function StatusBadge({
  status,
  className = "",
}: {
  status: TruckStatusType;
  className?: string;
}) {
  const m = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${m.badge} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}
