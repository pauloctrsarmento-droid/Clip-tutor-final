"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, ExternalLink, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  startExam,
  submitExamPhotos,
  clarifyExamAnswers,
  fetchExamResults,
} from "@/lib/api";
import { ExamPaperPicker } from "@/components/exam/exam-paper-picker";
import { ExamTimer } from "@/components/exam/exam-timer";
import { PhotoUpload } from "@/components/exam/photo-upload";
import { ReviewModal } from "@/components/exam/review-modal";
import { ExamResults } from "@/components/exam/exam-results";
import type {
  ExamPaper,
  ExamResults as ExamResultsType,
  Clarification,
} from "@/components/exam/types";

type Phase = "picker" | "confirm" | "in-exam" | "marking" | "review" | "results";

function formatSession(session: string): string {
  const map: Record<string, string> = { s: "June", w: "November", m: "March" };
  const prefix = session.charAt(0);
  const year = "20" + session.slice(1);
  return `${map[prefix] ?? session} ${year}`;
}

function formatComponentType(ct: string): string {
  const map: Record<string, string> = {
    theory_extended: "Theory (Extended)",
    theory_core: "Theory (Core)",
    theory: "Theory",
    atp: "Alternative to Practical",
    practical: "Practical",
    reading: "Reading",
    writing: "Writing",
    reading_writing: "Reading & Writing",
    programming: "Problem Solving & Programming",
    poetry_prose: "Poetry & Prose",
  };
  return map[ct] ?? ct;
}

