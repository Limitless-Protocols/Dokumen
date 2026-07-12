<script lang="ts">
  import { onDestroy } from 'svelte'
  import { currentPage, fitMode, totalPages, title, filePath as storeFilePath, pdfDocStore, activeSearchQuery, searchHighlightPages, scrollToPage } from '../stores/reader.svelte'
  import { pageText, ttsBoundary, ttsFullText, ttsPlayingPage, ttsState } from '../stores/tts.svelte'
  import { buildPageText, type PageTextResult } from '../lib/textParser'

  let scrollContainer: HTMLDivElement | undefined = $state(undefined)
  let loading = $state(true)
  let error = $state<string | null>(null)
  let pdfDoc: any = null
  let pdfjsLib: any = null
  let TextLayerCls: any = null
  let scale = $state(1.5)
  let observer: IntersectionObserver | null = null
  let currentPageValue = 1
  let fitModeValue: 'width' | 'height' = 'width'
  let firstPageViewport: any = null
  let scrollTimeout: ReturnType<typeof setTimeout> | null = null
  let textExtracting = false

  let searchQuery = ''
  let searchPages = new Set<number>()
  let currentBoundary: { charIndex: number; charLength: number } | null = null
  let fullTtsText = ''
  let playingPage = 1
  let speaking = false

  const pageTextLayers: Map<number, HTMLDivElement> = new Map()
  const pageSpanMaps: Map<number, { el: HTMLSpanElement; text: string; start: number; end: number }[]> = new Map()
  const pageCharMaps: Map<number, number[]> = new Map()
  const pageTextCache: Map<number, PageTextResult> = new Map()

  currentPage.subscribe(v => {
    currentPageValue = v
    extractTextForPage(v)
  })
  fitMode.subscribe(v => {
    fitModeValue = v
    if (pdfDoc && scrollContainer) {
      recalculateScale()
      rerenderAll()
      if (speaking || currentBoundary) {
        scrollToPage(playingPage)
        setTimeout(() => {
          const boundary = currentBoundary
          if (boundary) {
            highlightTtsOnPage(playingPage, boundary.charIndex, boundary.charLength)
          }
        }, 300)
      }
    }
  })
  activeSearchQuery.subscribe(v => { searchQuery = v })
  searchHighlightPages.subscribe(v => { searchPages = v })
  ttsBoundary.subscribe(v => { currentBoundary = v })
  ttsFullText.subscribe(v => { fullTtsText = v })
  ttsPlayingPage.subscribe(v => { playingPage = v })
  ttsState.subscribe(v => { speaking = v === 'speaking' || v === 'paused' })

  function getContainerWidth(): number {
    return scrollContainer?.clientWidth || 800
  }

  function getContainerHeight(): number {
    return scrollContainer?.clientHeight || 600
  }

  function recalculateScale() {
    if (!firstPageViewport) return
    const page = firstPageViewport
    if (fitModeValue === 'width') {
      scale = (getContainerWidth() - 40) / (page.width / (page.scale || 1))
    } else {
      scale = (getContainerHeight() - 48) / (page.height / (page.scale || 1))
    }
  }

  async function loadPDF(path: string) {
    try {
      loading = true
      error = null
      pdfDoc = null
      pageTextLayers.clear()
      pageSpanMaps.clear()
      pageCharMaps.clear()
      pageTextCache.clear()

      pdfjsLib = await import('pdfjs-dist')
      TextLayerCls = pdfjsLib.TextLayer

      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).href

      const { readFile } = (window as any).electronAPI
      const arrayBuffer = await readFile(path)

      pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      pdfDocStore.set(pdfDoc)

      totalPages.set(pdfDoc.numPages)
      currentPage.set(1)
      storeFilePath.set(path)

      const fileName = await (window as any).electronAPI.getFileName(path)
      title.set(fileName)

      const firstPage = await pdfDoc.getPage(1)
      const unscaledViewport = firstPage.getViewport({ scale: 1 })
      firstPageViewport = { width: unscaledViewport.width, height: unscaledViewport.height, scale: 1 }

      recalculateScale()
      createPages()
      setupObserver()

      loading = false

      setTimeout(() => renderVisiblePages(), 100)
    } catch (e: any) {
      console.error('[Dokumen] Load error:', e)
      error = e.message || 'Failed to load PDF'
      loading = false
    }
  }

  function createPages() {
    if (!scrollContainer || !pdfDoc) return

    if (import.meta.env?.DEV || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development')) {
      console.log(`[DIAG] createPages called — pageSpanMaps had ${pageSpanMaps.size} entries, pageCharMaps had ${pageCharMaps.size} entries`)
    }
    scrollContainer.innerHTML = ''
    pageTextLayers.clear()
    pageSpanMaps.clear()
    pageCharMaps.clear()

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const pageDiv = document.createElement('div')
      pageDiv.id = `page-container-${i}`
      pageDiv.className = 'page-placeholder'
      pageDiv.dataset.pageNum = String(i)

      const w = firstPageViewport ? firstPageViewport.width * scale : 612
      const h = firstPageViewport ? firstPageViewport.height * scale : 792

      pageDiv.style.width = `${w}px`
      pageDiv.style.height = `${h}px`
      pageDiv.style.margin = '0 auto 16px auto'
      pageDiv.style.position = 'relative'
      pageDiv.style.background = 'white'
      pageDiv.style.borderRadius = '2px'
      pageDiv.style.boxShadow = '0 1px 4px rgba(0,0,0,0.15)'
      pageDiv.style.overflow = 'hidden'

      const textLayerDiv = document.createElement('div')
      textLayerDiv.className = 'textLayer'
      textLayerDiv.style.position = 'absolute'
      textLayerDiv.style.top = '0'
      textLayerDiv.style.left = '0'
      textLayerDiv.style.width = `${w}px`
      textLayerDiv.style.height = `${h}px`
      textLayerDiv.style.zIndex = '2'
      textLayerDiv.style.pointerEvents = 'none'
      textLayerDiv.dataset.pageNum = String(i)
      pageDiv.appendChild(textLayerDiv)

      pageTextLayers.set(i, textLayerDiv)

      const focusOverlay = document.createElement('div')
      focusOverlay.className = 'focus-overlay'
      focusOverlay.dataset.pageNum = String(i)
      pageDiv.appendChild(focusOverlay)

      scrollContainer.appendChild(pageDiv)
    }
  }

  function setupObserver() {
    if (observer) observer.disconnect()

    const options = {
      root: scrollContainer,
      rootMargin: '400px 0px',
      threshold: 0.01
    }

    observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        const pageNum = parseInt(entry.target.dataset.pageNum || '0')
        if (!pageNum) return

        if (entry.isIntersecting) {
          renderPage(pageNum, entry.target as HTMLElement)
        } else {
          clearPage(entry.target as HTMLElement)
        }
      })
    }, options)

    const placeholders = scrollContainer?.querySelectorAll('.page-placeholder')
    placeholders?.forEach(el => observer!.observe(el))
  }

  async function renderPage(pageNum: number, containerDiv: HTMLElement) {
    if (!pdfDoc) return
    if (containerDiv.querySelector('canvas')) return

    try {
      const page = await pdfDoc.getPage(pageNum)
      const viewport = page.getViewport({ scale })

      const canvas = document.createElement('canvas')
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      canvas.style.position = 'absolute'
      canvas.style.top = '0'
      canvas.style.left = '0'
      canvas.style.borderRadius = '2px'
      canvas.style.zIndex = '0'

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)

      await page.render({ canvasContext: ctx, viewport }).promise

      containerDiv.insertBefore(canvas, containerDiv.firstChild)

      containerDiv.style.width = `${viewport.width}px`
      containerDiv.style.height = `${viewport.height}px`

      const textLayerDiv = pageTextLayers.get(pageNum)
      if (textLayerDiv && textLayerDiv.children.length === 0) {
        textLayerDiv.style.width = `${viewport.width}px`
        textLayerDiv.style.height = `${viewport.height}px`

        await renderTextLayer(pageNum, textLayerDiv, viewport)

        if (searchQuery) {
          highlightSearchOnPage(pageNum)
        }
      }
    } catch (e: any) {
      console.error(`[Dokumen] Render error page ${pageNum}:`, e)
    }
  }

  async function renderTextLayer(pageNum: number, textLayerDiv: HTMLDivElement, viewport: any) {
    if (!pdfDoc) return

    try {
      if (import.meta.env?.DEV || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development')) {
        console.log(`[DIAG] renderTextLayer called for page ${pageNum}, existing children: ${textLayerDiv.children.length}`)
      }
      const page = await pdfDoc.getPage(pageNum)
      const textContent = await page.getTextContent()

      let textDivs: HTMLElement[] | null = null
      let textDivsStr: string[] | null = null
      if (TextLayerCls) {
        const tl = new TextLayerCls({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport: viewport
        })
        await tl.render()
        textDivs = tl.textDivs
        textDivsStr = tl.textContentItemsStr
      }

      let cached = pageTextCache.get(pageNum)
      if (!cached) {
        cached = buildPageText(textContent.items)
        pageTextCache.set(pageNum, cached)
      }

      buildSpanMapFromPageText(pageNum, cached, textDivs, textDivsStr)
    } catch (e) {
      console.error(`[Dokumen] Text layer error page ${pageNum}:`, e)
    }
  }

  function buildSpanMapFromPageText(pageNum: number, pageTextResult: PageTextResult, textDivs: HTMLElement[] | null, textDivsStr: string[] | null) {
    const spanMap: { el: HTMLSpanElement; text: string; start: number; end: number }[] = []
    const charToSpan: number[] = []

    const suitableDivs: HTMLElement[] = []
    if (textDivs) {
      for (let i = 0; i < textDivs.length; i++) {
        const d = textDivs[i]
        const s = textDivsStr?.[i] ?? ''
        if (d && document.contains(d) && s.length > 0) {
          suitableDivs.push(d)
        }
      }
    }

    const nonEmptyItems = pageTextResult.itemPositions.filter(p => p.itemIndex >= 0)
    const isDev = import.meta.env?.DEV || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development')
    if (isDev) {
      console.log(`[DIAG] buildSpanMap page ${pageNum}: suitableDivs=${suitableDivs.length}, nonEmptyItems=${nonEmptyItems.length}, totalItems=${pageTextResult.itemPositions.length}`)
    }

    let divCursor = 0

    for (const pos of pageTextResult.itemPositions) {
      if (pos.itemIndex < 0) continue
      if (divCursor >= suitableDivs.length) continue

      const el = suitableDivs[divCursor]
      divCursor++

      const snippet = pageTextResult.text.substring(pos.start, Math.min(pos.end, pos.start + 30))

      if (isDev && spanMap.length < 5) {
        console.log(`[DIAG] span[${spanMap.length}] itemIndex=${pos.itemIndex} divText="${(textDivsStr?.[pos.itemIndex] ?? '').substring(0, 30)}" mappedText="${snippet}" [${pos.start}..${pos.end}]`)
      }

      spanMap.push({
        el: el as HTMLSpanElement,
        text: snippet,
        start: pos.start,
        end: pos.end
      })

      const spanIdx = spanMap.length - 1
      for (let c = pos.start; c < pos.end; c++) {
        charToSpan[c] = spanIdx
      }
    }

    if (isDev) {
      const uncovered = nonEmptyItems.length - spanMap.length
      console.log(`[DIAG] buildSpanMap page ${pageNum}: spans built=${spanMap.length}, uncovered items=${uncovered}, charToSpan length=${charToSpan.length}`)
    }

    pageSpanMaps.set(pageNum, spanMap)
    pageCharMaps.set(pageNum, charToSpan)
  }

  function clearPage(containerDiv: HTMLElement) {
    const canvas = containerDiv.querySelector('canvas')
    if (canvas) canvas.remove()
  }

  function rerenderAll() {
    if (!scrollContainer) return
    createPages()
    setupObserver()
    setTimeout(() => renderVisiblePages(), 50)
  }

  function renderVisiblePages() {
    if (!scrollContainer) return
    const placeholders = scrollContainer.querySelectorAll('.page-placeholder')
    placeholders.forEach(el => {
      const rect = el.getBoundingClientRect()
      const containerRect = scrollContainer!.getBoundingClientRect()
      if (rect.bottom > containerRect.top - 400 && rect.top < containerRect.bottom + 400) {
        const pageNum = parseInt(el.dataset.pageNum || '0')
        if (pageNum) renderPage(pageNum, el as HTMLElement)
      }
    })
  }

  function handleScroll() {
    if (scrollTimeout) clearTimeout(scrollTimeout)
    scrollTimeout = setTimeout(() => updateCurrentPageFromScroll(), 50)
  }

  function updateCurrentPageFromScroll() {
    if (!scrollContainer || !pdfDoc) return

    const containerRect = scrollContainer.getBoundingClientRect()

    let closestPage = 1
    let closestDistance = Infinity

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const el = document.getElementById(`page-container-${i}`)
      if (!el) continue
      const rect = el.getBoundingClientRect()
      const pageCenter = rect.top + rect.height / 2
      const distance = Math.abs(pageCenter - containerRect.top - containerRect.height / 2)

      if (distance < closestDistance) {
        closestDistance = distance
        closestPage = i
      }
    }

    if (closestPage !== currentPageValue) {
      currentPage.set(closestPage)
    }
  }

  async function extractTextForPage(pageNum: number) {
    if (!pdfDoc || textExtracting) return
    textExtracting = true
    try {
      const page = await pdfDoc.getPage(pageNum)
      const textContent = await page.getTextContent()

      let cached = pageTextCache.get(pageNum)
      if (!cached) {
        cached = buildPageText(textContent.items)
        pageTextCache.set(pageNum, cached)
      }

      pageText.set(cached.text)
    } catch (e) {
      console.error('[Dokumen] Text extraction error:', e)
      pageText.set('')
    }
    textExtracting = false
  }

  function clearHighlightsOnPage(pageNum: number) {
    const container = document.getElementById(`page-container-${pageNum}`)
    if (container) {
      container.querySelectorAll('.search-highlight').forEach(el => {
        el.classList.remove('search-highlight')
      })
    }
  }

  function findSpanForChar(spans: { start: number; end: number }[], charPos: number): number {
    let lo = 0, hi = spans.length - 1, best = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const s = spans[mid]
      if (charPos >= s.start && charPos < s.end) return mid
      if (charPos < s.start) { hi = mid - 1 } else { lo = mid + 1; best = mid }
    }
    return best
  }

  function highlightSearchOnPage(pageNum: number) {
    const spans = pageSpanMaps.get(pageNum)
    if (!spans || !searchQuery) return

    const q = searchQuery.toLowerCase()
    for (const span of spans) {
      if (span.text.toLowerCase().includes(q)) {
        span.el.classList.add('search-highlight')
      }
    }
  }

  function highlightTtsOnPage(pageNum: number, charIndex: number, charLength: number = 1) {
    const spans = pageSpanMaps.get(pageNum)
    const charToSpan = pageCharMaps.get(pageNum)
    if (!spans || spans.length === 0) return

    const rangeEnd = charIndex + charLength
    const matchedSpans = new Set<number>()

    for (let c = charIndex; c < rangeEnd; c++) {
      let idx = c < (charToSpan?.length ?? 0) ? charToSpan![c] : undefined
      if (idx === undefined) {
        idx = findSpanForChar(spans, c)
        if (idx === -1) continue
      }
      matchedSpans.add(idx)
    }

    const firstIdx = matchedSpans.size > 0 ? Math.min(...matchedSpans) : -1
    if (firstIdx >= 0) {
      const el = spans[firstIdx].el
      updateFocusOverlay(pageNum, el)

      if (fitModeValue !== 'height' && scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect()
        const spanRect = el.getBoundingClientRect()
        if (spanRect.top < containerRect.top || spanRect.bottom > containerRect.bottom) {
          const spanCenterY = spanRect.top + spanRect.height / 2 - containerRect.top
          scrollContainer.scrollTop += spanCenterY - scrollContainer.clientHeight / 2
        }
      }
    }
  }

  function updateFocusOverlay(pageNum: number, spanEl: HTMLElement) {
    const pageContainer = document.getElementById(`page-container-${pageNum}`)
    if (!pageContainer) return
    const overlay = pageContainer.querySelector('.focus-overlay') as HTMLElement | null
    if (!overlay) return

    const pageRect = pageContainer.getBoundingClientRect()
    const spanRect = spanEl.getBoundingClientRect()

    const spanCenterY = spanRect.top + spanRect.height / 2 - pageRect.top
    const pageHeight = pageRect.height

    const bandHalf = fitModeValue === 'height'
      ? pageHeight * 0.005
      : pageHeight * 0.015
    const topPct = Math.max(0, ((spanCenterY - bandHalf) / pageHeight) * 100)
    const bottomPct = Math.min(100, ((spanCenterY + bandHalf) / pageHeight) * 100)

    overlay.style.setProperty('--focus-top', `${topPct}%`)
    overlay.style.setProperty('--focus-bottom', `${bottomPct}%`)
    overlay.classList.add('active')
  }

  function clearFocusOverlay() {
    scrollContainer?.querySelectorAll('.focus-overlay.active').forEach(el => {
      el.classList.remove('active')
    })
  }

  $effect(() => {
    function handleLoadPdf(event: Event) {
      const detail = (event as CustomEvent).detail
      loadPDF(detail.filePath)
    }

    function handleGotoPage(event: Event) {
      const detail = (event as CustomEvent).detail
      if (detail.page) {
        scrollToPage(detail.page)
        currentPage.set(detail.page)
      }
    }

    window.addEventListener('load-pdf', handleLoadPdf)
    window.addEventListener('pdf-goto-page', handleGotoPage)
    return () => {
      window.removeEventListener('load-pdf', handleLoadPdf)
      window.removeEventListener('pdf-goto-page', handleGotoPage)
    }
  })

  $effect(() => {
    const unsubSearchQ = activeSearchQuery.subscribe(() => {
      for (const [pageNum] of pageSpanMaps) {
        clearHighlightsOnPage(pageNum)
        highlightSearchOnPage(pageNum)
      }
    })
    const unsubSearchP = searchHighlightPages.subscribe(() => {
      for (const [pageNum] of pageSpanMaps) {
        clearHighlightsOnPage(pageNum)
        highlightSearchOnPage(pageNum)
      }
    })
    return () => { unsubSearchQ(); unsubSearchP() }
  })

  $effect(() => {
    const unsubBoundary = ttsBoundary.subscribe((boundary) => {
      currentBoundary = boundary
      if (boundary) {
        highlightTtsOnPage(playingPage, boundary.charIndex, boundary.charLength)
      }
    })
    return unsubBoundary
  })

  $effect(() => {
    const unsubState = ttsState.subscribe((state) => {
      if (state === 'paused' || state === 'idle') {
        clearFocusOverlay()
      }
    })
    return unsubState
  })

  $effect(() => {
    const { onFileOpened } = (window as any).electronAPI
    if (!onFileOpened) return
    const cleanup = onFileOpened((path: string) => {
      loadPDF(path)
    })
    return cleanup
  })

  onDestroy(() => {
    if (observer) observer.disconnect()
    if (scrollTimeout) clearTimeout(scrollTimeout)
  })
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="pdf-viewer"
  bind:this={scrollContainer}
  onscroll={handleScroll}
