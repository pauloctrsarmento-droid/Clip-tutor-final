---
name: debug-detective
description: "Systematically debugs issues: reproduce, read error, hypothesis, targeted logging, test, fix, verify, regression test."
user_invocable: true
---

# Debug Detective

Systematic debugging — no guessing, no shotgun fixes.

## Process

1. **Reproduce**: Understand and reproduce the issue. Get the exact error message, stack trace, or unexpected behavior.

2. **Read**: Read the error carefully. Trace the stack to the origin. Read the relevant source code.

3. **Hypothesize**: Form 1-3 hypotheses ranked by likelihood. State them explicitly.

4. **Investigate**: For each hypothesis (most likely first):
   - Read the relevant code paths
   - Check recent changes with `git log --oneline -10 -- <file>`
   - Look for similar patterns elsewhere in the codebase
   - Add targeted, temporary logging if needed (remove after)

5. **Root cause**: Identify the root cause, not just the symptom. Explain WHY the bug exists.

6. **Fix**: Implement the minimal fix that addresses the root cause.

7. **Verify**:
   - Run the reproduction case — confirm it passes
   - Run related tests — confirm no regressions
   - Run full test suite

8. **Regression test**: Write a test that would have caught this bug.

## Rules
- Never apply a fix you can't explain
- Never suppress errors to "fix" them
- If the fix is in a dependency, document it and find a workaround
- Remove all temporary logging before committing
