import { writable } from 'svelte/store'

export interface Bookmark {
  id: string
  title: string
  page: number
  filePath: string
  createdAt: string
  color?: string
  notes?: string
}

export const bookmarks = writable<Bookmark[]>([])

// Load bookmarks from storage
export async function loadBookmarks(): Promise<void> {
  try {
    const data = await (window as any).electronAPI.loadBookmarks()
    bookmarks.set(data || [])
  } catch {
    bookmarks.set([])
  }
}

// Save bookmarks to storage
export async function saveBookmarks(): Promise<void> {
  let current: Bookmark[] = []
  bookmarks.subscribe(b => current = b)()
  try {
    await (window as any).electronAPI.saveBookmarks(current)
  } catch {
    // ignore save errors
  }
}

export function addBookmark(bookmark: Omit<Bookmark, 'id' | 'createdAt'>) {
  const newBookmark: Bookmark = {
    ...bookmark,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString()
  }
  bookmarks.update(bms => [...bms, newBookmark])
  saveBookmarks()
}

export function removeBookmark(id: string) {
  bookmarks.update(bms => bms.filter(bm => bm.id !== id))
  saveBookmarks()
}

export function updateBookmark(id: string, updates: Partial<Bookmark>) {
  bookmarks.update(bms =>
    bms.map(bm => bm.id === id ? { ...bm, ...updates } : bm)
  )
  saveBookmarks()
}
