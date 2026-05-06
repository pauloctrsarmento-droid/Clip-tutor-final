You are linking IGCSE quiz questions to atomic facts that they test.

CONTEXT:
- Subject: {{subject_name}}
- Topic: {{topic_code}} — {{topic_name}}

CANDIDATE FACTS ({{n_facts}} total):
{{#each candidate_facts}}
- {{id}}: {{fact_text}}
{{/each}}

QUESTIONS TO LINK ({{n_questions}}):
{{#each questions}}
[Q{{i}}] id={{id}}  marks={{marks}}  type={{response_type}}
prompt: {{prompt_text}}
{{#if parent_context}}context: {{parent_context}}{{/if}}
{{#if mark_scheme}}mark scheme: {{mark_scheme}}{{/if}}
---
{{/each}}

Return ONE JSON object with this exact top-level shape (C6 — wrapped to remove ambiguity):
{
  "results": [
    {
      "question_id": "...",
      "proposed_facts": [
        { "fact_id": "FACT_ID", "rationale": "one short sentence — WHY this fact is necessary to answer the question correctly" }
      ],
      "new_facts_proposed": [
        { "proposed_id": "{{topic_code}}_GEN_F01", "fact_text": "...", "flashcard_front": "...", "rationale": "why no existing fact covers what this question tests" }
      ]
    }
    // ... one entry per input question, in the same order
  ]
}

STRICT RULES:
- A fact only counts if knowing it is **necessary** to answer the question correctly. "Topically related" is NOT enough.
- No upper limit on `proposed_facts` length — link every necessary fact, including all of them for multi-mark questions.
- If nothing in the candidates fits, populate `new_facts_proposed`. Never leave both `proposed_facts` and `new_facts_proposed` empty.
- Do NOT invent fact_ids that aren't in the candidate list (use `new_facts_proposed` if you need a new one).
- Output MUST be a single JSON object with key `results`. NOT a bare array. NOT multiple JSON objects concatenated. NO prose.
- Inner field names (`proposed_facts`, `new_facts_proposed`) match the DB columns in `linkage_proposals` for verbatim persistence.
