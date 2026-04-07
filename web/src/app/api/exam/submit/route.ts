import { errorResponse, ValidationError } from "@/lib/errors";
import { submitPhotos } from "@/lib/services/orchestrators/exam-practice";
import { supabaseAdmin } from "@/lib/supabase-server";
import { getStudentId } from "@/lib/auth-helpers";

// Allow up to 60s for GPT-4o vision marking
export const maxDuration = 60;

const MAX_PHOTOS = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  try {
    const studentId = await getStudentId();
    const formData = await request.formData();
    const sessionId = formData.get("session_id") as string;

    if (!sessionId) {
      throw new ValidationError("session_id is required");
    }

    // Collect photo files
    const photos: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === "photos" && value instanceof File) {
        photos.push(value);
      }
    }

    if (photos.length === 0) {
      throw new ValidationError("At least one photo is required");
    }

    if (photos.length > MAX_PHOTOS) {
      throw new ValidationError(`Maximum ${MAX_PHOTOS} photos allowed`);
    }

    // Validate file sizes and types
    for (const photo of photos) {
      if (photo.size > MAX_FILE_SIZE) {
        throw new ValidationError(`Photo ${photo.name} exceeds 10MB limit`);
      }
      if (!photo.type.startsWith("image/")) {
        throw new ValidationError(`File ${photo.name} is not an image`);
      }
    }

    // Upload photos to Supabase Storage
    const photoUrls: string[] = [];
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const buffer = Buffer.from(await photo.arrayBuffer());
      const ext = photo.type.split("/")[1] ?? "jpg";
      const path = `${sessionId}/photo_${i + 1}.${ext}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from("exam-submissions")
        .upload(path, buffer, {
          contentType: photo.type,
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Failed to upload photo ${i + 1}: ${uploadError.message}`);
      }

      const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/exam-submissions/${path}`;
      photoUrls.push(url);
    }

    // Submit for marking
    const result = await submitPhotos({
      sessionId,
      photoUrls,
      studentId,
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
