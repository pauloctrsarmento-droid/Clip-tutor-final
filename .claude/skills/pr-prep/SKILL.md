---
name: pr-prep
description: "Prepares a clean PR: runs typecheck, tests, lint, generates a PR description with what changed and why. Use before pushing."
user_invocable: true
---

# PR Prep

Prepare the current branch for a clean pull request.

## Process

1. **Check state**:
   - `git status` — ensure no untracked files that should be committed
   - `git diff main...HEAD` — review all changes since branching

2. **Quality gates** (stop on failure):
   - `pnpm tsc --noEmit` — typecheck must pass
   - `pnpm test` — all tests must pass
   - `pnpm lint` — no lint errors (warnings OK)

3. **Analyze changes**:
   - Read all modified/added files
   - Categorize: feature, bugfix, refactor, etc.
   - Identify breaking changes
   - Note any migration or env var changes

4. **Generate PR description**:
   ```
   ## Summary
   <what changed and why, 2-4 bullets>

   ## Changes
   <grouped list of modified files with one-line descriptions>

   ## Testing
   <what was tested, test results>

   ## Breaking Changes
   <if any, otherwise omit section>

   ## Checklist
   - [ ] Types pass
   - [ ] Tests pass
   - [ ] No console.log
   - [ ] No secrets committed
   ```

5. **Output**: Print the PR description ready to paste, and confirm all gates passed.
