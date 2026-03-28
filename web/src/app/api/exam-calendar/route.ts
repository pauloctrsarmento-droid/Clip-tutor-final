import { errorResponse } from "@/lib/errors";
import { getExamCalendar } from "@/lib/services/study-plan";

export async function GET() {
  try {
    const calendar = await getExamCalendar();
    return Response.json(calendar);
  } catch (error) {
    return errorResponse(error);
  }
}
