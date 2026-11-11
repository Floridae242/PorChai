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
