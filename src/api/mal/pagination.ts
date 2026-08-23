export interface MalPage<T> {
  data: T[]
  paging?: { next?: string | null }
}

export async function* paginate<T>(
  makeUrl: (offset: number) => string,
  fetchPage: (url: string, signal?: AbortSignal) => Promise<MalPage<T>>,
  signal?: AbortSignal,
): AsyncGenerator<T[]> {
  let url: string | null = makeUrl(0)
  while (url !== null) {
    const page = await fetchPage(url, signal)
    yield page.data
    const next: string | null | undefined = page.paging?.next
    url = next ?? null
    if (url) {
      // Small breather between pages so we do not hammer the API.
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0)
      })
    }
  }
}
