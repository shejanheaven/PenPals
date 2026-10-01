// Talk to Cadence: speech-to-text via the browser's built-in recognizer
// (Chrome, Edge, Android, Safari on iPhone/Mac). Nothing is recorded or stored.

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null

export const voiceSupported = () => !!Recognition

const MESSAGES = {
  'not-allowed': 'Microphone access is off. Allow it for Cadence in your browser settings, or use the keyboard’s mic to dictate.',
  'service-not-allowed': 'Voice isn’t available here. Use the keyboard’s mic to dictate instead.',
  'no-speech': 'I didn’t hear anything. Tap the mic and try again.',
  'audio-capture': 'No microphone was found.',
  network: 'Voice needs an internet connection on this device.',
}

export const voiceErrorMessage = (code) => MESSAGES[code] ?? 'Voice stopped unexpectedly. Tap the mic to try again.'

// Listen for one request. Calls onText with the words so far, then onDone
// with the final transcript (or '' if nothing was understood).
export function listen({ onText, onDone, onError }) {
  if (!Recognition) {
    onError?.('service-not-allowed')
    return () => {}
  }
  const r = new Recognition()
  r.lang = navigator.language || 'en-US'
  r.interimResults = true
  r.continuous = false
  r.maxAlternatives = 1
  let finalText = ''
  let latest = ''
  let failed = false
  r.onresult = (e) => {
    let text = ''
    finalText = ''
    for (const res of e.results) {
      text += res[0].transcript
      if (res.isFinal) finalText += res[0].transcript
    }
    latest = text
    onText?.(text)
  }
  r.onerror = (e) => {
    if (e.error === 'aborted') return
    failed = true
    onError?.(e.error)
  }
  r.onend = () => {
    if (!failed) onDone?.((finalText || latest).trim())
  }
  try {
    r.start()
  } catch {
    onError?.('service-not-allowed')
  }
  return () => {
    try {
      r.stop()
    } catch {
      /* already stopped */
    }
  }
}
