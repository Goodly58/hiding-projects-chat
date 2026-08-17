# Hiding Projects Chat

Browser extension that declutters the [claude.ai](https://claude.ai) sidebar. Works in Firefox and in Chrome / Chromium-based browsers (Chrome, Edge, Brave, ungoogled-chromium).

## Modes

- **Off** — show everything (extension paused)
- **Hide project chats** — conversations that belong to a Project are hidden from the main sidebar; only standalone chats stay visible *(default)*
- **Focus on one project** — show only the chats from a single project you pick, and hide everything else

Project chats remain fully accessible from inside each Project page — they're only filtered out of the main sidebar list.

## Install

### Firefox — from Firefox Add-ons (recommended)

https://addons.mozilla.org/en-US/firefox/addon/hiding-claude-projects-chat/

### Chrome / Chromium (Edge, Brave, ungoogled-chromium)

There's no Chrome Web Store listing, so install it from source — it takes about a minute:

1. Download this repo (**Code → Download ZIP**, then unzip) or `git clone` it
2. Put the folder somewhere permanent — Chrome loads it from that path every launch, so don't leave it in Downloads or a temp folder
3. Open `chrome://extensions` (`edge://extensions` on Edge)
4. Turn on **Developer mode**, top right
5. Click **Load unpacked** and select the folder (the one containing `manifest.json` — not the file itself)

The extension stays installed across restarts. Notes:

- **Don't move or delete the folder.** Chrome reloads it from that path on every start; moving it uninstalls the extension and resets your saved mode.
- **No auto-updates.** To update: `git pull` (or re-download), then click **Reload** on `chrome://extensions`.
- Chrome logs an `Unrecognized manifest key 'browser_specific_settings'` warning. That's the Firefox-only block; it's harmless and the extension runs normally.
- Vanilla Chrome shows a "disable developer mode extensions" prompt on startup. Keep the extension enabled and it stays working; Edge and most other Chromium forks don't prompt at all.

### Firefox — temporary (for development)

1. Clone this repo
2. Open `about:debugging#/runtime/this-firefox` in Firefox
3. Click **Load Temporary Add-on…**
4. Select `manifest.json`

The extension stays loaded until Firefox restarts.

## How it works

`content.js` queries claude.ai's own API (`/api/organizations/{id}/chat_conversations` and `/api/organizations/{id}/projects`) with the user's signed-in session, then hides matching chat rows with `style.display = 'none'` — sidebar rows are matched by their `data-row-key="chat:{uuid}"` attribute, and list pages (Chats and tasks) by their `/chat/{uuid}` links. A MutationObserver keeps hidden chats hidden as the UI updates.

No data leaves your browser. The only thing stored is your mode choice and selected project UUID, via `storage.sync`.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension manifest (MV3; one file for both browsers — Chrome ignores the `browser_specific_settings` block) |
| `content.js` | Runs on claude.ai, filters sidebar chats |
| `popup.html` / `popup.js` | Toolbar popup with mode selector |
| `icon-{16,48,128}.png` | Extension icons |

No build step — what you see is what runs.

## License

[MIT](LICENSE)

## Disclaimer

Unofficial extension. Not affiliated with Anthropic.
