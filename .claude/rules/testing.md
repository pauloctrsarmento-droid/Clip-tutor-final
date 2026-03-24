---
globs: ["**/*.test.*", "**/*.spec.*", "**/tests/**", "**/__tests__/**"]
---

# Testing Rules

## Framework
- Use Vitest for all tests
- Use `@testing-library/react` for component tests
- Use `msw` (Mock Service Worker) for API mocking in integration tests

## Test Structure
- Descriptive test names: `it("should return 404 when user does not exist")`
- Arrange → Act → Assert pattern
- One assertion per concept (multiple `expect` is fine if testing one behavior)
- Group related tests with `describe` blocks

## Mocking
- Mock external services (APIs, databases, file system) — never make real calls
- Prefer dependency injection over module mocking
- Reset mocks between tests (`afterEach`)
- Never mock what you don't own — wrap external deps and mock the wrapper

## Coverage
- Target >80% coverage on service/business logic
- Don't chase 100% — focus on behavior, not lines
- Every bug fix must include a regression test
- Test edge cases: empty inputs, nulls, boundary values, error paths

## Anti-patterns to Avoid
- No `test("works")` — be specific about what works
- No testing implementation details — test behavior
- No shared mutable state between tests
- No `sleep`/`setTimeout` in tests — use proper async utilities
