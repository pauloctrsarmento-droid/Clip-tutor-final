---
globs: ["**/backend/**", "**/api/**", "**/server/**"]
---

# Backend Rules

## Route Handlers
- Validate ALL input with zod on every route — no exceptions
- Thin route handlers: parse input → call service → return response
- Business logic lives in services, not route handlers
- Return consistent error shapes: `{ error: string, code: string, details?: unknown }`

## Error Handling
- Use custom error classes (e.g., `NotFoundError`, `ValidationError`, `AuthorizationError`)
- Map error classes to HTTP status codes in a centralized error handler
- Never expose stack traces or internal details in API responses
- Log errors with structured context (requestId, userId, endpoint)

## Environment & Config
- Validate ALL env vars at startup with zod — fail fast on missing config
- Use a typed config object, never raw `process.env` in business logic
- Separate config by concern (database, auth, external services)

## Security
- Authenticate before authorize before execute
- Rate limit public endpoints
- Sanitize user input — never trust client data
- Use parameterized queries — never string interpolation in SQL

## Architecture
- Repository pattern for data access
- Service layer for business logic
- Dependency injection over hard imports for testability
- Keep modules loosely coupled with clear interfaces
