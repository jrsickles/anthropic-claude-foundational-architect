/**
 * Exercise 3, Step 4 — SLA accounting.
 *
 * Important framing: the Messages Batches API's own guarantee is completion
 * within 24 hours, not any shorter window. If a business SLA is tighter than
 * that (ours is 4 hours), the SLA is really a promise about the PIPELINE's
 * design, not about the Batches API alone — which is why the pipeline has to
 * make an explicit decision before each round about whether another batch
 * round-trip still fits the remaining budget, or whether it's safer to fall
 * back to the (more expensive, but fast) synchronous Messages API instead.
 */

export const SLA_MS = 4 * 60 * 60 * 1000; // 4 hours, per project decision

export function elapsedMs(startIso, endIso) {
    return new Date(endIso).getTime() - new Date(startIso).getTime();
}

export function formatDuration(ms) {
    const totalMinutes = Math.round(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
}

/**
 * @param {Array<{label: string, startIso: string, endIso: string}>} rounds
 *   Sequential processing rounds (round 2 can't start before round 1 ends).
 * @returns {{
 *   totalMs: number,
 *   withinSla: boolean,
 *   marginMs: number,     // positive = time to spare, negative = overage
 *   perRound: Array<{label: string, ms: number}>
 * }}
 */
export function evaluateSla(rounds) {
    const overallStart = rounds[0].startIso;
    const overallEnd = rounds[rounds.length - 1].endIso;
    const totalMs = elapsedMs(overallStart, overallEnd);

    return {
        totalMs,
        withinSla: totalMs <= SLA_MS,
        marginMs: SLA_MS - totalMs,
        perRound: rounds.map((r) => ({ label: r.label, ms: elapsedMs(r.startIso, r.endIso) }))
    };
}
