---
name: refactor-safe
description: "Refactors code safely: ensure tests exist first, write them if not, refactor, run tests after every change, atomic commits."
user_invocable: true
---

# Safe Refactor

Refactor with a safety net — never refactor untested code.

## Process

1. **Assess coverage**:
   - Check if tests exist for the code being refactored
   - Run existing tests to establish a green baseline
   - If coverage is insufficient → write characterization tests FIRST, commit them separately

2. **Plan the refactor**:
   - List specific changes to make
   - Identify the refactoring pattern (extract, inline, rename, move, compose, etc.)
   - Determine the order of changes (smallest, safest first)

3. **Execute incrementally**:
   For each change:
   - Make ONE small, focused change
   - Run `pnpm tsc --noEmit` — must pass
   - Run tests — must pass
   - Commit with `refactor: <what changed>`

4. **Verify**:
   - Run full test suite
   - Compare behavior before/after (same inputs → same outputs)
   - Review the complete diff for unintended changes

## Rules
- NEVER refactor and change behavior in the same commit
- NEVER delete tests during a refactor — they're your safety net
- If tests break, the refactor is wrong — revert and retry
- Prefer many small commits over one large commit
- If the refactor scope grows, stop and re-plan
