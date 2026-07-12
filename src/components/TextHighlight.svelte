<script lang="ts">
  let highlightedText = $state('')
  let highlightIndex = $state(-1)

  // Listen for TTS highlight events
  $effect(() => {
    function handleHighlight(event: Event) {
      const detail = (event as CustomEvent).detail
      highlightedText = detail.text || ''
      highlightIndex = detail.index || -1
    }

    window.addEventListener('tts-highlight', handleHighlight)
    return () => window.removeEventListener('tts-highlight', handleHighlight)
  })
</script>

{#if highlightedText}
  <div class="text-highlight">
    <span class="highlighted">{highlightedText}</span>
  </div>
{/if}

<style>
  .text-highlight {
    position: absolute;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--highlight);
    color: var(--highlight-text);
    padding: 8px 16px;
    border-radius: var(--radius-md);
    font-size: 14px;
    max-width: 80%;
    text-align: center;
    box-shadow: var(--shadow-md);
    z-index: 50;
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }
</style>
