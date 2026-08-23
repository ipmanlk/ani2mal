import type { FormattedLists } from '@/domain/media.ts'

export interface AnilistPort {
  getLists(username: string, signal?: AbortSignal): Promise<FormattedLists>
}
