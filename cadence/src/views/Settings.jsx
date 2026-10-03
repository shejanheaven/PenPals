import { useEffect, useRef, useState } from 'react'
import {
  Bell, CalendarClock, CalendarSync, ChevronDown, Clock, Cloud, CloudOff, Copy, Download, LogOut, Mail, MessageSquareText, Monitor, Music2, Moon, Palette, Plus, RefreshCw, RotateCcw, Share, Share2, Smartphone, SquarePlus, Sunrise, Timer, Upload, User, Webhook, Wind,
} from 'lucide-react'
import { device, getState, useStore } from '../store/store.js'
import { addItems, replaceState, resetAll, updateProfile, updateSettings } from '../store/actions.js'
import { Seg, Switch, copyText, toast } from '../components/ui.jsx'
import { ACCENTS } from '../lib/theme.js'
import { downloadFile, fromICS, toICS } from '../lib/ics.js'
import { mergeStates } from '../lib/merge.js'
import { todayKey } from '../lib/dates.js'
import { REMINDER_OPTIONS } from '../store/defaults.js'
import { openMusic } from '../store/ui.js'
import { WeekEditor } from '../components/WeekEditor.jsx'
import { defaultWeek, workBlocks } from '../lib/rhythm.js'
import {
  disableNotifications, enableNotifications, isIOS, isStandalone, needsInstallForNotifications, notificationsSupported, permission, sendTest,
} from '../services/notifications.js'
import {
  captureEndpoint, cloudConfigured, getCaptureToken, pushConfigured, signIn, signOut, signUp, subscribePush, syncNow, unsubscribePush, useCloud,
} from '../services/cloud.js'
import { promptInstall, useInstallPrompt } from '../services/install.js'
import { IS_PREVIEW } from '../preview.js'

function Group({ title, children, note }) {
  return (
    <section className="section">
      <div className="section-head">
        <span className="eyebrow">{title}</span>
      </div>
      <div className="list">{children}</div>
      {note && (
        <p className="tiny faint" style={{ margin: '8px 4px 0' }}>
          {note}
        </p>
      )}
    </section>
  )
}

function Row({ icon: Icon, title, sub, children, onClick, htmlFor }) {
  const Tag = onClick ? 'button' : htmlFor ? 'label' : 'div'
  return (
    <Tag className="setting" onClick={onClick} htmlFor={htmlFor} style={onClick ? { width: '100%', textAlign: 'left' } : undefined}>
      {Icon && (
        <span className="setting-icon">
          <Icon size={17} />
        </span>
      )}
      <span className="setting-text">
        <span className="setting-title" style={{ display: 'block' }}>
          {title}
        </span>
        {sub && <span className="setting-sub" style={{ display: 'block' }}>{sub}</span>}
      </span>
      {children && <span className="setting-controls">{children}</span>}
    </Tag>
  )
}

