import { EventEmitter } from "events";

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }
}

const globalForBus = globalThis as unknown as { __eventBus?: EventBus };

export const eventBus =
  globalForBus.__eventBus ?? (globalForBus.__eventBus = new EventBus());
