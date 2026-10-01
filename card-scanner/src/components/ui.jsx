import { Component, useEffect, useState } from "react";
import { getPhoto } from "../lib/db.js";

const P = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };

export const Icon = {
  camera: () => (
    <svg viewBox="0 0 24 24" {...P}><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13.5" r="3.5" /></svg>
  ),
  binder: () => (
    <svg viewBox="0 0 24 24" {...P}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 3v18M12 8h5M12 12h5" /></svg>
  ),
  search: () => (
    <svg viewBox="0 0 24 24" {...P}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
  ),
  settings: () => (
    <svg viewBox="0 0 24 24" {...P}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
  ),
  close: () => <svg viewBox="0 0 24 24" {...P}><path d="M6 6l12 12M18 6 6 18" /></svg>,
  back: () => <svg viewBox="0 0 24 24" {...P}><path d="M15 5l-7 7 7 7" /></svg>,
  image: () => (
    <svg viewBox="0 0 24 24" {...P}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></svg>
  ),
  refresh: () => <svg viewBox="0 0 24 24" {...P}><path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4" /></svg>,
  trash: () => <svg viewBox="0 0 24 24" {...P}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>,
  share: () => <svg viewBox="0 0 24 24" {...P}><path d="M12 15V3M8 7l4-4 4 4M5 12v8h14v-8" /></svg>,
  plus: () => <svg viewBox="0 0 24 24" {...P}><path d="M12 5v14M5 12h14" /></svg>,
  external: () => <svg viewBox="0 0 24 24" {...P}><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" /></svg>,
  flip: () => <svg viewBox="0 0 24 24" {...P}><path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" /></svg>,
};

export function Sheet({ title, onClose, left, right, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sheet" role="dialog" aria-label={title}>
      <div className="sheet-head">
        <div style={{ width: 40 }}>
          {left ?? (
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon.close />
            </button>
          )}
        </div>
        <div className="title ellipsis">{title}</div>
        <div style={{ minWidth: 40, display: "flex", justifyContent: "flex-end" }}>{right}</div>
      </div>
      <div className="sheet-body">{children}</div>
    </div>
  );
}

export function Segmented({ options, value, onChange, glass }) {
  return (
    <div className={`seg${glass ? " glass" : ""}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label }) {
  return <button className={`switch${on ? " on" : ""}`} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Spinner({ small }) {
  return <div className={`spinner${small ? " sm" : ""}`} role="status" aria-label="Loading" />;
}

export function CardImage({ src, alt, className, onClick }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <div className={`noimg ${className || ""}`}>No image</div>;
  return <img src={src} alt={alt} className={className} loading="lazy" onError={() => setBroken(true)} onClick={onClick} />;
}

/** Object URL for a photo stored in IndexedDB. */
export function usePhotoUrl(photoId) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    let u = null;
    getPhoto(photoId).then((blob) => {
      if (alive && blob) setUrl((u = URL.createObjectURL(blob)));
    });
    return () => {
      alive = false;
      if (u) URL.revokeObjectURL(u);
      setUrl(null);
    };
  }, [photoId]);
  return url;
}

export function Lightbox({ src, onClose }) {
  if (!src) return null;
  return (
    <div className="lightbox" onClick={onClose}>
      <img src={src} alt="" />
    </div>
  );
}

/** Keeps one broken panel from blanking the whole app. */
export class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error) {
    console.error(error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const { onReset } = this.props;
    const body = (
      <div className="empty">
        <div className="big">😵</div>
        <div>Something went wrong showing this.</div>
        <div className="tiny dim mt">{String(this.state.error?.message || this.state.error)}</div>
        <button className="btn mt" onClick={() => location.reload()}>
          Reload app
        </button>
      </div>
    );
    if (!onReset) return body;
    return (
      <Sheet
        title="Something went wrong"
        onClose={() => {
          this.setState({ error: null });
          onReset();
        }}
      >
        {body}
      </Sheet>
    );
  }
}
