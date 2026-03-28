export interface ExamPaper {
  id: string;
  subject_code: string;
  session: string;
  variant: string;
  component_type: string | null;
  year: number;
  total_marks: number;
  qp_url: string | null;
  ms_url: string | null;
}

export interface ExamPaperInfo {
  id: string;
  subject_code: string;
  session: string;
  variant: string;
  component_type: string;
  total_marks: number;
  qp_url: string;
  ms_url: string;
}

export interface MarkBreakdownPoint {
  point: string;
  awarded: boolean;
}

export interface ExamQuestionResult {
  question_number: string;
  max_marks: number;
  awarded_marks: number;
  confidence: "high" | "low";
  read_text: string;
  mark_breakdown: MarkBreakdownPoint[];
  student_answer_summary: string;
  feedback: string;
}

export interface ReviewQuestion {
  question_number: string;
  read_text: string;
}

export interface ExamResults {
  session_id: string;
  paper_info: ExamPaperInfo;
  questions: ExamQuestionResult[];
  total_marks: number;
  max_marks: number;
  percentage: number;
  grade: string | null;
  grade_boundaries: Record<string, number | null> | null;
  overall_feedback: string;
  needs_review: boolean;
  review_questions: ReviewQuestion[];
}

export interface Clarification {
  question_number: string;
  typed_text: string;
}
