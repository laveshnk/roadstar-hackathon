"use client";

import { useState } from "react";
import Dashboard from "@/components/Dashboard";
import SplashScreen from "@/components/SplashScreen";

export default function Home() {
  const [splashDone, setSplashDone] = useState(false);
  return (
    <>
      {!splashDone && <SplashScreen onComplete={() => setSplashDone(true)} />}
      <Dashboard />
    </>
  );
}
