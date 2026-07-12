# Dokumen

A cross-platform desktop PDF Reader with dual-engine Text-to-Speech, built with Electron, Svelte 5, and TypeScript.

## Features

- **PDF Rendering** — Canvas-based page rendering via pdfjs-dist with virtualized loading
- **Text-to-Speech** — Two engines: Edge TTS (cloud, high-quality) and Web Speech API (offline, local voices)
- **Word-Level Highlighting** — Visual focus overlay tracks the spoken word during TTS playback
- **Sentence Navigation** — Skip forward/backward between sentences within and across pages
- **Cross-Page Auto-Advance** — Automatically continues TTS to the next page
- **Full-Text Search** — Searches every page, shows results with snippets and inline highlighting
- **Bookmarks** — Per-file bookmarking with custom names and colors, persisted to disk
- **Light/Dark Theme** — Toggle between light and dark mode
- **Fit Modes** — Fit-to-Width or Fit-to-Height page display
- **Drag-and-Drop** — Open PDFs by dragging them onto the window
- **Default PDF Handler** — Optionally register as the system's default PDF reader
- **Protocol Handler** — Open PDFs via `dokumen://` URIs
- **Single Instance** — Ensures only one instance runs; subsequent opens route to the existing window

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Framework | Electron 35 |
| UI Framework | Svelte 5 |
| Build Tooling | electron-vite 3 / Vite |
| Language | TypeScript 5 |
| PDF Engine | pdfjs-dist 4 |
| Cloud TTS | node-edge-tts (Microsoft Edge TTS) |
| Local TTS | Web Speech API |
| Packaging | electron-builder 26 |

## Getting Started

### Prerequisites

- Node.js >= 20
- npm >= 9

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

Launches the app in development mode with hot module replacement for the renderer.

### Production Build

```bash
npm run build
```

Builds main, preload, and renderer into `out/`.

### Preview

```bash
npm run preview
```

Runs the production build locally.

## Packaging

| Platform | Command |
|----------|---------|
| Windows | `npm run build:win` |
| macOS | `npm run build:mac` |
| Linux | `npm run build:linux` |

Output installers are placed in `dist/`.

## Architecture

```
electron/
  main.ts        Main process — window management, IPC handlers, Edge TTS
  preload.ts     Preload — contextBridge, exposes typed electronAPI
src/
  renderer/      Entry point (index.html, main.ts)
  App.svelte     Root layout component
  components/    UI components
    PDFViewer.svelte, TTSControls.svelte, Toolbar.svelte,
    PageNavigation.svelte, SearchBar.svelte, BookmarksPanel.svelte,
    DropZone.svelte, DefaultHandlerDialog.svelte, TextHighlight.svelte
  stores/        Reactive state management
    reader.svelte.ts   — PDF and UI state (page, theme, fit mode)
    tts.svelte.ts      — TTS engine, playback, word tracking
    bookmarks.svelte.ts — Bookmark CRUD with disk persistence
  lib/           Utilities
    textParser.ts       — Sentence splitting, text cleaning
    pdfTextExtract.ts   — PDF text content extraction
  styles/        CSS with light/dark theme variables
```

Communication between renderer and main process is exclusively through IPC (`ipcRenderer.invoke` / `ipcMain.handle`) with `contextIsolation: true`.

## Data Storage

- **Settings:** `~/.dokumen/settings.json`
- **Bookmarks:** `~/.dokumen/bookmarks.json`
- **TTS Temp Files:** System temp directory (`dokumen-tts-*.mp3`, cleaned up after playback)

## Scripts

| Script | Description |
|--------|-------------|
| `dev` | Start development server |
| `build` | Build for production |
| `preview` | Preview production build |
| `build:win` | Package Windows installer |
| `build:mac` | Package macOS DMG + ZIP |
| `build:linux` | Package Linux deb + rpm + AppImage |

## License

MIT License — Copyright © 2026 Limitless Protocols
