// Turning whatever someone pastes from Spotify (a share link, an app URI, an
// embed link) into something the official embed player can show.

export const SPOTIFY_TYPES = ['playlist', 'album', 'track', 'artist', 'episode', 'show']

const TYPE_LABEL = { playlist: 'Playlist', album: 'Album', track: 'Song', artist: 'Artist', episode: 'Episode', show: 'Podcast' }
export const spotifyTypeLabel = (type) => TYPE_LABEL[type] ?? 'Spotify'

const ID = '([A-Za-z0-9]{10,40})'
const TYPES = SPOTIFY_TYPES.join('|')
const WEB = new RegExp(`open\\.spotify\\.com/(?:intl-[a-z-]+/)?(?:embed/)?(?:user/[^/]+/)?(${TYPES})/${ID}`, 'i')
const URI = new RegExp(`spotify:(?:user:[^:]+:)?(${TYPES}):${ID}`, 'i')
const SHORT = /\b(spotify\.link|spotify\.app\.link)\//i

// → { type, id } | { error }
export function parseSpotify(input) {
  const text = String(input ?? '').trim()
  if (!text) return { error: 'Paste a link from Spotify.' }
  const m = text.match(WEB) ?? text.match(URI)
  if (m) return { type: m[1].toLowerCase(), id: m[2] }
  if (SHORT.test(text)) {
    return { error: 'That’s a short share link. Open it in your browser, then copy the full open.spotify.com address.' }
  }
  return { error: 'That doesn’t look like a Spotify link. In Spotify: Share → Copy link.' }
}

export const spotifyUrl = ({ type, id }) => `https://open.spotify.com/${type}/${id}`

export function spotifyEmbedUrl({ type, id }, { dark = false } = {}) {
  return `https://open.spotify.com/embed/${type}/${id}?utm_source=generator${dark ? '&theme=0' : ''}`
}
