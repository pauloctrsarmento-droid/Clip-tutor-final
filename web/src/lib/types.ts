/** Block 2 + Block 3 — Study System Types */

// ============================================================
// Student
// ============================================================

export interface Student {
  id: string;
  name: string;
  current_streak: number;
  longest_streak: number;
  last_study_date: string | null;
  tutor_prompt: string | null;
}

// ============================================================
// Exam Questions
// ============================================================

export interface ExamPaper {
  id: string;
  subject_code: string;
  session: string;
  variant: string;
  year: number;
  total_questions: number;
  total_marks: number;
}

export interface ExamQuestion {
  id: string;
  paper_id: string;
  subject_code: string;
  syllabus_topic_id: string | null;
  question_number: number;
  part_label: string | null;
  group_id: string | null;
  question_text: string;
  parent_context: string | null;
  marks: number;
  correct_answer: string | null;
  mark_scheme: string | null;
  mark_points: string[];
  question_type: "short" | "structured";
  response_type: "text" | "numeric" | "drawing" | "table" | "mcq" | "labelling";
  has_diagram: boolean;
  fig_refs: string[];
  table_refs: string[];
  evaluation_ready: boolean;
  is_stem: boolean;
  part_order: number;
  sibling_count: number;
}

// ============================================================
// Study Sessions
// ============================================================

export type SessionType = "flashcard" | "quiz" | "review" | "chat_tutor";

export type BlockPhase = "intro" | "explanation" | "quiz" | "transition";

export type SessionStatus = "active" | "paused" | "completed" | "interrupted";

export interface StudySession {
  id: string;
  student_id: string;
  session_type: SessionType;
  subject_code: string | null;
  syllabus_topic_id: string | null;
  started_at: string;
  ended_at: string | null;
  total_cards: number;
  correct_count: number;
  mood: string | null;
  running_summary: string | null;
  current_block_index: number;
  block_phase: BlockPhase;
  embedded_session_id: string | null;
  status: SessionStatus;
}

// ============================================================
// Chat Tutor
// ============================================================

export type Mood = "unmotivated" | "normal" | "good" | "motivated";

/** A file attached to a chat message (image, PDF, or Word document). */
export interface Attachment {
  url: string;
  name: string;
}

/** Helper to detect MIME type from a data URL. */
export function getMimeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);/);
  return match?.[1] ?? "application/octet-stream";
}

/** Check if a data URL is an image. */
export function isImageAttachment(url: string): boolean {
  return getMimeFromDataUrl(url).startsWith("image/");
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  images: string[];
  attachments?: Attachment[];
  action: TutorAction | null;
  internal: TutorInternal | null;
  created_at: string;
}

// ============================================================
// Summary Review
// ============================================================

export interface SummaryReviewItem {
  type: "correct" | "error" | "missing";
  original?: string;
  corrected: string;
  explanation: string;
}

export interface SummaryReview {
  topic: string;
  score: number;
  grade: string;
  items: SummaryReviewItem[];
  corrected_version: string;
}

/** Actions the tutor can emit to control the activity panel. */
export type TutorAction =
  | { type: "launch_quiz"; config: { topic_id: string; num_questions: number; question_types: string[] } }
  | { type: "launch_flashcards"; config: { topic_id: string; count: number } }
  | { type: "show_content"; config: { title: string; content: string; diagram_url?: string } }
  | { type: "show_diagram"; config: { title: string; diagram_type: "mermaid" | "dalle"; mermaid_code?: string; dalle_prompt?: string } }
  | { type: "show_summary_review"; config: SummaryReview }
  | { type: "clear_panel"; config: Record<string, never> }
  | { type: "end_block"; config: { completed_block_index: number; next_subject?: string } }
  | { type: "end_session"; config: { reason: "completed" } };

/** Internal metadata for session state tracking. */
export interface TutorInternal {
  current_phase: BlockPhase;
  time_elapsed_minutes: number;
  block_progress: string;
}

