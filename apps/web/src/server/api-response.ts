export function jsonOk(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ code, message }, { status });
}