export default function ExamPage() {
  const [phase, setPhase] = useState<Phase>("picker");
  const [selectedPaper, setSelectedPaper] = useState<ExamPaper | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(60);
  const [photos, setPhotos] = useState<File[]>([]);
  const [results, setResults] = useState<ExamResultsType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhase("picker");
    setSelectedPaper(null);
    setSessionId(null);
    setTimeLimitMinutes(60);
    setPhotos([]);
    setResults(null);
    setSubmitting(false);
    setError(null);
  }, []);

  const handleSelectPaper = useCallback((paper: ExamPaper) => {
    setSelectedPaper(paper);
    setPhase("confirm");
    setError(null);
  }, []);

  const handleStartExam = useCallback(async () => {
    if (!selectedPaper) return;
    setError(null);
    try {
      const data = await startExam(selectedPaper.id);
      setSessionId(data.session_id as string);
      setTimeLimitMinutes((data.time_limit_minutes as number) ?? 60);
      setPhase("in-exam");
    } catch {
      setError("Failed to start exam. Please try again.");
    }
  }, [selectedPaper]);

  const handleSubmitPhotos = useCallback(async () => {
    if (!sessionId || photos.length === 0) return;
    setSubmitting(true);
    setError(null);
    setPhase("marking");
    try {
      const submitResult = await submitExamPhotos(sessionId, photos);
      const examResults = submitResult as ExamResultsType;
      setResults(examResults);

      if (examResults.needs_review && examResults.review_questions.length > 0) {
        setPhase("review");
      } else {
        setPhase("results");
      }
    } catch {
      setError("Failed to submit photos. Please try again.");
      setPhase("in-exam");
    } finally {
      setSubmitting(false);
    }
  }, [sessionId, photos]);

  const handleTimerExpire = useCallback(() => {
    // Auto-submit when time is up if there are photos
    if (photos.length > 0) {
      void handleSubmitPhotos();
    }
  }, [photos, handleSubmitPhotos]);

  const handleClarify = useCallback(
    async (clarifications: Clarification[]) => {
      if (!sessionId || !results) return;
      setPhase("marking");
      try {
        if (clarifications.length > 0) {
          const updated = await clarifyExamAnswers(sessionId, clarifications);
          setResults(updated as ExamResultsType);
        }
        setPhase("results");
      } catch {
        // If clarification fails, show results anyway
        setPhase("results");
      }
    },
    [sessionId, results]
  );

  const handleSkipReview = useCallback(() => {
    setPhase("results");
  }, []);

  const handleViewMarkScheme = useCallback(() => {
    if (!selectedPaper?.ms_url) return;
    window.open(selectedPaper.ms_url, "_blank", "noopener,noreferrer");
  }, [selectedPaper]);

  // Re-fetch results if needed (for review flow)
  const handleRefreshResults = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await fetchExamResults(sessionId);
      setResults(data as ExamResultsType);
    } catch {
      // Silently fail — results already loaded
    }
  }, [sessionId]);

  return (
    <div className="space-y-8">
      <AnimatePresence mode="wait">
        {/* PICKER */}
        {phase === "picker" && (
          <motion.div
            key="picker"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            <ExamPaperPicker onSelect={handleSelectPaper} />
          </motion.div>
        )}

        {/* CONFIRM */}
        {phase === "confirm" && selectedPaper && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="max-w-lg mx-auto space-y-6"
          >
            <div>
              <h1 className="font-heading text-3xl font-bold tracking-tight">
                Ready to Start
              </h1>
              <p className="text-muted-foreground mt-1">
                Review the paper details before beginning
              </p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
              <div className="space-y-2">
                <h2 className="font-heading text-lg font-semibold">
                  {formatSession(selectedPaper.session)}
                </h2>
                <div className="flex flex-wrap gap-2">
                  {selectedPaper.component_type && (
                    <Badge variant="secondary">
                      {formatComponentType(selectedPaper.component_type)}
                    </Badge>
                  )}
                  <Badge variant="outline">Variant {selectedPaper.variant}</Badge>
                  <Badge variant="outline" className="tabular-nums">
                    {selectedPaper.total_marks} marks
                  </Badge>
                </div>
              </div>

              <ul className="text-sm text-muted-foreground space-y-1.5">
                <li>- Print or open the question paper before starting</li>
                <li>- Write your answers on paper</li>
                <li>- When done, photograph your answer sheets</li>
                <li>- AI will mark your work against the mark scheme</li>
              </ul>
            </div>

            {selectedPaper.qp_url && (
              <Button
                variant="outline"
                className="w-full cursor-pointer gap-1.5"
                onClick={() =>
                  window.open(selectedPaper.qp_url!, "_blank", "noopener,noreferrer")
                }
              >
                <ExternalLink className="w-4 h-4" />
                Open Question Paper
              </Button>
            )}

            {/* Reading material / Insert booklet — Portuguese has separate text booklet */}
            {selectedPaper.qp_url && selectedPaper.subject_code === "0504" && (
              <Button
                variant="outline"
                className="w-full cursor-pointer gap-1.5"
                onClick={() => {
                  const inUrl = selectedPaper.qp_url!.replace("/qp.pdf", "/in.pdf");
                  window.open(inUrl, "_blank", "noopener,noreferrer");
                }}
              >
                <ExternalLink className="w-4 h-4" />
                Open Reading Material
              </Button>
            )}

            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={reset}
                className="cursor-pointer gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <Button
                onClick={handleStartExam}
                className="flex-1 cursor-pointer"
              >
                Start Exam
              </Button>
            </div>
          </motion.div>
        )}

        {/* IN-EXAM */}
        {phase === "in-exam" && (
          <motion.div
            key="in-exam"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="max-w-2xl mx-auto space-y-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="font-heading text-2xl font-bold tracking-tight">
                  Exam in Progress
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Write your answers on paper, then photograph them below
                </p>
              </div>
              <ExamTimer
                totalMinutes={timeLimitMinutes}
                onExpire={handleTimerExpire}
              />
            </div>

            <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <h3 className="font-heading text-sm font-semibold">Instructions</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>- Answer all questions on paper</li>
                <li>- Write clearly and show your working</li>
                <li>- Photograph each page of your answers</li>
                <li>- Ensure photos are well-lit and in focus</li>
              </ul>
            </div>

            <PhotoUpload photos={photos} onChange={setPhotos} maxPhotos={10} />

            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}

            <Button
              onClick={handleSubmitPhotos}
              disabled={photos.length === 0 || submitting}
              className={cn(
                "w-full cursor-pointer gap-1.5",
                photos.length === 0 && "opacity-50"
              )}
            >
              <Send className="w-4 h-4" />
              Submit for Marking
            </Button>
          </motion.div>
        )}

        {/* MARKING */}
        {phase === "marking" && (
          <motion.div
            key="marking"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center py-24 gap-6"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            >
              <Loader2 className="w-10 h-10 text-primary" />
            </motion.div>
            <div className="text-center space-y-1">
              <p className="font-heading text-lg font-semibold">
                Analysing your answers...
              </p>
              <p className="text-sm text-muted-foreground">
                This may take a minute
              </p>
            </div>
          </motion.div>
        )}

        {/* REVIEW */}
        {phase === "review" && results && (
          <motion.div
            key="review"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="blur-sm pointer-events-none">
              <ExamResults
                results={results}
                onAnother={reset}
                onViewMarkScheme={handleViewMarkScheme}
              />
            </div>
            <ReviewModal
              open
              questions={results.review_questions}
              onSubmit={handleClarify}
              onSkip={handleSkipReview}
            />
          </motion.div>
        )}

        {/* RESULTS */}
        {phase === "results" && results && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
          >
            <ExamResults
              results={results}
              onAnother={reset}
              onViewMarkScheme={handleViewMarkScheme}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
