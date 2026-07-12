<script lang="ts">
  import { currentPage, totalPages, goToPage, prevPage, nextPage } from '../stores/reader.svelte'

  let pageInput = $state('')

  function handleSubmit() {
    const page = parseInt(pageInput)
    if (!isNaN(page) && page >= 1 && page <= $totalPages) {
      goToPage(page)
      pageInput = ''
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSubmit()
    }
  }

  function handleSliderInput(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value)
    if (!isNaN(val)) {
      goToPage(val)
    }
  }
</script>

<footer class="page-navigation">
  <div class="nav-left">
    <button class="nav-btn" onclick={prevPage} disabled={$currentPage <= 1} title="Previous Page">
      ◄
    </button>

    <button class="nav-btn" onclick={nextPage} disabled={$currentPage >= $totalPages} title="Next Page">
      ►
    </button>
  </div>

  <div class="nav-center">
    <span class="page-label">Page</span>
    <input
      type="text"
      class="page-input"
      bind:value={pageInput}
      onkeydown={handleKeydown}
      placeholder={$currentPage.toString()}
    />
    <span class="page-total">/ {$totalPages}</span>
  </div>

  <div class="nav-slider">
    {#if $totalPages > 1}
      <input
        type="range"
        class="slider"
        min="1"
        max={$totalPages}
        value={$currentPage}
        oninput={handleSliderInput}
      />
    {/if}
  </div>

  <div class="nav-right">
    <span class="progress-text">
      {#if $totalPages > 0}
        {Math.round(($currentPage / $totalPages) * 100)}%
      {/if}
    </span>
  </div>
</footer>

<style>
  .page-navigation {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 40px;
    padding: 0 12px;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border);
    user-select: none;
    flex-shrink: 0;
  }

  .nav-left {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .nav-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    font-size: 12px;
    background: var(--bg-tertiary);
    flex-shrink: 0;
  }

  .nav-btn:hover:not(:disabled) {
    background: var(--border);
  }

  .nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .nav-center {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .page-input {
    width: 44px;
    text-align: center;
    padding: 2px 4px;
    font-size: 13px;
  }

  .page-label, .page-total {
    font-size: 13px;
    color: var(--text-secondary);
  }

  .nav-slider {
    flex: 1;
    display: flex;
    align-items: center;
    min-width: 0;
    padding: 0 8px;
  }

  .slider {
    width: 100%;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: var(--border);
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--accent);
    cursor: pointer;
    transition: transform 0.1s;
  }

  .slider::-webkit-slider-thumb:hover {
    transform: scale(1.2);
  }

  .slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--accent);
    cursor: pointer;
    border: none;
  }

  .nav-right {
    flex-shrink: 0;
  }

  .progress-text {
    font-size: 12px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    min-width: 32px;
    text-align: right;
  }
</style>
