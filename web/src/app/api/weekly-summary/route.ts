import { errorResponse } from "@/lib/errors";
import { callOpenAI } from "@/lib/openai";
import { getOverview, getSubjectMastery } from "@/lib/services/dashboard";
import { getWeekPlan, getExamCalendar } from "@/lib/services/study-plan";
import { STUDY_SUBJECTS } from "@/lib/constants";

export async function GET() {
  try {
    const [overview, subjects, weekPlan, exams] = await Promise.all([
      getOverview(),
      getSubjectMastery(),
      getWeekPlan(0),
      getExamCalendar(),
    ]);

    const activeSubjects = subjects.filter((s) =>
      STUDY_SUBJECTS.includes(s.subject_code)
    );

    const weekBlocks = weekPlan as Array<{
      subject_code: string;
      title: string;
      planned_hours: number;
      status: string;
    }>;

    const totalHours = weekBlocks.reduce((sum, b) => sum + b.planned_hours, 0);
    const doneBlocks = weekBlocks.filter((b) => b.status === "done").length;
    const nextExam = exams.find((e) => (e.days_remaining ?? 0) > 0);

    const weakest = activeSubjects
      .filter((s) => s.total_facts > 0)
      .sort((a, b) => a.mastery_percent - b.mastery_percent)
      .slice(0, 2);

    const prompt = `You are a friendly, encouraging study coach for Luísa, a 15-year-old girl preparing for Cambridge IGCSE exams.

Write a SHORT weekly study summary (3-5 sentences max). Be warm, motivating, and specific. Use simple English.

Data:
- Streak: ${overview.streak} days
- This week: ${weekBlocks.length} study blocks (${doneBlocks} done), ~${totalHours.toFixed(1)}h total
- Subjects this week: ${[...new Set(weekBlocks.map((b) => b.subject_code))].join(", ")}
- Next exam: ${nextExam ? `${nextExam.paper_name} in ${nextExam.days_remaining} days` : "none soon"}
- Weakest subjects: ${weakest.map((s) => `${s.subject_name} (${s.mastery_percent}%)`).join(", ") || "none yet"}
- Overall mastery: ${overview.mastery_percent}%
- Accuracy: ${overview.accuracy}%

Rules:
- Start with a positive observation about her progress or streak
- Mention what to focus on this week (based on blocks and weak subjects)
- If an exam is close (<30 days), mention it encouragingly
- End with a short motivating line
- NO bullet points, NO headers — just flowing text
- Keep it under 80 words`;

    const summary = await callOpenAI({
      system: prompt,
      user: "Generate the weekly summary now.",
      maxTokens: 200,
    });

    return Response.json({ summary: summary.trim() });
  } catch (error) {
    return errorResponse(error);
  }
}
