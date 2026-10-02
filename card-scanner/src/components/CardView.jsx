import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { CONDITIONS, GRADERS, estimateValue, platformPayouts } from "../lib/pricing.js";
import { GAME_LABEL, hasVariants, selectionOptions, subtitle, cardSnapshot } from "../lib/cards.js";
import {
  ebaySoldUrl,
  ebayActiveUrl,
  ebaySearchQuery,
  mustIncludeTokens,
  excludeTokens,
  gradeLabel,
  priceChartingQuery,
  priceChartingUrl,
  tcgplayerUrl,
} from "../lib/links.js";
import { money, safeHref, timeAgo } from "../lib/format.js";
import { CardImage, Icon, Lightbox, Segmented, Spinner, Switch } from "./ui.jsx";

const GRADES = ["10", "9.5", "9", "8.5", "8", "7.5", "7", "6", "5", "4", "3", "2", "1"];
const STALE_MS = 6 * 3600 * 1000;
const LAST_COLLECTION = "binder.lastCollection";

/**
 * The card page: pick exact version + condition, see a realistic value and what
 * you'd actually take home per platform, then save it to a collection.
 */
export default function CardView({
  card: initialCard,
  initialSelection,
  initialCondition = "NM",
  initialGraded = null,
  ai = null,
  photoUrl = null,
  item = null,
  collections,
  settings,
  status,
  onSave,
  onDelete,
  onCreateCollection,
  onAddBackPhoto,
  regrading = false,
}) {
  const [card, setCard] = useState(initialCard);
  const [refreshing, setRefreshing] = useState(false);
  const [selection, setSelection] = useState(initialSelection ?? selectionOptions(initialCard)[0]?.key ?? null);
  const [condition, setCondition] = useState(initialCondition);
  const [gradedOn, setGradedOn] = useState(Boolean(initialGraded?.company));
  const [company, setCompany] = useState(initialGraded?.company || "PSA");
  const [grade, setGrade] = useState(initialGraded?.grade || "10");
  const [pc, setPc] = useState({ loading: false, data: item?.market?.pricecharting ?? null, error: null });
  const [eb, setEb] = useState({ loading: false, data: null, error: null });
  const [openPayout, setOpenPayout] = useState(null);
  const [zoom, setZoom] = useState(null);

  const graded = gradedOn ? { company, grade } : null;

  // AI condition may arrive after mount (e.g. after adding a back photo).
  useEffect(() => setCondition(initialCondition), [initialCondition]);

  // Saved cards: refresh prices quietly when they're older than a few hours.
  useEffect(() => {
    if (item && Date.now() - (item.pricedAt || 0) > STALE_MS) refresh();
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      const { card: fresh } = await api.card(card.id);
      setCard(fresh);
    } catch {
      /* keep the saved snapshot */
    } finally {
      setRefreshing(false);
    }
  }

  // PriceCharting (eBay sold averages, incl. graded) — only if the server has a token.
  const pcQuery = priceChartingQuery(card, selection);
  useEffect(() => {
    if (!status?.pricecharting) return;
    let alive = true;
    setPc((s) => ({ ...s, loading: true, error: null }));
    api
      .pricecharting(pcQuery)
      .then((d) => alive && setPc({ loading: false, data: d.best, error: null }))
      .catch((e) => alive && setPc({ loading: false, data: null, error: e.message }));
    return () => {
      alive = false;
    };
  }, [pcQuery, status?.pricecharting]);

  // eBay live listings — only if the server has eBay keys.
  const ebQuery = ebaySearchQuery(card, selection, graded);
  const ebMust = mustIncludeTokens(card, selection).join(",");
  const ebExclude = excludeTokens(card, selection, ai?.edition).join(",");
  const ebGrade = gradeLabel(graded);
  useEffect(() => {
    if (!status?.ebay) return;
    let alive = true;
    setEb((s) => ({ ...s, loading: true, error: null }));
    api
      .ebay({ q: ebQuery, must: ebMust ? ebMust.split(",") : [], exclude: ebExclude ? ebExclude.split(",") : [], graded: Boolean(ebGrade), grade: ebGrade })
      .then((d) => alive && setEb({ loading: false, data: d, error: null }))
      .catch((e) => alive && setEb({ loading: false, data: null, error: e.message }));
    return () => {
      alive = false;
    };
  }, [ebQuery, ebMust, ebExclude, ebGrade, status?.ebay]);

  const estimate = useMemo(
    // Saved cards keep their last eBay snapshot so values don't jump when eBay is unreachable.
    () => estimateValue({ card, selection, condition, graded, pricecharting: pc.data, ebayActive: eb.data ?? item?.market?.ebayActive ?? null }, settings),
    [card, selection, condition, gradedOn, company, grade, pc.data, eb.data, item, settings],
  );
  const payouts = useMemo(() => platformPayouts(estimate.value, settings), [estimate.value, settings]);
  const options = selectionOptions(card);

  return (
    <div>
      {/* ── hero ── */}
      <div className="hero">
        <div className="art">
          <CardImage src={card.images?.large || card.images?.small} alt={card.name} onClick={() => setZoom(card.images?.large)} />
          {photoUrl && <img className="mine" src={photoUrl} alt="Your photo" onClick={() => setZoom(photoUrl)} />}
        </div>
        <div className="grow">
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            <span className="pill">{GAME_LABEL[card.game]}</span>
            {ai?.edition && ai.edition !== "unknown" && ai.edition !== "Unlimited" && <span className="pill cond">{ai.edition}</span>}
            {ai?.language && ai.language !== "English" && <span className="pill medium">{ai.language}</span>}
          </div>
          <h2>{card.name}</h2>
          <div className="muted small mt" style={{ marginTop: 6 }}>
            {subtitle(card, selection)}
          </div>
          <div className="dim tiny mt">
            {card.source}
            {card.pricesUpdatedAt ? ` · prices ${timeAgo(card.pricesUpdatedAt)}` : ""}
          </div>
          {item && (
            <button className="btn sm mt" onClick={refresh} disabled={refreshing}>
              {refreshing ? <Spinner small /> : <Icon.refresh />} Refresh prices
            </button>
          )}
        </div>
      </div>

      {ai?.authenticity_flags?.length > 0 && (
        <div className="banner error mt">
          <b>Authenticity check:</b> {ai.authenticity_flags.join(" ")}
        </div>
      )}

      {/* ── exact version ── */}
      {options.length > 0 && (
        <>
          <div className="section-title">{hasVariants(card) ? "Version" : "Printing (set code · rarity)"}</div>
          {hasVariants(card) ? (
            <div className="chips">
              {options.map((o) => (
                <button key={o.key} className={`chip${selection === o.key ? " on" : ""}`} onClick={() => setSelection(o.key)}>
                  {o.label}
                  {o.price ? <small>{money(o.price)}</small> : null}
                </button>
              ))}
            </div>
          ) : (
            <select className="select" value={selection || ""} onChange={(e) => setSelection(e.target.value)}>
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label} — {o.price ? money(o.price) : "no price"} ({o.sub})
                </option>
              ))}
            </select>
          )}
          {card.game === "yugioh" && ai?.edition === "1st Edition" && (
            <div className="dim tiny mt">1st Edition copies of older sets can sell for much more than these prices. Check eBay sold listings below.</div>
          )}
        </>
      )}

      {/* ── condition ── */}
      <div className="section-title">Condition</div>
      <div className="between" style={{ marginBottom: 10 }}>
        <span className="small muted">Graded slab</span>
        <Switch on={gradedOn} onChange={setGradedOn} label="Graded slab" />
      </div>
      {gradedOn ? (
        <div className="row">
          <select className="select" value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Grading company">
            {GRADERS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <select className="select" value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Grade">
            {GRADES.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </div>
      ) : (
        <Segmented options={CONDITIONS.map((c) => ({ value: c.key, label: c.short }))} value={condition} onChange={setCondition} />
      )}

      {ai?.condition && <AiCondition ai={ai} regrading={regrading} onAddBackPhoto={onAddBackPhoto} />}

      {/* ── value ── */}
      <div className="section-title">What it's worth</div>
      <div className="value-card">
        <div className="between">
          <span className="small muted">Realistic sale price · {estimate.condition}</span>
          <span className={`pill ${estimate.confidence}`}>{estimate.confidence} confidence</span>
        </div>
        <div className="big mt" style={{ marginTop: 6 }}>
          {money(estimate.value)}
        </div>
        {estimate.value !== null && (
          <div className="range">
            <div>
              <span className="tiny muted">Quick sale</span>
              <b>{money(estimate.quick)}</b>
            </div>
            <div>
              <span className="tiny muted">If you're patient</span>
              <b>{money(estimate.patient)}</b>
            </div>
          </div>
        )}
        <div className="stack mt">
          {estimate.sources.map((s, i) => (
            <div key={i} className="between small">
              <span className="muted grow">
                {s.label}
                {s.note ? <span className="dim"> · {s.note}</span> : null}
              </span>
              <b>{money(s.value)}</b>
            </div>
          ))}
          {pc.loading && <div className="row small dim"><Spinner small /> Checking eBay sold averages…</div>}
          {pc.data && <div className="tiny dim">PriceCharting match: {pc.data.product} · {pc.data.console}</div>}
          {estimate.notes.map((n, i) => (
            <div key={i} className="tiny" style={{ color: "#d9cdfc" }}>
              {n}
            </div>
          ))}
        </div>
      </div>

      {/* ── payouts ── */}
      {payouts.length > 0 && (
        <>
          <div className="section-title">What you'd take home</div>
          <div className="card" style={{ padding: "4px 14px" }}>
            {payouts.map((p, i) => (
              <button key={p.key} className={`payout${i === 0 ? " best" : ""}`} style={{ width: "100%", textAlign: "left" }} onClick={() => setOpenPayout(openPayout === p.key ? null : p.key)}>
                <div>
                  <div className="name" style={{ fontWeight: 650 }}>{p.name}</div>
                  <div className="tiny dim">
                    sells ~{money(p.salePrice)}
                    {p.fees ? ` · fees ${money(p.fees)}` : ""}
                    {p.shipping ? ` · shipping ${money(p.shipping)}` : ""}
                  </div>
                </div>
                <div className={`net${p.net < 0 ? " neg" : ""}`}>{money(p.net)}</div>
                {openPayout === p.key && (
                  <div className="detail">
                    {p.detail.map((d, j) => (
                      <div key={j}>• {d}</div>
                    ))}
                    <div style={{ marginTop: 4, color: "var(--text)" }}>{p.note}</div>
                  </div>
                )}
              </button>
            ))}
          </div>
          {item?.paid ? (
            <div className="small mt center">
              You paid {money(item.paid)} · best-case profit{" "}
              <b style={{ color: payouts[0].net - item.paid >= 0 ? "var(--accent)" : "var(--danger)" }}>{money(payouts[0].net - item.paid)}</b>
            </div>
          ) : null}
          <div className="tiny dim mt center">Fee and shipping assumptions can be changed in Settings.</div>
        </>
      )}

      {/* ── real comps ── */}
      <div className="section-title">Check real sales</div>
      <div className="card linklist" style={{ padding: "2px 14px" }}>
        <a href={ebaySoldUrl(card, selection, graded)} target="_blank" rel="noreferrer">
          eBay sold listings <span>what buyers actually paid ↗</span>
        </a>
        <a href={ebayActiveUrl(card, selection, graded)} target="_blank" rel="noreferrer">
          eBay current listings <span>your competition ↗</span>
        </a>
        <a href={safeHref(tcgplayerUrl(card))} target="_blank" rel="noreferrer">
          TCGplayer <span>market price history ↗</span>
        </a>
        <a href={priceChartingUrl(card, selection)} target="_blank" rel="noreferrer">
          PriceCharting <span>graded &amp; ungraded sales ↗</span>
        </a>
        {card.links?.cardmarket && (
          <a href={safeHref(card.links.cardmarket)} target="_blank" rel="noreferrer">
            Cardmarket <span>EU prices ↗</span>
          </a>
        )}
      </div>

      {status?.ebay && <EbayListings state={eb} />}

      {/* ── save ── */}
      <SaveSection
        key={item?.id || "new"}
        item={item}
        collections={collections}
        onCreateCollection={onCreateCollection}
        onDelete={onDelete}
        onSave={(extra) =>
          onSave({
            ...extra,
            card: cardSnapshot(card),
            selection,
            condition,
            graded,
            estimate: { value: estimate.value, confidence: estimate.confidence, nmBase: estimate.nmBase },
            market: { pricecharting: pc.data, ebayActive: eb.data ? { median: eb.data.median, count: eb.data.count, low: eb.data.low } : null },
            pricedAt: Date.now(),
          })
        }
      />

      <Lightbox src={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}

function AiCondition({ ai, regrading, onAddBackPhoto }) {
  const c = ai.condition;
  return (
    <div className="card mt">
      <div className="between">
        <b>
          AI read: {c.grade}
          {ai.graded?.is_graded ? ` · in ${ai.graded.company} ${ai.graded.grade} slab` : ""}
        </b>
        <span className={`pill ${c.confidence}`}>{c.confidence}</span>
      </div>
      <div className="small muted mt" style={{ marginTop: 6 }}>{c.summary}</div>
      <dl className="kv mt">
        <dt>Centering</dt>
        <dd>{c.centering || "—"}</dd>
        <dt>Corners</dt>
        <dd>{c.corners || "—"}</dd>
        <dt>Edges</dt>
        <dd>{c.edges || "—"}</dd>
        <dt>Surface</dt>
        <dd>{c.surface || "—"}</dd>
        {c.grading_outlook && (
          <>
            <dt>If graded</dt>
            <dd>{c.grading_outlook}</dd>
          </>
        )}
      </dl>
      {c.issues?.length > 0 && (
        <ul className="issues">
          {c.issues.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      )}
      {ai.photo_feedback && <div className="banner info mt">{ai.photo_feedback}</div>}
      {onAddBackPhoto && (
        <button className="btn block mt" onClick={onAddBackPhoto} disabled={regrading}>
          {regrading ? <Spinner small /> : <Icon.camera />} {regrading ? "Re-checking condition…" : "Add back photo for a better grade"}
        </button>
      )}
      <div className="tiny dim mt">This is an estimate from photos. Check corners and surface under a bright light before you list.</div>
    </div>
  );
}

function EbayListings({ state }) {
  if (state.loading) return <div className="row small dim mt"><Spinner small /> Loading eBay listings…</div>;
  if (state.error) return <div className="tiny dim mt">eBay listings unavailable: {state.error}</div>;
  const d = state.data;
  if (!d) return null;
  return (
    <div className="card mt">
      <div className="between">
        <b>eBay right now</b>
        <span className="tiny dim">{d.count} matching Buy It Now listings</span>
      </div>
      {d.count > 0 ? (
        <>
          <div className="small muted mt" style={{ marginTop: 6 }}>
            Lowest {money(d.low)} · median ask {money(d.median)} (incl. shipping)
          </div>
          <div className="mt">
            {(d.listings || []).slice(0, 5).map((l, i) => (
              <a key={i} className="listing" href={safeHref(l.url)} target="_blank" rel="noreferrer">
                {safeHref(l.image) ? <img src={l.image} alt="" loading="lazy" /> : <div className="noimg" style={{ width: 44, height: 44 }} />}
                <div className="grow">
                  <div className="small ellipsis">{l.title}</div>
                  <div className="tiny dim">
                    {money(l.price)}
                    {l.shipping ? ` + ${money(l.shipping)} ship` : " · free ship"}
                  </div>
                </div>
              </a>
            ))}
          </div>
          <div className="tiny dim mt">Asking prices, not sales. Cards usually sell below the median ask.</div>
        </>
      ) : (
        <div className="small muted mt">No matching listings right now.</div>
      )}
    </div>
  );
}

function SaveSection({ item, collections, onSave, onDelete, onCreateCollection }) {
  const lastUsed = (() => {
    try {
      return localStorage.getItem(LAST_COLLECTION);
    } catch {
      return null;
    }
  })();
  const initial = item?.collectionId || (collections.some((c) => c.id === lastUsed) ? lastUsed : collections[0]?.id) || null;
  const [collectionId, setCollectionId] = useState(initial);
  const [qty, setQty] = useState(item?.qty || 1);
  const [paid, setPaid] = useState(item?.paid ?? "");
  const [notes, setNotes] = useState(item?.notes || "");
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!collectionId && collections[0]) setCollectionId(collections[0].id);
  }, [collections, collectionId]);

  async function createCollection() {
    const name = newName.trim();
    if (!name) return;
    const c = await onCreateCollection(name);
    setCollectionId(c.id);
    setNewName("");
    setAdding(false);
  }

  async function save() {
    setBusy(true);
    try {
      let cid = collectionId;
      if (!cid) cid = (await onCreateCollection("My Collection")).id;
      try {
        localStorage.setItem(LAST_COLLECTION, cid);
      } catch {
        /* ignore */
      }
      await onSave({ collectionId: cid, qty: Math.max(1, Number(qty) || 1), paid: paid === "" ? null : Number(paid), notes });
    } finally {
      setBusy(false);
    }
  }

  const target = collections.find((c) => c.id === collectionId);
  return (
    <>
      <div className="section-title">{item ? "In your collection" : "Add to a collection"}</div>
      <div className="chips">
        {collections.map((c) => (
          <button key={c.id} className={`chip${collectionId === c.id ? " on" : ""}`} onClick={() => setCollectionId(c.id)}>
            {c.emoji} {c.name}
          </button>
        ))}
        <button className="chip" onClick={() => setAdding(true)}>
          + New
        </button>
      </div>
      {adding && (
        <div className="row mt">
          <input className="input" placeholder="Collection name" value={newName} autoFocus onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createCollection()} />
          <button className="btn" onClick={createCollection}>
            Create
          </button>
        </div>
      )}
      <div className="row mt">
        <div className="grow">
          <label className="label">Quantity</label>
          <input className="input" type="number" inputMode="numeric" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div className="grow">
          <label className="label">You paid (optional)</label>
          <input className="input" type="number" inputMode="decimal" step="0.01" placeholder="$" value={paid} onChange={(e) => setPaid(e.target.value)} />
        </div>
      </div>
      <div className="mt">
        <label className="label">Notes</label>
        <textarea className="textarea" placeholder="e.g. pulled from a pack, small scratch on back" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button className="btn primary block mt" onClick={save} disabled={busy}>
        {busy ? <Spinner small /> : null}
        {item ? "Save changes" : `Add to ${target ? target.name : "My Collection"}`}
      </button>
      {item && (
        <button className="btn danger ghost block mt" onClick={onDelete}>
          <Icon.trash /> Remove from collection
        </button>
      )}
    </>
  );
}
