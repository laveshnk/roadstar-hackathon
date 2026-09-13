/**
 * Simulated WebSocket / REST sync client.
 *
 * Broadcasts driver ELD status changes to the dispatch platform
 * (simulation-engine) on ws://localhost:4001. Falls back to a no-op logger
 * when the server is unreachable so the app works standalone.
 *
 * Also LISTENS for incoming DISPATCH_OFFER events from the dispatcher
 * dashboard (relayed by the WS message broker on port 4001).
 */

import type { DispatchEvent, LoadOffer } from "./types.ts";

const WS_URL = "ws://localhost:4001";
const REST_URL = "http://localhost:4001/api/driver-event";
const REST_RELAY_URL = "http://localhost:4001/api/relay";
const REST_EVENTS_URL = "http://localhost:4001/api/events";

type ConnectionListener = (connected: boolean) => void;
type MessageListener = (offer: LoadOffer) => void;

class FleetSyncClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<ConnectionListener>();
  private messageListeners = new Set<MessageListener>();
  private queue: DispatchEvent[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastEventId = 0;
  private storageHandler: ((e: StorageEvent) => void) | null = null;

  /** Attempt to connect to the simulation engine WebSocket. */
  connect(): void {
    if (typeof window === "undefined") return;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        this.notify(true);
        // Flush any queued events.
        while (this.queue.length > 0) {
          const evt = this.queue.shift();
          if (evt) this.sendRaw(evt);
        }
        // Start REST polling as a fallback for missed events.
        this.startPolling();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          // Handle incoming DISPATCH_OFFER from the dispatcher dashboard.
          if (msg.type === "DISPATCH_OFFER" && msg.data) {
            const offer = msg.data as LoadOffer;
            this.messageListeners.forEach((l) => l(offer));
          }
        } catch {
          // Malformed JSON — ignore.
        }
      };

      this.ws.onclose = () => {
        this.notify(false);
        // Attempt reconnect after 5s (non-blocking).
        setTimeout(() => this.connect(), 5000);
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.notify(false);
      // Start REST polling even if WS fails (fallback for dispatch offers).
      this.startPolling();
    }

    // Fallback: localStorage storage event listener — works even when the
    // simulation engine is completely offline. The dispatcher dashboard writes
    // to the "apex_dispatch_offer" key and the browser fires a `storage`
    // event in all OTHER windows/tabs on the same origin.
    // NOTE: storage events only fire cross-tab, not in the same tab.
    if (typeof window !== "undefined" && !this.storageHandler) {
      this.storageHandler = (e: StorageEvent) => {
        if (e.key !== "apex_dispatch_offer" || !e.newValue) return;
        try {
          const msg = JSON.parse(e.newValue);
          if (msg.type === "DISPATCH_OFFER" && msg.data) {
            const offer = msg.data as LoadOffer;
            this.messageListeners.forEach((l) => l(offer));
          }
        } catch { /* ignore */ }
      };
      window.addEventListener("storage", this.storageHandler);
    }
  }

  /** Broadcast a dispatch event to the platform. */
  broadcast(event: DispatchEvent): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendRaw(event);
    } else {
      this.queue.push(event);
      this.postRest(event);
    }
    // Also broadcast via localStorage so the dispatcher dashboard (port 3000)
    // can receive responses even when the simulation engine is offline.
    if (typeof localStorage !== "undefined") {
      try { localStorage.setItem("apex_dispatch_response", JSON.stringify(event)); } catch { /* noop */ }
    }
  }

  private sendRaw(event: DispatchEvent): void {
    try {
      this.ws?.send(JSON.stringify(event));
    } catch {
      this.queue.push(event);
    }
  }

  /** REST fallback (fire-and-forget). */
  private postRest(event: DispatchEvent): void {
    if (typeof fetch === "undefined") return;
    fetch(REST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    }).catch(() => { /* Server may not be running — silently ignore. */ });
    // Also POST to the relay endpoint so the dispatcher can poll for responses.
    fetch(REST_RELAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    }).catch(() => {});
  }

  /** REST polling fallback: checks for new DISPATCH_OFFER events. */
  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      if (typeof fetch === "undefined") return;
      fetch(`${REST_EVENTS_URL}?since=${this.lastEventId}`)
        .then((res) => res.json())
        .then((data: { events: Array<{ id: number; data: string }>; latestId: number }) => {
          if (data.latestId > this.lastEventId) this.lastEventId = data.latestId;
          for (const evt of data.events) {
            try {
              const msg = JSON.parse(evt.data);
              if (msg.type === "DISPATCH_OFFER" && msg.data) {
                this.messageListeners.forEach((l) => l(msg.data as LoadOffer));
              }
            } catch { /* ignore */ }
          }
        })
        .catch(() => {});
    }, 3000);
  }

  onConnectionChange(listener: ConnectionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Register a listener for incoming DISPATCH_OFFER events. */
  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  private notify(connected: boolean): void {
    this.listeners.forEach((l) => l(connected));
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/** Singleton sync client instance. */
export const fleetSync = new FleetSyncClient();
