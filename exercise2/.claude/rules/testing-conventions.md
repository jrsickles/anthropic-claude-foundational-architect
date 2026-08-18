---
paths: ["**/*.test.*"]
---

# Testing Conventions

- One logical assertion focus per test — split unrelated assertions into
  separate test methods.
- Test names describe behavior, not implementation:
  `test_rejects_expired_token`, not `test_checkExpiry_returns_false`.
- Arrange/Act/Assert structure, with blank lines separating the three
  sections for readability.
- No sleep()/timing-based waits in tests — use fakes or mocked clocks.
- Every bug fix must ship with a regression test that fails without the fix.
- Do not assert against live external services; stub or mock the boundary.
