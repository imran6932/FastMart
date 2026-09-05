// Wraps WebSocket with automatic reconnection (exponential backoff, capped)
// so a dropped connection or a backend restart doesn't leave the UI stuck
// until the user manually refreshes the page.
//
// Usage:
//   const handle = createReconnectingSocket(url, { onOpen, onMessage, onClose, onError })
//   handle.socket            // current underlying WebSocket (may change across reconnects)
//   handle.close()           // permanently stop — call this on component unmount
export function createReconnectingSocket(url, { onOpen, onMessage, onClose, onError } = {}) {
  const BASE_DELAY_MS = 1000
  const MAX_DELAY_MS = 15000

  let ws = null
  let attempt = 0
  let reconnectTimer = null
  let stopped = false

  function connect() {
    if (stopped) return
    ws = new WebSocket(url)

    ws.onopen = (e) => {
      attempt = 0
      onOpen && onOpen(e)
    }
    ws.onmessage = (e) => onMessage && onMessage(e)
    ws.onerror = (e) => onError && onError(e)
    ws.onclose = (e) => {
      onClose && onClose(e)
      if (stopped) return
      const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS)
      attempt += 1
      reconnectTimer = setTimeout(connect, delay)
    }
  }

  connect()

  return {
    get socket() {
      return ws
    },
    close() {
      stopped = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws) ws.close()
    },
  }
}
