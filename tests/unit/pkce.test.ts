import { describe, expect, it } from '../helpers/testkit.ts'
import {
  buildAuthorizeUrl,
  challengeFor,
  generateVerifier,
  isPlausibleVerifier,
} from '@/auth/pkce.ts'

describe('pkce', () => {
  it('RFC 7636 Appendix B vector', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    expect(await challengeFor(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
  it('generateVerifier length and charset', () => {
    for (let i = 0; i < 100; i++) {
      const v = generateVerifier()
      expect(v.length).toBeGreaterThanOrEqual(43)
      expect(v.length).toBeLessThanOrEqual(128)
      expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/)
      expect(isPlausibleVerifier(v)).toBe(true)
    }
  })
  it('verifier uniqueness', () => {
    const set = new Set(Array.from({ length: 20 }, () => generateVerifier()))
    expect(set.size).toBe(20)
  })
  it('buildAuthorizeUrl contains S256 and challenge', async () => {
    const v = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const url = await buildAuthorizeUrl('client123', v)
    const u = new URL(url)
    expect(u.searchParams.get('code_challenge_method')).toBe('S256')
    expect(u.searchParams.get('code_challenge')).toBe(await challengeFor(v))
    expect(u.searchParams.get('response_type')).toBe('code')
    expect(url).toContain('https://myanimelist.net/v1/oauth2/authorize')
  })
})
