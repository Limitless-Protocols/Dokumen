<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()
  let isDragOver = $state(false)

  function handleDragOver(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    isDragOver = true
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    isDragOver = false
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    isDragOver = false

    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return

    const file = files[0]
    if (file.name.toLowerCase().endsWith('.pdf')) {
      const filePath = (file as any).path || file.name
      window.dispatchEvent(new CustomEvent('load-pdf', { detail: { filePath } }))
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="drop-zone"
  class:drag-over={isDragOver}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
>
  {@render children()}

  {#if isDragOver}
    <div class="drop-overlay">
      <div class="drop-message">
        <span class="drop-icon">📄</span>
        <p>Drop PDF here</p>
      </div>
    </div>
  {/if}
</div>

<style>
  .drop-zone {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .drop-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(37, 99, 235, 0.1);
    border: 2px dashed var(--accent);
    border-radius: var(--radius-lg);
    z-index: 100;
    pointer-events: none;
  }

  .drop-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--accent);
    font-weight: 600;
  }

  .drop-icon {
    font-size: 48px;
  }
</style>
