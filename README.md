# Flow – Sketch Design Handoff Plugin

Publish Sketch designs to your Flow server so developers can inspect specs, export assets, and play through prototype journeys.

## Features

- **Configure Server URL** – Point the plugin at any Flow server instance (local or remote)
- **Register / Login** – Authenticate with your Flow account
- **Create Projects** – Organize designs into projects directly from Sketch
- **Publish Artboards** – Export every selected artboard with:
  - **Retina PNG previews** (2× export for crisp rendering)
  - **Full layer tree** – positions, sizes, styles, fills, borders, shadows, text attributes
  - **Prototype flow links** – source hotspot rects → target artboards with animation types, enabling developers to click through the designer's intended journey
  - **Design tokens** – document colors/swatches, shared text styles, shared layer styles

## How It Works

1. Open a Sketch document
2. Run **Plugins → Flow → Publish to Flow**
3. First time: enter your server URL and login (or register)
4. Select a project (or create a new one)
5. Pick which artboards to publish (grouped by page)
6. Click **Publish** – the plugin will:
   - Extract layer metadata for every artboard (recursively)
   - Walk every layer to find prototype `flow` connections
   - Export each artboard as a 2× PNG
   - Upload everything to the server
7. Open the handoff in your browser to inspect specs and play prototypes

## What Gets Extracted

| Data                 | Details                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| **Layer tree**       | id, name, type, frame (x/y/w/h), visibility, opacity, rotation, style                            |
| **Styles**           | Fills (solid + gradient), borders, shadows, inner shadows, blur, blend mode                      |
| **Text layers**      | String value, font family/size/weight, color, line height, letter spacing, alignment             |
| **Symbol instances** | Symbol ID, overrides                                                                             |
| **Prototype flows**  | Source layer → target artboard, source hotspot rect (absolute), animation type, back-action flag |
| **Design tokens**    | Document color swatches, shared text styles, shared layer styles                                 |

### Prototype Journey

Every layer with a `flow` property is captured with its **absolute position rectangle** relative to the artboard. This allows the web inspector to overlay clickable hotspots on artboard images. Developers can:

- See all clickable areas highlighted
- Click through screens following the designer's intended flow
- View the complete navigation graph of the prototype

## Installation

```bash
cd Flow-plugin
npm install
```

This runs `skpm-build` and `skpm-link` automatically via `postinstall`, installing the plugin into Sketch.

## Development

```bash
# Build everything (Svelte webview + native plugin)
npm run build

# Build webview only
npm run build:webview

# Build + watch + auto-reload in Sketch
npm run start

# Watch native side only
npm run watch

# Type-check Svelte code
npm run check

# Run tests
npm test

# Lint
npm run lint
```

### Debugging

```bash
# Tail plugin logs
skpm log -f
```

Or use [sketch-dev-tools](https://github.com/skpm/sketch-dev-tools).

## Architecture

The plugin uses a **dual build system**:

1. **Vite + Svelte** → compiles the webview UI into a single self-contained `resources/webview.html`
2. **skpm-build** (webpack) → bundles the native Sketch bridge code into `Flow.sketchplugin/`

```
src/
  manifest.json              # Plugin commands & menu
  webview.js                 # Native bridge – opens BrowserWindow, handles messages
  lib/
    extract.js               # Sketch document extraction (layers, styles, flows, tokens)
    settings.js              # Persistent settings (Sketch Settings API)
  types/
    index.ts                 # Shared TypeScript type definitions
  webview/                   # Svelte webview app (compiled by Vite)
    webview.html             # Vite entry point
    main.ts                  # Svelte mount
    App.svelte               # Root component with view routing & publish pipeline
    lib/
      api.ts                 # API client (auth, projects, publish)
      bridge.ts              # Typed WebView ↔ Plugin communication
      theme.ts               # Dark/light mode detection
    stores/
      state.ts               # App state, artboard selection, navigation
      toast.ts               # Toast notifications
      publish.ts             # Publish pipeline state
    styles/
      variables.css          # Design tokens, CSS reset, dark mode
    components/              # Reusable UI components (Button, Input, etc.)
    views/                   # View screens (Connect, Projects, Publish, etc.)
  __tests__/                 # Vitest test suite
resources/
  webview.html               # Built output (single-file, auto-generated)
assets/
  icon.png                   # Plugin icon
```

## Server API Endpoints Used

| Method | Endpoint                               | Purpose                                           |
| ------ | -------------------------------------- | ------------------------------------------------- |
| POST   | `/auth/register`                       | Create account                                    |
| POST   | `/auth/login`                          | Login, get JWT                                    |
| GET    | `/projects`                            | List user's projects                              |
| POST   | `/projects`                            | Create project                                    |
| POST   | `/projects/:id/versions`               | Start a new publish version                       |
| POST   | `/projects/:id/versions/:vId/screens`  | Upload screen (artboard image + metadata + flows) |
| POST   | `/projects/:id/versions/:vId/tokens`   | Upload design tokens                              |
| PUT    | `/projects/:id/versions/:vId/complete` | Finalize the version                              |
