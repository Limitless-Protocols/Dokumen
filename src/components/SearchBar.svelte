<script lang="ts">
  import { pdfDocStore, goToPage, currentPage, activeSearchQuery, searchHighlightPages } from '../stores/reader.svelte'

  let searchQuery = $state('')
  let searchResults = $state<{ page: number; text: string }[]>([])
  let isSearching = $state(false)
  let selectedIndex = $state(-1)

  async function handleSearch() {
    if (!searchQuery.trim()) {
      searchResults = []
      activeSearchQuery.set('')
      searchHighlightPages.set(new Set())
      return
    }

    let pdfDoc: any = null
    pdfDocStore.subscribe(v => pdfDoc = v)()

    if (!pdfDoc) {
      searchResults = []
      activeSearchQuery.set('')
      searchHighlightPages.set(new Set())
      return
    }

    isSearching = true
    searchResults = []
    const query = searchQuery.toLowerCase()
    const matchedPages = new Set<number>()

    try {
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i)
        const textContent = await page.getTextContent()
        const pageText = textContent.items
          .filter((item: any) => 'str' in item)
          .map((item: any) => item.str)
          .join(' ')

        if (pageText.toLowerCase().includes(query)) {
          const snippet = getSnippet(pageText, query)
          searchResults.push({ page: i, text: snippet })
          matchedPages.add(i)
        }
      }
      selectedIndex = searchResults.length > 0 ? 0 : -1
    } catch (e) {
      console.error('[Dokumen] Search error:', e)
    }

    activeSearchQuery.set(searchQuery)
    searchHighlightPages.set(matchedPages)

    if (searchResults.length > 0) {
      goToResult(searchResults[0])
    }
    isSearching = false
  }

  function clearSearch() {
    searchQuery = ''
    searchResults = []
    activeSearchQuery.set('')
    searchHighlightPages.set(new Set())
  }

  function getSnippet(text: string, query: string): string {
    const idx = text.toLowerCase().indexOf(query)
    if (idx === -1) return text.substring(0, 80)
    const start = Math.max(0, idx - 30)
    const end = Math.min(text.length, idx + query.length + 50)
    let snippet = text.substring(start, end)
    if (start > 0) snippet = '...' + snippet
    if (end < text.length) snippet = snippet + '...'
    return snippet
  }

  function goToResult(result: { page: number }) {
    goToPage(result.page)
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      if (searchResults.length > 0 && selectedIndex < searchResults.length - 1) {
        selectedIndex++
        goToResult(searchResults[selectedIndex])
      } else {
        handleSearch()
      }
    }
    if (e.key === 'Escape') {
      clearSearch()
    }
  }
</script>

<div class="search-bar">
  <input
    type="text"
    class="search-input"
    bind:value={searchQuery}
    onkeydown={handleKeydown}
    placeholder="Search in document..."
  />
  <button class="search-btn" onclick={handleSearch} disabled={!searchQuery.trim() || isSearching}>
    {isSearching ? '...' : '🔍'}
  </button>
</div>

{#if searchResults.length > 0}
  <div class="search-results">
    <p class="results-count">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found</p>
    <ul class="results-list">
      {#each searchResults as result, i}
        <li>
          <button
            class="result-item"
            class:selected={i === selectedIndex}
            onclick={() => { selectedIndex = i; goToResult(result) }}
          >
            <span class="result-page">Page {result.page}</span>
            <span class="result-text">{result.text}</span>
          </button>
        </li>
      {/each}
    </ul>
  </div>
{:else if searchQuery.trim() && !isSearching}
  <div class="search-results">
    <p class="results-count no-results">No results found</p>
  </div>
{/if}

<style>
  .search-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
  }

  .search-input {
    flex: 1;
    padding: 6px 10px;
    font-size: 13px;
  }

  .search-btn {
    padding: 6px 10px;
    border-radius: var(--radius-md);
    background: var(--bg-tertiary);
    font-size: 14px;
    min-width: 36px;
  }

  .search-btn:hover:not(:disabled) {
    background: var(--border);
  }

  .search-results {
    padding: 8px 12px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    max-height: 200px;
    overflow-y: auto;
  }

  .results-count {
    font-size: 12px;
    color: var(--text-muted);
    margin-bottom: 4px;
  }

  .no-results {
    color: var(--text-muted);
  }

  .results-list {
    list-style: none;
  }

  .result-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    text-align: left;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    font-size: 12px;
  }

  .result-item:hover,
  .result-item.selected {
    background: var(--bg-tertiary);
  }

  .result-page {
    font-weight: 600;
    color: var(--accent);
    white-space: nowrap;
  }

  .result-text {
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
