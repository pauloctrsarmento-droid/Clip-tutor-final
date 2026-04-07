import { errorResponse } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";
import { createSessionSchema } from "@/lib/validators/session";
import { createSession } from "@/lib/services/sessions";
import { getStudentId } from "@/lib/auth-helpers";

export async function POST(request: Request) {
  try {
    const studentId = await getStudentId();
    await verifyPin(request);
    const body = await request.json();
    const input = createSessionSchema.parse(body);
    const session = await createSession(input, studentId);
    return Response.json(session, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
