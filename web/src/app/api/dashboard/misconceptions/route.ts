import { errorResponse } from "@/lib/errors";
import { getMisconceptions } from "@/lib/services/dashboard";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const misconceptions = await getMisconceptions(limit);
    return Response.json(misconceptions);
  } catch (error) {
    return errorResponse(error);
  }
}
