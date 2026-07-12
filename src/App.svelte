<script lang="ts">
  import { onMount } from 'svelte'
  import PDFViewer from './components/PDFViewer.svelte'
  import Toolbar from './components/Toolbar.svelte'
  import TTSControls from './components/TTSControls.svelte'
  import PageNavigation from './components/PageNavigation.svelte'
  import BookmarksPanel from './components/BookmarksPanel.svelte'
  import SearchBar from './components/SearchBar.svelte'
  import DropZone from './components/DropZone.svelte'
  import DefaultHandlerDialog from './components/DefaultHandlerDialog.svelte'
  import { theme } from './stores/reader.svelte'
  import { ttsEngine } from './stores/tts.svelte'

  let showSidebar = $state(false)
  let showTTSPanel = $state(false)
  let showSearch = $state(false)
  let showDefaultDialog = $state(false)

  function toggleSidebar() {
    showSidebar = !showSidebar
  }

  function toggleTTSPanel() {
    showTTSPanel = !showTTSPanel
  }

  function toggleSearch() {
    showSearch = !showSearch
  }

  onMount(async () => {
    const api = (window as any).electronAPI
    if (!api) return

    // Load saved settings
    try {
      const settings = await api.loadSettings()
      if (settings.theme) {
        theme.set(settings.theme)
        document.documentElement.classList.toggle('dark', settings.theme === 'dark')
      }
      if (settings.ttsEngine) {
        ttsEngine.set(settings.ttsEngine)
      }
    } catch {
      // ignore
    }

    // Check if we should show default handler dialog
    try {
      const isDefault = await api.isDefaultPDFHandler()
      if (!isDefault) {
        const dismissCount = await api.getDefaultPromptDismissCount()
        if (dismissCount < 3) {
          showDefaultDialog = true
        }
      }
    } catch {
      // ignore
    }
  })
</script>

<div class="app" class:dark={$theme === 'dark'}>
  <DropZone>
    <Toolbar
      {toggleSidebar}
      {toggleTTSPanel}
      {toggleSearch}
    />

    <div class="main-content">
      {#if showSidebar}
        <aside class="sidebar">
          <BookmarksPanel />
        </aside>
      {/if}

      <main class="viewer-area">
        {#if showSearch}
          <SearchBar />
        {/if}
        <PDFViewer />
      </main>

      {#if showTTSPanel}
        <aside class="tts-panel">
          <TTSControls />
        </aside>
      {/if}
    </div>

    <PageNavigation />
  </DropZone>

  {#if showDefaultDialog}
    <DefaultHandlerDialog onclose={() => showDefaultDialog = false} />
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .main-content {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .sidebar {
    width: 260px;
    border-right: 1px solid var(--border);
    overflow-y: auto;
    background: var(--bg-secondary);
  }

  .viewer-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tts-panel {
    width: 280px;
    border-left: 1px solid var(--border);
    overflow-y: auto;
    background: var(--bg-secondary);
  }
</style>
