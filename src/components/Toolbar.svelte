<script lang="ts">
  import { theme, fitMode, currentPage, totalPages, toggleFitMode, toggleTheme } from '../stores/reader.svelte'

  interface Props {
    toggleSidebar: () => void
    toggleTTSPanel: () => void
    toggleSearch: () => void
  }

  let { toggleSidebar, toggleTTSPanel, toggleSearch }: Props = $props()

  let currentFilePath = $state<string | null>(null)

  async function openFile() {
    const { openFileDialog } = (window as any).electronAPI
    const filePath = await openFileDialog()
    if (filePath) {
      currentFilePath = filePath
      window.dispatchEvent(new CustomEvent('load-pdf', { detail: { filePath } }))
    }
  }
</script>

<header class="toolbar">
  <div class="toolbar-left">
    <button class="toolbar-btn" onclick={openFile} title="Open PDF">
      <span class="icon">📂</span>
      <span class="label">Open</span>
    </button>

    <div class="separator"></div>

    <button class="toolbar-btn" onclick={toggleSidebar} title="Toggle Sidebar">
      <span class="icon">📑</span>
    </button>
  </div>

  <div class="toolbar-center">
    <span class="app-title">Dokumen</span>
  </div>

  <div class="toolbar-right">
    <button class="toolbar-btn fit-btn" onclick={toggleFitMode} title={$fitMode === 'width' ? 'Fit to Width' : 'Fit to Height'}>
      <span class="icon">{$fitMode === 'width' ? '↔' : '↕'}</span>
      <span class="label">{$fitMode === 'width' ? 'Width' : 'Height'}</span>
    </button>

    <div class="separator"></div>

    <button class="toolbar-btn" onclick={toggleSearch} title="Search">
      <span class="icon">🔍</span>
    </button>

    <button class="toolbar-btn" onclick={toggleTTSPanel} title="Read Aloud">
      <span class="icon">🔊</span>
    </button>

    <div class="separator"></div>

    <button class="toolbar-btn" onclick={() => toggleTheme()} title="Toggle Theme">
      <span class="icon">{$theme === 'dark' ? '☀' : '🌙'}</span>
    </button>
  </div>
</header>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 48px;
    padding: 0 12px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    user-select: none;
    -webkit-app-region: drag;
    flex-shrink: 0;
  }

  .toolbar-left, .toolbar-center, .toolbar-right {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .toolbar-center {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
  }

  .app-title {
    font-weight: 600;
    font-size: 14px;
    color: var(--text-primary);
  }

  .separator {
    width: 1px;
    height: 20px;
    background: var(--border);
    margin: 0 4px;
  }

  .icon {
    font-size: 16px;
    filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.35));
  }

  .label {
    font-size: 12px;
  }

  .toolbar-btn {
    -webkit-app-region: no-drag;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 10px;
    border-radius: var(--radius-md);
    font-size: 13px;
    font-weight: 500;
    transition: background 0.15s;
  }

  .toolbar-btn:hover {
    background: var(--bg-tertiary);
  }

  .fit-btn {
    background: var(--accent-light);
    color: var(--accent);
  }

  .fit-btn:hover {
    background: var(--accent);
    color: white;
  }
</style>
