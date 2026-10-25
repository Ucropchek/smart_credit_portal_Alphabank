import { useEffect, useRef, useState } from 'react'

export type ConsentLink = 'connecting' | 'open' | 'closed'

export function useBkiConsent() {
  const [link, setLink] = useState<ConsentLink>('connecting')
  const [checked, setChecked] = useState(false)
  const [saved, setSaved] = useState<boolean | null>(null)
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(`${protocol}//${window.location.host}/bki-consent`)
    socketRef.current = socket

    const onOpen = () => setLink('open')
    const onClose = () => setLink('closed')
    const onMessage = (event: MessageEvent) => {
      const value = readChecked(event.data)
      if (typeof value !== 'boolean') return
      setChecked(value)
      setSaved(value)
    }

    socket.addEventListener('open', onOpen)
    socket.addEventListener('close', onClose)
    socket.addEventListener('error', onClose)
    socket.addEventListener('message', onMessage)

    return () => {
      socket.removeEventListener('open', onOpen)
      socket.removeEventListener('close', onClose)
      socket.removeEventListener('error', onClose)
      socket.removeEventListener('message', onMessage)
      socket.close()
      if (socketRef.current === socket) socketRef.current = null
    }
  }, [])

  const toggle = (value: boolean) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    setChecked(value)
    socket.send(JSON.stringify({ checked: value }))
  }

  return { link, checked, saved, toggle }
}

function readChecked(data: unknown) {
  if (typeof data !== 'string') return undefined
  try {
    const body: unknown = JSON.parse(data)
    if (!body || typeof body !== 'object' || !('checked' in body)) return undefined
    const value = (body as { checked?: unknown }).checked
    return typeof value === 'boolean' ? value : null
  } catch {
    return undefined
  }
}
