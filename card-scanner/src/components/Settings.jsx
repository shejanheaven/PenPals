import { useRef, useState } from "react";
import { DEFAULT_SETTINGS } from "../lib/pricing.js";
import { getPasscode, setPasscode } from "../lib/settings.js";
import { exportAll, importAll } from "../lib/db.js";
import { shareOrDownload } from "./Collections.jsx";
import { Switch, Spinner } from "./ui.jsx";

function NumberSetting({ label, hint, value, kind, onChange }) {
  const shown = kind === "pct" ? Math.round(value * 1000) / 10 : value;
  const [text, setText] = useState(String(shown));
  const commit = () => {
    const n = parseFloat(text);
    if (!Number.isFinite(n) || n < 0) return setText(String(shown));
    onChange(kind === "pct" ? n / 100 : n);
  };
  return (
    <div className="setting-row">
      <div className="grow">
        <div className="small">{label}</div>
        {hint && <div className="tiny dim">{hint}</div>}
      </div>
      <div className="row" style={{ gap: 6 }}>
        {kind === "usd" && <span className="dim">$</span>}
        <input className="input" type="number" inputMode="decimal" step="0.01" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} aria-label={label} />
        {kind === "pct" && <span className="dim">%</span>}
      </div>
    </div>
  );
}

function ToggleSetting({ label, hint, on, onChange }) {
  return (
    <div className="setting-row">
      <div className="grow">
        <div className="small">{label}</div>
        {hint && <div className="tiny dim">{hint}</div>}
      </div>
      <Switch on={on} onChange={onChange} label={label} />
    </div>
  );
}

function StatusRow({ ok, title, off }) {
  return (
    <div className="setting-row">
      <div className="grow">
        <div className="small row" style={{ gap: 8 }}>
          <span className={`status-dot${ok ? " ok" : ""}`} /> {title}
        </div>
        {!ok && <div className="tiny dim" style={{ marginLeft: 17 }}>{off}</div>}
      </div>
      <span className="tiny dim">{ok ? "On" : "Off"}</span>
    </div>
  );
}

