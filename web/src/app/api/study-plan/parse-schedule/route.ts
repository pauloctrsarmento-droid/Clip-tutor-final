import { errorResponse } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";
import { callOpenAI } from "@/lib/openai";
import type { VisionContentPart } from "@/lib/openai";
import { STUDY_SUBJECTS } from "@/lib/constants";

const SYSTEM_PROMPT = `You are an assistant that extracts study schedule entries from images or text.
The user will provide a photo of a handwritten schedule, a PDF, or text describing a study plan.

Extract each study block and return a JSON array. Each entry must have:
- plan_date: "YYYY-MM-DD"
- subject_code: one of ${JSON.stringify(STUDY_SUBJECTS)} or "PERSONAL" or "ART"
- title: short description of what to study
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

      userContent = [
        { type: "text", text: `Context date (today): ${contextDate}. Extract all study blocks from this schedule image.` },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } },
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

    const parsed = JSON.parse(raw) as { entries: unknown[]; notes?: string };
    return Response.json(parsed);
  } catch (error) {
    return errorResponse(error);
  }
}
