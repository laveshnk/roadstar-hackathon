"use client";

import { useEffect, useState } from "react";

/** Apex Corridor Systems logo SVG — stylized highway corridor / dispatch node icon. */
function ApexLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className}>
      {/* Highway ribbon */}
      <path d="M8 48 L24 16 H40 L56 48" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {/* Node dots */}
      <circle cx="8" cy="48" r="5" fill="#059669" />
      <circle cx="32" cy="16" r="5" fill="#2563eb" />
      <circle cx="56" cy="48" r="5" fill="#e11d48" />
      {/* Connecting arc */}
      <path d="M16 40 Q32 28 48 40" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 400); // allow fade-out transition
    }, 1500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-50 transition-opacity duration-400 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Logo */}
      <div className="animate-pulse">
        <ApexLogo className="h-20 w-20" />
      </div>
      {/* Brand name */}
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Apex Corridor Systems</h1>
      <p className="mt-1 text-sm font-medium text-slate-500">
        Automated Regional Dispatch Command
      </p>
      {/* Loading bar */}
      <div className="mt-6 h-1 w-48 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-blue-600"
          style={{ animation: "splash-loading 1.4s ease-out forwards" }}
        />
      </div>
    </div>
  );
}
