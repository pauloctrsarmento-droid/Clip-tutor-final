"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { StudyPlanDay } from "./study-plan-day";
import { StudyPlanWeek } from "./study-plan-week";
import { StudyPlanMonth } from "./study-plan-month";
import type { StudyPlanEntry, ExamCalendarEntry } from "@/lib/types";

interface StudyPlanProps {
  todayBlocks: StudyPlanEntry[];
  overdueBlocks: StudyPlanEntry[];
  exams: ExamCalendarEntry[];
  onStartBlock?: (block: StudyPlanEntry) => void;
}

export function StudyPlan({
  todayBlocks,
  overdueBlocks,
  exams,
  onStartBlock,
}: StudyPlanProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="rounded-2xl bg-card border border-border p-5"
    >
      <Tabs defaultValue={todayBlocks.length > 0 ? "today" : "week"}>
        <TabsList>
          <TabsTrigger value="today" className="cursor-pointer">
            Today
          </TabsTrigger>
          <TabsTrigger value="week" className="cursor-pointer">
            This Week
          </TabsTrigger>
          <TabsTrigger value="month" className="cursor-pointer">
            This Month
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today">
          <StudyPlanDay blocks={todayBlocks} overdueBlocks={overdueBlocks} onStartBlock={onStartBlock} />
        </TabsContent>

        <TabsContent value="week">
          <StudyPlanWeek exams={exams} />
        </TabsContent>

        <TabsContent value="month">
          <StudyPlanMonth exams={exams} />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
