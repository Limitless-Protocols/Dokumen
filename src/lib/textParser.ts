export interface TextItemPosition {
  start: number
  end: number
  itemIndex: number
}

export interface PageTextResult {
  text: string
  itemPositions: TextItemPosition[]
}

export interface SplitSentence {
  text: string
  start: number
  end: number
}

export function buildPageText(textContentItems: any[]): PageTextResult {
  const itemPositions: TextItemPosition[] = []
  let text = ''

  for (let i = 0; i < textContentItems.length; i++) {
    const item = textContentItems[i]
    const itemStr = item.str || ''

    if (itemStr.length > 0) {
      const start = text.length
      text += itemStr
      const end = text.length

      itemPositions.push({ start, end, itemIndex: i })
    } else {
      itemPositions.push({ start: text.length, end: text.length, itemIndex: -1 })
    }

    if (i < textContentItems.length - 1) {
      text += item.hasEOL ? '\n' : ' '
    }
  }

  if (import.meta.env?.DEV || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development')) {
    for (let i = 1; i < itemPositions.length; i++) {
      const prev = itemPositions[i - 1]
      const curr = itemPositions[i]
      if (prev.end > curr.start && prev.itemIndex >= 0 && curr.itemIndex >= 0) {
        console.warn(`[Dokumen] buildPageText: overlap between items ${i - 1} and ${i}: prev.end=${prev.end} > curr.start=${curr.start}`)
      }
    }
  }

  return { text, itemPositions }
}

export function splitIntoSentencesWithOffsets(text: string): SplitSentence[] {
  if (!text || text.trim().length === 0) return []

  const sentences: SplitSentence[] = []
  const regex = /(?<=[.!?])\s+/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const sentenceText = text.substring(lastIndex, match.index)
    if (sentenceText.trim().length > 0) {
      sentences.push({
        text: sentenceText,
        start: lastIndex,
        end: match.index
      })
    }
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    const remaining = text.substring(lastIndex)
    if (remaining.trim().length > 0) {
      sentences.push({
        text: remaining,
        start: lastIndex,
        end: text.length
      })
    }
  }

  if (import.meta.env?.DEV || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development')) {
    for (const s of sentences) {
      if (s.start < 0 || s.end > text.length) {
        console.warn(`[Dokumen] splitIntoSentencesWithOffsets: out-of-range sentence [${s.start}, ${s.end}] in text of length ${text.length}`)
      }
    }
  }

  return sentences
}

export function splitIntoSentences(text: string): string[] {
  return splitIntoSentencesWithOffsets(text).map(s => s.text)
}

export function splitIntoParagraphs(text: string): string[] {
  if (!text || text.trim().length === 0) return []

  return text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
}

export function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n/g, ' ')
    .trim()
}
