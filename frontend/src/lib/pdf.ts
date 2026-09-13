/**
 * PDF invoice generation for detention billing.
 *
 * Uses jsPDF + jspdf-autotable to produce a professional Freight Detention
 * Invoice PDF and trigger a browser download.
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { DetentionLog, Facility, Load } from "./types";
import type { SimTruck } from "./mockData";
import { FREE_DETENTION_MINUTES, DETENTION_RATE_PER_HOUR } from "./config";
import { formatCurrency, formatDuration } from "./detention";

/** Ontario HST rate (13%). */
const HST_RATE = 0.13;

export interface InvoicePDFParams {
  log: DetentionLog;
  truck: SimTruck | undefined;
  facility: Facility | undefined;
  load: Load | undefined;
}

/**
 * Generate a professional Freight Detention Invoice PDF and trigger download.
 */
export function generateDetentionInvoicePDF({
  log, truck, facility, load,
}: InvoicePDFParams): void {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const dark: [number, number, number] = [24, 24, 27];
  const blue: [number, number, number] = [37, 99, 235];
  const gray: [number, number, number] = [113, 113, 122];
  const emerald: [number, number, number] = [16, 185, 129];

  // Header band.
  doc.setFillColor(...blue);
  doc.rect(0, 0, pageWidth, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Apex Corridor Systems Inc.", margin, 13);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Carrier Detention Invoice", margin, 20);
  doc.setFontSize(8);
  doc.text("123 Dispatch Way, Milton, ON L9T 8H1  ·  www.apexcorridor.ca", margin, 26);

  // Invoice number (top right).
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(`Invoice #INV-${log.id}`, pageWidth - margin, 13, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const now = new Date();
  doc.text(
    `Issued: ${now.toLocaleDateString("en-CA")} ${now.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" })}`,
    pageWidth - margin, 18, { align: "right" },
  );
  doc.text(`Status: ${log.status === "ACTIVE" ? "CLOSED & INVOICED" : "INVOICED"}`, pageWidth - margin, 23, { align: "right" });

  // Billed To / Carrier.
  let y = 42;
  doc.setTextColor(...dark);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("BILLED TO", margin, y);
  doc.text("CARRIER / DRIVER", pageWidth - margin, y, { align: "right" });
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(load?.customer ?? facility?.customer ?? "—", margin, y);
  doc.text(truck?.driver_name ?? log.truck_id, pageWidth - margin, y, { align: "right" });
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(...gray);
  doc.text(facility?.name ?? log.facility_id, margin, y);
  doc.text(`Truck ${truck?.truck_number ?? log.truck_id}`, pageWidth - margin, y, { align: "right" });
  y += 4;
  doc.text(facility?.address ?? "", margin, y);

  // Load reference table.
  y += 8;
  doc.setTextColor(...dark);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("LOAD REFERENCE", margin, y);
  y += 5;
  autoTable(doc, {
    startY: y,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.5, textColor: dark },
    body: [
      ["Bill Number", String(load?.bill_number ?? "—"), "Trip ID", log.load_id],
      ["Origin", load?.origin_city ?? "—", "Destination", load?.destination_city ?? "—"],
      ["Commodity", load?.commodity ?? "Freight", "Equipment", load?.load_type ?? "Dry Van"],
    ],
    columnStyles: {
      0: { fontStyle: "bold", textColor: gray, cellWidth: 30 },
      2: { fontStyle: "bold", textColor: gray, cellWidth: 30 },
    },
  });

  // Dock session breakdown.
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...dark);
  doc.text("DOCK SESSION BREAKDOWN", margin, y);
  y += 3;

  const arrivalDate = new Date(log.arrival_time);
  const departureDate = log.departure_time ? new Date(log.departure_time) : now;
  const fmtDate = (d: Date) =>
    d.toLocaleString("en-CA", {
      timeZone: "America/Toronto",
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });

  autoTable(doc, {
    startY: y,
    theme: "grid",
    head: [["Event", "Timestamp", "Duration"]],
    headStyles: { fillColor: dark, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2 },
    body: [
      ["Arrival at Facility", fmtDate(arrivalDate), "—"],
      ["Free Allowance Threshold (120 min)", fmtDate(new Date(arrivalDate.getTime() + FREE_DETENTION_MINUTES * 60000)), formatDuration(FREE_DETENTION_MINUTES)],
      ["Departure / Current Time", fmtDate(departureDate), formatDuration(log.total_dock_minutes)],
      ["Billable Detention", "—", formatDuration(log.billable_detention_minutes)],
    ],
  });

  // Rate breakdown.
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...dark);
  doc.text("RATE BREAKDOWN", margin, y);
  y += 3;

  const subtotal = log.detention_fee_owed;
  const hst = Math.round(subtotal * HST_RATE * 100) / 100;
  const total = Math.round((subtotal + hst) * 100) / 100;

  autoTable(doc, {
    startY: y,
    theme: "striped",
    styles: { fontSize: 9, cellPadding: 2 },
    body: [
      ["Detention Rate", `${formatCurrency(DETENTION_RATE_PER_HOUR)} / hour`],
      ["Billable Minutes", `${log.billable_detention_minutes} min (${(log.billable_detention_minutes / 60).toFixed(2)} hrs)`],
      ["Subtotal", formatCurrency(subtotal)],
      ["HST (13% Ontario)", formatCurrency(hst)],
    ],
    columnStyles: {
      0: { fontStyle: "bold", textColor: gray, cellWidth: 60 },
    },
  });

  // Total Due box.
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  doc.setFillColor(...emerald);
  doc.rect(pageWidth - margin - 70, y, 70, 12, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("TOTAL DUE", pageWidth - margin - 66, y + 5);
  doc.setFontSize(13);
  doc.text(formatCurrency(total), pageWidth - margin - 4, y + 8, { align: "right" });

  // Footer.
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...gray);
  doc.text(
    "Payment due within 30 days. Detention billed per FTL rule: first 120 minutes free, then $75.00/hr prorated. HST #123456789 RT0001.",
    margin, pageHeight - 12,
  );
  doc.text("Apex Corridor Systems Inc. · This is a system-generated invoice.", margin, pageHeight - 8);

  // Download.
  doc.save(`Detention-Invoice-${log.id}.pdf`);
}

