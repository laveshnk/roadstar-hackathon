"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TabId } from "./Header";
import type { SimTruck } from "@/lib/mockData";
import type { DetentionLog, Facility, Load } from "@/lib/types";
import { speakNeural, cancelSpeech, playDing } from "@/lib/audioManager";

export interface TourStep {
  id: number;
  title: string;
  /** On-screen caption (clean formatting with $ symbols). */
  caption: string;
  /** TTS text (spelled-out numbers for fluid speech). */
  tts: string;
  position: "top" | "center" | "bottom-right" | "bottom-center" | "right-side" | "top-right" | "top-left";
  targetSelector?: string;
  /** CSS selector for the element to highlight with a pulsing ring + arrow pointer. */
  highlightSelector?: string;
  onEnter?: (ctrl: TourController) => void;
  /** For interactive tours only: the user action that auto-advances this step. */
  requiredAction?: TutorialAction;
}

/** Actions that drive interactive tutorial progression via window events. */
export type TutorialAction =
  | "OPEN_ASSIGN_MODAL"
  | "VIEW_3D_FIT"
  | "AXLE_CLEARED"
  | "DRIVER_SELECTED"
  | "CONFIRM_ASSIGNMENT"
  | "DRIVER_ACCEPTED";

/** Dispatch a tutorial action event that the AICoPilot listens for. */
export function emitTutorialAction(action: TutorialAction): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("tutorial-action", { detail: { action } }));
}

export interface TourController {
  switchTab: (tab: TabId) => void;
  selectTruck: (truckId: string) => void;
  openSpotQuote: () => void;
  confirmDispatch: () => void;
  closeModal: () => void;
}

export interface FleetContext {
  trucks: SimTruck[];
  loads: Load[];
  facilities: Facility[];
  activeDetentionLogs: DetentionLog[];
  invoicedTruckIds: Set<string>;
}

