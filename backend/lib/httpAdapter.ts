import http from "http";

/**
 * Adapt Node.js IncomingMessage to Web API Request (for use with fetch-style handlers).
 */
export async function nodeRequestFromIncoming(
  nodeReq: http.IncomingMessage
): Promise<Request> {
  const url = new URL(
    nodeReq.url ?? "/",
    `http://${nodeReq.headers.host ?? "localhost"}`
  );
  const chunks: Buffer[] = [];
  for await (const chunk of nodeReq) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(url.toString(), {
    method: nodeReq.method ?? "GET",
    headers: nodeReq.headers as Record<string, string>,
    body: body?.length ? body : undefined,
  });
}

/**
 * Send a Web API Response back through Node.js ServerResponse.
 */
export async function sendResponse(
  nodeRes: http.ServerResponse,
  response: Response
): Promise<void> {
  nodeRes.statusCode = response.status;
  response.headers.forEach((value, key) => nodeRes.setHeader(key, value));
  const buf = await response.arrayBuffer();
  nodeRes.end(Buffer.from(buf));
}
