// Route-based fetch stub. Each test lists the requests it expects, and the
// returned fetch answers those and throws on anything else.
export interface Route {
  method?: string
  pattern: string | RegExp
  respond: (req: Request) => Response | Promise<Response>
}

export function makeFetch(routes: Route[]): typeof fetch {
  return async (input, init) => {
    const req = new Request(input, init)
    // Request normalizes bare hosts to a trailing slash, so compare without one.
    const url = req.url.replace(/\/$/, '')
    // Real fetch rejects with the abort reason when the signal has already
    // fired or fires mid-flight; honour that so callers can rely on it.
    if (req.signal.aborted) throw req.signal.reason
    for (const route of routes) {
      if (route.method !== undefined && req.method !== route.method) continue
      const matched = typeof route.pattern === 'string'
        ? url === route.pattern
        : route.pattern.test(req.url)
      if (!matched) continue
      return await route.respond(req)
    }
    throw new Error(`unexpected ${req.method} ${req.url}`)
  }
}

export function jsonRes(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  const payload = body === null ? null : JSON.stringify(body)
  return new Response(payload, {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}
