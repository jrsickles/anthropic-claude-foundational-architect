---
paths: ["src/api/**/*"]
---

# API Conventions

- All API endpoints return JSON with a consistent envelope:
  `{ "data": ..., "error": null }` on success, `{ "data": null, "error": { "code": ..., "message": ... } }` on failure.
- Use HTTP status codes correctly — 4xx for client errors, 5xx for server errors.
  Never return 200 with an error payload.
- Validate all incoming request data at the controller boundary before it
  reaches business logic. Use a dedicated request validator class.
- Version breaking changes via URL prefix (`/api/v2/...`), never silently
  change an existing endpoint's contract.
- Rate-limit any endpoint that writes data.
- Never log full request bodies for endpoints that accept credentials or PII.
