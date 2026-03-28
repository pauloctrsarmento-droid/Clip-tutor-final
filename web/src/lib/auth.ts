import { AuthorizationError } from "./errors";

export function verifyPin(request: Request): void {
  const pin =
    request.headers.get("x-admin-pin") ??
    new URL(request.url).searchParams.get("pin");

  if (!pin || pin !== process.env.ADMIN_PIN) {
    throw new AuthorizationError();
  }
}
