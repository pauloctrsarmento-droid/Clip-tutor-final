import { errorResponse } from "@/lib/errors";
import { getProgressTimeline } from "@/lib/services/dashboard";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const days = Number(url.searchParams.get("days") ?? "30");
    const progress = await getProgressTimeline(days);
    return Response.json(progress);
  } catch (error) {
    return errorResponse(error);
  }
}
