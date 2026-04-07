import { errorResponse } from "@/lib/errors";
import { evaluateAnswer } from "@/lib/services/orchestrators/quiz";
import { supabaseAdmin } from "@/lib/supabase-server";
import { z } from "zod";

export const maxDuration = 60;

const jsonSchema = z.object({
  session_id: z.string().uuid(),
  question_id: z.string().min(1),
  student_answer: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    let sessionId: string;
    let questionId: string;
    let studentAnswer: string;
    let photoUrls: string[] = [];

    if (contentType.includes("multipart/form-data")) {
      // FormData with optional photos
      const formData = await request.formData();
      sessionId = formData.get("session_id") as string;
      questionId = formData.get("question_id") as string;
      studentAnswer = (formData.get("student_answer") as string) ?? "";

      // Process photo uploads
      const photoFiles = formData.getAll("photos") as File[];
      for (let i = 0; i < photoFiles.length; i++) {
        const photo = photoFiles[i];
        if (!photo || photo.size === 0) continue;
        if (photo.size > 10 * 1024 * 1024) continue; // 10MB limit

        const buffer = Buffer.from(await photo.arrayBuffer());
        const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
        const path = `quiz/${sessionId}/${questionId}_photo_${i}.${ext}`;

        await supabaseAdmin.storage
          .from("exam-submissions")
          .upload(path, buffer, { contentType: photo.type, upsert: true });

        const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/exam-submissions/${path}`;
        photoUrls.push(publicUrl);
      }

      // Allow submit with only photos (no text)
      if (!studentAnswer && photoUrls.length > 0) {
        studentAnswer = "[Photo uploaded — see attached image(s)]";
      }
    } else {
      // JSON (backwards compatible)
      const body = await request.json();
      const input = jsonSchema.parse(body);
      sessionId = input.session_id;
      questionId = input.question_id;
      studentAnswer = input.student_answer;
    }

    if (!sessionId || !questionId || (!studentAnswer && photoUrls.length === 0)) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const result = await evaluateAnswer({
      sessionId,
      questionId,
      studentAnswer,
      photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
