import { writable, derived, get } from 'svelte/store'
import { splitIntoSentencesWithOffsets, type SplitSentence } from '../lib/textParser'
import { extractTextFromPage } from '../lib/pdfTextExtract'
import { pdfDocStore, totalPages, currentPage, scrollToPage } from './reader.svelte'

export type TTSState = 'idle' | 'loading' | 'speaking' | 'paused' | 'error'
export type TTSEngine = 'webspeech' | 'edge'

export interface TTSConfig {
  rate: number
  pitch: number
  volume: number
  webSpeechVoiceName: string
  edgeVoiceName: string
}

export interface BoundaryInfo {
  charIndex: number
  charLength: number
}

export interface EdgeTTSVoice {
  name: string
  shortName: string
  gender: string
  locale: string
}

interface WordBoundary {
  part: string
  start: number
  end: number
}

interface WordBoundaryWithOffset extends WordBoundary {
  charIndex: number
}

interface PrefetchResult {
  audioUrl: string
  subtitles: WordBoundary[]
  cleanup: string[]
}

// ── Stores ─────────────────────────────────────────────────────────

export const ttsState = writable<TTSState>('idle')
export const currentSentenceIndex = writable<number>(0)
export const sentences = writable<string[]>([])
export const ttsConfig = writable<TTSConfig>({
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  webSpeechVoiceName: '',
  edgeVoiceName: ''
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

// Edge TTS stores
export const ttsEngine = writable<TTSEngine>('webspeech')
export const edgeVoices = writable<EdgeTTSVoice[]>([])

// ── Shared state ───────────────────────────────────────────────────

let currentPlayingPage = 1
let isLooping = false

// ── Web Speech state ───────────────────────────────────────────────

let currentUtterance: SpeechSynthesisUtterance | null = null
let sentencesWithOffsets: SplitSentence[] = []
let lastWordCharIndexInSentence = 0
let pausedSentenceIndex = 0
let pausedCharOffsetInSentence = 0

// ── Edge TTS state ─────────────────────────────────────────────────

let edgeAudio: HTMLAudioElement | null = null
let edgeSubtitles: WordBoundaryWithOffset[] = []
let boundaryPointer = 0
let edgeAnimationFrame: number | null = null
let currentRequestId: string | null = null
let currentCleanupPaths: string[] = []
let prefetchCache: Map<number, PrefetchResult> = new Map()

// ── Retry state ────────────────────────────────────────────────────

let lastSpokenText: string | null = null
let lastSpokenPage: number | null = null

// ── Helpers ────────────────────────────────────────────────────────

function getWebSpeechVoices(): SpeechSynthesisVoice[] {
  return window.speechSynthesis?.getVoices() || []
}

function prosodyConfig(): { voice: string; rate: string; pitch: string; volume: string } {
  const config = get(ttsConfig)
  const ratePct = `${Math.round((config.rate - 1) * 100)}%`
  const pitchHz = `${Math.round((config.pitch - 1) * 50)}Hz`
  const volumePct = `${Math.round(config.volume * 100)}%`
  return {
    voice: config.edgeVoiceName || 'en-US-AriaNeural',
    rate: ratePct,
    pitch: pitchHz,
    volume: volumePct
  }
}

function precomputeCharIndexes(subs: WordBoundary[]): WordBoundaryWithOffset[] {
  let acc = 0
  return subs.map(s => {
    const withIndex = { ...s, charIndex: acc }
    acc += s.part.length
    return withIndex
  })
}

// ── Public API ─────────────────────────────────────────────────────

export function initTTS() {
  if (!window.speechSynthesis) return

  window.speechSynthesis.onvoiceschanged = () => {
    const voices = getWebSpeechVoices()
    if (voices.length > 0) {
      ttsConfig.update(c => ({
        ...c,
        webSpeechVoiceName: c.webSpeechVoiceName || voices[0].name
      }))
    }
  }
}

export async function loadEdgeVoices() {
  const voices = await window.electronAPI.ttsListVoices()
  edgeVoices.set(voices)
}

export function speak(text: string, pageNum: number = 1) {
  if (!text || !text.trim()) return

  lastSpokenText = text
  lastSpokenPage = pageNum

  const engine = get(ttsEngine)
  if (engine === 'edge') {
    speakEdge(text, pageNum)
  } else {
    speakWebSpeech(text, pageNum)
  }
}

export function pause() {
  const engine = get(ttsEngine)
  if (engine === 'edge') {
    pauseEdge()
  } else {
    pauseWebSpeech()
  }
}

export function resume() {
  const engine = get(ttsEngine)
  if (engine === 'edge') {
    resumeEdge()
  } else {
    resumeWebSpeech()
  }
}

export function stop() {
  const engine = get(ttsEngine)
  if (engine === 'edge') {
    stopEdge()
  } else {
    stopWebSpeech()
  }
}

export function nextSentence() {
  const engine = get(ttsEngine)
  if (engine === 'edge') {
    // Edge TTS doesn't support sentence-level navigation during playback
    // Stop and start from next page if possible
    stop()
  } else {
    nextSentenceWebSpeech()
  }
}

export function prevSentence() {
  const engine = get(ttsEngine)
  if (engine === 'edge') {
    stop()
  } else {
    prevSentenceWebSpeech()
  }
}

export function setRate(rate: number) {
  ttsConfig.update(c => ({ ...c, rate: Math.max(0.5, Math.min(3.0, rate)) }))
}

export function setWebSpeechVoice(name: string) {
  ttsConfig.update(c => ({ ...c, webSpeechVoiceName: name }))
}

export function setEdgeVoice(name: string) {
  ttsConfig.update(c => ({ ...c, edgeVoiceName: name }))
}

export function retryEdge() {
  ttsState.set('idle')
  ttsEngine.set('edge')
  if (lastSpokenText && lastSpokenPage != null) {
    speak(lastSpokenText, lastSpokenPage)
  }
}

export function speakPage(text: string, pageNum: number) {
  speak(text, pageNum)
}

// ── Web Speech Engine ──────────────────────────────────────────────

function speakWebSpeech(text: string, pageNum: number) {
  if (!window.speechSynthesis) return

  stop()

  currentPlayingPage = pageNum
  ttsPlayingPage.set(pageNum)
  ttsFullText.set(text)
  ttsState.set('loading')

  sentencesWithOffsets = splitIntoSentencesWithOffsets(text)
  ttsSentenceCount.set(sentencesWithOffsets.length)

  isLooping = true
  speakSentence(0)
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

  let config: TTSConfig = { rate: 1.0, pitch: 1.0, volume: 1.0, webSpeechVoiceName: '', edgeVoiceName: '' }
  ttsConfig.subscribe(c => config = c)()

  utterance.rate = config.rate
  utterance.pitch = config.pitch
  utterance.volume = config.volume

  const voices = getWebSpeechVoices()
  const selectedVoice = voices.find(v => v.name === config.webSpeechVoiceName)
  if (selectedVoice) {
    utterance.voice = selectedVoice
  }

  lastWordCharIndexInSentence = charOffsetInSentence

  utterance.onstart = () => {
    ttsState.set('speaking')
  }

  utterance.onboundary = (event: any) => {
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

function pauseWebSpeech() {
  if (!window.speechSynthesis?.speaking) return

  pausedSentenceIndex = get(ttsCurrentSentenceIndex)
  pausedCharOffsetInSentence = lastWordCharIndexInSentence

  window.speechSynthesis.cancel()
  ttsState.set('paused')
}

function resumeWebSpeech() {
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

function stopWebSpeech() {
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

function nextSentenceWebSpeech() {
  const idx = get(ttsCurrentSentenceIndex)
  window.speechSynthesis?.cancel()
  ttsBoundary.set(null)
  speakSentence(idx + 1)
}

function prevSentenceWebSpeech() {
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

// ── Cross-page navigation (shared) ─────────────────────────────────

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

  const engine = get(ttsEngine)
  if (engine === 'edge') {
    speakEdge(text, pageNum)
  } else {
    sentencesWithOffsets = splitIntoSentencesWithOffsets(text)
    ttsSentenceCount.set(sentencesWithOffsets.length)
    speakSentence(0)
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

  const engine = get(ttsEngine)
  if (engine === 'edge') {
    speakEdge(text, pageNum)
  } else {
    sentencesWithOffsets = splitIntoSentencesWithOffsets(text)
    ttsSentenceCount.set(sentencesWithOffsets.length)
    speakSentence(sentencesWithOffsets.length - 1)
  }
}

// ── Edge TTS Engine ────────────────────────────────────────────────

async function speakEdge(text: string, pageNum: number) {
  stopEdge()
  ttsState.set('loading')

  currentPlayingPage = pageNum
  ttsPlayingPage.set(pageNum)
  ttsFullText.set(text)

  const requestId = crypto.randomUUID()
  currentRequestId = requestId

  isLooping = true

  // Use prefetched audio if available for this page
  let result = prefetchCache.get(pageNum)
  prefetchCache.delete(pageNum)

  if (!result) {
    try {
      const config = prosodyConfig()
      result = await window.electronAPI.ttsSpeak({
        text,
        requestId,
        ...config
      }) ?? undefined
    } catch (err) {
      console.error('[Dokumen] Edge TTS speak failed:', err)
    }
  }

  // Staleness check — request may have been superseded during network I/O
  if (!result || currentRequestId !== requestId) return

  currentCleanupPaths = result.cleanup
  edgeSubtitles = precomputeCharIndexes(result.subtitles)
  boundaryPointer = 0

  edgeAudio = new Audio(result.audioUrl)
  if (import.meta.env?.DEV) console.log('[edge-tts]', { audioUrl: result.audioUrl, subtitles: result.subtitles.length })

  edgeAudio.onplay = () => {
    ttsState.set('speaking')
    edgeAnimationFrame = requestAnimationFrame(trackEdgeWordBoundaries)
  }

  edgeAudio.onended = () => {
    cleanupCurrentEdge()
    const total = get(totalPages)
    const nextPage = currentPlayingPage + 1
    if (isLooping && nextPage <= total) {
      continueToNextPage(nextPage)
    } else {
      ttsState.set('idle')
      ttsBoundary.set(null)
      isLooping = false
    }
  }

  edgeAudio.onerror = () => {
    if (import.meta.env?.DEV) console.error('[Dokumen] Edge TTS audio error')
    stopEdge()
    ttsState.set('error')
  }

  edgeAudio.onpause = () => {
    if (edgeAnimationFrame) {
      cancelAnimationFrame(edgeAnimationFrame)
      edgeAnimationFrame = null
    }
  }

  try {
    await edgeAudio.play()
  } catch (err) {
    console.error('[Dokumen] Edge TTS play failed:', err)
    ttsState.set('error')
    return
  }

  // Prefetch next page while current plays
  if (get(ttsEngine) === 'edge') {
    prefetchNextPage(pageNum)
  }
}

function trackEdgeWordBoundaries() {
  if (!edgeAudio || !edgeSubtitles.length) return

  const t = edgeAudio.currentTime * 1000

  // Pointer-based scan: boundaries are monotonic in time
  while (
    boundaryPointer < edgeSubtitles.length - 1 &&
    t >= edgeSubtitles[boundaryPointer + 1].start
  ) {
    boundaryPointer++
  }

  const current = edgeSubtitles[boundaryPointer]
  if (current && t >= current.start && t < current.end) {
    ttsBoundary.set({
      charIndex: current.charIndex,
      charLength: current.part.length
    })
  }

  edgeAnimationFrame = requestAnimationFrame(trackEdgeWordBoundaries)
}

function pauseEdge() {
  if (!edgeAudio) return
  edgeAudio.pause()
  ttsState.set('paused')
}

function resumeEdge() {
  if (!edgeAudio || get(ttsState) !== 'paused') return
  edgeAudio.play()
  ttsState.set('speaking')
  edgeAnimationFrame = requestAnimationFrame(trackEdgeWordBoundaries)
}

function stopEdge() {
  currentRequestId = null
  if (edgeAnimationFrame) {
    cancelAnimationFrame(edgeAnimationFrame)
    edgeAnimationFrame = null
  }
  if (edgeAudio) {
    edgeAudio.pause()
    edgeAudio.src = ''
    edgeAudio.load() // release media resources
    edgeAudio = null
  }
  cleanupCurrentEdge()
  window.electronAPI.ttsStop()

  ttsState.set('idle')
  ttsBoundary.set(null)
  isLooping = false
}

function cleanupCurrentEdge() {
  if (currentCleanupPaths.length) {
    window.electronAPI.ttsCleanup(currentCleanupPaths)
    currentCleanupPaths = []
  }
}

async function prefetchNextPage(currentPageNum: number) {
  const pdfDoc = get(pdfDocStore)
  if (!pdfDoc) return

  const nextPage = currentPageNum + 1
  const total = get(totalPages)
  if (nextPage > total || prefetchCache.has(nextPage)) return

  try {
    const text = await extractTextFromPage(pdfDoc, nextPage)
    if (!text || !text.trim()) return

    const requestId = crypto.randomUUID()
    const config = prosodyConfig()
    const result = await window.electronAPI.ttsSpeak({
      text,
      requestId,
      ...config
    })
    if (result) {
      prefetchCache.set(nextPage, result)
    }
  } catch {
    // prefetch failure is non-fatal
  }
}
