import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { preparePhoto, fileToCanvas } from "../lib/image.js";
import { defaultSelection, hasVariants, numberLabel } from "../lib/cards.js";
import CardView from "./CardView.jsx";
import { CardImage, Sheet, Spinner } from "./ui.jsx";

const TIPS = ["Reading the set code and number…", "Matching the exact printing…", "Checking corners, edges and surface…", "Pulling market prices…"];

/** After a capture: identify with Claude, let the user confirm the match, then show the card page. */
export default function ScanFlow({ canvas, gameHint, collections, settings, status, onClose, onSaveItem, onCreateCollection, onSearchInstead }) {
  const [photo, setPhoto] = useState(null);
  const [back, setBack] = useState(null);
  const [phase, setPhase] = useState("identifying");
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [picked, setPicked] = useState(0);
  const [regrading, setRegrading] = useState(false);
  const [regradeError, setRegradeError] = useState(null);
  const [tip, setTip] = useState(0);
  const backRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await preparePhoto(canvas);
      if (!alive) return;
      setPhoto(p);
      identify(p);
    })();
    return () => {
      alive = false;
    };
  }, [canvas]);

  useEffect(() => {
    if (phase !== "identifying") return;
    const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 1800);
    return () => clearInterval(t);
  }, [phase]);

  async function identify(p = photo) {
    setPhase("identifying");
    setError(null);
    try {
      const r = await api.identify({ front: p.dataUrl, gameHint });
      setResult(r);
      setPicked(0);
      setPhase("done");
    } catch (e) {
      setError(e);
      setPhase("error");
    }
  }

  async function onBackPhoto(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const b = await preparePhoto(await fileToCanvas(f), { maxSide: 1400, quality: 0.8 });
    setBack(b);
    setRegrading(true);
    setRegradeError(null);
    try {
      const r = await api.identify({ front: photo.dataUrl, back: b.dataUrl, gameHint });
      // Keep the confirmed match; take the improved condition read.
      setResult((prev) => ({ ...prev, identification: { ...prev.identification, condition: r.identification.condition, graded: r.identification.graded, photo_feedback: r.identification.photo_feedback } }));
    } catch (err) {
      setRegradeError(`Couldn't re-check condition: ${err.message}`);
      setBack(null);
    } finally {
      setRegrading(false);
    }
  }

  const id = result?.identification;
  const candidates = result?.candidates || [];
  const card = candidates[picked];

  return (
    <Sheet title={card ? "Scan result" : "Scanning"} onClose={onClose}>
      {phase === "identifying" && (
        <div className="center">
          <div className="photo-pending">
            {photo && <img src={photo.previewUrl} alt="Your card" />}
            <div className="scanline" />
          </div>
          <div className="row" style={{ justifyContent: "center", marginTop: 18 }}>
            <Spinner small /> <b>Identifying card</b>
          </div>
          <div className="muted small mt">{TIPS[tip]}</div>
        </div>
      )}

      {phase === "error" && (
        <div className="stack">
          {photo && <img src={photo.previewUrl} alt="" style={{ width: "50%", margin: "0 auto", borderRadius: 12 }} />}
          <div className="banner error">{error?.message || "Something went wrong."}</div>
          {error?.code === "passcode" ? (
            <div className="small muted center">Open Settings and enter the app passcode you set on the server.</div>
          ) : (
            <button className="btn primary block" onClick={() => identify()}>
              Try again
            </button>
          )}
          <button className="btn block" onClick={() => onSearchInstead({})}>
            Search manually
          </button>
        </div>
      )}

      {phase === "done" && id && !id.is_card && (
        <div className="stack center">
          {photo && <img src={photo.previewUrl} alt="" style={{ width: "50%", margin: "0 auto", borderRadius: 12 }} />}
          <h3>No card found in that photo</h3>
          <div className="muted small">{id.photo_feedback || "Hold the card flat inside the frame, in good light, and try again."}</div>
          <button className="btn primary block" onClick={onClose}>
            Retake
          </button>
        </div>
      )}

      {phase === "done" && id?.is_card && (
        <>
          {candidates.length === 0 ? (
            <div className="stack">
              <div className="banner">
                Read as <b>{id.name}</b>
                {id.collector_number ? ` ${id.collector_number}${id.set_total ? `/${id.set_total}` : ""}` : ""}
                {id.set_code ? ` (${id.set_code})` : ""}, but no price data matched.
                {result.warnings?.length ? ` ${result.warnings.join(" ")}` : ""}
              </div>
              <button
                className="btn primary block"
                onClick={() => onSearchInstead({
                    game: ["yugioh", "mtg"].includes(id.game) ? id.game : "pokemon",
                    name: id.name,
                    number: id.game === "mtg" ? [id.set_code, id.collector_number].filter(Boolean).join(" ") : id.collector_number || id.set_code,
                  })}
              >
                Search the database
              </button>
            </div>
          ) : (
            <>
              {candidates.length > 1 && (
                <>
                  <div className="between" style={{ marginBottom: 8 }}>
                    <span className="small muted">Is this your card? Tap the right one.</span>
                    <button
                      className="small"
                      style={{ color: "var(--accent)", fontWeight: 650 }}
                      onClick={() => onSearchInstead({ game: id.game, name: id.name })}
                    >
                      Not here?
                    </button>
                  </div>
                  <div className="candidates">
                    {candidates.map((c, i) => (
                      <button key={c.id} className={`candidate${i === picked ? " on" : ""}`} onClick={() => setPicked(i)}>
                        <CardImage src={c.images?.small} alt={c.name} />
                        <div className="t ellipsis">{c.name}</div>
                        <div className="s ellipsis">{hasVariants(c) ? `${c.setName} ${numberLabel(c)}` : c.printings?.find((p) => p.key === c.printingKey)?.setCode || c.type}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {regradeError && <div className="banner error" style={{ marginBottom: 12 }}>{regradeError}</div>}
              <CardView
                key={card.id}
                card={card}
                initialSelection={defaultSelection(card, id)}
                initialCondition={id.condition?.grade || "NM"}
                initialGraded={id.graded?.is_graded ? { company: id.graded.company, grade: id.graded.grade } : null}
                ai={id}
                photoUrl={photo?.previewUrl}
                collections={collections}
                settings={settings}
                status={status}
                regrading={regrading}
                onAddBackPhoto={back ? null : () => backRef.current?.click()}
                onCreateCollection={onCreateCollection}
                onSave={(data) => onSaveItem({ ...data, ai: { condition: id.condition, edition: id.edition, language: id.language } }, photo, back)}
              />
            </>
          )}
        </>
      )}
      <input ref={backRef} type="file" accept="image/*" capture="environment" hidden onChange={onBackPhoto} />
    </Sheet>
  );
}
