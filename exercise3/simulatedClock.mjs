/**
 * Exercise 3, Step 4 — A simulated clock for the batch pipeline demo.
 *
 * We do NOT want a test of "does the SLA math work" to actually take 4 real
 * hours. In production, batch timing comes from the API's own `created_at`
 * / `ended_at` timestamps on the batch object, not from how long your poll
 * loop happened to run — so we simulate exactly that: a clock that starts
 * at the real current time and is advanced by explicit amounts to represent
 * "this much time passed while the batch was processing," without any real
 * waiting. All SLA/timing code downstream reads timestamps the same way it
 * would against the real API; only the passage of time itself is faked.
 */

export class SimulatedClock {
    constructor(startMs = Date.now()) {
        this.ms = startMs;
    }

    now() {
        return this.ms;
    }

    nowIso() {
        return new Date(this.ms).toISOString();
    }

    advanceMinutes(minutes) {
        this.ms += minutes * 60_000;
        return this.ms;
    }

    advanceMs(ms) {
        this.ms += ms;
        return this.ms;
    }
}
