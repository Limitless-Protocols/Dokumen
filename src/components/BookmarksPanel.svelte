<script lang="ts">
  import { bookmarks, removeBookmark, addBookmark, type Bookmark } from '../stores/bookmarks.svelte'
  import { currentPage, filePath, goToPage } from '../stores/reader.svelte'

  let currentFilePath = $state<string | null>(null)

  $effect(() => {
    const unsub = filePath.subscribe(f => currentFilePath = f)
    return unsub
  })

  function goToBookmark(bookmark: Bookmark) {
    goToPage(bookmark.page)
  }

  let currentBookmarks = $derived(
    $bookmarks.filter(bm => bm.filePath === currentFilePath)
  )

  function handleAddBookmark() {
    let title = 'Bookmark'
    if (currentFilePath) {
      title = currentFilePath.split(/[/\\]/).pop()?.replace('.pdf', '') || 'Bookmark'
    }
    addBookmark({
      title,
      page: $currentPage,
      filePath: currentFilePath || '',
      color: '#2563eb'
    })
  }
</script>

<div class="bookmarks-panel">
  <h3 class="panel-title">Bookmarks</h3>

  {#if currentBookmarks.length === 0}
    <p class="empty">No bookmarks yet</p>
    <p class="hint">Click the button below to add one</p>
  {:else}
    <ul class="bookmark-list">
      {#each currentBookmarks as bm (bm.id)}
        <li class="bookmark-item">
          <button class="bookmark-btn" onclick={() => goToBookmark(bm)}>
            <span class="bookmark-color" style="background: {bm.color || '#2563eb'}"></span>
            <div class="bookmark-info">
              <span class="bookmark-title">{bm.title}</span>
              <span class="bookmark-page">Page {bm.page}</span>
            </div>
          </button>
          <button class="remove-btn" onclick={() => removeBookmark(bm.id)} title="Remove bookmark">
            ×
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="add-bookmark">
    <button class="add-btn" onclick={handleAddBookmark}>
      + Add Bookmark
    </button>
  </div>
</div>

<style>
  .bookmarks-panel {
    padding: 16px;
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .panel-title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 12px;
  }

  .empty {
    color: var(--text-muted);
    font-size: 14px;
    text-align: center;
    padding: 16px 0;
  }

  .hint {
    color: var(--text-muted);
    font-size: 12px;
    text-align: center;
  }

  .bookmark-list {
    list-style: none;
    flex: 1;
    overflow-y: auto;
  }

  .bookmark-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 0;
  }

  .bookmark-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    text-align: left;
    flex: 1;
    min-width: 0;
  }

  .bookmark-btn:hover {
    background: var(--bg-tertiary);
  }

  .bookmark-color {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .bookmark-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .bookmark-title {
    font-size: 13px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bookmark-page {
    font-size: 11px;
    color: var(--text-muted);
  }

  .remove-btn {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    font-size: 14px;
    color: var(--text-muted);
    opacity: 0;
    transition: opacity 0.15s;
  }

  .bookmark-item:hover .remove-btn {
    opacity: 1;
  }

  .remove-btn:hover {
    color: var(--error);
    background: var(--bg-tertiary);
  }

  .add-bookmark {
    padding-top: 12px;
    border-top: 1px solid var(--border);
    margin-top: auto;
  }

  .add-btn {
    width: 100%;
    padding: 8px;
    border-radius: var(--radius-md);
    background: var(--bg-tertiary);
    font-size: 13px;
    font-weight: 500;
  }

  .add-btn:hover {
    background: var(--border);
  }
</style>
