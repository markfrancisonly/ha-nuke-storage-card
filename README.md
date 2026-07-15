# ha-nuke-storage-card

A Home Assistant custom Lovelace card that opens a dialog to clear browser storage for the
current origin — localStorage, sessionStorage, cookies, IndexedDB, Cache Storage, and Service
Workers — with checkboxes for what to clear, then reloads. Useful for recovering kiosk / wall-panel
browsers stuck on stale frontend state.

## Install

Copy `nuke-storage-card.js` into `<config>/www/` and register it as a dashboard resource
(`/local/nuke-storage-card.js`, type: JavaScript Module). Add a card of type
`custom:nuke-storage-card`.
