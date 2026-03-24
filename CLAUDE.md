# CLAUDE.md

## Project
TBD — will be defined in conversation.

## Stack & Preferences
- **Language**: TypeScript strict mode (`strict: true` in tsconfig). NEVER use `any`.
- **Modules**: ES modules only (`import`/`export`), never CommonJS
- **Frontend**: Functional React with hooks, Tailwind CSS only (no CSS modules, no styled-components)
- **Validation**: zod for all runtime validation
- **Package manager**: pnpm (never npm or yarn)
- **Logging**: Use project logger — NEVER `console.log`

## Commit Convention
Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
Keep commits atomic — one logical change per commit.

## Hard Rules
1. MUST run `pnpm tsc --noEmit` after any TS change — do not consider done until it passes
2. MUST run tests before considering any task done
3. NEVER commit `.env`, secrets, API keys, or credentials
4. NEVER add dependencies without asking first
5. NEVER use `console.log` — use the project logger
6. NEVER use `any` type — use `unknown` + type narrowing if needed
7. NEVER leave TODO/FIXME without a linked issue or explanation

## Code Style
- Meaningful variable/function names — no abbreviations except well-known ones (id, url, etc.)
- Comments explain "why", not "what"
- Prefer `const` over `let`, never `var`
- Prefer early returns over nested conditionals
- Destructure where it improves readability
- One component per file, file name matches export

## Error Handling
- Use custom error classes, not generic `Error`
- Always handle promise rejections
- Validate at system boundaries (API input, env vars, external data)

## Compact Instructions
When compacting conversation context, ALWAYS preserve:
- List of files modified in current session
- Test results (pass/fail with counts)
- Active bugs or issues being investigated
- Current task progress and remaining steps
