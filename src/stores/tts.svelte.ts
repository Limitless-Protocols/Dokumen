import { writable, derived, get } from 'svelte/store'
import { splitIntoSentencesWithOffsets, type SplitSentence } from '../lib/textParser'
import { extractTextFromPage } from '../lib/pdfTextExtract'
import { pdfDocStore, totalPages, currentPage, scrollToPage } from './reader.svelte'

export type TTSState = 'idle' | 'loading' | 'speaking' | 'paused' | 'error'

export interface TTSConfig {
  rate: number
  pitch: number
  volume: number
  voiceName: string
}

export interface BoundaryInfo {
  charIndex: number
  charLength: number
}

export const ttsState = writable<TTSState>('idle')
export const currentSentenceIndex = writable<number>(0)
export const sentences = writable<string[]>([])
export const ttsConfig = writable<TTSConfig>({
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  voiceName: ''
})
export const pageText = writable<string>('')
export const ttsBoundary = writable<BoundaryInfo | null>(null)
export const ttsFullText = writable<string>('')
export const ttsPlayingPage = writable<number>(1)
export const ttsSentenceCount = writable<number>(0)
export const ttsCurrentSentenceIndex = writable<number>(0)

export const isSpeaking = derived(ttsState, $s => $s === 'speaking')
export const isPaused = derived(ttsState, $s => $s === 'paused')
export const isIdle = derived(ttsState, $s => $s === 'idle')
export const canPlay = derived(ttsState, $s => $s === 'idle' || $s === 'paused')
export const canPause = derived(ttsState, $s => $s === 'speaking')

let currentUtterance: SpeechSynthesisUtterance | null = null
let currentPlayingPage = 1
let sentencesWithOffsets: SplitSentence[] = []
let isLooping = false

let lastWordCharIndexInSentence = 0
let pausedSentenceIndex = 0
let pausedCharOffsetInSentence = 0

function getVoices(): SpeechSynthesisVoice[] {
  return window.speechSynthesis?.getVoices() || []
}

export function initTTS() {
  if (!window.speechSynthesis) return

  window.speechSynthesis.onvoiceschanged = () => {
    const voices = getVoices()
    if (voices.length > 0) {
      ttsConfig.update(c => ({
        ...c,
        voiceName: c.voiceName || voices[0].name
      }))
    }
  }
}

