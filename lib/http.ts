import { unstable_rethrow } from "next/navigation";

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "bad_request", "คำขอไม่ถูกต้อง");
  }
}

// For actions whose body is optional: no body = {}
export async function readOptionalJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "bad_request", "คำขอไม่ถูกต้อง");
  }
}

// Turn any thrown value into a JSON error response.
export function errorResponse(err: unknown): Response {
  // Let Next's internal control-flow errors (e.g. dynamic-route bailout) through
  unstable_rethrow(err);
  if (err instanceof HttpError) {
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
  console.error(err);
  return Response.json(
    { error: { code: "internal", message: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" } },
    { status: 500 },
  );
}
