import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./lib/api.js";
import { loadSettings, saveSettings } from "./lib/settings.js";
import { listCollections, listItems, saveCollection, saveItem, savePhoto, deleteItem, requestPersistence } from "./lib/db.js";
import { defaultSelection } from "./lib/cards.js";
import Scanner from "./components/Scanner.jsx";
import ScanFlow from "./components/ScanFlow.jsx";
import CardView from "./components/CardView.jsx";
import Search from "./components/Search.jsx";
import Settings from "./components/Settings.jsx";
import { Collections, CollectionDetail } from "./components/Collections.jsx";
import { ErrorBoundary, Icon, Sheet, usePhotoUrl } from "./components/ui.jsx";

const TABS = [
  { key: "scan", label: "Scan", icon: Icon.camera },
  { key: "collections", label: "Collections", icon: Icon.binder },
  { key: "search", label: "Search", icon: Icon.search },
  { key: "settings", label: "Settings", icon: Icon.settings },
];

function readPref(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [tab, setTab] = useState("scan");
  const [status, setStatus] = useState(null);
  const [settings, setSettingsState] = useState(loadSettings);
  const [collections, setCollections] = useState([]);
  const [items, setItems] = useState([]);
  const [openCollection, setOpenCollection] = useState(null);
  const [capture, setCapture] = useState(null);
  const [cardSheet, setCardSheet] = useState(null);
  const [searchInitial, setSearchInitial] = useState(null);
  const [gameHint, setGameHintState] = useState(() => readPref("binder.gameHint", "auto"));
  const [toastMsg, setToastMsg] = useState(null);
  const toastTimer = useRef(null);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  }, []);

  const reload = useCallback(async () => {
    const [c, i] = await Promise.all([listCollections(), listItems()]);
    setCollections(c);
    setItems(i);
    return c;
  }, []);

  useEffect(() => {
    reload();
    requestPersistence();
    api
      .status()
      .then(setStatus)
      .catch(() => setStatus({ ai: false, ebay: false, pricecharting: false, offline: true }));
  }, [reload]);

  const setSettings = (s) => {
    setSettingsState(s);
    saveSettings(s);
  };
  const setGameHint = (g) => {
    setGameHintState(g);
    try {
      localStorage.setItem("binder.gameHint", g);
    } catch {
      /* ignore */
    }
  };

  async function createCollection(name) {
    const c = await saveCollection({ name });
    await reload();
    return c;
  }

  // Look the name up in the freshly reloaded list: the collection may have just been created.
  const addedTo = (cols, id) => `Added to ${cols.find((c) => c.id === id)?.name || "collection"}`;

  async function saveScanned(data, photo, back) {
    const photoId = photo?.thumb ? await savePhoto(photo.thumb) : null;
    const backPhotoId = back?.thumb ? await savePhoto(back.thumb) : null;
    await saveItem({ ...data, photoId, backPhotoId });
    const cols = await reload();
    setCapture(null);
    toast(addedTo(cols, data.collectionId));
  }

  async function saveFromSheet(data) {
    const existing = cardSheet?.item;
    await saveItem(existing ? { ...existing, ...data } : data);
    const cols = await reload();
    cardSheet?.reload?.();
    setCardSheet(null);
    toast(existing ? "Saved" : addedTo(cols, data.collectionId));
  }

  async function removeItem() {
    const it = cardSheet?.item;
    if (!it || !confirm(`Remove ${it.card.name} from this collection?`)) return;
    await deleteItem(it);
    await reload();
    cardSheet?.reload?.();
    setCardSheet(null);
    toast("Removed");
  }

  function searchInstead(initial) {
    setCapture(null);
    setSearchInitial({ ...initial, at: Date.now() });
    setTab("search");
  }

  const sheetOpen = Boolean(capture || cardSheet);

  return (
    <div className="app">
      <ErrorBoundary key={tab}>
        {tab === "scan" && (
          <div className="screen flush">
            <Scanner
              active={!sheetOpen}
              aiReady={status ? status.ai : true}
              gameHint={gameHint}
              setGameHint={setGameHint}
              onCapture={setCapture}
              onSearchInstead={() => setTab("search")}
            />
          </div>
        )}
        {tab === "collections" &&
          (openCollection ? (
            <CollectionDetail
              key={openCollection.id}
              collection={openCollection}
              settings={settings}
              toast={toast}
              onBack={() => setOpenCollection(null)}
              onOpenItem={(item, reloadList) => setCardSheet({ card: item.card, item, reload: reloadList })}
              onChanged={async (updated) => {
                await reload();
                if (updated) setOpenCollection(updated);
              }}
            />
          ) : (
            <Collections collections={collections} items={items} onOpenCollection={setOpenCollection} onCreated={() => reload()} />
          ))}
        {tab === "search" && <Search initial={searchInitial} onOpenCard={(card) => setCardSheet({ card })} />}
        {tab === "settings" && <Settings status={status} settings={settings} setSettings={setSettings} onDataChanged={reload} toast={toast} />}
      </ErrorBoundary>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "on" : ""}
            onClick={() => {
              if (t.key === "collections" && tab === "collections") setOpenCollection(null);
              setTab(t.key);
            }}
          >
            <t.icon />
            {t.label}
          </button>
        ))}
      </nav>

      {capture && (
        <ErrorBoundary onReset={() => setCapture(null)}>
          <ScanFlow
            canvas={capture}
            gameHint={gameHint}
            collections={collections}
            settings={settings}
            status={status}
            onClose={() => setCapture(null)}
            onSaveItem={saveScanned}
            onCreateCollection={createCollection}
            onSearchInstead={searchInstead}
          />
        </ErrorBoundary>
      )}

      {cardSheet && (
        <ErrorBoundary onReset={() => setCardSheet(null)}>
          <CardSheet
            sheet={cardSheet}
            collections={collections}
            settings={settings}
            status={status}
            onClose={() => setCardSheet(null)}
            onSave={saveFromSheet}
            onDelete={removeItem}
            onCreateCollection={createCollection}
          />
        </ErrorBoundary>
      )}

      {toastMsg && <div className="toast">{toastMsg}</div>}
    </div>
  );
}

function CardSheet({ sheet, onClose, ...rest }) {
  const { card, item } = sheet;
  const photoUrl = usePhotoUrl(item?.photoId);
  return (
    <Sheet title={item ? "Your card" : card.name} onClose={onClose}>
      <CardView
        card={card}
        item={item}
        photoUrl={photoUrl}
        initialSelection={item?.selection ?? defaultSelection(card, null)}
        initialCondition={item?.condition || "NM"}
        initialGraded={item?.graded || null}
        ai={item?.ai?.condition ? { condition: item.ai.condition, edition: item.ai.edition, language: item.ai.language } : null}
        {...rest}
      />
    </Sheet>
  );
}
