// The event bus. All sensors publish here; the brain, db, outputs, and dashboard
// SSE subscribe. A typed EventEmitter — designed so actuators can subscribe later
// with zero changes to any sensor.

import { EventEmitter } from "node:events";
import type { NormalizedEvent } from "./event.js";

/** The single channel every NormalizedEvent flows through. */
export const MORT_EVENT = "mort:event" as const;

type BusEvents = {
  [MORT_EVENT]: [NormalizedEvent];
};

class MortBus extends EventEmitter<BusEvents> {
  /** Sensors call this to put a validated event on the bus. */
  publish(event: NormalizedEvent): void {
    this.emit(MORT_EVENT, event);
  }

  /** Subscribe to every event. Returns an unsubscribe function. */
  subscribe(listener: (event: NormalizedEvent) => void): () => void {
    this.on(MORT_EVENT, listener);
    return () => {
      this.off(MORT_EVENT, listener);
    };
  }
}

export const bus = new MortBus();
export type { MortBus };
