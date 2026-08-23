import type { Token } from '@/config/schema.ts'

export interface TokenProvider {
  getAccessToken(signal?: AbortSignal): Promise<string>
  refresh(signal?: AbortSignal): Promise<Token>
}
