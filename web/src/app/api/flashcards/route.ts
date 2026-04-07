import { errorResponse } from "@/lib/errors";
import { flashcardQuerySchema } from "@/lib/validators/flashcard";
import { getFlashcardDeck } from "@/lib/services/flashcards";
import { getStudentId } from "@/lib/auth-helpers";

export async function GET(request: Request) {
  try {
    const studentId = await getStudentId();
    const url = new URL(request.url);
    const query = flashcardQuerySchema.parse({
      subject: url.searchParams.get("subject") ?? undefined,
      topic: url.searchParams.get("topic") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const deck = await getFlashcardDeck({
      subjectCode: query.subject,
      topicId: query.topic,
      limit: query.limit,
      studentId,
    });

    return Response.json(deck);
  } catch (error) {
    return errorResponse(error);
  }
}