>
  {#if loading}
    <div class="placeholder">
      <span class="placeholder-icon">📄</span>
      <p>Open a PDF file to start reading</p>
      <p class="hint">Drag & drop a PDF here or click Open</p>
    </div>
  {:else if error}
    <div class="placeholder error">
      <span class="placeholder-icon">⚠</span>
      <p>{error}</p>
    </div>
  {/if}
</div>

<style>
  .pdf-viewer {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    background: var(--bg-tertiary);
    padding: 16px 0;
    position: relative;
  }

  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    color: var(--text-muted);
    text-align: center;
  }

  .placeholder-icon {
    font-size: 64px;
    opacity: 0.5;
  }

  .placeholder p {
    font-size: 16px;
  }

  .placeholder .hint {
    font-size: 13px;
    color: var(--text-muted);
  }

  .placeholder.error {
    color: var(--error);
  }

  :global(.page-placeholder) {
    transition: width 0.3s ease, height 0.3s ease;
  }

  :global(.textLayer) {
    position: absolute;
    text-align: initial;
    inset: 0;
    overflow: clip;
    opacity: 1;
    line-height: 2;
    text-size-adjust: none;
    forced-color-adjust: none;
    transform-origin: left top;
    z-index: 2;
    pointer-events: none;
  }

  :global(.textLayer span) {
    color: transparent;
    position: absolute;
    white-space: normal;
    cursor: text;
    transform-origin: left bottom;
  }

  :global(.textLayer .search-highlight) {
    background-color: rgba(255, 230, 0, 0.6) !important;
    border-radius: 2px;
    color: transparent !important;
    mix-blend-mode: normal;
  }

  @property --focus-top {
    syntax: '<percentage>';
    inherits: false;
    initial-value: 50%;
  }

  @property --focus-bottom {
    syntax: '<percentage>';
    inherits: false;
    initial-value: 50%;
  }

  :global(.focus-overlay) {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.4s ease, --focus-top 0.5s cubic-bezier(0.25, 0.1, 0.25, 1), --focus-bottom 0.5s cubic-bezier(0.25, 0.1, 0.25, 1);
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.5) 0%,
      rgba(0, 0, 0, 0.5) calc(var(--focus-top) - 8px),
      transparent calc(var(--focus-top) - 8px),
      transparent calc(var(--focus-bottom) + 8px),
      rgba(0, 0, 0, 0.5) calc(var(--focus-bottom) + 8px),
      rgba(0, 0, 0, 0.5) 100%
    );
  }

  :global(.focus-overlay.active) {
    opacity: 1;
  }
</style>
