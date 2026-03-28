export async function POST(request: Request) {
  try {
    const body = await request.json();
    const pin = body.pin;

    if (!pin || pin !== process.env.ADMIN_PIN) {
      return Response.json({ valid: false }, { status: 401 });
    }

    return Response.json({ valid: true });
  } catch {
    return Response.json({ valid: false }, { status: 400 });
  }
}