export default function Settings() {
  const state = useStore()
  const { profile, settings } = state
  const n = settings.notify

  return (
    <div className="page">
      <header className="page-head">
        <div className="eyebrow">Settings</div>
        <h1 className="display">Make it yours.</h1>
      </header>

      <InstallCard />

      <Group title="You">
        <Row icon={User} title="Name" htmlFor="set-name">
          <input id="set-name" className="input" style={{ maxWidth: 170 }} value={profile.name} placeholder="Your name" onChange={(e) => updateProfile({ name: e.target.value })} />
        </Row>
      </Group>

      <section className="section">
        <div className="section-head">
          <span className="eyebrow">Your week</span>
          {workBlocks(profile.week).length > 0 && (
            <button
              className="btn ghost sm"
              onClick={() => {
                const blocks = workBlocks(profile.week)
                addItems(blocks.map((b) => ({ ...b, notes: '', goalId: null, date: todayKey(), reminder: settings.defaultReminder, source: 'setup' })))
                toast(`Added ${blocks.length} work ${blocks.length === 1 ? 'block' : 'blocks'} to your plan`)
              }}
            >
              <Plus size={14} /> Add work hours to plan
            </button>
          )}
        </div>
        <WeekEditor value={profile.week ?? defaultWeek(profile)} onChange={(week) => updateProfile({ week })} weekStart={settings.weekStart} />
        <p className="tiny faint" style={{ margin: '8px 4px 0' }}>
          Your day view, check-ins and mindful pauses follow each day’s times.
        </p>
      </section>

      <NotificationsGroup />

      <Group title="Check-ins">
        <Row icon={Sunrise} title="Morning check-in" sub="Your plan for the day, and a moment to set an intention">
          {n.morningOn && (
            <select className="select" value={n.morningAuto ? 'auto' : 'fixed'} onChange={(e) => updateSettings({ notify: { morningAuto: e.target.value === 'auto' } })} aria-label="Morning check-in timing">
              <option value="auto">After I wake</option>
              <option value="fixed">At a set time</option>
            </select>
          )}
          {n.morningOn && !n.morningAuto && <input type="time" className="input" value={n.morning} onChange={(e) => e.target.value && updateSettings({ notify: { morning: e.target.value } })} aria-label="Morning check-in time" />}
          <Switch checked={n.morningOn} onChange={(v) => updateSettings({ notify: { morningOn: v } })} label="Morning check-in" />
        </Row>
        <Row icon={Moon} title="Evening reflection" sub="A quiet prompt to close the day">
          {n.eveningOn && (
            <select className="select" value={n.eveningAuto ? 'auto' : 'fixed'} onChange={(e) => updateSettings({ notify: { eveningAuto: e.target.value === 'auto' } })} aria-label="Evening reflection timing">
              <option value="auto">An hour before bed</option>
              <option value="fixed">At a set time</option>
            </select>
          )}
          {n.eveningOn && !n.eveningAuto && <input type="time" className="input" value={n.evening} onChange={(e) => e.target.value && updateSettings({ notify: { evening: e.target.value } })} aria-label="Evening reflection time" />}
          <Switch checked={n.eveningOn} onChange={(v) => updateSettings({ notify: { eveningOn: v } })} label="Evening reflection" />
        </Row>
        <Row icon={CalendarClock} title="Weekly review" sub="On the last evening of each week">
          <Switch checked={n.weeklyReview} onChange={(v) => updateSettings({ notify: { weeklyReview: v } })} label="Weekly review" />
        </Row>
        <Row icon={Wind} title="Mindful pauses" sub="Two gentle nudges to breathe and re-centre">
          <Switch checked={n.pauses} onChange={(v) => updateSettings({ notify: { pauses: v } })} label="Mindful pauses" />
        </Row>
        {n.pauses && (
          <div className="setting" style={{ paddingLeft: 64 }}>
            {[0, 1].map((i) => (
              <input
                key={i}
                type="time"
                className="input"
                value={n.pauseTimes[i] ?? ''}
                onChange={(e) => {
                  const next = [...n.pauseTimes]
                  next[i] = e.target.value
                  updateSettings({ notify: { pauseTimes: next.filter(Boolean) } })
                }}
                aria-label={`Pause ${i + 1}`}
              />
            ))}
          </div>
        )}
        <Row icon={Bell} title="Default reminder" sub="For new items with a time">
          <select className="select" value={String(settings.defaultReminder ?? '')} onChange={(e) => updateSettings({ defaultReminder: e.target.value === '' ? null : +e.target.value })}>
            {REMINDER_OPTIONS.filter((o) => o.value !== '1440').map((o) => (
              <option key={o.value} value={o.value}>
                {o.label.replace(' before', '')}
              </option>
            ))}
          </select>
        </Row>
        <Row icon={Timer} title="Default length" sub="For new time blocks">
          <select className="select" value={settings.defaultDuration} onChange={(e) => updateSettings({ defaultDuration: +e.target.value })}>
            {[15, 30, 45, 60, 90, 120].map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${m / 60} hr`}
              </option>
            ))}
          </select>
        </Row>
      </Group>

      <Group title="Appearance">
        <Row icon={Monitor} title="Theme">
          <Seg
            label="Theme"
            value={settings.theme}
            onChange={(theme) => updateSettings({ theme })}
            options={[
              { value: 'system', label: 'Auto' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Row>
        <Row icon={Palette} title="Accent">
          <div className="row-flex" style={{ gap: 6 }} role="radiogroup" aria-label="Accent colour">
            {Object.entries(ACCENTS).map(([id, a]) => (
              <button
                key={id}
                role="radio"
                aria-checked={settings.accent === id}
                aria-label={a.label}
                title={a.label}
                onClick={() => updateSettings({ accent: id })}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: a.light[0],
                  boxShadow: settings.accent === id ? `0 0 0 2px var(--surface), 0 0 0 4px ${a.light[0]}` : 'none',
                  transition: 'box-shadow .2s',
                }}
              />
            ))}
          </div>
        </Row>
        <Row icon={Clock} title="24-hour clock">
          <Switch checked={settings.clock24} onChange={(clock24) => updateSettings({ clock24 })} label="24-hour clock" />
        </Row>
        <Row icon={CalendarClock} title="Week starts on">
          <Seg
            label="Week starts on"
            value={settings.weekStart}
            onChange={(weekStart) => updateSettings({ weekStart })}
            options={[
              { value: 1, label: 'Mon' },
              { value: 0, label: 'Sun' },
            ]}
          />
        </Row>
      </Group>

      <AccountGroup />
      <Connections />
      <DataGroup />

      <p className="tiny faint" style={{ textAlign: 'center', margin: '32px 0 8px', lineHeight: 1.7 }}>
        Cadence 1.0 · Your plans live on this device{cloudConfigured() ? ' and, when you sign in, in your private cloud' : ''}.
        <br />
        <span className="hide-mobile">
          Shortcuts: <span className="kbd">N</span> new · <span className="kbd">T</span> today · <span className="kbd">1</span>–<span className="kbd">5</span> views · <span className="kbd">B</span> breathe · <span className="kbd">I</span> inbox
        </span>
      </p>
    </div>
  )
}

function InstallCard() {
  const prompt = useInstallPrompt()
  const { installHintDismissed } = device.use()
  if (IS_PREVIEW) {
    return (
      <div className="card pad tint stack" style={{ gap: 6 }}>
        <strong style={{ fontWeight: 600 }}>You’re trying the preview</strong>
        <span className="small muted">
          Plans you make here stay in this browser. Notifications, installing on your Home Screen, file downloads and sync work once Cadence runs from its own web address (one free Vercel deploy, see the README).
        </span>
      </div>
    )
  }
  if (isStandalone() || installHintDismissed) return null
  if (prompt) {
    return (
      <div className="card pad tint row-flex" style={{ gap: 14 }}>
        <span className="setting-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          <Smartphone size={18} />
        </span>
        <span className="grow">
          <strong style={{ fontWeight: 600, display: 'block' }}>Install Cadence</strong>
          <span className="small muted">Open it like an app, offline, with reminders.</span>
        </span>
        <button className="btn primary sm" onClick={promptInstall}>
          Install
        </button>
      </div>
    )
  }
  if (isIOS()) {
    return (
      <div className="card pad tint stack" style={{ gap: 8 }}>
        <div className="row-flex">
          <Smartphone size={18} style={{ color: 'var(--accent)' }} />
          <strong style={{ fontWeight: 600 }} className="grow">
            Put Cadence on your Home Screen
          </strong>
          <button className="btn ghost sm" onClick={() => device.set({ installHintDismissed: true })}>
            Later
          </button>
        </div>
        <ol className="steps">
          <li>
            In Safari, tap <Share size={14} style={{ verticalAlign: '-2px' }} /> <strong>Share</strong>
          </li>
          <li>
            Choose <SquarePlus size={14} style={{ verticalAlign: '-2px' }} /> <strong>Add to Home Screen</strong>
          </li>
          <li>Open it from there — reminders on iPhone need this step</li>
        </ol>
      </div>
    )
  }
  return null
}

function NotificationsGroup() {
  const { notifications } = device.use()
  const cloud = useCloud()
  const [perm, setPerm] = useState(permission())
  const on = notifications && perm === 'granted'

  let sub = 'A nudge before things start, plus your check-ins'
  if (IS_PREVIEW) sub = 'Available in your installed app, not in this preview'
  else if (needsInstallForNotifications()) sub = 'On iPhone, add Cadence to your Home Screen first (see above)'
  else if (!notificationsSupported()) sub = 'This browser can’t show notifications — you’ll see reminders inside the app'
  else if (perm === 'denied') sub = 'Blocked in your browser’s site settings for Cadence'

  return (
    <Group
      title="Reminders"
      note={
        on && !(cloud.user && cloud.push)
          ? cloudConfigured()
            ? 'Reminders arrive while Cadence is open or recently used. Sign in below to get them even when it’s fully closed.'
            : 'Reminders arrive while Cadence is open or recently used. For alerts when it’s fully closed, connect the cloud (see README) or export to your phone’s calendar below.'
          : null
      }
    >
      <Row icon={Bell} title="Notifications on this device" sub={sub}>
        <Switch
          checked={on}
          label="Notifications"
          onChange={async (v) => {
            if (v) {
              const result = await enableNotifications()
              setPerm(result)
              if (result === 'granted') toast('Reminders are on')
              else if (result === 'denied') toast('Notifications are blocked in your browser settings')
            } else {
              disableNotifications()
              if (cloud.push) unsubscribePush()
            }
          }}
        />
      </Row>
      {on && pushConfigured() && cloud.user && (
        <Row icon={Cloud} title="Reminders when the app is closed" sub={cloud.push ? 'On — delivered by your cloud' : 'Off'}>
          <Switch checked={cloud.push} onChange={(v) => (v ? subscribePush() : unsubscribePush())} label="Background push" />
        </Row>
      )}
      {on && (
        <Row
          icon={Sunrise}
          title="Send a test"
          sub="See how a reminder looks"
          onClick={async () => {
            const ok = await sendTest()
            if (!ok) toast('Allow notifications first')
          }}
        />
      )}
    </Group>
  )
}

function AccountGroup() {
  const cloud = useCloud()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  if (!cloudConfigured()) {
    return (
      <Group title="Sync & backup">
        <Row icon={CloudOff} title="Saved on this device" sub="Connect a free cloud to sync your phone and computer and get reminders when the app is closed. Setup takes ~10 minutes — see the README." />
      </Group>
    )
  }

  if (cloud.user) {
    return (
      <Group title="Sync & backup">
        <Row icon={Cloud} title={cloud.user.email} sub={cloud.error ? `Sync problem: ${cloud.error}` : cloud.syncing ? 'Syncing…' : cloud.lastSync ? `Synced ${new Date(cloud.lastSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Signed in'}>
          <button className="icon-btn" onClick={() => syncNow()} aria-label="Sync now">
            <RefreshCw size={18} className={cloud.syncing ? 'spin' : ''} />
          </button>
        </Row>
        <Row icon={LogOut} title="Sign out" sub="Your plans stay on this device" onClick={() => signOut()} />
      </Group>
    )
  }

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { needsConfirmation } = await signUp(email, password)
        toast(needsConfirmation ? 'Check your email to confirm, then sign in here' : 'Account created — syncing')
        if (needsConfirmation) setMode('signin')
      } else {
        await signIn(email, password)
        toast('Signed in — syncing your plans')
      }
    } catch (err) {
      toast(err.message ?? 'Something went wrong')
    }
    setBusy(false)
  }

  return (
    <Group title="Sync & backup" note="Your current plans are merged into your account — nothing is lost.">
      <form className="stack" style={{ padding: 16, gap: 10 }} onSubmit={submit}>
        <div className="row-flex">
          <Cloud size={18} style={{ color: 'var(--accent)' }} />
          <strong style={{ fontWeight: 600 }} className="grow">
            Sync across your devices
          </strong>
        </div>
        <Seg
          label="Account"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'signin', label: 'Sign in' },
            { value: 'signup', label: 'Create account' },
          ]}
        />
        <input className="input" type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder="Password (8+ characters)" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className="btn primary" disabled={busy}>
          {busy ? 'One moment…' : mode === 'signup' ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </Group>
  )
}

