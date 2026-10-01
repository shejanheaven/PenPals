import { Component } from 'react'
import { RotateCcw } from 'lucide-react'
import { persistNow } from '../store/store.js'

// If a screen ever fails, show a calm way back instead of a blank page.
// Plans are saved separately, so nothing is lost.
export class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    persistNow()
    console.error('Cadence screen error', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="page">
        <div className="card" style={{ marginTop: 32 }}>
          <div className="empty">
            <h3>This screen hit a snag</h3>
            <p>Your plans are safe. Try again, or head back to Today.</p>
            <div className="row-flex" style={{ justifyContent: 'center', marginTop: 14 }}>
              <button className="btn secondary" onClick={() => this.setState({ error: null })}>
                <RotateCcw size={16} /> Try again
              </button>
              <button className="btn primary" onClick={() => location.assign('/')}>
                Go to Today
              </button>
            </div>
            <p className="tiny faint" style={{ marginTop: 14 }}>
              {String(this.state.error?.message ?? this.state.error)}
            </p>
          </div>
        </div>
      </div>
    )
  }
}
