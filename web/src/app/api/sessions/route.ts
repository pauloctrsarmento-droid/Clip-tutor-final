import { errorResponse } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";
import { createSessionSchema } from "@/lib/validators/session";
import { createSession } from "@/lib/services/sessions";

export async function POST(request: Request) {
  try {
    await verifyPin(request);
    const body = await request.json();
    const input = createSessionSchema.parse(body);
    const session = await createSession(input);
    return Response.json(session, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
