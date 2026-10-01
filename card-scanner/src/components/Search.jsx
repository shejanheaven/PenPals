import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { numberLabel } from "../lib/cards.js";
import { money } from "../lib/format.js";
import { CardImage, Segmented, Spinner } from "./ui.jsx";

function parseExtra(game, extra) {
  const s = extra.trim();
  if (!s) return {};
  if (game === "yugioh") return { setCode: s.toUpperCase() };
  const m = s.match(/^#?\s*([A-Za-z]*\d+[A-Za-z]*)\s*(?:\/\s*([A-Za-z]*\d+))?$/);
  return m ? { number: m[1], total: m[2] || "" } : { setName: s };
}

function priceHint(c) {
  if (c.game === "pokemon") {
    const prices = (c.variants || []).map((v) => v.market ?? v.mid).filter(Boolean);
    return prices.length ? Math.max(...prices) : null;
  }
  return c.printings?.find((p) => p.key === c.printingKey)?.price ?? c.cardPrices?.tcgplayer ?? null;
}

export default function Search({ initial, onOpenCard }) {
  const [game, setGame] = useState(initial?.game || "pokemon");
  const [name, setName] = useState(initial?.name || "");
  const [extra, setExtra] = useState(initial?.number || "");
  const [state, setState] = useState({ loading: false, results: null, error: null, warnings: [] });

  useEffect(() => {
    if (initial?.name) run(initial.game || game, initial.name, initial.number || "");
  }, [initial]);

  async function run(g = game, n = name, x = extra) {
    if (!n.trim() && !x.trim()) return;
    setState({ loading: true, results: null, error: null, warnings: [] });
    try {
      const r = await api.search({ game: g, name: n.trim(), ...parseExtra(g, x) });
      setState({ loading: false, results: r.results, error: null, warnings: r.warnings || [] });
    } catch (e) {
      setState({ loading: false, results: null, error: e.message, warnings: [] });
    }
  }

  return (
    <div className="screen">
      <h1>Search</h1>
      <Segmented
        options={[
          { value: "pokemon", label: "Pokémon" },
          { value: "yugioh", label: "Yu-Gi-Oh!" },
        ]}
        value={game}
        onChange={(g) => {
          setGame(g);
          setState({ loading: false, results: null, error: null, warnings: [] });
        }}
      />
      <form
        className="stack mt"
        onSubmit={(e) => {
          e.preventDefault();
          document.activeElement?.blur();
          run();
        }}
      >
        <input className="input" type="search" placeholder={game === "pokemon" ? "Card name, e.g. Charizard" : "Card name, e.g. Dark Magician"} value={name} onChange={(e) => setName(e.target.value)} enterKeyHint="search" />
        <input
          className="input"
          placeholder={game === "pokemon" ? "Number (optional), e.g. 4/102" : "Set code (optional), e.g. LOB-EN005"}
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          autoCapitalize="characters"
          enterKeyHint="search"
        />
        <button className="btn primary block" disabled={state.loading || (!name.trim() && !extra.trim())}>
          {state.loading ? <Spinner small /> : null} Search
        </button>
      </form>

      {state.error && <div className="banner error mt">{state.error}</div>}
      {state.warnings.length > 0 && <div className="tiny dim mt">{state.warnings.join(" · ")}</div>}
      {state.results && (
        <div className="card mt" style={{ padding: "2px 14px" }}>
          {state.results.length === 0 ? (
            <div className="empty">No cards found. Check the spelling, or try just the name.</div>
          ) : (
            state.results.map((c) => (
              <button key={c.id} className="result-row" onClick={() => onOpenCard(c)}>
                <CardImage src={c.images?.small} alt={c.name} />
                <div className="grow">
                  <div style={{ fontWeight: 650 }}>{c.name}</div>
                  <div className="tiny dim">
                    {c.game === "pokemon"
                      ? [c.setName, numberLabel(c), c.rarity].filter(Boolean).join(" · ")
                      : [c.type, `${c.printings?.length || 0} printings`].join(" · ")}
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>{money(priceHint(c))}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