/** Proactive operational alert fired by the monitoring engine in Dashboard. */
export interface OperationalAlert {
  id: string;
  type: "DETENTION_THRESHOLD" | "HOS_DOCK_TRAP" | "EXPEDITED_APPOINTMENT" | "DRIVER_DELAY";
  severity: "amber" | "red";
  title: string;
  message: string;
  truckId?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Spur LLM API — OpenAI-compatible endpoint at ai.spuric.com
const SPUR_API_KEY = "sk-spur-2maHL8nsMXo7qbZadyjh9DvYS7x199Gm";
const SPUR_API_URL = "https://ai.spuric.com/v1/chat/completions";
const SPUR_MODEL = "spur-chat";

function buildSystemPrompt(ctx: FleetContext): string {
  const t = ctx.trucks.map((x) => `${x.truck_number} (${x.driver_name}): ${x.current_status}, HOS ${x.hos_remaining_hours?.toFixed(1)}h`).join("\n");
  const l = ctx.loads.filter((x) => !x.truck_id).map((x) => `${x.id}: ${x.customer}, ${x.origin_city}→${x.destination_city}`).join("\n");
  const d = ctx.activeDetentionLogs.map((x) => `${x.truck_id}: ${x.total_dock_minutes}min, $${x.detention_fee_owed}`).join("\n");
  return `You are the AI Dispatch Co-Pilot for Apex Corridor Systems, a regional freight dispatch platform operating along the Highway 401 corridor in Ontario, Canada. You have real-time access to fleet data.

Fleet Status:
${t || "No trucks online"}

Unassigned Loads:
${l || "None"}

Active Detention Sessions:
${d || "None"}

Rules:
- Answer concisely in 1-3 sentences.
- You can see live truck positions, HOS hours, detention billing, and load assignments.
- When asked about specific trucks, reference their real data above.
- Suggest actionable next steps (assign loads, monitor detention, check HOS compliance).
- If asked about something outside your data, say so honestly.`;
}

async function queryLLM(message: string, ctx: FleetContext, history: ChatMessage[]): Promise<string> {
  const messages = [
    { role: "system" as const, content: buildSystemPrompt(ctx) },
    ...history.slice(-8).map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user" as const, content: message },
  ];

  try {
    const res = await fetch(SPUR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SPUR_API_KEY}`,
      },
      body: JSON.stringify({
        model: SPUR_MODEL,
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown error");
      console.warn(`[LLM] API returned ${res.status}: ${errText}`);
      throw new Error(`LLM API ${res.status}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (content && typeof content === "string") return content.trim();
    throw new Error("Empty LLM response");
  } catch (err) {
    console.warn("[LLM] Falling back to local response:", err);
    return generateLocalResponse(message, ctx);
  }
}

function generateLocalResponse(msg: string, ctx: FleetContext): string {
  const l = msg.toLowerCase();
  if (l.includes("hos") || l.includes("remaining") || l.includes("hours")) {
    const top = [...ctx.trucks].sort((a, b) => (b.hos_remaining_hours ?? 0) - (a.hos_remaining_hours ?? 0))[0];
    return `${top.driver_name} (Truck ${top.truck_number}) has the most HOS remaining at ${top.hos_remaining_hours?.toFixed(1)}h. Driver 13 (B8269) is over cycle at -43.8h and needs rest.`;
  }
  if (l.includes("detention") || l.includes("b3339") || l.includes("dock")) {
    const log = ctx.activeDetentionLogs.find((x) => x.truck_id === "B3339");
    return log ? `Truck B3339 docked ${log.total_dock_minutes}min at Cambridge Customer Dock. ${log.billable_detention_minutes > 0 ? `Billing active: $${log.detention_fee_owed} owed and accruing at $75/hr.` : "Within 2h free window."}` : "No active detention on B3339.";
  }
  if (l.includes("load") || l.includes("assign") || l.includes("dispatch")) {
    const unassigned = ctx.loads.filter((x) => !x.truck_id);
    return unassigned.length > 0 ? `${unassigned.length} unassigned loads available. Click 'Assign Driver' on any load card in the Dispatch tab to start the pre-audit process.` : "All loads have been assigned to drivers.";
  }
  if (l.includes("fleet") || l.includes("status") || l.includes("online")) {
    const inTransit = ctx.trucks.filter((t) => t.current_status === "IN_TRANSIT").length;
    const docked = ctx.trucks.filter((t) => t.current_status === "DOCKED_WAITING").length;
    const offDuty = ctx.trucks.filter((t) => t.current_status === "OFF_DUTY").length;
    return `Fleet status: ${inTransit} in-transit, ${docked} docked, ${offDuty} off-duty. ${ctx.activeDetentionLogs.length > 0 ? `${ctx.activeDetentionLogs.length} active detention session(s).` : "No detention alerts."}`;
  }
  if (l.includes("optimal") || l.includes("spot") || l.includes("quote") || l.includes("margin")) {
    return "Click 'AI Optimize Load' on any unassigned load in the Dispatch tab. The optimizer evaluates HOS availability, deadhead distance, and equipment compatibility to maximize net profit margin.";
  }
  if (l.includes("invoice") || l.includes("pdf") || l.includes("bill")) {
    return "Go to the Detention & Invoices tab to see the billing ledger. Click 'Download PDF' on any row to generate a professional carrier invoice with Ontario 13% HST.";
  }
  if (l.includes("hello") || l.includes("hi") || l.includes("hey")) {
    return "Hello! I'm the Apex Corridor Systems AI Dispatch Co-Pilot. I can help with fleet status, HOS compliance, detention billing, load assignments, and spot-quote optimization. What do you need?";
  }
  return "I can help with fleet status, HOS hours, detention billing, load assignments, spot quotes, and invoices. Try asking 'What's the fleet status?' or 'Which driver has the most HOS remaining?'";
}

// 6-Step Guided Tour — caption (clean display) + tts (spelled-out for speech).
const TOUR_STEPS: TourStep[] = [
  {
    id: 1,
    title: "Welcome & Revenue Metrics",
    caption: "Welcome aboard Apex Corridor Systems. Every day, dispatchers and drivers lose $15,000 to $50,000 a month simply trying to coordinate across disconnected tools. We built this platform to bring everyone onto the same page—capturing every minute of detention and locking in top-margin spot quotes so our entire fleet earns what it's owed.",
    tts: "Welcome aboard Apex Corridor Systems. Every day, dispatchers and drivers lose fifteen to fifty thousand dollars a month simply trying to coordinate across disconnected tools. We built this platform to bring everyone onto the same page—capturing every minute of detention and locking in top-margin spot quotes so our entire fleet earns what it's owed.",
    position: "top",
    targetSelector: "header",
    highlightSelector: "header",
  },
  {
    id: 2,
    title: "Corridor Map & Road Geometry",
    caption: "Our live map tracks the entire fleet moving across the Highway 401 corridor. Routes follow actual road geometry, with cyan breadcrumbs tracing each truck's exact path. Toggle over to satellite view whenever you need a clear look at dock approaches and yard access.",
    tts: "Our live map tracks the entire fleet moving across the Highway 401 corridor. Routes follow actual road geometry, with cyan breadcrumbs tracing each truck's exact path. Toggle over to satellite view whenever you need a clear look at dock approaches and yard access.",
    position: "bottom-right",
    targetSelector: ".leaflet-container",
    highlightSelector: ".leaflet-container",
    onEnter: (c) => { c.switchTab("map"); },
  },
  {
    id: 3,
    title: "Detention Focus & Map Fly-To",
    caption: "Truck B3339 has been docked at Cambridge Customer Dock past the two-hour free threshold. The engine automatically logs geofence arrivals and bills $75 per hour without human intervention. The red alert shows the live accruing fee.",
    tts: "Truck B3339 has been docked at Cambridge Customer Dock past the two-hour free threshold. The engine automatically logs geofence arrivals and bills seventy-five dollars per hour without human intervention. The red alert shows the live accruing fee.",
    position: "top-left",
    targetSelector: ".leaflet-container",
    highlightSelector: ".leaflet-container",
    onEnter: (c) => { c.switchTab("map"); c.selectTruck("B3339"); },
  },
  {
    id: 4,
    title: "Dispatch & Pre-Audit Compliance",
    caption: "Switching to the Dispatch tab. Unassigned loads are matched against Transport Canada HOS rules. The 13-hour drive limit and 14-hour on-duty window are checked automatically before any driver is assigned, preventing compliance violations.",
    tts: "Switching to the Dispatch tab. Unassigned loads are matched against Transport Canada HOS rules. The thirteen-hour drive limit and fourteen-hour on-duty window are checked automatically before any driver is assigned, preventing compliance violations.",
    position: "bottom-center",
    targetSelector: "nav",
    highlightSelector: "nav",
    onEnter: (c) => { c.switchTab("dispatch"); },
  },
  {
    id: 5,
    title: "Detention Invoices & PDF Generation",
    caption: "Finally, the Detention and Invoices tab shows the full billing ledger. Click Download PDF on any row to generate a professional carrier invoice with timestamped dock breakdown, Ontario 13% HST, and total due. Invoices can be re-downloaded at any time.",
    tts: "Finally, the Detention and Invoices tab shows the full billing ledger. Click Download PDF on any row to generate a professional carrier invoice with timestamped dock breakdown, Ontario thirteen percent HST, and total due. Invoices can be re-downloaded at any time.",
    position: "top-right",
    targetSelector: "nav",
    highlightSelector: "nav",
    onEnter: (c) => { c.closeModal(); c.switchTab("detention"); },
  },
];

// Interactive Load Assignment Tutorial — guides the user through a hands-on
// dispatch workflow: select a heavy load → inspect cargo → pick a compliant
// driver → confirm the assignment handshake → driver accepts on ELD app.
// Steps advance AUTOMATICALLY when the user performs the required UI action.
const INTERACTIVE_STEPS: TourStep[] = [
  {
    id: 1,
    title: "Interactive: Assign Heavy Shipment",
    caption: "Let's assign a heavy dry-van shipment (LD-409019-AB, 42,758 lbs). Click the 'Assign Driver' button on the load card to open the pre-dispatch audit modal.",
    tts: "Let's assign a heavy dry-van shipment, load four zero nine zero one nine, forty-two thousand seven hundred fifty-eight pounds. Click the Assign Driver button on the load card to open the pre-dispatch audit modal.",
    position: "right-side",
    targetSelector: "nav",
    highlightSelector: "button:has(svg path[d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'])",
    onEnter: (c) => { c.switchTab("dispatch"); },
    requiredAction: "OPEN_ASSIGN_MODAL",
  },
  {
    id: 2,
    title: "Pre-Audit: Inspect Cargo Fit",
    caption: "Inspect the trailer cargo fit first. Notice that assigning this heavy payload to an already loaded unit triggers an overload alert on the tandem axles. Switch to the '3D Cargo Fit & Axles' tab in the modal to see the axle distribution.",
    tts: "Inspect the trailer cargo fit first. Notice that assigning this heavy payload to an already loaded unit triggers an overload alert on the tandem axles. Switch to the three-D Cargo Fit and Axles tab in the modal to see the axle distribution.",
    position: "right-side",
    highlightSelector: "button:has(svg path[d='M12 3l9 5-9 5-9-5 9-5z'])",
    requiredAction: "VIEW_3D_FIT",
  },
  {
    id: 3,
    title: "Resolution: Select Compliant Driver",
    caption: "Now switch to Driver 1 (or TRK-1005 R. Kowalski), who operates an empty 53' tandem unit with full legal axle clearance. The axle distribution displays green — COMPLIANT: 75,758 lbs GVW.",
    tts: "Now switch to Driver One, or TRK one zero zero five R. Kowalski, who operates an empty fifty-three foot tandem unit with full legal axle clearance. The axle distribution displays green — compliant at seventy-five thousand seven hundred fifty-eight pounds gross vehicle weight.",
    position: "right-side",
    requiredAction: "AXLE_CLEARED",
  },
  {
    id: 4,
    title: "Handshake: Confirm & Dispatch",
    caption: "Click [Confirm Assignment]. The modal closes, the load flips to OFFERED status, and a dispatch offer is transmitted to the driver. Now switch to the Driver ELD app on port 5174 and tap 'Accept Load' to complete the handshake.",
    tts: "Click Confirm Assignment. The modal closes, the load flips to offered status, and a dispatch offer is transmitted to the driver. Now switch to the Driver ELD app on port five one seven four and tap Accept Load to complete the handshake.",
    position: "right-side",
    highlightSelector: "button:has(svg path[d='M13 2L3 14h9l-1 8 10-12h-9l1-8z'])",
    requiredAction: "CONFIRM_ASSIGNMENT",
  },
  {
    id: 5,
    title: "Driver Acceptance on Port 5174",
    caption: "Switch over to Driver App on port 5174 and click 'Accept Load' to start transit. The tutorial will complete automatically when the dispatch handshake is received.",
    tts: "Switch over to Driver App on port five one seven four and click Accept Load to start transit. The tutorial will complete automatically when the dispatch handshake is received.",
    position: "right-side",
    requiredAction: "DRIVER_ACCEPTED",
  },
];

/** Animated friendly robot avatar with blinking eyes and bounce. */
function RobotAvatar({ active, size = 40 }: { active: boolean; size?: number }) {
  return (
    <div
      className="relative"
      style={{
        width: size,
        height: size,
        animation: active ? "robot-bounce 0.6s ease-in-out infinite" : undefined,
      }}
    >
      <svg viewBox="0 0 48 48" fill="none" className="h-full w-full">
        {/* Antenna */}
        <line x1="24" y1="4" x2="24" y2="10" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
        <circle cx="24" cy="4" r="2" fill="#6366f1" className={active ? "animate-pulse" : ""} />
        {/* Head */}
        <rect x="10" y="10" width="28" height="24" rx="6" fill="white" stroke="#6366f1" strokeWidth="2" />
        {/* Eyes (blink animation) */}
        <circle cx="18" cy="20" r="3" fill="#6366f1" style={{ animation: "robot-blink 4s infinite", transformOrigin: "18px 20px" }} />
        <circle cx="30" cy="20" r="3" fill="#6366f1" style={{ animation: "robot-blink 4s infinite", transformOrigin: "30px 20px" }} />
        {/* Smile */}
        <path d="M18 28 Q24 32 30 28" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" fill="none" />
        {/* Body */}
        <rect x="14" y="36" width="20" height="8" rx="3" fill="#6366f1" opacity="0.2" stroke="#6366f1" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

interface AICoPilotProps {
  controller: TourController;
  fleetContext: FleetContext;
  operationalAlerts?: OperationalAlert[];
}

export default function AICoPilot({ controller, fleetContext, operationalAlerts = [] }: AICoPilotProps) {
  // --- Tour deterministic state machine ---
  // Advancement occurs STRICTLY when the user clicks [Next Step].
  // Audio playback is fire-and-forget — it NEVER triggers step progression.
  // If audio fails, finishes, or gets blocked by browser autoplay policies,
  // the tour stays firmly on the current step dialog.
  const [tourActive, setTourActive] = useState(false);
  const [isInteractiveTour, setIsInteractiveTour] = useState(false);
  const [activeSteps, setActiveSteps] = useState<TourStep[]>(TOUR_STEPS);
  const [tour, setTour] = useState<{ currentStep: number; isPaused: boolean; isSpeaking: boolean }>({
    currentStep: 0, isPaused: false, isSpeaking: false,
  });
  // Bumped every time a tour is started so the enter-step effect re-fires
  // even when currentStep is already 0.
  const [tourEpoch, setTourEpoch] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const [muted, setMuted] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [listening, setListening] = useState(false);
  // Active proactive alerts currently displayed (derived directly from prop).
  const seenAlertIds = useRef<Set<string>>(new Set());
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const currentStep = activeSteps[tour.currentStep];

  // Refs to avoid stale closures inside async audio callbacks.
  const mutedRef = useRef(muted);
  const controllerRef = useRef(controller);
  useEffect(() => {
    mutedRef.current = muted;
    controllerRef.current = controller;
  });

  // Initialize audio on first user interaction (Brave autoplay policy).
  useEffect(() => {
    const resume = () => {
      try {
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) new Ctor().resume();
      } catch { /* noop */ }
    };
    window.addEventListener("click", resume, { once: true });
    window.addEventListener("touchstart", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
  }, []);

  const startTour = useCallback(() => {
    setActiveSteps(TOUR_STEPS);
    setIsInteractiveTour(false);
    setTour({ currentStep: 0, isPaused: false, isSpeaking: false });
    setTourActive(true); setChatOpen(false);
    setTourEpoch((e) => e + 1);
  }, []);

  const startInteractiveTour = useCallback(() => {
    setActiveSteps(INTERACTIVE_STEPS);
    setIsInteractiveTour(true);
    setTour({ currentStep: 0, isPaused: false, isSpeaking: false });
    setTourActive(true); setChatOpen(false);
    setTourEpoch((e) => e + 1);
  }, []);

  // End tour: unmount overlay, clear all active audio instances.
  const endTour = useCallback(() => {
    cancelSpeech();
    setTourActive(false);
    setIsInteractiveTour(false);
    setTour({ currentStep: 0, isPaused: false, isSpeaking: false });
    setSpotlightRect(null);
    setHighlightRect(null);
  }, []);

  // Advance to next step — called ONLY when the user clicks [Next Step].
  // No audio callback, no setTimeout, no promise resolution can trigger this.
  const handleNextStep = useCallback(() => {
    cancelSpeech(); // Stop speech for the current step.
    if (tour.currentStep < activeSteps.length - 1) {
      setTour((prev) => ({ ...prev, currentStep: prev.currentStep + 1, isPaused: false, isSpeaking: false }));
    } else {
      endTour();
    }
  }, [tour.currentStep, activeSteps.length, endTour]);

  // --- Interactive tutorial: action-driven progression ---
  // Listens for `tutorial-action` window events. When the received action
  // matches the current step's `requiredAction`, stops speech and advances.
  // This ONLY applies to the interactive tour — the standard guided tour
  // remains strictly manual (Next Step button only).
  useEffect(() => {
    if (!tourActive || !isInteractiveTour) return;
    const handleAction = (e: Event) => {
      const detail = (e as CustomEvent<{ action: string }>).detail;
      if (!detail?.action) return;
      const currentStepData = activeSteps[tour.currentStep];
      if (!currentStepData?.requiredAction) return;
      if (detail.action === currentStepData.requiredAction) {
        cancelSpeech();
        if (tour.currentStep < activeSteps.length - 1) {
          setTour((prev) => ({ ...prev, currentStep: prev.currentStep + 1, isPaused: false, isSpeaking: false }));
        } else {
          endTour();
        }
      }
    };
    window.addEventListener("tutorial-action", handleAction as EventListener);
    return () => window.removeEventListener("tutorial-action", handleAction as EventListener);
  }, [tourActive, isInteractiveTour, tour.currentStep, activeSteps, endTour]);

  // Pause suspends voice output. Resume just re-triggers the step's speech.
  const togglePause = useCallback(() => {
    setTour((s) => {
      if (!s.isPaused) { cancelSpeech(); return { ...s, isPaused: true, isSpeaking: false }; }
      return { ...s, isPaused: false, isSpeaking: true };
    });
  }, []);

  // --- Enter-step effect: runs when currentStep, tourActive, OR activeSteps change. ---
  useEffect(() => {
    if (!tourActive) return;
    const step = activeSteps[tour.currentStep];
    if (!step) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      endTour();
      return;
    }

    // Run onEnter callback (switch tabs, select trucks, etc.).
    step.onEnter?.(controllerRef.current);

    // Play a ding at the start of each step.
    playDing();

    // Verify target selector exists before scrolling/spotlighting.
    // Fallback to center (no spotlight) if element is absent so it does not auto-skip.
    let spotlightTimer: ReturnType<typeof setTimeout> | null = null;
    let highlightTimer: ReturnType<typeof setTimeout> | null = null;
    if (step.targetSelector) {
      spotlightTimer = setTimeout(() => {
        const el = document.querySelector(step.targetSelector!);
        if (el) {
          const rect = el.getBoundingClientRect();
          setSpotlightRect(rect);
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          setSpotlightRect(null);
        }
      }, 350);
    } else {
      setSpotlightRect(null);
    }

    // Track the highlight element (pulsing ring + arrow pointer).
    if (step.highlightSelector) {
      highlightTimer = setTimeout(() => {
        const el = document.querySelector(step.highlightSelector!);
        if (el) {
          setHighlightRect(el.getBoundingClientRect());
        } else {
          setHighlightRect(null);
        }
      }, 400);
    } else {
      setHighlightRect(null);
    }

    // If muted, do NOT speak and do NOT auto-advance — wait for user.
    if (mutedRef.current) {
      return () => { if (spotlightTimer) clearTimeout(spotlightTimer); };
    }

    // Speak the step's TTS text via local Kokoro neural TTS — fire-and-forget.
    // Audio completion does NOT trigger step advancement. The user must
    // click [Next Step] to progress.
    setTour((s) => ({ ...s, isSpeaking: true }));
    speakNeural(step.tts).catch(() => {});

    // NOTE: We intentionally do NOT call cancelSpeech() in the cleanup.
    // speakNeural() already calls cancelSpeech() at its start.
    return () => { if (spotlightTimer) clearTimeout(spotlightTimer); if (highlightTimer) clearTimeout(highlightTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.currentStep, tourActive, activeSteps, tourEpoch]);

  // --- Proactive operational alerts: playDing on new alerts ---
  useEffect(() => {
    for (const alert of operationalAlerts) {
      if (!seenAlertIds.current.has(alert.id)) {
        seenAlertIds.current.add(alert.id);
        playDing();
      }
    }
  }, [operationalAlerts]);

  // Cleanup all audio on unmount.
  useEffect(() => {
    return () => { cancelSpeech(); };
  }, []);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatHistory]);

  const sendChat = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput(""); setChatHistory((h) => [...h, { role: "user", content: msg }]); setChatLoading(true);
    const resp = await queryLLM(msg, fleetContext, chatHistory);
    setChatHistory((h) => [...h, { role: "assistant", content: resp }]); setChatLoading(false);
    speakNeural(resp).catch(() => {});
  }, [chatInput, chatLoading, fleetContext, chatHistory]);

