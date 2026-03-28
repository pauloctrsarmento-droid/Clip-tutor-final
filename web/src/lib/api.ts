const BASE = "";

function headers(pin: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "x-admin-pin": pin,
  };
}

export async function fetchSubjects() {
  const res = await fetch(`${BASE}/api/subjects`);
  if (!res.ok) throw new Error("Failed to fetch subjects");
  return res.json();
}

export async function fetchSubjectTopics(subjectId: string) {
  const res = await fetch(`${BASE}/api/subjects/${subjectId}/topics`);
  if (!res.ok) throw new Error("Failed to fetch topics");
  return res.json();
}

export async function fetchTopicFacts(topicId: string) {
  const res = await fetch(`${BASE}/api/topics/${topicId}/facts`);
  if (!res.ok) throw new Error("Failed to fetch facts");
  return res.json();
}

export async function updateTopic(
  topicId: string,
  pin: string,
  data: { topic_name?: string; description?: string | null }
) {
  const res = await fetch(`${BASE}/api/topics/${topicId}`, {
    method: "PUT",
    headers: headers(pin),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update topic");
  return res.json();
}

export async function createFact(
  topicId: string,
  pin: string,
  factText: string
) {
  const res = await fetch(`${BASE}/api/topics/${topicId}/facts`, {
    method: "POST",
    headers: headers(pin),
    body: JSON.stringify({ fact_text: factText }),
  });
  if (!res.ok) throw new Error("Failed to create fact");
  return res.json();
}

export async function updateFact(
  factId: string,
  pin: string,
  data: { fact_text?: string; is_active?: boolean }
) {
  const res = await fetch(`${BASE}/api/facts/${factId}`, {
    method: "PUT",
    headers: headers(pin),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update fact");
  return res.json();
}

export async function deleteFact(factId: string, pin: string) {
  const res = await fetch(`${BASE}/api/facts/${factId}`, {
    method: "DELETE",
    headers: headers(pin),
  });
  if (!res.ok) throw new Error("Failed to delete fact");
  return res.json();
}

export async function verifyPin(pin: string): Promise<boolean> {
  const res = await fetch(`${BASE}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  const data = await res.json();
  return data.valid === true;
}

// ============================================================
// Flashcard Sessions (orchestrated)
// ============================================================

export async function startFlashcards(
  data: { subject_code: string; topic_id?: string; limit?: number }
) {
  const res = await fetch(`${BASE}/api/flashcards/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to start flashcard session");
  return res.json();
}

export async function explainFlashcard(factId: string, question?: string) {
  const res = await fetch(`${BASE}/api/flashcards/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fact_id: factId, question }),
  });
  if (!res.ok) throw new Error("Failed to get explanation");
  return res.json();
}

export async function answerFlashcard(
  data: { session_id: string; fact_id: string; result: "know" | "partial" | "dunno" }
) {
  const res = await fetch(`${BASE}/api/flashcards/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to record answer");
  return res.json();
}

export async function endFlashcards(sessionId: string) {
  const res = await fetch(`${BASE}/api/flashcards/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) throw new Error("Failed to end session");
  return res.json();
}

export async function fetchSubjectTopicsList(subjectCode: string) {
  const res = await fetch(`${BASE}/api/subjects?code=${subjectCode}`);
  if (!res.ok) throw new Error("Failed to fetch subject");
  const subjects = await res.json();
  if (!subjects.length) throw new Error("Subject not found");
  const subjectId = subjects[0].id;
  return fetchSubjectTopics(subjectId);
}

// ============================================================
// Quiz Sessions (orchestrated)
// ============================================================

export async function startQuiz(data: {
  subject_code: string;
  topic_id?: string;
  count?: number;
  question_type?: string;
}) {
  const res = await fetch(`${BASE}/api/quiz/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to start quiz");
  return res.json();
}

export async function evaluateQuizAnswer(data: {
  session_id: string;
  question_id: string;
  student_answer: string;
}) {
  const res = await fetch(`${BASE}/api/quiz/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to evaluate");
  return res.json();
}

export async function endQuiz(sessionId: string) {
  const res = await fetch(`${BASE}/api/quiz/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) throw new Error("Failed to end quiz");
  return res.json();
}

// ============================================================
// Dashboard
// ============================================================

export async function fetchDashboardOverview() {
  const res = await fetch(`${BASE}/api/dashboard/overview`);
  if (!res.ok) throw new Error("Failed to fetch overview");
  return res.json();
}

export async function fetchDashboardSubjects() {
  const res = await fetch(`${BASE}/api/dashboard/subjects`);
  if (!res.ok) throw new Error("Failed to fetch subject mastery");
  return res.json();
}

export async function fetchMisconceptions(limit = 20) {
  const res = await fetch(`${BASE}/api/dashboard/misconceptions?limit=${limit}`);
  if (!res.ok) throw new Error("Failed to fetch misconceptions");
  return res.json();
}

export async function fetchProgress(days = 30) {
  const res = await fetch(`${BASE}/api/dashboard/progress?days=${days}`);
  if (!res.ok) throw new Error("Failed to fetch progress");
  return res.json();
}

// ============================================================
// Papers
// ============================================================

export async function fetchPapers(subjectCode?: string) {
  const params = subjectCode ? `?subject_code=eq.${subjectCode}` : "";
  const res = await fetch(`${BASE}/api/papers${params}`);
  if (!res.ok) throw new Error("Failed to fetch papers");
  return res.json();
}

export async function createPaper(
  pin: string,
  data: { id: string; subject_code: string; session: string; variant: string; year: number; total_questions?: number; total_marks?: number },
  qpFile?: File,
  msFile?: File
) {
  // 1. Create DB record
  const res = await fetch(`${BASE}/api/papers`, {
    method: "POST",
    headers: headers(pin),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create paper");
  const paper = await res.json();

  // 2. Upload PDFs if provided
  if (qpFile || msFile) {
    const formData = new FormData();
    formData.append("paper_id", data.id);
    if (qpFile) formData.append("qp", qpFile);
    if (msFile) formData.append("ms", msFile);
    await fetch(`${BASE}/api/papers/upload`, {
      method: "POST",
      headers: { "x-admin-pin": pin },
      body: formData,
    });
  }

  return paper;
}

export async function deletePaper(id: string, pin: string) {
  const res = await fetch(`${BASE}/api/papers/${id}`, {
    method: "DELETE",
    headers: headers(pin),
  });
  if (!res.ok) throw new Error("Failed to delete paper");
  return res.json();
}

// ============================================================
// Study Plan
// ============================================================

export async function fetchExamCalendar() {
  const res = await fetch(`${BASE}/api/exam-calendar`);
  if (!res.ok) throw new Error("Failed to fetch exam calendar");
  return res.json();
}

export async function fetchStudyPlanWeek(weekOffset = 0) {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + weekOffset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const from = monday.toISOString().split("T")[0];
  const to = sunday.toISOString().split("T")[0];
  const res = await fetch(`${BASE}/api/study-plan?from=${from}&to=${to}`);
  if (!res.ok) throw new Error("Failed to fetch study plan");
  return res.json();
}

export async function fetchStudyPlanToday() {
  const res = await fetch(`${BASE}/api/study-plan/today`);
  if (!res.ok) throw new Error("Failed to fetch today plan");
  return res.json();
}

export async function updatePlanEntry(
  id: string,
  pin: string,
  data: { status?: string; plan_date?: string; notes?: string }
) {
  const res = await fetch(`${BASE}/api/study-plan/${id}`, {
    method: "PATCH",
    headers: headers(pin),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update plan entry");
  return res.json();
}

export async function reschedulePlanEntry(
  pin: string,
  data: { entry_id: string; new_date: string; notes?: string }
) {
  const res = await fetch(`${BASE}/api/study-plan/reschedule`, {
    method: "POST",
    headers: headers(pin),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to reschedule");
  return res.json();
}

export async function aiReschedule(
  pin: string,
  data: { reason: string; available_hours_per_day?: number }
) {
  const res = await fetch(`${BASE}/api/study-plan/ai-reschedule`, {
    method: "POST",
    headers: headers(pin),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to generate AI reschedule");
  return res.json();
}

export async function applyReschedule(
  pin: string,
  data: { entries: Array<Record<string, unknown>> }
) {
  const res = await fetch(`${BASE}/api/study-plan/apply-reschedule`, {
    method: "POST",
    headers: headers(pin),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to apply reschedule");
  return res.json();
}

// ============================================================
// Prompts
// ============================================================

export async function fetchPrompts() {
  const res = await fetch(`${BASE}/api/prompts`);
  if (!res.ok) throw new Error("Failed to fetch prompts");
  return res.json();
}

export async function fetchPrompt(idOrSlug: string) {
  const res = await fetch(`${BASE}/api/prompts/${idOrSlug}`);
  if (!res.ok) throw new Error("Failed to fetch prompt");
  return res.json();
}

export async function updatePromptContent(
  id: string,
  pin: string,
  data: { content: string; change_note?: string }
) {
  const res = await fetch(`${BASE}/api/prompts/${id}`, {
    method: "PATCH",
    headers: headers(pin),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update prompt");
  return res.json();
}

export async function fetchPromptVersions(id: string) {
  const res = await fetch(`${BASE}/api/prompts/${id}/versions`);
  if (!res.ok) throw new Error("Failed to fetch versions");
  return res.json();
}

export async function revertPrompt(id: string, pin: string, versionId: string) {
  const res = await fetch(`${BASE}/api/prompts/${id}/revert`, {
    method: "POST",
    headers: headers(pin),
    body: JSON.stringify({ version_id: versionId }),
  });
  if (!res.ok) throw new Error("Failed to revert");
  return res.json();
}

export async function aiRewritePrompt(id: string, pin: string, description: string) {
  const res = await fetch(`${BASE}/api/prompts/${id}/ai-rewrite`, {
    method: "POST",
    headers: headers(pin),
    body: JSON.stringify({ description }),
  });
  if (!res.ok) throw new Error("Failed to AI rewrite");
  return res.json();
}

// ============================================================
// Student Profile
// ============================================================

export async function fetchStudent(id = "00000000-0000-0000-0000-000000000001") {
  const res = await fetch(`${BASE}/api/students/${id}`);
  if (!res.ok) throw new Error("Failed to fetch student");
  return res.json();
}

export async function updateStudentProfile(
  id: string,
  pin: string,
  tutorPrompt: string
) {
  const res = await fetch(`${BASE}/api/students/${id}`, {
    method: "PATCH",
    headers: headers(pin),
    body: JSON.stringify({ tutor_prompt: tutorPrompt }),
  });
  if (!res.ok) throw new Error("Failed to update profile");
  return res.json();
}

export async function generateStudentProfile(
  id: string,
  pin: string,
  pdfFile: File
) {
  const formData = new FormData();
  formData.append("file", pdfFile);
  const res = await fetch(`${BASE}/api/students/${id}/generate-profile`, {
    method: "POST",
    headers: { "x-admin-pin": pin },
    body: formData,
  });
  if (!res.ok) throw new Error("Failed to generate profile");
  return res.json();
}

// ============================================================
// Exam Practice
// ============================================================

export async function fetchExamPapers(subjectCode?: string) {
  const params = subjectCode ? `?subject_code=${subjectCode}` : "";
  const res = await fetch(`${BASE}/api/papers${params}`);
  if (!res.ok) throw new Error("Failed to fetch exam papers");
  return res.json();
}

export async function startExam(examPaperId: string) {
  const res = await fetch(`${BASE}/api/exam/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exam_paper_id: examPaperId }),
  });
  if (!res.ok) throw new Error("Failed to start exam");
  return res.json();
}

export async function submitExamPhotos(sessionId: string, photos: File[]) {
  const formData = new FormData();
  formData.append("session_id", sessionId);
  for (const photo of photos) {
    formData.append("photos", photo);
  }
  const res = await fetch(`${BASE}/api/exam/submit`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Failed to submit exam photos");
  return res.json();
}

export async function clarifyExamAnswers(
  sessionId: string,
  clarifications: Array<{ question_number: string; typed_text: string }>
) {
  const res = await fetch(`${BASE}/api/exam/clarify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, clarifications }),
  });
  if (!res.ok) throw new Error("Failed to clarify answers");
  return res.json();
}

export async function fetchExamResults(sessionId: string) {
  const res = await fetch(`${BASE}/api/exam/results?session_id=${sessionId}`);
  if (!res.ok) throw new Error("Failed to fetch exam results");
  return res.json();
}

export async function fetchExamHistory(subjectCode?: string) {
  const params = subjectCode ? `?subject_code=${subjectCode}` : "";
  const res = await fetch(`${BASE}/api/exam/history${params}`);
  if (!res.ok) throw new Error("Failed to fetch exam history");
  return res.json();
}

// ============================================================
// Home Page
// ============================================================

export async function fetchHomeData() {
  const [overview, subjects, today, exams] = await Promise.all([
    fetch(`${BASE}/api/dashboard/overview`).then((r) => r.json()),
    fetch(`${BASE}/api/dashboard/subjects`).then((r) => r.json()),
    fetch(`${BASE}/api/study-plan/today`).then((r) => r.json()),
    fetch(`${BASE}/api/exam-calendar`).then((r) => r.json()),
  ]);
  return { overview, subjects, today, exams } as {
    overview: import("@/lib/types").DashboardOverview;
    subjects: import("@/lib/types").SubjectMastery[];
    today: { today: import("@/lib/types").StudyPlanEntry[]; overdue: import("@/lib/types").StudyPlanEntry[] };
    exams: import("@/lib/types").ExamCalendarEntry[];
  };
}

export async function fetchWeekPlan(): Promise<import("@/lib/types").StudyPlanEntry[]> {
  const res = await fetch(`${BASE}/api/study-plan?week=current`);
  if (!res.ok) throw new Error("Failed to fetch week plan");
  return res.json();
}

export async function fetchMonthPlan(
  from: string,
  to: string
): Promise<import("@/lib/types").StudyPlanEntry[]> {
  const res = await fetch(`${BASE}/api/study-plan?from=${from}&to=${to}`);
  if (!res.ok) throw new Error("Failed to fetch month plan");
  return res.json();
}

export async function fetchSubjectMasteryDrillDown(subjectCode: string) {
  const res = await fetch(`${BASE}/api/mastery/${subjectCode}`);
  if (!res.ok) throw new Error("Failed to fetch subject mastery");
  return res.json() as Promise<{
    subject: { code: string; name: string };
    topics: Array<{
      id: string;
      topic_name: string;
      mastery_score: number;
      facts: Array<{
        id: string;
        text: string;
        mastery_score: number;
        status: "mastered" | "in_progress" | "not_started";
      }>;
    }>;
  }>;
}
