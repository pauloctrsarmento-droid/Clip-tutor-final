import { errorResponse } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";
import { getSuggestions, generateSuggestions } from "@/lib/services/suggestions";
import { getStudentId } from "@/lib/auth-helpers";

export async function GET() {
  try {
    const studentId = await getStudentId();
    const suggestions = await getSuggestions(studentId);
    return Response.json(suggestions);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const studentId = await getStudentId();
    await verifyPin(request);
    const suggestions = await generateSuggestions(studentId);
    return Response.json(suggestions);
  } catch (error) {
    return errorResponse(error);
  }
}
