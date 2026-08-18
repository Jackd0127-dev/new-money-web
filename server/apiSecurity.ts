export const MAX_AI_REQUEST_BODY_BYTES = 2_000_000
export const MAX_ACCOUNT_REQUEST_BODY_BYTES = 10_000

interface HeaderResponse {
  setHeader?: (key: string, value: string) => unknown
}

export function setSecureApiHeaders(res: HeaderResponse): void {
  res.setHeader?.('Cache-Control', 'no-store')
  res.setHeader?.('X-Content-Type-Options', 'nosniff')
}

export function isRequestBodyTooLarge(
  body: unknown,
  maxBytes = MAX_AI_REQUEST_BODY_BYTES,
): boolean {
  return getApproximateBodySizeBytes(body) > maxBytes
}

function getApproximateBodySizeBytes(body: unknown): number {
  if (body === undefined || body === null) {
    return 0
  }

  if (typeof body === 'string') {
    return Buffer.byteLength(body, 'utf8')
  }

  try {
    return Buffer.byteLength(JSON.stringify(body), 'utf8')
  } catch {
    return Number.POSITIVE_INFINITY
  }
}
