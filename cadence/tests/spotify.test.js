import { describe, expect, it } from 'vitest'
import { parseSpotify, spotifyEmbedUrl, spotifyUrl } from '../src/lib/spotify.js'
import { mergeStates } from '../src/lib/merge.js'
import { migrate } from '../src/store/store.js'

const ID = '37i9dQZF1DX8NTLI2TtZa6'

describe('parseSpotify', () => {
  it('reads share links, with or without tracking and locale', () => {
    expect(parseSpotify(`https://open.spotify.com/playlist/${ID}?si=abc123`)).toEqual({ type: 'playlist', id: ID })
    expect(parseSpotify(`https://open.spotify.com/intl-de/album/${ID}`)).toEqual({ type: 'album', id: ID })
    expect(parseSpotify(`open.spotify.com/track/${ID}`)).toEqual({ type: 'track', id: ID })
    expect(parseSpotify(`Listen to this! https://open.spotify.com/episode/${ID}?si=x`)).toEqual({ type: 'episode', id: ID })
  })

  it('reads embed links, old user playlists and app URIs', () => {
    expect(parseSpotify(`https://open.spotify.com/embed/show/${ID}?utm_source=generator`)).toEqual({ type: 'show', id: ID })
    expect(parseSpotify(`https://open.spotify.com/user/spotify/playlist/${ID}`)).toEqual({ type: 'playlist', id: ID })
    expect(parseSpotify(`spotify:artist:${ID}`)).toEqual({ type: 'artist', id: ID })
    expect(parseSpotify(`spotify:user:bob:playlist:${ID}`)).toEqual({ type: 'playlist', id: ID })
  })

  it('explains what it cannot read', () => {
    expect(parseSpotify('').error).toMatch(/Paste/)
    expect(parseSpotify('https://spotify.link/AbCdEf').error).toMatch(/short share link/)
    expect(parseSpotify('https://youtube.com/watch?v=1').error).toBeTruthy()
    expect(parseSpotify('https://open.spotify.com/genre/0JQ5DAqbMKFQ00XGBls6ym').error).toBeTruthy()
  })

  it('builds the open and embed addresses', () => {
    const ref = { type: 'playlist', id: ID }
    expect(spotifyUrl(ref)).toBe(`https://open.spotify.com/playlist/${ID}`)
    expect(spotifyEmbedUrl(ref)).toBe(`https://open.spotify.com/embed/playlist/${ID}?utm_source=generator`)
    expect(spotifyEmbedUrl(ref, { dark: true })).toContain('theme=0')
  })
})

describe('notes in the planner', () => {
  it('older saves gain an empty notes collection and Spotify settings', () => {
    const s = migrate({ items: {}, settings: { theme: 'dark' } })
    expect(s.notes).toEqual({})
    expect(s.settings.spotify).toEqual({ links: [], current: null })
    expect(s.settings.theme).toBe('dark')
  })

  it('merges notes across devices, newest edit winning', () => {
    const a = { notes: { n1: { id: 'n1', body: 'old', updatedAt: 1 }, n2: { id: 'n2', body: 'only here', updatedAt: 5 } } }
    const b = { notes: { n1: { id: 'n1', body: 'new', updatedAt: 2 } } }
    const out = mergeStates(a, b)
    expect(out.notes.n1.body).toBe('new')
    expect(out.notes.n2.body).toBe('only here')
  })
})