  const startListening = useCallback(() => {
    if (typeof window === "undefined") return;
    const SR = (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new (SR as new () => { lang: string; continuous: boolean; interimResults: boolean; onresult: (e: { results: { [index: number]: { transcript: string } }[] }) => void; onend: () => void; stop: () => void; start: () => void; })();
    rec.lang = "en-CA"; rec.continuous = false; rec.interimResults = false;
    rec.onresult = (e) => { setChatInput(e.results[0][0].transcript); setListening(false); };
    rec.onend = () => setListening(false);
    rec.start(); recognitionRef.current = rec; setListening(true);
  }, []);

  const stopListening = useCallback(() => { recognitionRef.current?.stop(); setListening(false); }, []);

  const isRightSide = currentStep?.position === "right-side" || currentStep?.position === "top-right" || currentStep?.position === "top-left";
  const posClass = currentStep?.position === "top" ? "left-1/2 top-24 -translate-x-1/2" :
    currentStep?.position === "bottom-right" ? "bottom-28 right-6" :
    currentStep?.position === "bottom-center" ? "bottom-28 left-1/2 -translate-x-1/2" :
    currentStep?.position === "right-side" ? "top-1/2 right-6 -translate-y-1/2" :
    currentStep?.position === "top-right" ? "top-24 right-6" :
    currentStep?.position === "top-left" ? "top-24 left-6" :
    "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2";

  return (
    <>
      {/* Proactive operational alert toasts */}
      {operationalAlerts.length > 0 && !tourActive && (
        <div className="fixed bottom-20 right-4 z-[2850] w-80 space-y-2">
          {operationalAlerts.slice(-3).map((alert) => (
            <div key={alert.id} className={`pointer-events-auto rounded-xl border px-3 py-2.5 shadow-lg backdrop-blur ${alert.severity === "red" ? "border-rose-300 bg-rose-50/95" : "border-amber-300 bg-amber-50/95"}`}>
              <div className="flex items-start gap-2">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${alert.severity === "red" ? "bg-rose-500" : "bg-amber-500"}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} className="h-4 w-4"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
                </div>
                <div className="min-w-0">
                  <p className={`text-[11px] font-bold ${alert.severity === "red" ? "text-rose-700" : "text-amber-700"}`}>{alert.title}</p>
                  <p className={`mt-0.5 text-[10px] leading-snug ${alert.severity === "red" ? "text-rose-600" : "text-amber-600"}`}>{alert.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tourActive && currentStep && (
        <div className="pointer-events-none fixed inset-0 z-[2800]">
          {/* Dark overlay — skipped for right-side steps so the screen stays fully visible */}
          {!isRightSide && (
            <>
              {/* Spotlight overlay — cut a hole around the target element if found */}
              {spotlightRect ? (
                <div
                  className="absolute bg-black/65"
                  style={{
                    clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${spotlightRect.left - 8}px 0, ${spotlightRect.left - 8}px ${spotlightRect.top - 8}px, ${spotlightRect.right + 8}px ${spotlightRect.top - 8}px, ${spotlightRect.right + 8}px ${spotlightRect.bottom + 8}px, ${spotlightRect.left - 8}px ${spotlightRect.bottom + 8}px, ${spotlightRect.left - 8}px 0)`,
                  }}
                />
              ) : (
                <div className="absolute inset-0 bg-black/60" />
              )}
            </>
          )}
          {/* Highlight overlay — pulsing ring + arrow around the target button/element */}
          {highlightRect && (
            <>
              {/* Pulsing ring */}
              <div
                className="pointer-events-none absolute z-[2801] rounded-lg ring-4 ring-blue-500 animate-pulse"
                style={{
                  left: highlightRect.left - 4,
                  top: highlightRect.top - 4,
                  width: highlightRect.width + 8,
                  height: highlightRect.height + 8,
                  animationDuration: "1.2s",
                }}
              />
              {/* Arrow pointer from the right side */}
              <div
                className="pointer-events-none absolute z-[2801] flex items-center"
                style={{
                  left: highlightRect.right + 8,
                  top: highlightRect.top + highlightRect.height / 2 - 12,
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="animate-bounce" style={{ animationDuration: "0.8s" }}>
                  <path d="M2 12 L18 12 M14 6 L20 12 L14 18" stroke="#3B82F6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="ml-1 whitespace-nowrap rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-bold text-white shadow-lg">
                  👆 Click here
                </span>
              </div>
            </>
          )}
          <div className={`pointer-events-auto absolute w-96 max-w-[calc(100vw-2rem)] ${posClass}`}>
            <div className="overflow-hidden rounded-xl border border-blue-200 bg-white shadow-2xl backdrop-blur">
              <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2.5">
                <div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">{currentStep.id}</span><span className="text-xs font-semibold text-slate-900">{currentStep.title}</span></div>
                <span className="text-[10px] text-slate-400">{tour.currentStep + 1} / {activeSteps.length}</span>
              </div>
              <div className="px-4 py-3"><p className="text-[11px] leading-relaxed text-slate-600">{currentStep.caption}</p></div>
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <RobotAvatar active={tour.isSpeaking} size={28} />
                  <button type="button" onClick={() => setMuted((m) => !m)} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                    {muted ? (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M23 9l-6 6M17 9l6 6" /></svg>) : (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /></svg>)}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={togglePause} className="rounded-md border border-slate-300 px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-100">{tour.isPaused ? "▶ Resume" : "⏸ Pause"}</button>
                  <button type="button" onClick={endTour} className="rounded-md border border-rose-300 px-2.5 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-50">Skip Entire Tutorial</button>
                  {isInteractiveTour && currentStep.requiredAction ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-3 py-1 text-[10px] font-bold text-amber-700 ring-1 ring-inset ring-amber-200">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                      Waiting for your action…
                    </span>
                  ) : tour.currentStep < activeSteps.length - 1 ? (
                    <button type="button" onClick={handleNextStep} className="rounded-md bg-blue-600 px-3 py-1 text-[10px] font-bold text-white hover:bg-blue-500">Next Step →</button>
                  ) : (
                    <button type="button" onClick={endTour} className="rounded-md bg-emerald-600 px-3 py-1 text-[10px] font-bold text-white hover:bg-emerald-500">Done</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* PLACEHOLDER_CHAT */}
      {chatOpen && !tourActive && (
        <div className="fixed bottom-20 right-4 z-[2850] flex h-96 w-80 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-2"><RobotAvatar active={chatLoading} size={24} /><span className="text-xs font-semibold text-slate-900">AI Dispatch Co-Pilot</span></div>
            <div className="flex items-center gap-1"><button type="button" onClick={startTour} title="Start Tour" className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg></button><button type="button" onClick={() => setMuted((m) => !m)} title={muted ? "Unmute" : "Mute"} className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700">{muted ? (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M23 9l-6 6M17 9l6 6" /></svg>) : (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /></svg>)}</button><button type="button" onClick={() => setChatOpen(false)} className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><path d="M18 6L6 18M6 6l12 12" /></svg></button></div>
          </div>
          <div ref={chatScrollRef} className="flex-1 space-y-2 overflow-y-auto p-3">
            {chatHistory.length === 0 && (
              <div className="space-y-2">
                <div className="text-center text-[10px] text-slate-400">Hi! I'm your AI Dispatch Co-Pilot. I have real-time fleet data. Try one of these:</div>
                {["What's the fleet status?", "Which driver has the most HOS?", "What's the detention situation on B3339?", "How many unassigned loads?"].map((q) => (
                  <button key={q} type="button" onClick={() => { setChatInput(q); setTimeout(() => { const input = document.querySelector<HTMLInputElement>('input[placeholder*="Type"]'); input?.focus(); }, 50); }} className="block w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left text-[10px] font-medium text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700">
                    💬 {q}
                  </button>
                ))}
              </div>
            )}
            {chatHistory.map((m, i) => (<div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-[11px] ${m.role === "user" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>{m.content}</div></div>))}
            {chatLoading && <div className="flex justify-start"><div className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] text-slate-400"><span className="animate-pulse">●●●</span></div></div>}
          </div>
          <div className="flex items-center gap-1.5 border-t border-slate-200 p-2">
            <button type="button" onClick={listening ? stopListening : startListening} title={listening ? "Stop" : "Voice input"} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${listening ? "bg-rose-100 text-rose-600 ring-1 ring-rose-200" : "bg-slate-100 text-slate-400 hover:text-slate-700"}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" /></svg></button>
            <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }} placeholder={listening ? "Listening…" : "Type a question…"} className="min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none" />
            <button type="button" onClick={sendChat} disabled={!chatInput.trim() || chatLoading} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg></button>
          </div>
        </div>
      )}
      {/* Floating Avatar */}
      <div className="fixed bottom-4 right-4 z-[2900] flex flex-col items-end gap-2">
        {/* Tour buttons (shown when tour not active and chat not open) */}
        {!tourActive && !chatOpen && (
          <div className="flex flex-col items-end gap-1.5">
            <button type="button" onClick={startTour} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[10px] font-bold text-blue-600 shadow-md ring-1 ring-blue-200 transition-transform hover:scale-105">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><path d="M3 11l19-9-9 19-2-8-8-2z" /></svg>
              ▶ Start Guided Tour
            </button>
            <button type="button" onClick={startInteractiveTour} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[10px] font-bold text-indigo-600 shadow-md ring-1 ring-indigo-200 transition-transform hover:scale-105">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>
              🚚 Interactive Load Assignment
            </button>
          </div>
        )}
        <button type="button" onClick={() => tourActive ? endTour() : setChatOpen((o) => !o)} className={`group relative flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-transform hover:scale-105 ${operationalAlerts.length > 0 ? "bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-500/30" : "bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/30"}`}>
          {operationalAlerts.length > 0 ? (
            <span className="absolute inset-0 animate-ping rounded-full bg-rose-400/40" style={{ animationDuration: "1s" }} />
          ) : (
            <span className="absolute inset-0 animate-ping rounded-full bg-blue-400/30" style={{ animationDuration: "2s" }} />
          )}
          <RobotAvatar active={tourActive || chatLoading || operationalAlerts.length > 0} size={40} />
          {listening && <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 ring-2 ring-white"><span className="h-2 w-2 animate-pulse rounded-full bg-white" /></span>}
          {muted && !tourActive && !chatLoading && <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 ring-2 ring-white"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3 text-white"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M23 9l-6 6M17 9l6 6" /></svg></span>}
          {operationalAlerts.length > 0 && !tourActive && <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[9px] font-bold text-white ring-2 ring-white">{operationalAlerts.length}</span>}
        </button>
      </div>
    </>
  );
}
