# Hiding Projects Chat

Firefox extension that declutters the [claude.ai](https://claude.ai) sidebar.

## Modes

- **Off** — show everything (extension paused)
- **Hide project chats** — conversations that belong to a Project are hidden from the main sidebar; only standalone chats stay visible *(default)*
- **Focus on one project** — show only the chats from a single project you pick, and hide everything else

Project chats remain fully accessible from inside each Project page — they're only filtered out of the main sidebar list.

## Install

### From Firefox Add-ons (recommended)

https://addons.mozilla.org/en-US/firefox/addon/hiding-claude-projects-chat/

### Temporary (for development)

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
| `manifest.json` | Extension manifest (MV3, Firefox) |
| `content.js` | Runs on claude.ai, filters sidebar chats |
| `popup.html` / `popup.js` | Toolbar popup with mode selector |
| `icon-{16,48,128}.png` | Extension icons |

No build step — what you see is what runs.

## License

[MIT](LICENSE)

## Disclaimer

Unofficial extension. Not affiliated with Anthropic.
