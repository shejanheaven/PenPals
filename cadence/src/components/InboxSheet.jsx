import { useState } from 'react'
import { CalendarPlus, ClipboardPaste, Inbox as InboxIcon, Link2, Mail, MessageSquareText, Pencil, Share2, Webhook, X } from 'lucide-react'
import { Empty, Sheet, toast } from './ui.jsx'
import { ParsedPreview, parsedToFields, useParser } from './items.jsx'
import { useStore } from '../store/store.js'
import { addItem, deleteItem, resolveInbox, restoreInbox } from '../store/actions.js'
import { newItem } from '../store/ui.js'
import { captureText, sourceLabel } from '../integrations/capture.js'

const SOURCE_ICONS = { sms: MessageSquareText, email: Mail, share: Share2, shortcut: Link2, webhook: Webhook }

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hr ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}

function InboxEntry({ entry, settings }) {
  const parsed = useParser(entry.text.split('\n')[0].slice(0, 240))
  const Icon = SOURCE_ICONS[entry.source] ?? InboxIcon
  return (
    <div className="card pad stack" style={{ gap: 10 }}>
      <div className="row-flex tiny faint" style={{ gap: 6 }}>
        <Icon size={13} /> {sourceLabel(entry.source)}
        {entry.meta?.from && <span>· {entry.meta.from}</span>}
        <span className="spacer" />
        {ago(entry.receivedAt)}
      </div>
      <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 15 }}>{entry.text}</div>
      {parsed.recognized && <ParsedPreview parsed={parsed} />}
      <div className="row-flex wrap" style={{ gap: 8 }}>
        <button
          className="btn sm primary"
          onClick={() => {
            const id = addItem({ ...parsedToFields(parsed, settings), title: parsed.title || entry.text.slice(0, 80), source: entry.source })
            resolveInbox(entry.id)
            toast('Added to your plan', {
              action: 'Undo',
              onAction: () => {
                deleteItem(id)
                restoreInbox(entry.id)
              },
            })
          }}
        >
          <CalendarPlus size={15} /> Add {parsed.recognized ? 'as shown' : 'for today'}
        </button>
        <button className="btn sm secondary" onClick={() => newItem({ ...parsedToFields(parsed, settings), title: parsed.title || entry.text.slice(0, 80), notes: entry.text.length > 80 ? entry.text : '', source: entry.source }, { inboxId: entry.id })}>
          <Pencil size={15} /> Edit first
        </button>
        <span className="spacer" />
        <button
          className="btn sm ghost"
          onClick={() => {
            resolveInbox(entry.id)
            toast('Let go', { action: 'Undo', onAction: () => restoreInbox(entry.id) })
          }}
        >
          <X size={15} /> Dismiss
        </button>
      </div>
    </div>
  )
}

export function InboxSheet({ open, onClose }) {
  const state = useStore()
  const [text, setText] = useState('')
  const entries = Object.values(state.inbox)
    .filter((e) => !e.deleted)
    .sort((a, b) => b.receivedAt - a.receivedAt)

  return (
    <Sheet open={open} onClose={onClose} title="Inbox">
      <form
        className="row-flex"
        style={{ marginBottom: 16 }}
        onSubmit={(e) => {
          e.preventDefault()
          if (captureText(text)) setText('')
        }}
      >
        <input className="input" placeholder="Brain dump — get it out of your head…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Capture a thought" data-autofocus enterKeyHint="done" />
        {text.trim() ? (
          <button className="btn secondary" type="submit">
            Capture
          </button>
        ) : (
          navigator.clipboard?.readText && (
            <button
              type="button"
              className="btn secondary"
              title="Paste a copied message or email"
              onClick={async () => {
                try {
                  const pasted = (await navigator.clipboard.readText()).trim()
                  if (pasted) captureText(pasted, { source: 'paste' })
                  else toast('Nothing to paste — copy a message first')
                } catch {
                  toast('Paste was blocked — long-press the box and paste instead')
                }
              }}
            >
              <ClipboardPaste size={16} /> Paste
            </button>
          )
        )}
      </form>
      {entries.length ? (
        <div className="stack">
          {entries.map((e) => (
            <InboxEntry key={e.id} entry={e} settings={state.settings} />
          ))}
        </div>
      ) : (
        <Empty icon={InboxIcon} title="Inbox zero. Clear mind.">
          Things you capture — or send from texts, email, Shortcuts and other apps — wait here until you decide what they deserve.
        </Empty>
      )}
    </Sheet>
  )
}
