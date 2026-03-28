# CLAUDE.md

## Project
IGCSE Tutor for Luísa — exam practice platform for Cambridge IGCSE June 2026.
Student at CLIP Porto, 8 subjects: Chemistry, Physics, Biology, CS, English Language, French, English Literature, Portuguese.

### Current State: Data Pipeline COMPLETE → Ready for App Build
- **287 papers** parsed across 8 subjects (2019-2025)
- **8,063 question leaves**, 100% MS match, 0 orphans, 0 dupes
- **1,714 diagram PNGs** extracted with caption naming
- Topic classification done for Chemistry + Physics (AI + keyword)
- Next step: **build the tutor app** (Next.js + Fastify + Supabase)

## Data Pipeline Architecture

### MS-First Extraction (`scripts/paper-parser/`)
The Mark Scheme drives question structure. The Question Paper provides content.
```
parse_ms(ms.pdf) → definitive question IDs + answers + marks
scan_qp_markers(qp.pdf) → word-level content extraction (get_text("words"))
merge() → direct match by canonical ID (zero fuzzy matching)
```

Key files:
- `parse_questions.py` — QP parser with word-level marker scanning
- `parse_markscheme.py` — MS table parser (rotated + normal layouts)
- `merge.py` — MS-first merge (no diagram linking — resolved at runtime)
- `canonical.py` — QuestionID dataclass for exact ID matching
- `extract_diagrams.py` — PyMuPDF cluster detection + caption naming
- `run_all.py` — batch runner for all 8 subjects
- `verify.py` — 4-part verification (MS integrity, diagrams, topics, facts)
- `topic_prompts.py` — AI disambiguation prompts for Chemistry + Physics

### Data Layout
```
data/extracted/{code}/{subject}_all.json    # 8,063 leaves (current)
data/extracted/{code}/{subject}_verified.json  # with topics (from earlier pipeline)
data/diagrams/{paper_id}/fig_3_1.png        # 1,714 PNGs by caption
data/diagrams/{paper_id}/unknown_page5_y230.png  # uncaptioned diagrams
```

### Diagram Resolution (Runtime)
No diagram_path in question JSON. Frontend resolves at runtime:
- Question text mentions "Fig. 3.1" → load `data/diagrams/{paper_id}/fig_3_1.png`
- paper_id format: `0620_s23_41` (code_session_variant)

### Stats
| Subject | Papers | Leaves | MS Match | Diagrams (captioned) |
|---------|--------|--------|----------|---------------------|
| Chemistry (0620) | 49 | 2,380 | 100% | 134 |
| Physics (0625) | 49 | 1,923 | 100% | 511 |
| Biology (0610) | 46 | 1,535 | 100% | 463 |
| CS (0478) | 27 | 626 | 100% | 0 (no Fig. refs) |
| English Lang (0500) | 27 | 295 | 100% | — |
| French (0520) | 40 | 1,037 | 100% | — |
| English Lit (0475) | 35 | 153 | 100% | — |
| Portuguese (0504) | 14 | 114 | 100% | — |

## Stack & Preferences
- **Language**: TypeScript strict mode (`strict: true` in tsconfig). NEVER use `any`.
- **Modules**: ES modules only (`import`/`export`), never CommonJS
- **Frontend**: Next.js App Router + React 19 + Tailwind CSS + shadcn/ui
- **Backend**: Fastify (or Next.js API routes)
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **Validation**: zod for all runtime validation
- **Package manager**: pnpm (never npm or yarn)
- **Logging**: Use project logger — NEVER `console.log`
- **Python pipeline**: PyMuPDF (fitz) for PDF parsing, no AI costs for extraction

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
8. NEVER alter the Python pipeline without running `run_all.py` to verify 0 orphans

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
- Pipeline stats: 287 papers, 8,063 leaves, 100% match, 0 orphans
