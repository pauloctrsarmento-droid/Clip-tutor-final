"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchSubjects, fetchSubjectTopics } from "@/lib/api";
import { AdminSidebar } from "./admin-sidebar";
import { SubjectView } from "./subject-view";
import { TopicView } from "./topic-view";
import { ProgressView } from "./progress-view";
import { StudyPlanView } from "./study-plan-view";
import { PromptsView } from "./prompts-view";
import { StudentProfileView } from "./student-profile-view";
import { PapersView } from "./papers-view";
import { Skeleton } from "@/components/ui/skeleton";
import { GraduationCap } from "lucide-react";

interface Subject {
  id: string;
  code: string;
  name: string;
  topic_count: number;
  fact_count: number;
}

interface TopicInfo {
  id: string;
  topic_code: string;
  topic_name: string;
  description: string | null;
}

type View =
  | { type: "empty" }
  | { type: "subject"; subjectId: string }
  | { type: "topic"; topicId: string; subjectId: string; topicInfo: TopicInfo }
  | { type: "progress" }
  | { type: "study-plan" }
  | { type: "prompts" }
  | { type: "student-profile" }
  | { type: "papers" };

export function AdminShell() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>({ type: "empty" });
  const [topicsCache, setTopicsCache] = useState<Record<string, TopicInfo[]>>(
    {}
  );

  useEffect(() => {
    fetchSubjects()
      .then(setSubjects)
      .finally(() => setLoading(false));
  }, []);

  const activeSubjectId =
    view.type === "subject"
      ? view.subjectId
      : view.type === "topic"
        ? view.subjectId
        : null;

  const activeSection =
    view.type === "progress" ||
    view.type === "study-plan" ||
    view.type === "prompts" ||
    view.type === "student-profile" ||
    view.type === "papers"
      ? view.type
      : null;

  const handleSelectSubject = useCallback((id: string) => {
    setView({ type: "subject", subjectId: id });
  }, []);

  const handleSelectSection = useCallback((section: string) => {
    setView({ type: section } as View);
  }, []);

  const handleSelectTopic = useCallback(
    async (topicId: string) => {
      const subjectId = activeSubjectId;
      if (!subjectId) return;

      let topics = topicsCache[subjectId];
      if (!topics) {
        const data = await fetchSubjectTopics(subjectId);
        topics = data.topics;
        setTopicsCache((prev) => ({ ...prev, [subjectId]: topics }));
      }

      const topicInfo = topics.find((t) => t.id === topicId);
      if (topicInfo) {
        setView({ type: "topic", topicId, subjectId, topicInfo });
      }
    },
    [activeSubjectId, topicsCache]
  );

  const handleBackToSubject = useCallback(() => {
    if (view.type === "topic") {
      setView({ type: "subject", subjectId: view.subjectId });
    }
  }, [view]);

  if (loading) {
    return (
      <div className="flex h-screen">
        <div className="w-[260px] border-r border-sidebar-border p-5 space-y-4">
          <Skeleton className="h-9 w-32" />
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="h-10 w-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar
        subjects={subjects}
        activeSubjectId={activeSubjectId}
        activeSection={activeSection}
        onSelectSubject={handleSelectSubject}
        onSelectSection={handleSelectSection}
      />

      <main className="flex-1 overflow-y-auto">
        {view.type === "empty" && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
            <GraduationCap className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-sm">Select a subject to get started</p>
          </div>
        )}

        {view.type === "subject" && (
          <SubjectView
            subjectId={view.subjectId}
            onSelectTopic={handleSelectTopic}
          />
        )}

        {view.type === "topic" && (
          <TopicView
            topicId={view.topicId}
            topicInfo={view.topicInfo}
            onBack={handleBackToSubject}
          />
        )}

        {view.type === "progress" && <ProgressView />}
        {view.type === "study-plan" && <StudyPlanView />}
        {view.type === "prompts" && <PromptsView />}
        {view.type === "student-profile" && <StudentProfileView />}
        {view.type === "papers" && <PapersView />}
      </main>
    </div>
  );
}