export interface TutorMemory {
  id: string;
  student_id: string;
  subject_code: string;
  session_id: string | null;
  summary: string;
  key_points: {
    struggles: string[];
    wins: string[];
    effective_methods: string[];
    mood_note: string;
  } | null;
  created_at: string;
}

// ============================================================
// Mastery
// ============================================================

export interface FactMastery {
  mastery_score: number;
  mastered: boolean;
  consecutive_correct: number;
  times_tested: number;
  times_correct: number;
}

export interface FactMasteryRow {
  id: string;
  student_id: string;
  fact_id: string;
  mastery_score: number;
  consecutive_correct: number;
  times_tested: number;
  times_correct: number;
  last_seen: string | null;
  last_error: string | null;
}

export interface TopicMasteryRow {
  id: string;
  student_id: string;
  syllabus_topic_id: string;
  total_marks_earned: number;
  total_marks_available: number;
  questions_attempted: number;
  questions_correct: number;
  last_practiced: string | null;
}

// ============================================================
// Flashcard
// ============================================================

export interface Flashcard {
  fact_id: string;
  fact_text: string;
  flashcard_front: string | null;
  topic_name: string;
  subject_code: string;
  difficulty: number;
  has_formula: boolean;
  mastery_score: number | null;
  last_seen: string | null;
}

// ============================================================
// Dashboard
// ============================================================

export interface DashboardOverview {
  streak: number;
  longest_streak: number;
  mastery_percent: number;
  total_attempts: number;
  accuracy: number;
}

export interface SubjectMastery {
  subject_code: string;
  subject_name: string;
  total_facts: number;
  mastered_facts: number;
  mastery_percent: number;
  quiz_attempts: number;
  quiz_accuracy: number;
}

export interface Misconception {
  fact_id: string;
  fact_text: string;
  topic_name: string;
  mastery_score: number;
  times_wrong: number;
  last_error: string | null;
}

export interface DayProgress {
  date: string;
  cards_reviewed: number;
  correct: number;
  mastery_snapshot: number;
}

export interface TopicProgress {
  syllabus_topic_id: string;
  topic_name: string;
  topic_code: string;
  subject_code: string;
  marks_earned: number;
  marks_available: number;
  mastery_percent: number;
  questions_attempted: number;
  last_practiced: string | null;
}

// ============================================================
// Suggestions
// ============================================================

export type SuggestionReason = "never_seen" | "stale" | "low_mastery";

export interface StudySuggestion {
  id: string;
  syllabus_topic_id: string;
  topic_name: string;
  topic_code: string;
  subject_code: string;
  reason: string;
  reason_code: SuggestionReason;
  priority: number;
  dismissed: boolean;
  acted_on: boolean;
}

// ============================================================
// Study Plan (Block 3)
// ============================================================

export type StudyType = "study" | "practice" | "exam" | "final_prep" | "mixed";
export type PlanPhase = "easter_w1" | "easter_w2" | "back_to_school" | "full_time";
export type PlanStatus = "pending" | "done" | "skipped" | "rescheduled" | "missed";

export interface StudyPlanEntry {
  id: string;
  student_id: string;
  plan_date: string;
  subject_code: string;
  title: string;
  syllabus_topic_ids: string[];
  planned_hours: number;
  study_type: StudyType;
  phase: PlanPhase;
  status: PlanStatus;
  actual_date: string | null;
  notes: string | null;
  sort_order: number;
  start_time: string | null;
  end_time: string | null;
}

export interface ExamCalendarEntry {
  id: string;
  student_id: string;
  subject_code: string;
  paper_name: string;
  paper_code: string;
  exam_date: string;
  exam_time: string;
  days_remaining?: number;
}

export interface RescheduleProposal {
  entries: Array<{
    plan_date: string;
    subject_code: string;
    title: string;
    planned_hours: number;
    study_type: StudyType;
    syllabus_topic_ids?: string[];
    sort_order: number;
  }>;
  reasoning: string;
}

// ============================================================
// Prompts (Block 4)
// ============================================================

export interface Prompt {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  content: string;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PromptVersion {
  id: string;
  prompt_id: string;
  content: string;
  version: number;
  change_note: string | null;
  created_at: string;
}
