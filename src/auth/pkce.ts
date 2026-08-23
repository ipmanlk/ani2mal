// PKCE helpers built on Web Crypto.

const b64url = (bytes: Uint8Array): string => {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function generateVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(64))
  return b64url(bytes)
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return b64url(new Uint8Array(digest))
}

export function isPlausibleVerifier(v: string): boolean {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(v)
}

export async function buildAuthorizeUrl(clientId: string, verifier: string): Promise<string> {
  const u = new URL('https://myanimelist.net/v1/oauth2/authorize')
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('code_challenge', await challengeFor(verifier))
  u.searchParams.set('code_challenge_method', 'S256')
  return u.toString()
}
