# Repository Guidelines

## Project Structure & Module Organization

This repository is a browser-based prototype for a vector-scan style side-scrolling shooter.

- `index.html` is the app entry point and loads the playable game.
- `styles.css` contains page layout, HUD positioning, and visual shell styling.
- `src/game.bundle.js` is the currently executed game script. Update this file for runtime behavior visible in the browser.
- `src/runtime/` and `src/main.js` contain earlier modular source structure for future refactoring or WebAssembly-oriented separation.
- There is no dedicated `assets/` or `tests/` directory yet.

## Build, Test, and Development Commands

No package manager or build pipeline is required at the moment.

- Open `index.html` directly in a browser to play the current build.
- `node --check src/game.bundle.js` checks JavaScript syntax when Node.js is available.
- A local server is optional. If you add module-based loading again, serve the folder with a static server instead of relying on `file://`.

## Coding Style & Naming Conventions

Use plain JavaScript, HTML, and CSS. Keep indentation at two spaces, use semicolons, and prefer `const` or `let` over `var`.

Use PascalCase for classes such as `Game`, `Renderer`, and `Input`. Use camelCase for methods, variables, and object fields, for example `powerCapsules`, `updateLasers`, and `drawPowerGauge`.

Keep gameplay constants near the top of the script. Avoid broad rewrites unless replacing `game.bundle.js` with a proper source build.

## Testing Guidelines

There is no automated test suite yet. For every gameplay change:

- Run a syntax check: `node --check src/game.bundle.js`.
- Reload `index.html` and manually verify title, movement, shooting, power-ups, death, respawn, and game over flow.
- When adding tests later, place them under `tests/` and name files by feature, such as `powerups.test.js`.

## Commit & Pull Request Guidelines

This directory does not currently contain Git history, so no existing commit convention is available. Use concise imperative commits, for example `Add crash respawn flow`.

Pull requests should include a short summary, manual test notes, and screenshots or short clips for visible gameplay or UI changes.

## Agent-Specific Instructions

Preserve the direct-browser workflow unless a build step is intentionally introduced. Keep `src/game.bundle.js` runnable after each change.
