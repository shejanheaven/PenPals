import { useState } from 'react'
import { ExternalLink, Music2, Play, Plus, Settings2, Trash2 } from 'lucide-react'
import { useStore } from '../store/store.js'
import { addSpotifyLink, playSpotifyLink, removeSpotifyLink, renameSpotifyLink, restoreSpotifyLinks } from '../store/actions.js'
import { openMusic } from '../store/ui.js'
import { parseSpotify, spotifyEmbedUrl, spotifyTypeLabel, spotifyUrl } from '../lib/spotify.js'
import { Sheet, toast } from './ui.jsx'

const linkName = (l) => l.label?.trim() || spotifyTypeLabel(l.type)

// Spotify's own embedded player. It plays whole tracks for anyone signed in
// to Spotify in this browser (30-second previews otherwise).
export function SpotifyPlayer({ height = 152, showEmpty = true }) {
  const { links, current } = useStore().settings.spotify
  const link = links.find((l) => l.key === current) ?? links[0]

  if (!link) {
    if (!showEmpty) return null
    return (
      <button className="side-link music-add" onClick={openMusic}>
        <Music2 size={18} /> Add music
      </button>
    )
  }

  return (
    <div className="music">
      <div className="music-head">
        <Music2 size={14} className="faint" />
        {links.length > 1 ? (
          <select className="music-select" value={link.key} onChange={(e) => playSpotifyLink(e.target.value)} aria-label="Choose what to play">
            {links.map((l) => (
              <option key={l.key} value={l.key}>
                {linkName(l)}
              </option>
            ))}
          </select>
        ) : (
          <span className="music-select">{linkName(link)}</span>
        )}
        <button className="icon-btn sm" onClick={openMusic} aria-label="Manage music">
          <Settings2 size={15} />
        </button>
      </div>
      <iframe
        key={link.key}
        className="music-frame"
        title={`Spotify: ${linkName(link)}`}
        src={spotifyEmbedUrl(link)}
        height={height}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
      />
    </div>
  )
}

export function MusicSheet({ open, onClose }) {
  const { links, current } = useStore().settings.spotify
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')

  const add = (e) => {
    e.preventDefault()
    const parsed = parseSpotify(url)
    if (parsed.error) return setError(parsed.error)
    addSpotifyLink({ ...parsed, label })
    setUrl('')
    setLabel('')
    setError('')
    toast(`${label.trim() || spotifyTypeLabel(parsed.type)} added. Press play when you’re ready.`)
  }

  return (
    <Sheet open={open} onClose={onClose} title="Music">
      <form className="stack" style={{ gap: 12 }} onSubmit={add}>
        <p className="small muted">
          Keep the playlists, albums or podcasts you work, rest and move to. In Spotify, tap <strong>Share → Copy link</strong>, then paste it here.
        </p>
        <div className="field">
          <label className="label" htmlFor="spotify-url">
            Spotify link
          </label>
          <input
            id="spotify-url"
            className="input"
            placeholder="https://open.spotify.com/playlist/…"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setError('')
            }}
            inputMode="url"
            autoComplete="off"
            data-autofocus
          />
          {error && (
            <span className="small" style={{ color: 'var(--danger)' }} role="alert">
              {error}
            </span>
          )}
        </div>
        <div className="row-flex">
          <input className="input grow" placeholder="Name it (optional), e.g. Deep focus" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Name" />
          <button className="btn primary" type="submit" disabled={!url.trim()}>
            <Plus size={16} /> Add
          </button>
        </div>
      </form>

      {links.length > 0 && (
        <section className="section">
          <div className="section-head">
            <span className="eyebrow">Saved</span>
          </div>
          <div className="list">
            {links.map((l) => (
              <div key={l.key} className="item-row" style={{ minHeight: 56 }}>
                <button
                  className={`icon-btn${l.key === current ? ' music-current' : ''}`}
                  onClick={() => playSpotifyLink(l.key)}
                  aria-label={`Show ${linkName(l)} in the player`}
                  aria-pressed={l.key === current}
                >
                  <Play size={16} />
                </button>
                <span className="item-body">
                  <input
                    className="input bare item-title"
                    value={l.label}
                    placeholder={spotifyTypeLabel(l.type)}
                    onChange={(e) => renameSpotifyLink(l.key, e.target.value)}
                    aria-label="Name"
                  />
                  <span className="item-meta">{spotifyTypeLabel(l.type)}</span>
                </span>
                <a className="icon-btn" href={spotifyUrl(l)} target="_blank" rel="noreferrer" aria-label="Open in Spotify">
                  <ExternalLink size={16} />
                </a>
                <button
                  className="icon-btn"
                  aria-label={`Remove ${linkName(l)}`}
                  onClick={() => {
                    const before = { links, current }
                    removeSpotifyLink(l.key)
                    toast('Removed', { action: 'Undo', onAction: () => restoreSpotifyLinks(before) })
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <p className="tiny faint" style={{ marginTop: 10 }}>
            Sign in to Spotify in this browser to hear whole songs; otherwise the player plays 30-second previews.
          </p>
        </section>
      )}
    </Sheet>
  )
}