function speakSentenceFrom(index: number, charOffsetInSentence: number, textToSpeak: string) {
  const sentence = sentencesWithOffsets[index]
  if (!sentence) {
    ttsState.set('idle')
    ttsBoundary.set(null)
    isLooping = false
    return
  }

  ttsCurrentSentenceIndex.set(index)
  currentSentenceIndex.set(index)
  sentences.set(sentencesWithOffsets.map(s => s.text))

  const utterance = new SpeechSynthesisUtterance(textToSpeak)

  let config: TTSConfig = { rate: 1.0, pitch: 1.0, volume: 1.0, voiceName: '' }
  ttsConfig.subscribe(c => config = c)()

  utterance.rate = config.rate
  utterance.pitch = config.pitch
  utterance.volume = config.volume

  const voices = getVoices()
  const selectedVoice = voices.find(v => v.name === config.voiceName)
  if (selectedVoice) {
    utterance.voice = selectedVoice
  }

  lastWordCharIndexInSentence = charOffsetInSentence

  utterance.onstart = () => {
    ttsState.set('speaking')
  }

  utterance.onboundary = (event: SpeechSynthesisBoundaryEvent) => {
    if (event.name === 'word') {
      let charLength = event.charLength || 0
      if (!charLength && event.name === 'word') {
        const remaining = textToSpeak.substring(event.charIndex)
        const match = remaining.match(/^\S+/)
        charLength = match ? match[0].length : 1
      } else if (!charLength) {
        charLength = 1
      }

      lastWordCharIndexInSentence = charOffsetInSentence + event.charIndex

      ttsBoundary.set({
        charIndex: event.charIndex + charOffsetInSentence + sentence.start,
        charLength
      })
    }
  }

  utterance.onend = () => {
    ttsBoundary.set(null)
    if (isLooping) {
      speakSentence(index + 1)
    }
  }

  utterance.onerror = (e) => {
    if (e.error === 'canceled' || e.error === 'interrupted') {
      return
    }
    console.error('[Dokumen] TTS error:', e.error)
    ttsState.set('error')
    ttsBoundary.set(null)
    isLooping = false
  }

  currentUtterance = utterance
  ttsState.set('speaking')
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

function speakSentence(index: number) {
  if (!isLooping || index >= sentencesWithOffsets.length) {
    const total = get(totalPages)
    const nextPage = currentPlayingPage + 1
    if (isLooping && nextPage <= total) {
      continueToNextPage(nextPage)
      return
    }
    ttsState.set('idle')
    ttsBoundary.set(null)
    isLooping = false
    return
  }

  speakSentenceFrom(index, 0, sentencesWithOffsets[index].text)
}

async function continueToNextPage(pageNum: number) {
  const pdfDoc = get(pdfDocStore)
  if (!pdfDoc) {
    ttsState.set('idle')
    isLooping = false
    return
  }

  const text = await extractTextFromPage(pdfDoc, pageNum)
  if (!text || !text.trim() || !isLooping) {
    ttsState.set('idle')
    isLooping = false
    return
  }

  currentPlayingPage = pageNum
  ttsPlayingPage.set(pageNum)
  ttsFullText.set(text)
  currentPage.set(pageNum)
  scrollToPage(pageNum)

  sentencesWithOffsets = splitIntoSentencesWithOffsets(text)
  ttsSentenceCount.set(sentencesWithOffsets.length)

  speakSentence(0)
}

export function speak(text: string, pageNum: number = 1) {
  if (!window.speechSynthesis) return

  stop()

  if (!text || !text.trim()) return

  currentPlayingPage = pageNum
  ttsPlayingPage.set(pageNum)
  ttsFullText.set(text)
  ttsState.set('loading')

  sentencesWithOffsets = splitIntoSentencesWithOffsets(text)
  ttsSentenceCount.set(sentencesWithOffsets.length)

  isLooping = true
  speakSentence(0)
}

export function pause() {
  if (!window.speechSynthesis?.speaking) return

  pausedSentenceIndex = get(ttsCurrentSentenceIndex)
  pausedCharOffsetInSentence = lastWordCharIndexInSentence

  window.speechSynthesis.cancel()

  ttsState.set('paused')
}

export function resume() {
  if (get(ttsState) !== 'paused') return

  const idx = pausedSentenceIndex
  const sentence = sentencesWithOffsets[idx]
  if (!sentence) {
    ttsState.set('idle')
    return
  }

  const remainingText = sentence.text.substring(pausedCharOffsetInSentence)
  if (!remainingText.trim()) {
    speakSentence(idx + 1)
    return
  }

  speakSentenceFrom(idx, pausedCharOffsetInSentence, remainingText)
}

export function stop() {
  isLooping = false
  window.speechSynthesis?.cancel()
  ttsState.set('idle')
  currentSentenceIndex.set(0)
  ttsCurrentSentenceIndex.set(0)
  ttsSentenceCount.set(0)
  ttsBoundary.set(null)
  sentences.set([])
  currentUtterance = null
  pausedSentenceIndex = 0
  pausedCharOffsetInSentence = 0
  lastWordCharIndexInSentence = 0
}

export function nextSentence() {
  const idx = get(ttsCurrentSentenceIndex)
  window.speechSynthesis?.cancel()
  ttsBoundary.set(null)
  speakSentence(idx + 1)
}

export function prevSentence() {
  const idx = get(ttsCurrentSentenceIndex)
  if (idx > 0) {
    window.speechSynthesis?.cancel()
    ttsBoundary.set(null)
    speakSentence(idx - 1)
  } else if (currentPlayingPage > 1) {
    const prevPage = currentPlayingPage - 1
    window.speechSynthesis?.cancel()
    ttsBoundary.set(null)
    continueToPrevPage(prevPage)
  } else {
    stop()
  }
}

async function continueToPrevPage(pageNum: number) {
  const pdfDoc = get(pdfDocStore)
  if (!pdfDoc) {
    stop()
    return
  }

  const text = await extractTextFromPage(pdfDoc, pageNum)
  if (!text || !text.trim()) {
    stop()
    return
  }

  currentPlayingPage = pageNum
  ttsPlayingPage.set(pageNum)
  ttsFullText.set(text)
  currentPage.set(pageNum)
  scrollToPage(pageNum)

  sentencesWithOffsets = splitIntoSentencesWithOffsets(text)
  ttsSentenceCount.set(sentencesWithOffsets.length)

  speakSentence(sentencesWithOffsets.length - 1)
}

export function setRate(rate: number) {
  ttsConfig.update(c => ({ ...c, rate: Math.max(0.5, Math.min(3.0, rate)) }))
}

export function setVoice(voiceName: string) {
  ttsConfig.update(c => ({ ...c, voiceName }))
}

export function speakPage(text: string, pageNum: number) {
  speak(text, pageNum)
}