// ── Connections ─────────────────────────────────────────────────────────────

function Connection({ icon: Icon, title, sub, status, children }) {
  const [open, setOpen] = useState(false)
  const pill = { ready: ['on', 'Ready'], cloud: ['on', 'Via cloud'], needs: ['', 'Needs cloud'], soon: ['soon', 'Coming later'] }[status]
  return (
    <div>
      <button className="setting" style={{ width: '100%', textAlign: 'left' }} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="setting-icon">
          <Icon size={17} />
        </span>
        <span className="setting-text">
          <span className="setting-title" style={{ display: 'block' }}>
            {title}
          </span>
          <span className="setting-sub" style={{ display: 'block' }}>
            {sub}
          </span>
        </span>
        <span className={`status-pill ${pill[0]}`}>{pill[1]}</span>
        <ChevronDown size={17} className="faint" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s', flex: 'none' }} />
      </button>
      {open && (
        <div className="stack fade-in" style={{ padding: '0 16px 18px 64px', gap: 10, fontSize: 14 }}>
          {children}
        </div>
      )}
    </div>
  )
}

function CopyLine({ value, label = 'Copy' }) {
  return (
    <div className="row-flex">
      <code className="code grow">{value}</code>
      <button className="icon-btn" onClick={() => copyText(value)} aria-label={label}>
        <Copy size={16} />
      </button>
    </div>
  )
}

