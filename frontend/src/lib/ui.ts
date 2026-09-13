import type {
  TruckStatusType,
  FacilityType,
  LoadStatus,
} from "./types";

/**
 * UI metadata for each domain enum. Class strings are written as full
 * literals so Tailwind's scanner picks them up at build time.
 */
export interface StatusMeta {
  label: string;
  badge: string; // badge classes
  dot: string; // status dot bg class
  marker: string; // hex color used for leaflet markers (inline)
  text: string; // accent text class
}

export const STATUS_META: Record<TruckStatusType, StatusMeta> = {
  IN_TRANSIT: {
    label: "In-Transit",
    badge: "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    dot: "bg-emerald-500",
    marker: "#3b82f6",
    text: "text-blue-600 dark:text-blue-400",
  },
  DOCKED_WAITING: {
    label: "Docked / Waiting",
    badge: "bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    dot: "bg-amber-500",
    marker: "#f59e0b",
    text: "text-amber-600 dark:text-amber-400",
  },
  OFF_DUTY: {
    label: "Off-Duty",
    badge: "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:border-slate-600",
    dot: "bg-slate-400",
    marker: "#a1a1aa",
    text: "text-slate-600 dark:text-slate-400",
  },
};

export const FACILITY_META: Record<
  FacilityType,
  { label: string; color: string; fill: string }
> = {
  HUB: { label: "Hub", color: "#6366f1", fill: "#6366f1" },
  CUSTOMER_DOCK: { label: "Customer Dock", color: "#10b981", fill: "#10b981" },
  TERMINAL: { label: "Terminal", color: "#a855f7", fill: "#a855f7" },
};

export const LOAD_STATUS_META: Record<
  LoadStatus,
  { label: string; badge: string }
> = {
  ASSIGNED: {
    label: "Assigned",
    badge: "bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20",
  },
  IN_TRANSIT: {
    label: "In-Transit",
    badge: "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
  },
  DELIVERED: {
    label: "Delivered",
    badge:
      "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
  },
  PENDING: {
    label: "Pending",
    badge: "bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-700/40 dark:text-slate-300 dark:border-slate-600",
  },
  OFFERED: {
    label: "Offer Sent",
    badge: "bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
  },
  UNASSIGNED: {
    label: "Unassigned",
    badge: "bg-orange-50 text-orange-800 border border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20",
  },
};
