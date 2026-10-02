import { useEffect, useMemo, useState } from "react";
import { listItems, saveItem, saveCollection, deleteCollection } from "../lib/db.js";
import { api } from "../lib/api.js";
import { estimateValue } from "../lib/pricing.js";
import { GAME_LABEL, GAMES, hasVariants, numberLabel, subtitle, selectionLabel } from "../lib/cards.js";
import { money, pct } from "../lib/format.js";
import { historyStats, itemValue, sparkPath } from "../lib/history.js";
import { CardImage, Icon, Segmented, Sheet, Spinner } from "./ui.jsx";

const EMOJIS = ["📒", "🔥", "⚡", "🐉", "💎", "🏆", "💰", "🛒", "🎴", "⭐", "🧪", "📦"];

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export { itemValue };

export function Collections({ collections, items, snapshots, onOpenCollection, onCreated }) {
  const [creating, setCreating] = useState(false);
  const totals = useMemo(() => {
    const t = {};
    for (const it of items) {
      t[it.collectionId] ??= { value: 0, count: 0 };
      t[it.collectionId].value += itemValue(it);
      t[it.collectionId].count += it.qty || 1;
    }
    return t;
  }, [items]);
  const grand = items.reduce((s, it) => s + itemValue(it), 0);
  const cardCount = items.reduce((s, it) => s + (it.qty || 1), 0);

  return (
    <div className="screen">
      <h1>Collections</h1>
      <div className="total-banner">
        <div className="small muted">Everything you own</div>
        <div className="big">{money(grand, { whole: true })}</div>
        <div className="small muted">
          {plural(cardCount, "card")} · realistic sale value
        </div>
        <ValueTrend snapshots={snapshots} />
      </div>
      <div className="grid-2">
        {collections.map((c) => (
          <button key={c.id} className="coll" onClick={() => onOpenCollection(c)}>
            <div>
              <div className="emoji">{c.emoji}</div>
              <div className="name ellipsis">{c.name}</div>
              <div className="tiny dim">{plural(totals[c.id]?.count || 0, "card")}</div>
            </div>
            <div className="val">{money(totals[c.id]?.value || 0, { whole: true })}</div>
          </button>
        ))}
        <button className="coll new" onClick={() => setCreating(true)}>
          <Icon.plus />
          New collection
        </button>
      </div>
      {collections.length === 0 && (
        <div className="empty">
          <div className="big">🎴</div>
          Make collections like “Binder 1”, “For Sale” or “Charizards”. Scanned cards go into them.
        </div>
      )}
      {creating && (
        <CollectionEditor
          onClose={() => setCreating(false)}
          onSave={async (data) => {
            const c = await saveCollection(data);
            setCreating(false);
            onCreated(c);
          }}
        />
      )}
    </div>
  );
}

const RANGES = [
  { value: 7, label: "7D" },
  { value: 30, label: "30D" },
  { value: 90, label: "90D" },
  { value: 0, label: "All" },
];

