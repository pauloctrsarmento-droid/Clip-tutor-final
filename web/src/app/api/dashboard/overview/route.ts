import { errorResponse } from "@/lib/errors";
import { getOverview } from "@/lib/services/dashboard";

export async function GET() {
  try {
    const overview = await getOverview();
    return Response.json(overview);
  } catch (error) {
    return errorResponse(error);
  }
}
