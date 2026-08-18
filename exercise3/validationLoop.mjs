/**
 * Exercise 3, Step 2 — Validation-retry loop.
 *
 * Strategy:
 *   1. Extract. Validate against the JSON Schema.
 *   2. If invalid, send a followup turn containing: the original document,
 *      the failed JSON, and the specific validation errors. Ask the model
 *      to correct ONLY what's wrong, and to use null (where the schema
 *      allows it) instead of guessing if the source text doesn't support
 *      a valid value.
 *   3. Re-validate. Repeat up to maxRetries times.
 *   4. Classify: an error present on attempt N and ABSENT after the retry
 *      is "resolved_by_retry" (proves it was a format mistake). An error
 *      still present (on the same instancePath) after retries are
 *      exhausted is "unresolved_likely_absent" (proves the model cannot
 *      manufacture the fact no matter how the error is explained to it).
 *
 * Needs: npm install ajv
 */

import { validateExtraction } from "./validator.mjs";

const DEFAULT_MAX_RETRIES = 2;

function formatErrorsForPrompt(errors) {
    return errors
        .map((e) => `- field "${e.path || "(root)"}": ${e.message} (rule: ${e.keyword})`)
        .join("\n");
}

/**
 * @param {Anthropic} client
 * @param {object} tool - the tool definition (name + input_schema)
 * @param {string} documentText - the source document being extracted from
 * @param {object} opts
 * @returns {{
 *   success: boolean,
 *   data: object|null,
 *   attempts: number,
 *   resolvedErrors: Array,   // errors from earlier attempts that a later attempt fixed
 *   unresolvedErrors: Array, // errors still present when retries were exhausted
 *   history: Array           // full attempt-by-attempt record, for audit/debugging
 * }}
 */
export async function extractWithValidation(client, tool, documentText, opts = {}) {
    const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    const model = opts.model ?? "claude-sonnet-4-5";

    const messages = [
        {
            role: "user",
            content: `Extract structured data from this product review:\n\n${documentText}`
        }
    ];

    const history = [];
    let resolvedErrors = [];
    let lastErrors = [];
    let lastData = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        const response = await client.messages.create({
            model,
            max_tokens: 1024,
            tools: [tool],
            tool_choice: { type: "tool", name: tool.name },
            messages
        });

        const toolUseBlock = response.content.find((b) => b.type === "tool_use");
        const data = toolUseBlock ? toolUseBlock.input : null;
        const { valid, errors } = validateExtraction(tool.input_schema, data);

        history.push({ attempt, data, valid, errors });

        // Any error present last attempt but gone now was fixable by retry —
        // i.e. it really was a format mistake, not missing information.
        if (attempt > 1 && lastErrors.length) {
            const stillPresentPaths = new Set(errors.map((e) => e.path));
            const nowFixed = lastErrors.filter((e) => !stillPresentPaths.has(e.path));
            resolvedErrors.push(...nowFixed.map((e) => ({ ...e, resolvedOnAttempt: attempt })));
        }

        if (valid) {
            return {
                success: true,
                data,
                attempts: attempt,
                resolvedErrors,
                unresolvedErrors: [],
                history
            };
        }

        lastErrors = errors;
        lastData = data;

        if (attempt <= maxRetries) {
            // Feed the model back its own failure: the doc, what it produced,
            // and precisely what's wrong with it.
            messages.push({
                role: "assistant",
                content: response.content
            });
            messages.push({
                role: "user",
                content: [
                    {
                        type: "tool_result",
                        tool_use_id: toolUseBlock.id,
                        content:
                            `Validation failed:\n${formatErrorsForPrompt(errors)}\n\n` +
                            `Correct ONLY the fields listed above. If the source document does not ` +
                            `contain information that would let you fix a field validly, and the ` +
                            `schema allows null for that field, use null rather than guessing a value. ` +
                            `Do not change fields that were not flagged as errors.`
                    }
                ]
            });
        }
    }

    // Retries exhausted and still invalid: whatever errors remain are ones
    // the model could not resolve even when told exactly what was wrong —
    // the practical signal that the source document lacks the information.
    return {
        success: false,
        data: lastData,
        attempts: maxRetries + 1,
        resolvedErrors,
        unresolvedErrors: lastErrors.map((e) => ({ ...e, reason: "information_absent_from_source" })),
        history
    };
}
