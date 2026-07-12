<script lang="ts">
  import { ttsState, speak, pause, resume, stop, nextSentence, prevSentence, setRate, setVoice, ttsConfig, initTTS, pageText } from '../stores/tts.svelte'
  import { currentPage, totalPages, pdfDocStore } from '../stores/reader.svelte'
  import { extractTextFromPage } from '../lib/pdfTextExtract'

  let availableVoices = $state<SpeechSynthesisVoice[]>([])

  $effect(() => {
    initTTS()
    function loadVoices() {
      availableVoices = window.speechSynthesis?.getVoices() || []
    }
    loadVoices()
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoices)
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices)
  })

  function handlePlayPause() {
    const state = $ttsState
    if (state === 'idle') {
      const text = $pageText
      if (text) speak(text, $currentPage)
    } else if (state === 'paused') {
      resume()
    } else if (state === 'speaking') {
      pause()
    }
  }

  async function handleNextPage() {
    stop()
    const next = Math.min($currentPage + 1, $totalPages)
    currentPage.set(next)
    const doc = $pdfDocStore
    if (doc) {
      const text = await extractTextFromPage(doc, next)
      if (text) speak(text, next)
    }
  }

  async function handlePrevPage() {
    stop()
    const prev = Math.max($currentPage - 1, 1)
    currentPage.set(prev)
    const doc = $pdfDocStore
    if (doc) {
      const text = await extractTextFromPage(doc, prev)
      if (text) speak(text, prev)
    }
  }

  const speedPresets = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0]
</script>

<div class="tts-controls">
  <h3 class="tts-title">Read Aloud</h3>

  <div class="playback-controls">
    <button class="control-btn" onclick={prevSentence} disabled={$ttsState === 'idle'} title="Previous Sentence">
      ◄◄
    </button>

    <button class="play-btn" class:playing={$ttsState === 'speaking'} onclick={handlePlayPause} title={$ttsState === 'speaking' ? 'Pause' : 'Play'}>
      {#if $ttsState === 'speaking'}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1"/>
          <rect x="14" y="4" width="4" height="16" rx="1"/>
        </svg>
      {:else}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="8,5 19,12 8,19"/>
        </svg>
      {/if}
    </button>

    <button class="control-btn stop-btn" onclick={stop} disabled={$ttsState === 'idle'} title="Stop">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="6" width="12" height="12" rx="1"/>
      </svg>
    </button>

    <button class="control-btn" onclick={nextSentence} disabled={$ttsState === 'idle'} title="Next Sentence">
      ►►
    </button>
  </div>

  <div class="page-controls">
    <button class="control-btn small" onclick={handlePrevPage} disabled={$currentPage <= 1}>
      ◄ Page
    </button>

    <span class="page-info">{$currentPage} / {$totalPages}</span>

    <button class="control-btn small" onclick={handleNextPage} disabled={$currentPage >= $totalPages}>
      Page ►
    </button>
  </div>

  <div class="settings">
    <div class="setting-row">
      <label for="speed">Speed</label>
      <select
        id="speed"
        value={$ttsConfig.rate}
        onchange={(e) => setRate(parseFloat((e.target as HTMLSelectElement).value))}
      >
        {#each speedPresets as speed}
          <option value={speed}>{speed}x</option>
        {/each}
      </select>
    </div>

    <div class="setting-row">
      <label for="voice">Voice</label>
      <select
        id="voice"
        value={$ttsConfig.voiceName}
        onchange={(e) => setVoice((e.target as HTMLSelectElement).value)}
      >
        {#each availableVoices as voice}
          <option value={voice.name}>
            {voice.name}
          </option>
        {/each}
      </select>
    </div>
  </div>
</div>

<style>
  .tts-controls {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .tts-title {
    font-size: 15px;
    font-weight: 600;
  }

  .playback-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  .control-btn {
    padding: 8px 12px;
    border-radius: var(--radius-md);
    font-size: 13px;
    font-weight: 500;
    background: var(--bg-tertiary);
    transition: background 0.15s;
  }

  .control-btn:hover:not(:disabled) {
    background: var(--border);
  }

  .control-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .control-btn.small {
    padding: 6px 10px;
    font-size: 12px;
  }

  .play-btn {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--accent);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s, transform 0.15s;
    border: none;
    cursor: pointer;
  }

  .play-btn:hover {
    background: var(--accent-hover);
    transform: scale(1.05);
  }

  .play-btn:active {
    transform: scale(0.95);
  }

  .play-btn.playing {
    background: var(--warning);
  }

  .play-btn.playing:hover {
    background: #d97706;
  }

  .play-btn svg, .stop-btn svg {
    filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.25));
  }

  .stop-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
    border: none;
    cursor: pointer;
  }

  .stop-btn:hover:not(:disabled) {
    background: var(--error);
    color: white;
  }

  .stop-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .page-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .page-info {
    font-size: 13px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .settings {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .setting-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .setting-row label {
    font-size: 12px;
    color: var(--text-secondary);
    min-width: 40px;
    flex-shrink: 0;
  }

  .setting-row select {
    flex: 1;
    min-width: 0;
    padding: 5px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
