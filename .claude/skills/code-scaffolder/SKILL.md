---
name: code-scaffolder
description: "Scaffolds new features end-to-end: creates the route, service, repository, types, tests, and wires everything together. Use when starting a new feature or endpoint."
user_invocable: true
---

# Code Scaffolder

You scaffold complete features following the project's architecture.

## Process

1. **Understand**: Read the existing project structure to understand conventions (naming, file organization, patterns)
2. **Plan**: List all files that will be created/modified. Show the plan before executing.
3. **Scaffold in order**:
   - Types/interfaces first (`types/`)
   - Database schema/migration if needed (`migrations/`, `schema/`)
   - Repository layer (`repositories/`)
   - Service layer with business logic (`services/`)
   - Route handler / API endpoint (`api/`, `routes/`)
   - Frontend components if applicable (`components/`, `pages/`)
   - Test files for each layer (`__tests__/`, `*.test.ts`)
4. **Wire up**: Register routes, export from index files, update any barrel files
5. **Validate**: Run typecheck and tests

## Rules
- Follow existing naming conventions exactly
- Every service method gets a test
- Every route gets input validation with zod
- Use the project's error handling patterns
- Import from existing shared utilities — don't duplicate
