import { Injectable } from '@nestjs/common';
import type { PunchKind } from '@vo/shared';
import { EventEmitter } from 'node:events';

/** Things other modules (presence today, notifications later) want to react to. In-process only. */
export interface DomainEventMap {
  /** a punch was recorded for someone (web clock, biometric device, HR or auto clock-out). Device punches have no kind. */
  punch: { userId: string; kind: PunchKind | null; punchedAt: Date };
  /** one or more of a person's sessions were ended (logout, force-logout, password change, deactivation) */
  sessionsEnded: { userId: string };
  /** a person's profile, role, department or status changed */
  userChanged: { userId: string };
}

@Injectable()
export class DomainEvents {
  private readonly bus = new EventEmitter().setMaxListeners(50);

  emit<K extends keyof DomainEventMap>(name: K, payload: DomainEventMap[K]): void {
    // listeners must never break the request that triggered the event
    for (const l of this.bus.listeners(name)) {
      try {
        const r = (l as (p: DomainEventMap[K]) => unknown)(payload);
        if (r instanceof Promise) r.catch((e) => console.error(`[events] ${name} listener failed`, e));
      } catch (e) {
        console.error(`[events] ${name} listener failed`, e);
      }
    }
  }

  on<K extends keyof DomainEventMap>(name: K, listener: (p: DomainEventMap[K]) => unknown): () => void {
    this.bus.on(name, listener);
    return () => this.bus.off(name, listener);
  }
}
