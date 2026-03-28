"use client";

import Link from "next/link";
import { GraduationCap, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export default function SessionPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center min-h-[60vh] gap-6"
    >
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
        <GraduationCap className="w-10 h-10 text-primary" />
      </div>
      <div className="text-center space-y-2">
        <h1 className="font-heading text-2xl font-bold text-foreground">
          Study session
        </h1>
        <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
          The Chat Tutor is being developed.
          <br />
          Soon you'll be able to study with personalised help!
        </p>
      </div>
      <Link href="/study">
        <Button
          variant="default"
          className="bg-gradient-to-r from-primary to-primary/80 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to home
        </Button>
      </Link>
    </motion.div>
  );
}
