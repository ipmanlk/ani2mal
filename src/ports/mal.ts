import type { Media } from '@/domain/media.ts'

export interface MalPort {
  getLists(signal?: AbortSignal): Promise<{ anime: Media[]; manga: Media[] }>
  updateOne(media: Media, signal?: AbortSignal): Promise<void>
  deleteOne(media: Media, signal?: AbortSignal): Promise<void>
}
