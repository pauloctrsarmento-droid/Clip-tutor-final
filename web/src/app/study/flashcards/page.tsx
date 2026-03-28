"use client";

import { useRouter } from "next/navigation";
import { SubjectPicker } from "@/components/flashcards/subject-picker";

export default function FlashcardsPage() {
  const router = useRouter();

  const handleStart = (subjectCode: string, topicId?: string) => {
    const params = new URLSearchParams({ subject: subjectCode });
    if (topicId) params.set("topic", topicId);
    router.push(`/study/flashcards/session?${params.toString()}`);
  };

  return <SubjectPicker onStart={handleStart} />;
}