function ValueTrend({ snapshots }) {
  const [days, setDays] = useState(30);
  const stats = useMemo(() => historyStats(snapshots, days), [snapshots, days]);
  if (!snapshots?.length) return null;
  if (snapshots.length < 2) return <div className="tiny dim mt">Your value history starts today. Check back tomorrow to see the trend.</div>;
  const up = (stats?.change ?? 0) >= 0;
  return (
    <div className="trend mt">
      <div className="between">
        {stats ? (
          <span className={`small ${up ? "up" : "down"}`}>
            {up ? "▲" : "▼"} {money(Math.abs(stats.change))}
            {stats.pct !== null ? ` (${pct(Math.abs(stats.pct))})` : ""}
            <span className="dim"> since {new Date(`${stats.since}T12:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
          </span>
        ) : (
          <span className="small dim">Not enough history in this range</span>
        )}
        <div className="range">
          {RANGES.map((r) => (
            <button key={r.value} className={days === r.value ? "on" : ""} onClick={() => setDays(r.value)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {stats && (
        <>
          <svg className={`spark ${up ? "up" : "down"}`} viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label="Collection value over time">
            <polyline points={sparkPath(stats.points)} fill="none" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
          {stats.cardsAdded !== 0 && (
            <div className="tiny dim">
              Includes {plural(Math.abs(stats.cardsAdded), "card")} {stats.cardsAdded > 0 ? "added" : "removed"} in this period, not just price moves.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function CollectionEditor({ collection, onClose, onSave, onDelete }) {
  const [name, setName] = useState(collection?.name || "");
  const [emoji, setEmoji] = useState(collection?.emoji || "📒");
  return (
    <Sheet title={collection ? "Edit collection" : "New collection"} onClose={onClose}>
      <label className="label">Name</label>
      <input className="input" value={name} autoFocus placeholder="e.g. For Sale" onChange={(e) => setName(e.target.value)} />
      <label className="label mt">Icon</label>
      <div className="emoji-pick">
        {EMOJIS.map((e) => (
          <button key={e} className={emoji === e ? "on" : ""} onClick={() => setEmoji(e)}>
            {e}
          </button>
        ))}
      </div>
      <button className="btn primary block mt-lg" disabled={!name.trim()} onClick={() => onSave({ ...(collection || {}), name: name.trim(), emoji })}>
        {collection ? "Save" : "Create collection"}
      </button>
      {onDelete && (
        <button className="btn danger ghost block mt" onClick={onDelete}>
          <Icon.trash /> Delete collection and its cards
        </button>
      )}
    </Sheet>
  );
}

const SORTS = [
  { value: "value", label: "Value" },
  { value: "recent", label: "Recent" },
  { value: "name", label: "Name" },
];

export function CollectionDetail({ collection, settings, onBack, onOpenItem, onChanged, toast }) {
  const [items, setItems] = useState(null);
  const [sort, setSort] = useState("value");
  const [game, setGame] = useState("all");
  const [refreshing, setRefreshing] = useState(null);
  const [editing, setEditing] = useState(false);

  const load = () => listItems(collection.id).then(setItems);
  useEffect(() => {
    load();
  }, [collection.id]);

  const shown = useMemo(() => {
    if (!items) return [];
    const list = items.filter((it) => game === "all" || it.card.game === game);
    if (sort === "value") list.sort((a, b) => itemValue(b) - itemValue(a));
    if (sort === "name") list.sort((a, b) => a.card.name.localeCompare(b.card.name));
    return list;
  }, [items, sort, game]);
  const total = (items || []).reduce((s, it) => s + itemValue(it), 0);
  const paid = (items || []).reduce((s, it) => s + (it.paid || 0) * (it.qty || 1), 0);

  async function refreshAll() {
    let done = 0;
    let failed = 0;
    setRefreshing({ done, total: items.length });
    for (const it of items) {
      try {
        const { card } = await api.card(it.card.id);
        const est = estimateValue(
          { card, selection: it.selection, condition: it.condition, graded: it.graded, pricecharting: it.market?.pricecharting, ebayActive: it.market?.ebayActive },
          settings,
        );
        await saveItem({ ...it, card: { ...it.card, ...card }, estimate: { value: est.value, confidence: est.confidence, nmBase: est.nmBase }, pricedAt: Date.now() });
      } catch {
        failed++;
      }
      setRefreshing({ done: ++done, total: items.length });
    }
    setRefreshing(null);
    await load();
    onChanged();
    toast(failed ? `Updated ${done - failed} of ${done} cards` : "Prices updated");
  }

  function exportCsv() {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Name", "Game", "Set", "Number / Code", "Version", "Condition", "Qty", "Value each", "Value total", "Paid each", "Notes"]];
    for (const it of shown) {
      const c = it.card;
      const p = c.printings?.find((x) => x.key === it.selection);
      rows.push([
        c.name,
        GAME_LABEL[c.game],
        c.setName || p?.setName || "",
        hasVariants(c) ? numberLabel(c) : p?.setCode || "",
        selectionLabel(c, it.selection),
        it.graded ? `${it.graded.company} ${it.graded.grade}` : it.condition,
        it.qty || 1,
        it.estimate?.value ?? "",
        itemValue(it).toFixed(2),
        it.paid ?? "",
        it.notes || "",
      ]);
    }
    const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
    shareOrDownload(new File([csv], `${collection.name.replace(/[^\w-]+/g, "_")}.csv`, { type: "text/csv" }));
  }

  return (
    <div className="screen">
      <div className="between" style={{ marginTop: 4 }}>
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <Icon.back />
        </button>
        <button className="btn sm" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>
      <h1>
        {collection.emoji} {collection.name}
      </h1>
      <div className="total-banner">
        <div className="big">{money(total, { whole: true })}</div>
        <div className="small muted">
          {plural((items || []).reduce((s, it) => s + (it.qty || 1), 0), "card")}
          {paid ? ` · paid ${money(paid, { whole: true })} · ${total - paid >= 0 ? "+" : ""}${money(total - paid, { whole: true })}` : ""}
        </div>
        <div className="row mt">
          <button className="btn sm" onClick={refreshAll} disabled={!items?.length || refreshing}>
            {refreshing ? <Spinner small /> : <Icon.refresh />}
            {refreshing ? `${refreshing.done}/${refreshing.total}` : "Refresh prices"}
          </button>
          <button className="btn sm" onClick={exportCsv} disabled={!items?.length}>
            <Icon.share /> Export CSV
          </button>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="grow">
          <Segmented options={SORTS} value={sort} onChange={setSort} />
        </div>
      </div>
      <Segmented
        options={[{ value: "all", label: "All" }, ...GAMES]}
        value={game}
        onChange={setGame}
      />
      <div className="card mt" style={{ padding: "2px 14px" }}>
        {items === null ? (
          <div className="empty">
            <Spinner />
          </div>
        ) : shown.length === 0 ? (
          <div className="empty">
            <div className="big">📭</div>
            No cards here yet. Scan one!
          </div>
        ) : (
          shown.map((it) => (
            <button key={it.id} className="item" onClick={() => onOpenItem(it, load)}>
              <CardImage src={it.card.images?.small} alt={it.card.name} />
              <div className="grow">
                <div className="ellipsis" style={{ fontWeight: 650 }}>
                  {it.card.name}
                  {it.qty > 1 ? <span className="dim"> ×{it.qty}</span> : null}
                </div>
                <div className="tiny dim ellipsis">{subtitle(it.card, it.selection)}</div>
                <div className="row" style={{ gap: 6, marginTop: 4 }}>
                  <span className="pill cond">{it.graded ? `${it.graded.company} ${it.graded.grade}` : it.condition}</span>
                  {selectionLabel(it.card, it.selection) && hasVariants(it.card) && <span className="pill">{selectionLabel(it.card, it.selection)}</span>}
                </div>
              </div>
              <div className="v">{money(itemValue(it))}</div>
            </button>
          ))
        )}
      </div>
      {editing && (
        <CollectionEditor
          collection={collection}
          onClose={() => setEditing(false)}
          onSave={async (data) => {
            await saveCollection(data);
            setEditing(false);
            onChanged(data);
          }}
          onDelete={async () => {
            if (!confirm(`Delete “${collection.name}” and all ${items?.length || 0} cards in it?`)) return;
            await deleteCollection(collection.id);
            setEditing(false);
            onChanged();
            onBack();
          }}
        />
      )}
    </div>
  );
}

export async function shareOrDownload(file) {
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: file.name });
      return;
    }
  } catch (e) {
    if (e?.name === "AbortError") return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
