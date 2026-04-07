export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, "VALIDATION_ERROR", 400, details);
    this.name = "ValidationError";
  }
}

export class AuthorizationError extends AppError {
  constructor() {
    super("Invalid PIN", "UNAUTHORIZED", 401);
    this.name = "AuthorizationError";
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Not authenticated") {
    super(message, "UNAUTHENTICATED", 401);
    this.name = "AuthenticationError";
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json(
      { error: error.message, code: error.code, details: error.details },
      { status: error.statusCode }
    );
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : "Internal server error";
  console.error("[API Error]", error);
  return Response.json(
    { error: message, code: "INTERNAL_ERROR" },
    { status: 500 }
  );
}
