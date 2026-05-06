You are auditing an AI's question-fact linking proposals. Be skeptical.

QUESTION:
id={{question.id}}  marks={{question.marks}}
prompt: {{question.prompt_text}}
{{#if mark_scheme}}mark scheme: {{mark_scheme}}{{/if}}

CANDIDATE FACTS:
{{candidate_facts_listing}}

SONNET PROPOSED:
proposed_facts: {{sonnet.proposed_facts}}
new_facts_proposed: {{sonnet.new_facts_proposed}}

For each entry in `proposed_facts`, decide:
- KEEP if the fact is genuinely necessary to answer correctly.
- REMOVE if it's only topically related, not tested.
- ADD missing facts that Sonnet overlooked (only from the candidate list).

For each entry in `new_facts_proposed`, decide:
- APPROVE if no existing candidate fact covers what the question tests, AND the new fact is well-formed (single concept, ≤2 sentences, IGCSE-appropriate).
- REJECT if an existing candidate already covers it (state which fact_id covers it).
- REWRITE the proposed_id, fact_text, or flashcard_front if it can be salvaged with edits.

Return a single JSON object:
{
  "approved_facts": [{ "fact_id": "...", "rationale": "..." }],
  "new_facts_approved": [{ "proposed_id": "...", "fact_text": "...", "flashcard_front": "...", "rationale": "..." }],
  "rejection_notes": "free text — why anything was removed/rejected",
  "agreement_signal": "high" | "medium" | "low"
}

`agreement_signal` is the reviewer's overall trust in Sonnet's pass for this question — `low` means the orchestrator should flag the chunk for human review. Use `low` whenever you remove >50% of Sonnet's proposed facts AND add nothing.

STRICT RULES:
- approved_facts MAY be empty ONLY if new_facts_approved has entries (never both empty).
- Use "necessary to answer correctly" as the bar — not "related".
- Output ONLY JSON (single object). No prose. No wrapping array.

Field names `approved_facts`, `new_facts_approved`, and `agreement_signal` match the `linkage_proposals` columns for verbatim persistence (the orchestrator stores each into the corresponding column when applying).
