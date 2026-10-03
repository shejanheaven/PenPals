import { useMemo, useState } from 'react'
import { CalendarPlus, NotebookPen, Pin, PinOff, Plus, Search, Trash2, X } from 'lucide-react'
import { getState, useStore } from '../store/store.js'
import { addNote, deleteNote, restoreNote, updateNote } from '../store/actions.js'
import { openNote, openQuickAdd } from '../store/ui.js'
import { AreaChips, Empty, Sheet, toast } from '../components/ui.jsx'
import { AREAS, areaColor } from '../lib/areas.js'
import { fmtRelative, toKey } from '../lib/dates.js'

const isBlank = (n) => !n.title.trim() && !n.body.trim()

export function newNote(fields) {
  openNote(addNote(fields))
}

function noteTitle(n) {
  return n.title.trim() || n.body.trim().split('\n')[0].slice(0, 80) || 'Untitled'
}

function edited(n) {
  const d = new Date(n.updatedAt)
  const day = fmtRelative(toKey(d))
  return day === 'Today' ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : day
}

export default function Notes() {
  const state = useStore()
  const [query, setQuery] = useState('')
  const [area, setArea] = useState(null)

  const all = useMemo(
    () => Object.values(state.notes).filter((n) => !n.deleted && !isBlank(n)),
    [state.notes],
  )
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all
      .filter((n) => (!area || n.area === area) && (!q || `${n.title}\n${n.body}`.toLowerCase().includes(q)))
      .sort((a, b) => b.pinned - a.pinned || b.updatedAt - a.updatedAt)
  }, [all, query, area])
  const usedAreas = AREAS.filter((a) => all.some((n) => n.area === a.id))

  return (
    <div className="page wide" style={{ maxWidth: 1040 }}>
      <header className="page-head">
        <div className="row-flex" style={{ alignItems: 'flex-end' }}>
          <div className="grow">
            <div className="eyebrow">Notes</div>
            <h1 className="display">Keep it in mind.</h1>
          </div>
          <button className="btn primary" onClick={() => newNote({ area })}>
            <Plus size={17} /> New note
          </button>
        </div>
      </header>

      {all.length > 0 && (
        <div className="stack" style={{ gap: 12, marginBottom: 18 }}>
          <label className="notes-search">
            <Search size={17} className="faint" />
            <input className="input bare" type="search" placeholder="Search notes" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search notes" />
            {query && (
              <button className="icon-btn sm" onClick={() => setQuery('')} aria-label="Clear search">
                <X size={16} />
              </button>
            )}
          </label>
          {usedAreas.length > 0 && <AreaChips value={area} onChange={setArea} areas={usedAreas} />}
        </div>
      )}

      {shown.length > 0 ? (
        <div className="notes-grid">
          {shown.map((n) => (
            <button key={n.id} className="card note-card fade-in" style={{ '--ev': areaColor(n.area) }} onClick={() => openNote(n.id)}>
              <span className="note-card-title">{noteTitle(n)}</span>
              {n.title.trim() && n.body.trim() && <span className="note-card-body">{n.body}</span>}
              <span className="note-card-foot">
                {n.area && <span className="area-dot" style={{ background: areaColor(n.area) }} />}
                <span className="grow">{edited(n)}</span>
                {n.pinned && <Pin size={13} aria-label="Pinned" />}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="card">
          {all.length ? (
            <Empty compact>No notes match{query ? ` “${query}”` : ''}.</Empty>
          ) : (
            <Empty
              icon={NotebookPen}
              title="A place for loose thoughts"
              action={
                <button className="btn soft" onClick={() => newNote()}>
                  <Plus size={16} /> Write your first note
                </button>
              }
            >
              Ideas, lists, things to remember, what someone said. Pin the ones you want on top.
            </Empty>
          )}
        </div>
      )}
    </div>
  )
}

export function NoteSheet({ open, onClose, noteId }) {
  const state = useStore()
  const note = state.notes[noteId]
  const [fresh] = useState(() => !note || isBlank(note))

  // An untouched new note simply disappears when closed.
  const close = () => {
    const n = getState().notes[noteId]
    if (n && !n.deleted && isBlank(n)) deleteNote(noteId)
    onClose()
  }

  if (!note) return null
  const set = (patch) => updateNote(noteId, patch)

  return (
    <Sheet
      open={open}
      onClose={close}
      wide
      title={fresh ? 'New note' : 'Note'}
      footer={
        <>
          <button
            className="btn danger"
            aria-label="Delete note"
            onClick={() => {
              deleteNote(noteId)
              if (!isBlank(note)) toast('Note deleted', { action: 'Undo', onAction: () => restoreNote(noteId) })
              onClose()
            }}
          >
            <Trash2 size={16} />
          </button>
          <button className="btn ghost" onClick={() => set({ pinned: !note.pinned })} aria-pressed={note.pinned}>
            {note.pinned ? <PinOff size={16} /> : <Pin size={16} />} {note.pinned ? 'Unpin' : 'Pin'}
          </button>
          <button
            className="btn ghost"
            disabled={isBlank(note)}
            title="Turn this note into something on your plan"
            onClick={() => {
              const text = noteTitle(note)
              onClose()
              openQuickAdd({ text })
            }}
          >
            <CalendarPlus size={16} /> Add to plan
          </button>
          <span className="spacer" />
          <button className="btn primary" onClick={close}>
            Done
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <input
          className="input title-input"
          placeholder="Title"
          value={note.title}
          onChange={(e) => set({ title: e.target.value })}
          data-autofocus={fresh ? true : undefined}
          aria-label="Note title"
        />
        <textarea
          className="textarea bare note-body"
          placeholder="Write anything…"
          value={note.body}
          onChange={(e) => set({ body: e.target.value })}
          aria-label="Note"
        />
        <div className="field">
          <span className="label">Area of life</span>
          <AreaChips value={note.area} onChange={(a) => set({ area: a })} areas={AREAS} />
        </div>
      </div>
    </Sheet>
  )
}
