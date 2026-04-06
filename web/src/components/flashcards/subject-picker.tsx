"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchSubjects, fetchSubjectTopics } from "@/lib/api";
import { getSubjectMeta } from "@/lib/subject-meta";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ChevronRight, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { STUDY_SUBJECTS } from "@/lib/constants";

interface Subject {
  id: string;
  code: string;
  name: string;
  topic_count: number;
  fact_count: number;
}

interface Topic {
  id: string;
  topic_code: string;
  topic_name: string;
  fact_count: number;
}

interface SubjectPickerProps {
  onStart: (subjectCode: string, topicId?: string) => void;
  title?: string;
  subtitle?: string;
}

// Filtered by STUDY_SUBJECTS from constants

export function SubjectPicker({ onStart, title = "Flashcards", subtitle }: SubjectPickerProps) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(false);

  useEffect(() => {
    fetchSubjects()
      .then((data: Subject[]) => {
        setSubjects(data.filter((s) => STUDY_SUBJECTS.includes(s.code)));
      })
      .finally(() => setLoading(false));
  }, []);

  // Subjects where exam questions aren't mapped to individual topics yet
  const SKIP_TOPIC_PICKER = new Set(["0520", "0500", "0504"]);

  const handleSelectSubject = useCallback(async (subject: Subject) => {
    if (SKIP_TOPIC_PICKER.has(subject.code)) {
      onStart(subject.code);
      return;
    }

    setSelectedSubject(subject);
    setTopicsLoading(true);
    try {
      const data = await fetchSubjectTopics(subject.id);
      setTopics(data.topics ?? []);
    } finally {
      setTopicsLoading(false);
    }
  }, [onStart]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {title}
        </h1>
        <p className="text-muted-foreground mt-1">
          {selectedSubject
            ? subtitle ?? "Choose a topic or study all"
            : subtitle ?? "Choose a subject to start"}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {!selectedSubject ? (
          <motion.div
            key="subjects"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {subjects.map((subject, i) => {
              const meta = getSubjectMeta(subject.code);
              const Icon = meta.icon;

              return (
                <motion.button
                  key={subject.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  onClick={() => handleSelectSubject(subject)}
                  className={cn(
                    "group relative text-left p-6 rounded-2xl cursor-pointer",
                    "bg-card border border-border",
                    "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
                    "active:scale-[0.98]",
                    "transition-all duration-200"
                  )}
                >
                  <div className="space-y-3">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br",
                        meta.gradient
                      )}
                    >
                      <Icon className={cn("w-5 h-5", meta.accent)} />
                    </div>
                    <div>
                      <h3 className="font-heading text-base font-semibold">
                        {subject.name}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {subject.fact_count} facts · {subject.topic_count} topics
                      </p>
                    </div>
                  </div>
                  <ChevronRight
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground
                               opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5
                               transition-all duration-200"
                  />
                </motion.button>
              );
            })}
          </motion.div>
        ) : (
          <motion.div
            key="topics"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setSelectedSubject(null); setTopics([]); }}
              className="cursor-pointer gap-1.5 -ml-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to subjects
            </Button>

            {/* All topics button */}
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => onStart(selectedSubject.code)}
              className={cn(
                "w-full text-left p-5 rounded-2xl cursor-pointer",
                "bg-primary/5 border-2 border-primary/20",
                "hover:border-primary/40 hover:bg-primary/10",
                "active:scale-[0.99]",
                "transition-all duration-200"
              )}
            >
              <div className="flex items-center gap-3">
                <Layers className="w-5 h-5 text-primary" />
                <div>
                  <h3 className="font-heading text-sm font-semibold">
                    All Topics — {selectedSubject.name}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedSubject.fact_count} facts mixed
                  </p>
                </div>
              </div>
            </motion.button>

            {topicsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {topics.map((topic, i) => (
                  <motion.button
                    key={topic.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => onStart(selectedSubject.code, topic.id)}
                    className={cn(
                      "group text-left p-4 rounded-xl cursor-pointer",
                      "bg-card border border-border",
                      "hover:border-primary/20 hover:bg-secondary",
                      "active:scale-[0.99]",
                      "transition-all duration-200"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Badge variant="secondary" className="text-[10px] font-mono">
                          {topic.topic_code}
                        </Badge>
                        <h4 className="text-sm font-medium">{topic.topic_name}</h4>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {topic.fact_count}
                      </span>
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
