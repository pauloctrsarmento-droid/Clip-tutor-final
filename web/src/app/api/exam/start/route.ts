import { errorResponse } from "@/lib/errors";
import { startExamSession } from "@/lib/services/orchestrators/exam-practice";
import { z } from "zod";

const schema = z.object({
  exam_paper_id: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = schema.parse(body);

    const result = await startExamSession({
      examPaperId: input.exam_paper_id,
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
