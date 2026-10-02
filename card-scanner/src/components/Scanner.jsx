import { useEffect, useRef, useState } from "react";
import { cropVideoToGuide, fileToCanvas, guideRect } from "../lib/image.js";
import { GAMES } from "../lib/cards.js";
import { Icon, Segmented } from "./ui.jsx";

const GAME_OPTIONS = [{ value: "auto", label: "Auto" }, ...GAMES];

export default function Scanner({ active, aiReady, gameHint, setGameHint, onCapture, onSearchInstead }) {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const pickRef = useRef(null);
  const nativeCamRef = useRef(null);
  const [cam, setCam] = useState("starting"); // starting | live | denied | unavailable
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Run the camera only while this tab is visible and no sheet covers it (saves battery).
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setCam("unavailable");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const v = videoRef.current;
        v.srcObject = stream;
        await v.play().catch(() => {});
        setCam("live");
        stream.getVideoTracks()[0]?.applyConstraints?.({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
      } catch (e) {
        if (!cancelled) setCam(e?.name === "NotAllowedError" || e?.name === "SecurityError" ? "denied" : "unavailable");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [active]);

  function shoot() {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    setFlash(true);
    setTimeout(() => setFlash(false), 260);
    navigator.vibrate?.(15);
    onCapture(cropVideoToGuide(v));
  }

  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) onCapture(await fileToCanvas(f));
  }

  const g = guideRect(size.w, size.h);
  const canShoot = aiReady && cam === "live";

  return (
    <div className="scanner" ref={wrapRef}>
      <video ref={videoRef} playsInline muted autoPlay />
      {cam === "live" && size.w > 0 && (
        <>
          <div className="guide" style={{ left: g.x, top: g.y, width: g.w, height: g.h }}>
            <div className="scanline" />
          </div>
          <div className="hint" style={{ top: g.y + g.h + 14 }}>
            Fill the frame with the card. Tilt it a little to kill glare.
          </div>
        </>
      )}

      {(cam === "denied" || cam === "unavailable") && (
        <div className="camera-fallback">
          <div style={{ fontSize: 48 }}>📷</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{cam === "denied" ? "Camera access is off" : "Live camera unavailable"}</div>
          <div className="muted small">
            {cam === "denied"
              ? "On iPhone: Settings → Apps → Safari → Camera → Allow, then reopen this page. Or take a photo instead:"
              : "You can still take a photo with your camera app:"}
          </div>
          <button className="btn primary" onClick={() => nativeCamRef.current?.click()} disabled={!aiReady}>
            <Icon.camera /> Take a photo
          </button>
        </div>
      )}

      <div className="top stack">
        <Segmented glass options={GAME_OPTIONS} value={gameHint} onChange={setGameHint} />
        {!aiReady && (
          <div className="banner">
            Scanning needs an Anthropic API key on the server (see the README). You can still add cards with{" "}
            <button style={{ color: "var(--accent)", fontWeight: 650 }} onClick={onSearchInstead}>
              Search
            </button>
            .
          </div>
        )}
      </div>

      <div className="controls">
        <button className="round-btn" style={{ justifySelf: "start" }} onClick={() => pickRef.current?.click()} disabled={!aiReady} aria-label="Choose a photo">
          <Icon.image />
        </button>
        <button className="shutter" onClick={shoot} disabled={!canShoot} aria-label="Scan card" />
        <button className="round-btn" style={{ justifySelf: "end" }} onClick={() => nativeCamRef.current?.click()} disabled={!aiReady} aria-label="Use the camera app (sharper for small text)">
          <Icon.camera />
        </button>
      </div>

      <input ref={pickRef} type="file" accept="image/*" hidden onChange={onFile} />
      <input ref={nativeCamRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
      {flash && <div className="flash" />}
    </div>
  );
}
