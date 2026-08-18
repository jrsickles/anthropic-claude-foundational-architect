/**
 * Exercise 3, Step 2 — JSON Schema validator.
 *
 * We validate the model's tool_use.input against the SAME schema we sent
 * as the tool definition. This matters: tool_use guarantees the model calls
 * the tool with *some* arguments, but it is still just an LLM generating
 * JSON — it can violate enums, minimum/maximum, or the if/then defect_detail
 * rule. The API does not enforce your schema for you at generation time
 * (there's no server-side JSON Schema validation on tool inputs), so client-side
 * validation is not optional if you actually need the constraints to hold.
 *
 * Needs: npm install ajv
 */

import Ajv from "ajv";

const ajv = new Ajv({ allErrors: true, strict: false });

/**
 * @param {object} schema - the tool's input_schema
 * @param {object} data - the tool_use.input returned by the model
 * @returns {{ valid: boolean, errors: Array<{path: string, message: string, keyword: string}> }}
 */
export function validateExtraction(schema, data) {
    const validateFn = ajv.compile(schema);
    const valid = validateFn(data);

    if (valid) {
        return { valid: true, errors: [] };
    }

    const errors = (validateFn.errors || []).map((e) => ({
        path: e.instancePath || "(root)",
        message: e.message,
        keyword: e.keyword,
        params: e.params
    }));

    return { valid: false, errors };
}
