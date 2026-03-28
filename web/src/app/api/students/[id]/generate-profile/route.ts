import { errorResponse } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";
import { callOpenAI } from "@/lib/openai";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyPin(request);
    await params;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    // Read PDF as base64 for OpenAI
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    const system = `You are an educational psychologist expert. Analyze the psychometric assessment report provided and generate a detailed learning profile for an AI tutor system.

The profile MUST include these sections:
1. COGNITIVE STRENGTHS — list each tested aptitude with percentile and practical teaching implications
2. COGNITIVE AREAS TO SUPPORT — areas below average that need extra scaffolding
3. MEMORY PROFILE — visual, auditory, reading effectiveness with specific teaching strategies for each
4. PERSONALITY TRAITS — relevant to teaching: confidence, frustration tolerance, motivation patterns, impulsivity, creativity
5. STUDY SESSION STRUCTURE — optimal block length, best methods, worst methods, motivation strategies

Format the output as a structured text block that can be injected into an AI tutor's system prompt. Use → arrows for actionable recommendations. Be specific and practical, not generic.

The student is a 15-year-old girl preparing for Cambridge IGCSE exams.`;

    const profile = await callOpenAI({
      system,
      user: `Analyze this psychometric assessment report (PDF in base64):\n\n${base64.slice(0, 50000)}`,
      maxTokens: 4096,
    });

    return Response.json({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}
