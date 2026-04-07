import { errorResponse } from "@/lib/errors";
import { getStudentProfile } from "@/lib/auth-helpers";

export async function GET() {
  try {
    const profile = await getStudentProfile();
    return Response.json(profile);
  } catch (error) {
    return errorResponse(error);
  }
}
