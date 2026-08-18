/**
 * Exercise 3, Step 4 — Entry point. Runs the full batch pipeline against the
 * mock batch client (see mockBatchClient.mjs's docstring for why: no real
 * cost, no real 24h wait, fully deterministic thanks to the seeded document
 * generator) and prints the report.
 *
 * Usage: node batchRunner.mjs
 */

import { generateBatchDocuments } from "./batchDocuments.mjs";
import { createMockBatchClient } from "./mockBatchClient.mjs";
import { SimulatedClock } from "./simulatedClock.mjs";
import { runBatchPipeline, printReport } from "./batchPipeline.mjs";

async function main() {
    const documents = generateBatchDocuments();
    const clock = new SimulatedClock();
    const client = createMockBatchClient(documents, clock);

    const result = await runBatchPipeline(client, clock, documents);
    printReport(result);
}

main().catch((err) => {
    console.error("Batch pipeline run failed:", err);
    process.exit(1);
});
