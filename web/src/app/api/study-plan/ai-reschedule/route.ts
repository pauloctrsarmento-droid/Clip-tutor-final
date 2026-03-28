import { errorResponse } from "@/lib/errors";
import { verifyPin } from "@/lib/auth";
import { aiRescheduleSchema } from "@/lib/validators/study-plan";
import { generateRescheduleProposal } from "@/lib/services/ai-reschedule";

export async function POST(request: Request) {
  try {
    await verifyPin(request);
    const body = await request.json();
    const input = aiRescheduleSchema.parse(body);

    const proposal = await generateRescheduleProposal({
      reason: input.reason,
      availableHoursPerDay: input.available_hours_per_day,
    });

    return Response.json(proposal);
  } catch (error) {
    return errorResponse(error);
  }
}