function Connections() {
  const cloud = useCloud()
  const [token, setToken] = useState(null)
  const origin = typeof location !== 'undefined' ? location.origin : 'https://your-cadence-app'
  const endpoint = captureEndpoint()
  const webhook = endpoint && token ? `${endpoint}?token=${token}` : null
  const cloudReady = cloudConfigured() && cloud.user
  const musicCount = useStore().settings.spotify.links.length

  useEffect(() => {
    if (cloudReady && !token) getCaptureToken().then(setToken).catch(() => {})
  }, [cloudReady]) // eslint-disable-line react-hooks/exhaustive-deps

  const webhookBlock = webhook ? (
    <>
      <span className="small muted">Your private webhook (keep it secret):</span>
      <CopyLine value={webhook} label="Copy webhook URL" />
    </>
  ) : (
    <p className="small muted">{cloudConfigured() ? 'Sign in above to get your private webhook.' : 'Needs the optional cloud (see README → Cloud setup).'}</p>
  )

  return (
    <Group title="Connections" note="Captured things land in your Inbox, so you decide what deserves your time.">
      <Connection icon={Music2} title="Spotify" sub={musicCount ? `${musicCount} saved ${musicCount === 1 ? 'link' : 'links'} in your music player` : 'Play your playlists inside Cadence'} status="ready">
        <p className="small muted">
          Paste a playlist, album, song or podcast link. On a computer the player sits in the sidebar and keeps playing as you move around; on a phone it appears on Today.
        </p>
        <div>
          <button className="btn soft sm" onClick={openMusic}>
            <Music2 size={15} /> {musicCount ? 'Manage music' : 'Add music'}
          </button>
        </div>
      </Connection>
      <Connection icon={MessageSquareText} title="Text messages" sub="Turn a message into a plan" status="ready">
        <strong style={{ fontWeight: 600 }}>Any phone, no setup</strong>
        <p className="small muted">
          Copy a message, open the Inbox and tap <strong>Paste</strong>. “Dinner with Sam Friday 7pm” arrives already understood — add it with one tap.
        </p>
        <strong style={{ fontWeight: 600, marginTop: 6 }}>iPhone: from the Share menu, in the background</strong>
        <ol className="steps">
          <li>Shortcuts → <strong>+</strong> → name it “Add to Cadence”, turn on <strong>Show in Share Sheet</strong> (Text)</li>
          <li>
            Add <strong>Get Contents of URL</strong>: your webhook below, method <strong>POST</strong>, JSON body <code>text</code> = Shortcut Input, <code>source</code> = <code>sms</code>
          </li>
          <li>Press-and-hold any text → Share → Add to Cadence. It waits in your Inbox.</li>
        </ol>
        <p className="small muted">
          Or make it automatic: Shortcuts → Automation → <strong>Message</strong> (from someone, or containing “meet”, “appointment”…) → the same Get Contents of URL step.
        </p>
        {webhookBlock}
        <strong style={{ fontWeight: 600, marginTop: 6 }}>Android & computers: a capture link</strong>
        <p className="small muted">Opening this link (from a shortcut, bookmark or automation) captures the text. Add <code>&add=1</code> to skip the Inbox.</p>
        <CopyLine value={`${origin}/?capture=`} label="Copy capture link" />
      </Connection>

      <Connection icon={Mail} title="Email" sub="Forward or auto-route emails into your inbox" status={cloudReady ? 'cloud' : 'needs'}>
        <p className="small muted">Works today through your webhook. Pick one:</p>
        <ul className="steps">
          <li>
            <strong>Zapier / Make:</strong> “New email matching search in Gmail/Outlook” → Webhook POST <code>{'{"text": subject + body, "source": "email"}'}</code>
          </li>
          <li>
            <strong>Gmail filter + Apps Script:</strong> label emails “Cadence”, a 5-line script posts them (template in the README)
          </li>
          <li>
            <strong>iPhone:</strong> Shortcuts automation “When I receive an email from…” → Get Contents of URL
          </li>
        </ul>
        {webhookBlock}
        <p className="tiny faint">A direct Gmail/Outlook connection is planned; the webhook will keep working alongside it.</p>
      </Connection>

      <Connection icon={Share2} title="Share from any app" sub="Android & desktop share menus" status="ready">
        <p className="small muted">Install Cadence (Chrome → Install app / Add to Home screen). It then appears in the system share sheet: share a message, an email, or a web page and it lands in your Inbox.</p>
      </Connection>

      <Connection icon={CalendarSync} title="Phone calendar" sub="Apple, Google & Outlook calendars" status="ready">
        <p className="small muted">Export your plan as a calendar file. Open it on your phone to add everything — with native alerts that ring even if Cadence is closed. Import any .ics file to bring existing events in.</p>
        <div className="row-flex wrap">
          <button className="btn secondary sm" onClick={exportCalendar}>
            <Download size={15} /> Export .ics
          </button>
          <ImportCalendarButton />
        </div>
      </Connection>

      <Connection icon={Webhook} title="Zapier, IFTTT, Make & more" sub="Anything that can send a web request" status={cloudReady ? 'cloud' : 'needs'}>
        {webhookBlock}
        {webhook && (
          <>
            <span className="small muted">Example:</span>
            <code className="code wrap-any">{`curl -X POST '${webhook}' \\\n  -H 'content-type: application/json' \\\n  -d '{"text":"Call the dentist tomorrow 10am","source":"zapier"}'`}</code>
            <button
              className="btn ghost sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={async () => {
                setToken(await getCaptureToken({ rotate: true }))
                toast('New webhook created — update your automations')
              }}
            >
              <RotateCcw size={14} /> Reset link
            </button>
          </>
        )}
      </Connection>

      <Connection icon={CalendarClock} title="Google Calendar live sync" sub="Two-way, automatic" status="soon">
        <p className="small muted">Until then, use the .ics export/import above. Cadence’s data model already supports it.</p>
      </Connection>
    </Group>
  )
}