export default function Settings({ status, settings, setSettings, onDataChanged, toast }) {
  const [pass, setPass] = useState(getPasscode());
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  // Remount inputs after "reset" so their text reflects the defaults.
  const [rev, setRev] = useState(0);

  const set = (path, v) => {
    const next = structuredClone(settings);
    let o = next;
    for (const k of path.slice(0, -1)) o = o[k];
    o[path.at(-1)] = v;
    setSettings(next);
  };

  async function doExport() {
    setBusy(true);
    try {
      const data = await exportAll();
      const date = new Date().toISOString().slice(0, 10);
      await shareOrDownload(new File([JSON.stringify(data)], `binder-backup-${date}.json`, { type: "application/json" }));
    } finally {
      setBusy(false);
    }
  }

  async function doImport(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const r = await importAll(JSON.parse(await f.text()));
      toast(`Restored ${r.items} cards in ${r.collections} collections`);
      onDataChanged();
    } catch (err) {
      toast(err.message || "Could not read that backup");
    }
  }

  const s = settings;
  return (
    <div className="screen" key={rev}>
      <h1>Settings</h1>

      <div className="section-title">Server features</div>
      <div className="card" style={{ padding: "2px 14px" }}>
        <StatusRow ok={status?.ai} title="AI card scanning & condition grading" off="Add ANTHROPIC_API_KEY on the server." />
        <StatusRow ok={status?.ebay} title="Live eBay listings" off="Optional: add free eBay developer keys (EBAY_CLIENT_ID / EBAY_CLIENT_SECRET)." />
        <StatusRow ok={status?.pricecharting} title="eBay sold averages incl. PSA/BGS/CGC" off="Optional: add a PriceCharting API token (paid)." />
      </div>
      {(status?.passcodeRequired || pass) && (
        <>
          <div className="section-title">App passcode</div>
          <div className="row">
            <input className="input" type="password" placeholder="Passcode set on the server" value={pass} onChange={(e) => setPass(e.target.value)} />
            <button
              className="btn"
              onClick={() => {
                setPasscode(pass.trim());
                toast("Passcode saved on this phone");
              }}
            >
              Save
            </button>
          </div>
        </>
      )}

      <div className="section-title">eBay</div>
      <div className="card" style={{ padding: "2px 14px" }}>
        <ToggleSetting label="I have an eBay Store" hint="Store rate: 12.7% up to $2,500" on={s.ebay.store} onChange={(v) => set(["ebay", "store"], v)} />
        <NumberSetting label="Promoted Listings ad rate" value={s.ebay.promotedRate} kind="pct" onChange={(v) => set(["ebay", "promotedRate"], v)} />
        <ToggleSetting label="$1,000+ singles promo" hint="50% off the final value fee while eBay runs it" on={s.ebay.highValuePromo} onChange={(v) => set(["ebay", "highValuePromo"], v)} />
        <NumberSetting label="Sales tax buyers pay" hint="eBay & TCGplayer take their % on tax too" value={s.salesTaxRate} kind="pct" onChange={(v) => set(["salesTaxRate"], v)} />
      </div>

      <div className="section-title">Shipping one card</div>
      <div className="card" style={{ padding: "2px 14px" }}>
        <NumberSetting label="eBay Standard Envelope label" hint="Items up to $20" value={s.shipping.envelopeLabel} kind="usd" onChange={(v) => set(["shipping", "envelopeLabel"], v)} />
        <NumberSetting label="Stamp (plain envelope)" value={s.shipping.stamp} kind="usd" onChange={(v) => set(["shipping", "stamp"], v)} />
        <NumberSetting label="Envelope supplies" hint="Sleeve, toploader, envelope" value={s.shipping.envelopeSupplies} kind="usd" onChange={(v) => set(["shipping", "envelopeSupplies"], v)} />
        <NumberSetting label="Tracked label" hint="USPS Ground Advantage" value={s.shipping.trackedLabel} kind="usd" onChange={(v) => set(["shipping", "trackedLabel"], v)} />
        <NumberSetting label="Tracked supplies" hint="Bubble mailer, toploader" value={s.shipping.trackedSupplies} kind="usd" onChange={(v) => set(["shipping", "trackedSupplies"], v)} />
      </div>

      <div className="section-title">Other ways to sell</div>
      <div className="card" style={{ padding: "2px 14px" }}>
        <NumberSetting label="Local / in-person sale" hint="% of market buyers pay" value={s.localFactor} kind="pct" onChange={(v) => set(["localFactor"], v)} />
        <NumberSetting label="Shop buylist (cash)" value={s.buylistCash} kind="pct" onChange={(v) => set(["buylistCash"], v)} />
        <NumberSetting label="Shop buylist (store credit)" value={s.buylistCredit} kind="pct" onChange={(v) => set(["buylistCredit"], v)} />
        <NumberSetting label="Quick-sale price" hint="% of market that sells within days" value={s.quickSaleFactor} kind="pct" onChange={(v) => set(["quickSaleFactor"], v)} />
        <NumberSetting label="Patient price" hint="% of market you can hold out for" value={s.patientFactor} kind="pct" onChange={(v) => set(["patientFactor"], v)} />
      </div>

      <div className="section-title">Condition vs Near Mint</div>
      <div className="card" style={{ padding: "2px 14px" }}>
        {["LP", "MP", "HP", "DMG"].map((k) => (
          <NumberSetting key={k} label={k} value={s.conditionMultipliers[k]} kind="pct" onChange={(v) => set(["conditionMultipliers", k], v)} />
        ))}
      </div>
      <button
        className="btn block mt"
        onClick={() => {
          setSettings(structuredClone(DEFAULT_SETTINGS));
          setRev((r) => r + 1);
          toast("Reset to defaults");
        }}
      >
        Reset selling assumptions
      </button>

      <div className="section-title">Your data</div>
      <div className="card small muted">Collections and photos are stored on this phone only. Export a backup now and then, especially before clearing Safari data.</div>
      <div className="row mt">
        <button className="btn grow" onClick={doExport} disabled={busy}>
          {busy ? <Spinner small /> : null} Export backup
        </button>
        <button className="btn grow" onClick={() => fileRef.current?.click()}>
          Import backup
        </button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={doImport} />

      <div className="section-title">About prices</div>
      <div className="card small muted stack">
        <p>
          <b style={{ color: "var(--text)" }}>Realistic sale price</b> starts from recent <i>sales</i> of your exact printing (TCGplayer market price, plus eBay sold averages if PriceCharting is on). It is then adjusted for your card's condition or grade. Asking prices are never used as the main number.
        </p>
        <p>
          <b style={{ color: "var(--text)" }}>Take-home</b> subtracts each platform's 2026 fee schedule, tax-on-fees, and the shipping you'd pay. Always check eBay sold listings before you list anything valuable.
        </p>
        <p className="tiny dim">Card data: TCGdex, Pokémon TCG API, YGOPRODeck. Not affiliated with The Pokémon Company, Konami, eBay or TCGplayer.</p>
      </div>
    </div>
  );
}
