<script lang="ts">
  interface Props {
    onclose: () => void
  }

  let { onclose }: Props = $props()

  async function handleSetDefault() {
    try {
      await (window as any).electronAPI.setAsDefaultPDFHandler()
      await (window as any).electronAPI.setDefaultPromptDismissCount(999)
      onclose()
    } catch (e) {
      console.error('Failed to set default handler:', e)
    }
  }

  async function handleDismiss() {
    try {
      const count = await (window as any).electronAPI.getDefaultPromptDismissCount()
      await (window as any).electronAPI.setDefaultPromptDismissCount(count + 1)
      onclose()
    } catch {
      onclose()
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onclose()
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="dialog-overlay" onclick={onclose} onkeydown={handleKeydown} role="dialog" aria-modal="true" tabindex="-1">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="dialog" onclick={(e) => e.stopPropagation()} onkeydown={() => {}} role="document">
    <div class="dialog-icon">📄</div>
    <h2 class="dialog-title">Set Default PDF Reader</h2>
    <p class="dialog-message">
      Would you like to set <strong>Dokumen</strong> as your default PDF reader?
    </p>
    <p class="dialog-detail">
      This will make Dokumen open PDF files when you double-click them.
    </p>

    <div class="dialog-buttons">
      <button class="btn-secondary" onclick={handleDismiss}>
        Not Now
      </button>
      <button class="btn-primary" onclick={handleSetDefault}>
        Set as Default
      </button>
    </div>
  </div>
</div>

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1000;
  }

  .dialog {
    background: var(--bg-primary);
    border-radius: var(--radius-lg);
    padding: 24px;
    max-width: 400px;
    width: 90%;
    box-shadow: var(--shadow-lg);
  }

  .dialog-icon {
    font-size: 48px;
    text-align: center;
    margin-bottom: 12px;
  }

  .dialog-title {
    font-size: 18px;
    font-weight: 600;
    text-align: center;
    margin-bottom: 8px;
  }

  .dialog-message {
    font-size: 14px;
    text-align: center;
    margin-bottom: 4px;
  }

  .dialog-detail {
    font-size: 13px;
    color: var(--text-muted);
    text-align: center;
    margin-bottom: 20px;
  }

  .dialog-buttons {
    display: flex;
    gap: 12px;
    justify-content: center;
  }

  .btn-secondary {
    padding: 8px 16px;
    border-radius: var(--radius-md);
    background: var(--bg-tertiary);
    font-weight: 500;
  }

  .btn-secondary:hover {
    background: var(--border);
  }

  .btn-primary {
    padding: 8px 16px;
    border-radius: var(--radius-md);
    background: var(--accent);
    color: white;
    font-weight: 500;
  }

  .btn-primary:hover {
    background: var(--accent-hover);
  }
</style>
