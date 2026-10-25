# CanvasPilot

A compact desktop tool for collecting UI changes into one clear handoff for an AI assistant. Capture selected areas across windows and pages, annotate them, add captions, and keep everything in a session journal. Copy or export Markdown, plain text, or XML with paths to the annotated screenshots.

Created by **Nima Bahrami**.

## Features

- Area capture with available window titles and timestamps attached to each entry.
- Arrows, shapes, pen, highlighting, editable text, and permanent redaction.
- Compact screenshot cards, floating session navigation, and an expandable annotation editor.
- Separate session folders containing screenshots, metadata, and all three journal formats.
- Background capture and session-copy shortcuts, plus a menu bar/system tray menu.
- Whole-journal AI enhancement that produces tasks, acceptance checks, and a final audit instruction for the receiving assistant.
- OpenAI, Anthropic, Gemini, NVIDIA, OpenAI-compatible APIs, and Ollama, with automatic model discovery.

## Run from source

Requires Node.js 22.12+ and npm. On macOS, install Xcode Command Line Tools to compile the window-context helper.

```sh
npm ci
npm run dev
```

To run the production renderer in Electron:

```sh
npm run build
npm start
```

`npm run dev:web` starts a browser preview with IndexedDB storage and ZIP export. Native capture, session folders, global shortcuts, and protected AI keys require Electron.

## Use

1. Create a session and click its title to rename it.
2. Choose **Capture area**, select a window or display, and drag an area. You can also import or paste an image.
3. Add markup and a caption. Enlarge the editor for detailed work, then save the capture to the journal.
4. Continue collecting entries from other windows or pages. Click a saved screenshot to edit its annotations.
5. Open **Export** to choose Markdown, text, or XML, preview the journal, and copy or save it.

The bottom-right **Enhance journal** orb processes the complete saved journal using the provider configured in Settings. Review and edit the generated tasks before copying or applying them. Unsaved composer text is excluded.

Close or hide the main window to keep CanvasPilot running in the background. Hold **Option** (**Alt** on Windows/Linux), press **U**, then **I** to capture. Add **P** within 350 ms to open the session-copy popup. These are key sequences. Use the tray menu or the platform quit command to exit fully.

Desktop sessions default to `Documents/CanvasPilot/`. Each has a date/title/ID folder, a `screenshots/` directory, `session.json`, and Markdown, text, and XML journals. Renaming a session preserves its folder path. Browser URLs are optional context supplied by the user.

## Privacy

Screenshots and journals stay on your device. AI enhancement sends journal text, paths, and source metadata to your chosen provider; it does not upload screenshot pixels. API keys use OS-backed encryption where available and otherwise remain in memory for the current launch. Journals and captures are not encrypted at rest.

Applying redaction permanently flattens the current image and its markup. Other annotations remain editable. Review files and exports before sharing them. See [Security](SECURITY.md) for details.

## Package

Build on the operating system you intend to target:

```sh
npm run package:mac     # DMG / ZIP
npm run package:win     # NSIS installer
npm run package:linux   # AppImage / DEB
```

For a locally signed macOS development DMG:

```sh
npm run package:mac:local
```

The output is placed in `release/`. Drag CanvasPilot into Applications and launch the installed copy. Quit any running copy before rebuilding. Local signing material is generated in the ignored `.local-signing/` directory; it is never part of the source repository. Developer ID distribution signing and Apple notarization are not configured.

macOS requires Screen & System Audio Recording permission for the installed app. The capture permission dialog links to System Settings and offers retry/restart. Linux Wayland may use the system capture portal and expose limited source metadata. Windows and Linux packaging targets are configured; native behavior still needs verification on those systems.

## Development checks

```sh
npm run build
npm run check:public
npm audit
```

The public-file check catches selected credential patterns and private files. Review staged contents and use a dedicated secret scanner before publishing. Personal test tooling, Playwright configuration, internal notes, generated screenshots, local sessions, credentials, and signing material are excluded from this repository.

## Documentation and license

- [Journal enhancer instructions and review](docs/AI-ENHANCER.md)
- [UI sources, adaptations, and fonts](docs/UI-SOURCES.md)

CanvasPilot is [MIT licensed](LICENSE), copyright Nima Bahrami. Third-party component and font notices are preserved in `LICENSES/`.
