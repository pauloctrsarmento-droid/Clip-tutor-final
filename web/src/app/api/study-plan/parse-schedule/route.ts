import { errorResponse } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";
import { callOpenAI } from "@/lib/openai";
import type { VisionContentPart } from "@/lib/openai";
import { STUDY_SUBJECTS } from "@/lib/constants";
import { supabaseAdmin } from "@/lib/supabase-server";

const SYSTEM_PROMPT = `You are an assistant that extracts study schedule entries from images or text.
The user will provide a photo of a handwritten schedule, a PDF, or text describing a study plan.

Extract each study block and return a JSON array. Each entry must have:
- plan_date: "YYYY-MM-DD"
- subject_code: one of ${JSON.stringify(STUDY_SUBJECTS)} or "PERSONAL" or "ART"
- title: short description of what to study
- topic_hints: array of topic names/numbers mentioned (e.g. ["topic 3", "forces and motion", "stoichiometry"]). Extract as many as you can see.
- planned_hours: number (decimal ok, e.g. 1.5)
- study_type: "study" | "practice" | "exam" | "final_prep" | "mixed"
- start_time: "HH:MM" (24h format) if visible, otherwise omit
- end_time: "HH:MM" (24h format) if visible, otherwise omit

Subject code mapping:
- Chemistry / Chem / Quim → "0620"
- Physics / Phys / Fís → "0625"
- Biology / Bio → "0610"
- Computer Science / CS / ICT → "0478"
- French / Francês → "0520"
- Portuguese / Port → "0504"
- English Language / Eng Lang → "0500"
- English Literature / Eng Lit → "0475"
- Art / Arte → "ART"
- Personal / Pessoal / Free / Livre → "PERSONAL"

If the schedule mentions a date range (e.g. "week of April 14"), expand to individual days.
If only day names (Mon, Tue...) are given without dates, use the current or next week starting from the context_date provided.
Default study_type to "study" unless it says practice/exam/revision.
Return ONLY a valid JSON object: { "entries": [...], "notes": "any observations" }`;

interface ParsedEntry {
  plan_date: string;
  subject_code: string;
  title: string;
  topic_hints?: string[];
  planned_hours: number;
  study_type: string;
  start_time?: string;
  end_time?: string;
}

interface TopicRow {
  id: string;
  topic_code: string;
  topic_name: string;
  subject_id: string;
}

interface SubjectRow {
  id: string;
  code: string;
}

/** Match topic hints from AI against actual syllabus topics */
async function resolveTopicIds(
  entries: ParsedEntry[]
): Promise<Array<ParsedEntry & { syllabus_topic_ids: string[] }>> {
  // Get unique subject codes (excluding non-study)
  const subjectCodes = [...new Set(
    entries.map((e) => e.subject_code).filter((c) => c !== "ART" && c !== "PERSONAL")
  )];

  if (subjectCodes.length === 0) {
    return entries.map((e) => ({ ...e, syllabus_topic_ids: [] }));
  }

  // Fetch subjects
  const { data: subjects } = await supabaseAdmin
    .from("subjects")
    .select("id, code")
    .in("code", subjectCodes);

  if (!subjects?.length) {
    return entries.map((e) => ({ ...e, syllabus_topic_ids: [] }));
  }

  const subjectIdByCode = new Map(
    (subjects as SubjectRow[]).map((s) => [s.code, s.id])
  );

  // Fetch all topics for these subjects
  const subjectIds = subjects.map((s) => (s as SubjectRow).id);
  const { data: topics } = await supabaseAdmin
    .from("syllabus_topics")
    .select("id, topic_code, topic_name, subject_id")
    .in("subject_id", subjectIds);

  if (!topics?.length) {
    return entries.map((e) => ({ ...e, syllabus_topic_ids: [] }));
  }

  // Group topics by subject_id
  const topicsBySubject = new Map<string, TopicRow[]>();
  for (const t of topics as TopicRow[]) {
    const existing = topicsBySubject.get(t.subject_id) ?? [];
    existing.push(t);
    topicsBySubject.set(t.subject_id, existing);
  }

  return entries.map((entry) => {
    const hints = entry.topic_hints ?? [];
    if (hints.length === 0 || entry.subject_code === "ART" || entry.subject_code === "PERSONAL") {
      return { ...entry, syllabus_topic_ids: [] };
    }

    const subjectId = subjectIdByCode.get(entry.subject_code);
    if (!subjectId) return { ...entry, syllabus_topic_ids: [] };

    const subjectTopics = topicsBySubject.get(subjectId) ?? [];
    const matchedIds: string[] = [];

    for (const hint of hints) {
      const lower = hint.toLowerCase().trim();

      // Try matching by topic number (e.g. "topic 3", "T3", "3")
      const numMatch = lower.match(/(?:topic\s*|t)(\d+)/);
      if (numMatch) {
        const num = numMatch[1];
        const found = subjectTopics.find(
          (t) => t.topic_code === `T${num}` || t.topic_code === num || t.topic_code.endsWith(`.${num}`)
        );
        if (found && !matchedIds.includes(found.id)) {
          matchedIds.push(found.id);
          continue;
        }
      }

      // Try matching by name substring
      const found = subjectTopics.find(
        (t) => t.topic_name.toLowerCase().includes(lower) || lower.includes(t.topic_name.toLowerCase())
      );
      if (found && !matchedIds.includes(found.id)) {
        matchedIds.push(found.id);
      }
    }

    return { ...entry, syllabus_topic_ids: matchedIds };
  });
}

export async function POST(request: Request) {
  try {
    verifyPin(request);

    const contentType = request.headers.get("content-type") ?? "";

    let userContent: string | VisionContentPart[];
    let contextDate: string;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      contextDate = (formData.get("context_date") as string) ?? new Date().toISOString().split("T")[0];

      if (!file) {
        return Response.json({ error: "No file provided", code: "VALIDATION_ERROR" }, { status: 400 });
      }

      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      const mimeType = file.type || "image/png";
      const isPdf = mimeType === "application/pdf" || file.name.endsWith(".pdf");

      const filePart: VisionContentPart = isPdf
        ? { type: "file", file: { filename: file.name, file_data: `data:${mimeType};base64,${base64}` } }
        : { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } };

      userContent = [
        { type: "text", text: `Context date (today): ${contextDate}. Extract all study blocks from this schedule.` },
        filePart,
      ];
    } else {
      const body = await request.json();
      contextDate = body.context_date ?? new Date().toISOString().split("T")[0];
      const text = body.text as string;

      if (!text) {
        return Response.json({ error: "No text or file provided", code: "VALIDATION_ERROR" }, { status: 400 });
      }

      userContent = `Context date (today): ${contextDate}. Extract all study blocks from this schedule:\n\n${text}`;
    }

    const raw = await callOpenAI({
      system: SYSTEM_PROMPT,
      user: userContent,
      jsonMode: true,
      maxTokens: 4096,
    });

    const parsed = JSON.parse(raw) as { entries: ParsedEntry[]; notes?: string };

    // Resolve topic hints to actual syllabus_topic_ids
    const enriched = await resolveTopicIds(parsed.entries);

    return Response.json({ entries: enriched, notes: parsed.notes });
  } catch (error) {
    return errorResponse(error);
  }
}
