import { writable, derived, get } from 'svelte/store'

export const filePath = writable<string | null>(null)
export const title = writable<string>('')
export const totalPages = writable<number>(0)
export const currentPage = writable<number>(1)
export const fitMode = writable<'width' | 'height'>('width')
export const theme = writable<'light' | 'dark'>('light')
export const pdfDocStore = writable<any>(null)
export const activeSearchQuery = writable<string>('')
export const searchHighlightPages = writable<Set<number>>(new Set())

export const progress = derived(
  [currentPage, totalPages],
  ([$currentPage, $totalPages]) => ({
    percent: $totalPages > 0 ? Math.round(($currentPage / $totalPages) * 100) : 0,
    current: $currentPage,
    total: $totalPages
  })
)

export function goToPage(page: number) {
  const total = get(totalPages)
  const clamped = Math.max(1, Math.min(page, total))
  currentPage.set(clamped)
  scrollToPage(clamped)
}

export function scrollToPage(page: number) {
  const el = document.getElementById(`page-container-${page}`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

export function nextPage() {
  const current = get(currentPage)
  const total = get(totalPages)
  if (current < total) {
    goToPage(current + 1)
  }
}

export function prevPage() {
  const current = get(currentPage)
  if (current > 1) {
    goToPage(current - 1)
  }
}

export function toggleFitMode() {
  const current = get(fitMode)
  fitMode.set(current === 'width' ? 'height' : 'width')
}

export function setTheme(t: 'light' | 'dark') {
  theme.set(t)
  document.documentElement.classList.toggle('dark', t === 'dark')
}

export function toggleTheme() {
  const current = get(theme)
  const newTheme = current === 'light' ? 'dark' : 'light'
  theme.set(newTheme)
  document.documentElement.classList.toggle('dark', newTheme === 'dark')
}
