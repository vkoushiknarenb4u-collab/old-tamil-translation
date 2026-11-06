export class RequestBodyTooLargeError extends Error {
  constructor() { super("The uploaded request is larger than the allowed limit."); this.name = "RequestBodyTooLargeError"; }
}

export class InvalidMultipartFormError extends Error {
  constructor() { super("Upload must be a valid multipart form."); this.name = "InvalidMultipartFormError"; }
}

export async function readFormDataWithinLimit(request: Request, maxBytes: number): Promise<FormData> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new RequestBodyTooLargeError();
  if (!request.body) throw new InvalidMultipartFormError();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyTooLargeError();
      }
      chunks.push(part.value);
    }
    const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    const replay = new Request(request.url, { method: request.method, headers: request.headers, body });
    return await replay.formData();
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) throw error;
    throw new InvalidMultipartFormError();
  }
}
