import { errorResponse } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";
import { getSuggestions, generateSuggestions } from "@/lib/services/suggestions";

export async function GET() {
  try {
    const suggestions = await getSuggestions();
    return Response.json(suggestions);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await verifyPin(request);
    const suggestions = await generateSuggestions();
    return Response.json(suggestions);
  } catch (error) {
    return errorResponse(error);
  }
}