function exportCalendar() {
  const items = Object.values(getState().items).filter((i) => !i.deleted)
  if (downloadFile(`cadence-${todayKey()}.ics`, toICS(items), 'text/calendar')) toast(`Exported ${items.length} ${items.length === 1 ? 'item' : 'items'}`)
  else toast('Exporting works in your installed app, not in this preview')
}

function ImportCalendarButton() {
  const input = useRef(null)
  return (
    <>
      <button className="btn secondary sm" onClick={() => input.current?.click()}>
        <Upload size={15} /> Import .ics
      </button>
      <input
        ref={input}
        type="file"
        accept=".ics,text/calendar"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          const items = fromICS(await file.text(), { defaultReminder: getState().settings.defaultReminder })
          addItems(items)
          toast(items.length ? `Imported ${items.length} ${items.length === 1 ? 'event' : 'events'}` : 'No current events found in that file')
        }}
      />
    </>
  )
}

function DataGroup() {
  const input = useRef(null)
  const [armed, setArmed] = useState(false)
  const disarm = useRef(null)
  return (
    <Group title="Your data" note="Backups include everything: plans, goals, journal and settings.">
      <Row
        icon={Download}
        title="Download a backup"
        sub="A .json file you can keep anywhere"
        onClick={() => {
          if (downloadFile(`cadence-backup-${todayKey()}.json`, JSON.stringify(getState(), null, 2), 'application/json')) toast('Backup downloaded')
          else toast('Backups download in your installed app, not in this preview')
        }}
      />
      <Row icon={Upload} title="Restore from a backup" sub="Merged with what’s here — newest edits win" onClick={() => input.current?.click()} />
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          try {
            const data = JSON.parse(await file.text())
            if (!data || typeof data !== 'object' || !data.items) throw new Error('Not a Cadence backup')
            replaceState(mergeStates(getState(), data))
            toast('Backup restored')
          } catch (err) {
            toast(err.message || 'Could not read that file')
          }
        }}
      />
      <Row
        icon={RotateCcw}
        title={armed ? 'Tap again to erase everything' : 'Start fresh'}
        sub={armed ? 'Plans, goals and journal on this device. This can’t be undone.' : 'Erase everything on this device'}
        onClick={() => {
          if (!armed) {
            setArmed(true)
            clearTimeout(disarm.current)
            disarm.current = setTimeout(() => setArmed(false), 5000)
            return
          }
          clearTimeout(disarm.current)
          setArmed(false)
          resetAll()
          toast('Everything cleared')
        }}
      />
    </Group>
  )
}

