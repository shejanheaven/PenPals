import { useState, useRef, useEffect, useCallback } from "react"
import { supabase } from "../supabase.js"
import { lsGetContacts, lsGetConvos, lsSaveContacts, lsSaveConvos,
         dbLoadCustomPals, dbSaveCustomPal, dbLoadMessages, dbSaveMessage,
         dbUpdateSvg, dbClearMessages, dbClearCustomPals } from "./storage.js"

// ── DATA ──────────────────────────────────────────────────────
const COLORS = [
  {bg:"#1e2a3a",fg:"#7eb8f7"},{bg:"#1a2e1e",fg:"#7dd4a0"},
  {bg:"#2e1e10",fg:"#f0a96a"},{bg:"#2e1020",fg:"#f07aaa"},
  {bg:"#1e1a2e",fg:"#a58af5"},{bg:"#2e1010",fg:"#f07070"},
  {bg:"#0d2530",fg:"#6dd4f0"},{bg:"#1a2e10",fg:"#a0d46a"},
]

const TEXTING = `You are a real person texting a friend. Never break character or admit to being an AI.
- Match energy exactly. Short = short back. Long = can go longer.
- Be witty, funny, swear naturally when it fits.
- Have strong opinions. React emotionally. Reference your real life unprompted.
- Use casual language: gonna, tbh, lol, ngl, rn. Contractions and slang.
- Sometimes send two short messages with a line break between them instead of one long one.
- Don't always ask a question back. Sometimes just vibe.
- Never use bullet points or formal structure.
- PHOTOS: You can send photos. Write [PHOTO: short vivid description] when you want to share one. Only when it feels natural.`

const BASE = [
  {id:"c1",name:"Alex",emoji:"⚽",color:COLORS[0],persona:"31-year-old Chicago marketing manager. Has a 4-year-old yellow lab named Bruno. Fantasy football obsessed. Broke up with his girlfriend 4 months ago. Orders Jimmy Johns 3 days a week. Always has an opinion on last nights game."},
  {id:"c2",name:"Maya",emoji:"✈️",color:COLORS[1],persona:"29-year-old freelance travel photographer based in Lisbon. Been to 47 countries. Cat named Fig. Casually dating a Portuguese guy Tomas, complicated. Talks about travel like its just normal life not a brand."},
  {id:"c3",name:"Sam",emoji:"🍳",color:COLORS[2],persona:"38-year-old food writer and private chef in New Orleans. Nigerian dad, French Creole mom. Has 6-year-old twins with ex-wife Danielle. Off weeks he stays up late and cooks for fun. Best friend is jazz musician Clifton."},
  {id:"c4",name:"Jordan",emoji:"🎸",color:COLORS[3],persona:"27-year-old barista and musician in Austin. Guitar in a band called Slow Parade. Hamster named Tater. Smokes weed most evenings, watches weird documentaries. Had a complicated thing with bandmate Remi."},
  {id:"c5",name:"Priya",emoji:"📚",color:COLORS[4],persona:"35-year-old lit professor at Boston University. 8-year-old daughter Meena. Lives with boyfriend David who is an architect. Witty, dry, does not suffer fools. Too much coffee, not enough sleep."},
  {id:"c6",name:"Marco",emoji:"🏄",color:COLORS[5],persona:"33-year-old surf instructor and marine biology researcher in San Diego. Rescued greyhound named Dune. Dad sick in Tucson, drives up monthly. Genuinely laid back. Childhood best friend Luis."},
  {id:"c7",name:"Zara",emoji:"🎨",color:COLORS[6],persona:"30-year-old graphic designer and artist in Brooklyn, grew up in Nairobi. Shares a loft with best friend Amara. Dating Felix, a filmmaker. Very direct, very funny. Night owl."},
  {id:"c8",name:"Luca",emoji:"🍕",color:COLORS[7],persona:"42-year-old history teacher in Boston, coaches JV baseball. Sunday dinners at moms are non-negotiable. Fat orange tabby named Cannoli. Friday night cards with the same guys for 20 years."},
  {id:"c9",name:"Aiko",emoji:"🌸",color:COLORS[0],persona:"28-year-old UX designer in Tokyo, fully remote. Spent 3 years in London. Cat named Mochi. Calls mom every Sunday. Small tight friend circle. Quietly funny."},
  {id:"c10",name:"Darius",emoji:"🎷",color:COLORS[1],persona:"44-year-old jazz sax player and producer in Harlem, from New Orleans. Teenage son Marcus. Dog named Coltrane. 6 years sober. Knows every bodega owner in 10 blocks. Reads constantly."},
  {id:"c11",name:"Elena",emoji:"🌿",color:COLORS[2],persona:"36-year-old botanist on a 4-acre farm in Vermont with wife Carmen and son Nico age 3. Two goats Basil and Rue. Very old dog Creek. Up by 6am. Barely uses social media."},
  {id:"c12",name:"Raj",emoji:"🚀",color:COLORS[3],persona:"26-year-old software engineer in Seattle, fully remote. Hardcore homebody. Telescope on his balcony. Obsessed with space. Elden Ring, mostly delivery food. Teaching himself to cook lately."},
]

const PHOTO_THEMES = {
  c1:["yellow lab park","sports bar game","Chicago pizza","Chicago skyline"],
  c2:["Lisbon rooftop","Portugal street","beach ocean","travel city"],
  c3:["gumbo bowl steam","French Quarter","kitchen family","cafe coffee"],
  c4:["guitar coffee shop","Austin music stage","vinyl records","food trucks sunset"],
  c5:["office books lamp","Boston campus autumn","child playground","library books"],
  c6:["surfer wave sunrise","greyhound beach","ocean underwater","coastal sunset"],
  c7:["Brooklyn street art","art studio canvases","bridge city lights","art supplies"],
  c8:["festival lights night","baseball field sunset","Italian dinner","orange cat couch"],
  c9:["Tokyo neon night","tea ceremony","cherry blossoms","ramen shop"],
  c10:["jazz club blue lights","vinyl records shelf","Harlem brownstones","saxophone stage"],
  c11:["farm sunrise mist","wildflower meadow","farmhouse window rain","herbs garden"],
  c12:["telescope night sky","milky way mountain","Seattle skyline dusk","space control"],
}

// ── API ───────────────────────────────────────────────────────
async function callAPI(apiKey, messages, maxTokens=1000) {
  for (let i = 0; i < 3; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 900 * i))
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "x-api-key": apiKey,
          "anthropic-version":"2023-06-01",
          "anthropic-dangerous-direct-browser-access":"true",
        },
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:maxTokens, messages }),
      })
      const raw = await res.text()
      if (!raw?.trim()) continue
      const data = JSON.parse(raw)
      if (!res.ok) throw new Error(data?.error?.message || "HTTP " + res.status)
      const text = (data.content||[]).map(b=>b.text||"").filter(Boolean).join("\n")
      if (text) return text
    } catch(e) { if (i===2) throw e }
  }
  throw new Error("No response after 3 tries")
}

async function generateSVG(apiKey, caption) {
  const text = await callAPI(apiKey, [{role:"user",content:`Draw a beautiful detailed SVG illustration of: "${caption}". Return ONLY raw SVG starting with <svg and ending with </svg>. Use viewBox="0 0 320 220" width="320" height="220". Rich gradients, atmospheric depth, realistic colors, no text labels inside.`}], 2000)
  const s = text.indexOf("<svg"), e = text.lastIndexOf("</svg>") + 6
  if (s===-1||e<6) throw new Error("No SVG")
  return text.slice(s, e)
}

function buildSystem(name, persona, hist) {
  const hr = new Date().getHours()
  const day = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()]
  const wknd = new Date().getDay()===0||new Date().getDay()===6
  const t = hr<6?"Middle of the night.":hr<9?"Early morning, just woke up.":hr<12?"Mid-morning.":hr<14?"Lunchtime.":hr<17?"Afternoon.":hr<20?"Early evening.":hr<23?"Night, chill mode.":"Late night."
  const mem = hist?.length > 3 ? "\nRecent: " + hist.slice(-5).map(m=>(m.role==="user"?"Them":"You")+": "+m.content?.slice(0,80)).join(" | ") : ""
  return `You are ${name}. Your life: ${persona}\n\nIt is ${day}${wknd?" (weekend)":" (weekday)"}. ${t}${mem}\n\n${TEXTING}`
}

function extractPhotoTag(text) {
  const m = text.match(/\[PHOTO:\s*([^\]]+)\]/i)
  if (!m) return { text, caption:null }
  return { text:text.replace(m[0],"").replace(/\n\n+/g,"\n").trim(), caption:m[1].trim() }
}

function ftime() { return new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) }
function getStatus(hr) {
  return hr<7?"up late 🌙":hr<9?"morning coffee ☕":hr<12?"mid-morning":hr<13?"lunch break":hr<17?"at work":hr<19?"just got off":hr<22?"chilling":"winding down"
}

// ── COMPONENTS ────────────────────────────────────────────────
function Av({ c, size=46 }) {
  const dot = (new Date().getHours()<7||new Date().getHours()>=22)?"#f0a040":"#50d080"
  return (
    <div style={{width:size,height:size,minWidth:size,borderRadius:"50%",background:c.color.bg,color:c.color.fg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.42,position:"relative",flexShrink:0,border:`1px solid ${c.color.fg}22`}}>
      {c.emoji}
      <div style={{width:9,height:9,background:dot,borderRadius:"50%",border:"2px solid #0a0a0f",position:"absolute",bottom:1,right:1}}/>
    </div>
  )
}

function TypingDots({ c }) {
  return (
    <div style={{display:"flex",alignItems:"flex-end",gap:10}}>
      <Av c={c} size={28}/>
      <div style={{display:"flex",gap:5,padding:"11px 16px",background:"#1a1a24",borderRadius:"18px 18px 18px 4px",border:"1px solid #ffffff10"}}>
        {[0,.18,.36].map((d,i)=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"#555",animation:"bnc 1.1s infinite",animationDelay:`${d}s`}}/>)}
      </div>
    </div>
  )
}

// RULE: Every photo has Next › button
function PhotoCard({ caption, svgData, onGenerate }) {
  const [loading, setLoading] = useState(!svgData)
  useEffect(()=>{ if(!svgData){setLoading(true);onGenerate(false).finally(()=>setLoading(false))} },[])
  async function next() { setLoading(true); await onGenerate(true); setLoading(false) }
  return (
    <div style={{borderRadius:"18px 18px 18px 4px",overflow:"hidden",width:"min(260px,68vw)",background:"#0f0f1a",border:"1px solid #ffffff12"}}>
      {(loading||!svgData) && (
        <div style={{padding:"28px 16px",display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
          <div style={{fontSize:26}}>🎨</div>
          <div style={{fontSize:13,color:"#555",fontStyle:"italic"}}>{svgData?"Getting another...":"Drawing photo..."}</div>
          <div style={{display:"flex",gap:5}}>{[0,.2,.4].map((d,i)=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"#444",animation:"bnc 1.1s infinite",animationDelay:`${d}s`}}/>)}</div>
        </div>
      )}
      {svgData&&!loading&&(
        <>
          <div dangerouslySetInnerHTML={{__html:svgData}} style={{display:"block",lineHeight:0,width:"100%"}}/>
          <div style={{padding:"7px 12px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(255,255,255,0.03)"}}>
            <div style={{fontSize:11,color:"#666",fontStyle:"italic",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(caption||"").slice(0,42)}</div>
            <button onClick={next} style={{marginLeft:8,padding:"3px 11px",borderRadius:20,border:"1px solid #ffffff15",background:"rgba(255,255,255,0.07)",color:"#aaa",fontSize:11,cursor:"pointer",flexShrink:0,fontWeight:600}}>Next ›</button>
          </div>
        </>
      )}
    </div>
  )
}

// ── KEY SCREEN (inside app, for guests) ──────────────────────
function ApiKeyPrompt({ onSave, onSignUp }) {
  const [key, setKey] = useState("")
  const valid = key.startsWith("sk-ant-")
  return (
    <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{width:"100%",maxWidth:400,display:"flex",flexDirection:"column",gap:20}}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:10}}>🔑</div>
          <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22,marginBottom:6}}>Enter your API key</div>
          <div style={{fontSize:13,color:"#555",lineHeight:1.7}}>
            Get a free key at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{color:"#7eb8f7"}}>console.anthropic.com</a> → API Keys → Create Key
          </div>
        </div>
        <input type="password" placeholder="sk-ant-api03-..." value={key} onChange={e=>setKey(e.target.value)}
          style={{background:"#0a0a0f",border:`1px solid ${valid?"#7eb8f7":"#ffffff15"}`,borderRadius:12,padding:"12px 16px",fontSize:14,color:"#f0ede8",outline:"none",fontFamily:"monospace",letterSpacing:"0.5px",transition:"border .2s"}}/>
        <button disabled={!valid} onClick={()=>onSave(key)}
          style={{padding:14,borderRadius:12,border:"none",fontSize:15,fontWeight:600,cursor:valid?"pointer":"default",background:valid?"linear-gradient(135deg,#7eb8f7,#a58af5)":"#1a1a24",color:valid?"#0a0a0f":"#444",transition:"all .2s"}}>
          Start chatting →
        </button>
        <div style={{textAlign:"center",fontSize:13,color:"#444"}}>
          Want to save chats?{" "}
          <button onClick={onSignUp} style={{background:"none",border:"none",color:"#a58af5",cursor:"pointer",fontSize:13}}>Create a free account</button>
        </div>
        <div style={{fontSize:12,color:"#333",textAlign:"center"}}>Key stored only on this device. Never sent anywhere except Anthropic.</div>
      </div>
    </div>
  )
}

// ── MAIN APP ─────────────────────────────────────────────────
export default function PenPalsApp({ user, onSignIn, onSignUp, onSignOut }) {
  const [apiKey, setApiKey]       = useState(()=>{ try{return localStorage.getItem("pp-apikey")||""}catch(e){return""} })
  const [contacts, setContacts]   = useState(BASE.map(c=>({...c,isNew:false})))
  const [convos, setConvos]       = useState(()=>Object.fromEntries(BASE.map(c=>[c.id,[]])))
  const [activeId, setActiveId]   = useState(null)
  const [busy, setBusy]           = useState(false)
  const [generating,setGenerating]= useState(false)
  const [showClear, setShowClear] = useState(false)
  const [loadingData, setLoadingData] = useState(false)
  const [isMobile, setIsMobile]   = useState(window.innerWidth < 768)
  const convosRef  = useRef(convos)
  const contactsRef= useRef(contacts)
  useEffect(()=>{ convosRef.current=convos },[convos])
  useEffect(()=>{ contactsRef.current=contacts },[contacts])

  useEffect(()=>{
    const fn=()=>setIsMobile(window.innerWidth<768)
    window.addEventListener("resize",fn)
    return()=>window.removeEventListener("resize",fn)
  },[])

  // Load data based on auth state
  useEffect(()=>{
    if (user) {
      loadUserData()
    } else {
      // Guest: load from localStorage
      const savedC = lsGetContacts()
      const savedV = lsGetConvos()
      if (savedC?.length) setContacts(savedC)
      if (savedV) setConvos(p=>({...Object.fromEntries(BASE.map(c=>[c.id,[]])), ...savedV}))
    }
  },[user])

  async function loadUserData() {
    setLoadingData(true)
    try {
      // Load custom pals from DB
      const customPals = await dbLoadCustomPals(user.id)
      if (customPals.length) {
        const dbPals = customPals.map(p=>({
          id: p.pal_id, name: p.name, emoji: p.emoji,
          persona: p.persona, color: COLORS[p.color_index % COLORS.length], isNew: false,
        }))
        setContacts([...BASE.map(c=>({...c,isNew:false})), ...dbPals])
      }
      // Load messages for the first pal to start (load others on demand)
    } catch(e) { console.error(e) }
    setLoadingData(false)
  }

  function saveApiKey(k) {
    try { localStorage.setItem("pp-apikey", k) } catch(e) {}
    setApiKey(k)
  }

  function updC(fn) {
    setContacts(p => {
      const n = typeof fn==="function" ? fn(p) : fn
      contactsRef.current = n
      if (!user) lsSaveContacts(n)
      return n
    })
  }

  function updV(fn, palId=null) {
    setConvos(p => {
      const n = typeof fn==="function" ? fn(p) : fn
      convosRef.current = n
      if (!user) lsSaveConvos(n)
      return n
    })
  }

  const active = contacts.find(c=>c.id===activeId)||null

  async function selectContact(id) {
    updC(cs => cs.map(c=>c.id===id ? {...c,isNew:false} : c))
    setActiveId(id)
    // Load messages from DB if logged in and not yet loaded
    if (user && (!convosRef.current[id] || convosRef.current[id].length===0)) {
      const msgs = await dbLoadMessages(user.id, id)
      if (msgs.length) {
        updV(cv => ({...cv, [id]: msgs}))
      }
    }
  }

  async function confirmClear() {
    if (user) {
      await dbClearMessages(user.id)
      await dbClearCustomPals(user.id)
      setContacts(BASE.map(c=>({...c,isNew:false})))
    }
    updV(Object.fromEntries(contacts.map(c=>[c.id,[]])))
    setShowClear(false)
  }

  const PHOTO_TRIGGERS=["send me a photo","send a photo","send me a pic","send a pic","show me a photo","show me a pic","share a photo","share a pic","send photo","send pic","take a photo","gimme a pic","give me a pic"]

  async function handleSend(txt) {
    if (!active||busy) return
    if (PHOTO_TRIGGERS.some(t=>txt.toLowerCase().includes(t))) {
      const um = {role:"user",content:txt,time:ftime()}
      updV(cv=>({...cv,[active.id]:[...(cv[active.id]||[]),um]}))
      if (user) await dbSaveMessage(user.id, active.id, um)
      handlePhoto()
      return
    }
    const um = {role:"user",content:txt,time:ftime()}
    updV(cv=>({...cv,[active.id]:[...(cv[active.id]||[]),um]}))
    if (user) await dbSaveMessage(user.id, active.id, um)
    setBusy(true)
    try {
      const hist=(convosRef.current[active.id]||[]).filter(m=>!m.isErr&&m.type!=="image"&&m.content)
      const sys=buildSystem(active.name,active.persona||"",hist)
      const reply=await callAPI(apiKey,[{role:"user",content:sys+"\n\nConversation:\n"+hist.slice(0,-1).map(m=>(m.role==="user"?"Them":"You")+": "+m.content).join("\n")+"\nThem: "+txt}])
      const{text:clean,caption}=extractPhotoTag(reply)
      const newMsgs=[]
      if(clean){const parts=clean.split("\n").map(p=>p.trim()).filter(Boolean);if(parts.length>1&&parts.length<=3)parts.forEach(p=>newMsgs.push({role:"assistant",content:p,time:ftime()}));else newMsgs.push({role:"assistant",content:clean,time:ftime()})}
      if(caption)newMsgs.push({role:"assistant",type:"image",caption,svgData:null,time:ftime()})
      for(let i=0;i<newMsgs.length;i++){
        if(i>0)await new Promise(r=>setTimeout(r,600))
        const m=newMsgs[i]
        updV(cv=>({...cv,[active.id]:[...cv[active.id],m]}))
        if(user)await dbSaveMessage(user.id,active.id,m)
      }
    } catch(e) {
      updV(cv=>({...cv,[active.id]:[...cv[active.id],{role:"assistant",content:"Couldn't send — try again",time:ftime(),isErr:true}]}))
    }
    setBusy(false)
  }

  function handlePhoto() {
    if (!active) return
    const themes=PHOTO_THEMES[active.id]||["lifestyle moment","city scene","candid photo","everyday scene"]
    const caption=themes[Math.floor(Math.random()*themes.length)]
    const pm={role:"assistant",type:"image",caption,svgData:null,time:ftime()}
    updV(cv=>({...cv,[active.id]:[...(cv[active.id]||[]),pm]}))
    if(user)dbSaveMessage(user.id,active.id,pm)
  }

  async function handleGeneratePhoto(idx,caption,force=false) {
    if (!active) return
    const ms=convosRef.current[active.id]||[]
    if(!force&&ms[idx]?.svgData)return
    try {
      const svg=await generateSVG(apiKey,caption||"beautiful scenic moment")
      updV(cv=>{const u=[...(cv[active.id]||[])];if(u[idx])u[idx]={...u[idx],svgData:svg};return{...cv,[active.id]:u}})
      if(user)await dbUpdateSvg(user.id,active.id,idx,svg)
    } catch(e){}
  }

  async function generateRandom() {
    setGenerating(true)
    try {
      const used=contacts.map(c=>c.name).join(", ")
      const col=COLORS[contacts.length%COLORS.length]
      const raw=await callAPI(apiKey,[{role:"user",content:`Create a unique pen pal. Names taken: ${used}. Return ONLY raw JSON:\n{"name":"unique first name","emoji":"one emoji","persona":"4-5 sentences: age, job, city, living situation, family or pets, daily routine, personality quirks. Be specific and unexpected."}`}])
      let js=null,d=0,s=-1
      for(let i=0;i<raw.length;i++){if(raw[i]==="{"){if(d===0)s=i;d++}else if(raw[i]==="}"){d--;if(d===0&&s!==-1){js=raw.slice(s,i+1);break}}}
      if(!js)throw new Error("No JSON")
      const p=JSON.parse(js)
      if(!p.name||!p.persona)throw new Error("Missing fields")
      const name=p.name.trim().split(" ")[0]
      const nc={id:"c"+Date.now(),name,emoji:p.emoji||"🌟",color:col,isNew:true,persona:p.persona}
      PHOTO_THEMES[nc.id]=["lifestyle moment","city street","candid photo","nature scene"]
      updC(cs=>[...cs,nc])
      updV(cv=>({...cv,[nc.id]:[]}))
      if(user)await dbSaveCustomPal(user.id,{...nc,colorIndex:contacts.length%COLORS.length})
      setActiveId(nc.id)
    } catch(e){alert("Couldn't generate — try again!")}
    setGenerating(false)
  }

  const showSidebar = !isMobile || !active
  const showChat    = !isMobile || active

  if (!apiKey) return (
    <div style={{height:"100vh",display:"flex",flexDirection:"column",background:"#0a0a0f"}}>
      <div style={{padding:"16px 20px",borderBottom:"1px solid #ffffff08",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontFamily:"'Instrument Serif',serif",fontSize:18}}>Pen Pals ✉️</div>
        {user
          ? <div style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:12,color:"#555"}}>{user.email}</span>
              <button onClick={onSignOut} style={{background:"none",border:"none",color:"#555",fontSize:12,cursor:"pointer"}}>Sign out</button>
            </div>
          : <div style={{display:"flex",gap:8}}>
              <button onClick={onSignIn} style={{padding:"6px 14px",borderRadius:20,border:"1px solid #ffffff15",background:"transparent",color:"#888",fontSize:12,cursor:"pointer"}}>Sign in</button>
              <button onClick={onSignUp} style={{padding:"6px 14px",borderRadius:20,border:"none",background:"#a58af5",color:"#fff",fontSize:12,cursor:"pointer"}}>Sign up free</button>
            </div>
        }
      </div>
      <ApiKeyPrompt onSave={saveApiKey} onSignUp={onSignUp}/>
    </div>
  )

  return (
    <div style={{display:"flex",height:"100vh",background:"#0a0a0f",overflow:"hidden"}}>

      {/* SIDEBAR */}
      {showSidebar && (
        <div style={{width:isMobile?"100%":"300px",minWidth:isMobile?"100%":"300px",borderRight:"1px solid #ffffff08",display:"flex",flexDirection:"column",background:"#0a0a0f"}}>

          {/* Header */}
          <div style={{padding:"16px 18px",borderBottom:"1px solid #ffffff08",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:18}}>Pen Pals ✉️</div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {user
                ? <>
                    <span style={{fontSize:11,color:"#444",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.email}</span>
                    <button onClick={onSignOut} style={{background:"none",border:"none",color:"#555",fontSize:11,cursor:"pointer"}}>Out</button>
                  </>
                : <>
                    <button onClick={onSignIn} style={{background:"none",border:"none",color:"#7eb8f7",fontSize:11,cursor:"pointer"}}>Sign in</button>
                    <button onClick={onSignUp} style={{padding:"4px 10px",borderRadius:20,border:"none",background:"#a58af5",color:"#fff",fontSize:11,cursor:"pointer"}}>Sign up</button>
                  </>
              }
              <button onClick={()=>setShowClear(true)} style={{background:"none",border:"none",color:"#f07070",fontSize:11,cursor:"pointer"}}>Clear</button>
            </div>
          </div>

          {/* Sidebar ad slot */}
          <div id="ad-sidebar" style={{padding:"6px 16px",borderBottom:"1px solid #ffffff05",minHeight:0}}>
            {/* ADSENSE SIDEBAR AD
            <ins className="adsbygoogle" style={{display:"block"}} data-ad-client="ca-pub-XXXXXXXX" data-ad-slot="XXXXXXXXXX" data-ad-format="auto"></ins>
            <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
            */}
          </div>

          {/* Saved chats banner for guests */}
          {!user && (
            <div style={{padding:"10px 16px",background:"#a58af710",borderBottom:"1px solid #a58af720",fontSize:12,color:"#a58af5",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>💾 Save your chats forever</span>
              <button onClick={onSignUp} style={{background:"#a58af5",border:"none",color:"#fff",padding:"3px 10px",borderRadius:20,fontSize:11,cursor:"pointer"}}>Free →</button>
            </div>
          )}

          {/* Generate button */}
          <div style={{padding:"10px 14px 6px"}}>
            <button onClick={generateRandom} disabled={generating}
              style={{width:"100%",padding:"10px",borderRadius:12,border:"1px solid #7eb8f725",background:generating?"#1a1a24":"rgba(126,184,247,0.07)",color:generating?"#444":"#7eb8f7",fontSize:13,fontWeight:500,cursor:generating?"default":"pointer",transition:"all .2s"}}>
              {generating?"⏳  Generating...":"✦  Random new pal"}
            </button>
          </div>

          {/* Contacts */}
          <div style={{flex:1,overflowY:"auto"}}>
            {contacts.map((c,i)=>{
              const ms=convos[c.id]||[],last=ms[ms.length-1]
              const prev=last?(last.role==="user"?"You: "+last.content:last.type==="image"?"📸 Photo":last.content):"Say hello 👋"
              const isActive=c.id===activeId
              return(
                <div key={c.id}>
                  <div onClick={()=>selectContact(c.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 16px",cursor:"pointer",background:isActive?"#ffffff07":"transparent",borderLeft:isActive?"2px solid #7eb8f7":"2px solid transparent",transition:"all .15s"}}>
                    <Av c={c} size={44}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                        <span style={{fontSize:14,fontWeight:600,color:"#f0ede8"}}>
                          {c.name}
                          {c.isNew&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:8,background:"#7eb8f720",color:"#7eb8f7",fontWeight:600,marginLeft:5}}>NEW</span>}
                        </span>
                        {last&&<span style={{fontSize:10,color:"#333"}}>{last.time}</span>}
                      </div>
                      <div style={{fontSize:12,color:"#444",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{(prev||"").slice(0,40)}{(prev||"").length>40?"...":""}</div>
                    </div>
                  </div>
                  {i<contacts.length-1&&<div style={{height:1,background:"#ffffff06",marginLeft:72}}/>}
                </div>
              )
            })}
          </div>

          {/* Donation slot */}
          <div id="donate-slot" style={{padding:"10px 16px",borderTop:"1px solid #ffffff07",textAlign:"center"}}>
            {/* BUY ME A COFFEE WIDGET — replace YOUR_NAME
            <a href="https://buymeacoffee.com/YOUR_NAME" target="_blank" rel="noreferrer">
              <img src="https://img.buymeacoffee.com/button-api/?text=Support Pen Pals&emoji=☕&slug=YOUR_NAME&button_colour=7eb8f7&font_colour=0a0a0f&font_family=Lato&outline_colour=0a0a0f" style={{height:36,borderRadius:8}}/>
            </a>
            */}
            <div style={{fontSize:11,color:"#333"}}>
              <a href="https://buymeacoffee.com/YOUR_NAME" target="_blank" rel="noreferrer" style={{color:"#7eb8f7",textDecoration:"none"}}>☕ Support Pen Pals</a>
            </div>
          </div>
        </div>
      )}

      {/* CHAT PANEL */}
      {showChat && (
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,background:"#0c0c16"}}>
          {!active ? (
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14,color:"#333",padding:32}}>
              <div style={{fontSize:52}}>✉️</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:20,color:"#444"}}>Choose a pen pal</div>
              <div style={{fontSize:13,color:"#333"}}>or tap ✦ to generate a random one</div>
              {/* Center ad slot */}
              <div id="ad-center" style={{marginTop:16}}>
                {/* ADSENSE CENTER
                <ins className="adsbygoogle" style={{display:"inline-block",width:300,height:250}} data-ad-client="ca-pub-XXXXXXXX" data-ad-slot="XXXXXXXXXX"></ins>
                <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
                */}
              </div>
            </div>
          ) : (
            <ChatPanel
              c={active} messages={convos[active.id]||[]} busy={busy}
              onBack={()=>setActiveId(null)} isMobile={isMobile}
              onSend={handleSend} onPhoto={handlePhoto}
              onGeneratePhoto={handleGeneratePhoto}
            />
          )}
        </div>
      )}

      {/* Clear confirm */}
      {showClear && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:24}}>
          <div style={{background:"#0f0f1a",border:"1px solid #ffffff15",borderRadius:20,overflow:"hidden",width:"100%",maxWidth:320}}>
            <div style={{padding:"28px 24px 20px",textAlign:"center"}}>
              <div style={{fontSize:36,marginBottom:12}}>🗑️</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:20,marginBottom:8}}>Clear all chats?</div>
              <div style={{fontSize:14,color:"#555",lineHeight:1.5}}>This deletes every conversation. Can't be undone.</div>
            </div>
            <div style={{borderTop:"1px solid #ffffff10"}}>
              <button onClick={confirmClear} style={{width:"100%",padding:16,background:"none",border:"none",borderBottom:"1px solid #ffffff10",color:"#f07070",fontSize:15,fontWeight:600,cursor:"pointer"}}>Yes, clear everything</button>
              <button onClick={()=>setShowClear(false)} style={{width:"100%",padding:16,background:"none",border:"none",color:"#7eb8f7",fontSize:15,cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ChatPanel({ c, messages, busy, onBack, isMobile, onSend, onPhoto, onGeneratePhoto }) {
  const [text, setText] = useState("")
  const msgsRef = useRef(null)
  const taRef   = useRef(null)
  useEffect(()=>{ if(msgsRef.current)msgsRef.current.scrollTop=msgsRef.current.scrollHeight },[messages,busy])
  function send(){ const t=text.trim();if(!t||busy)return;onSend(t);setText("");if(taRef.current)taRef.current.style.height="auto" }
  const hr = new Date().getHours()
  return(
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>
      <div style={{padding:"13px 18px",borderBottom:"1px solid #ffffff08",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
        {isMobile&&<button onClick={onBack} style={{background:"none",border:"none",color:"#7eb8f7",fontSize:18,cursor:"pointer",padding:"2px 6px 2px 0"}}>‹</button>}
        <Av c={c} size={36}/>
        <div>
          <div style={{fontSize:14,fontWeight:600,color:"#f0ede8"}}>{c.name}</div>
          <div style={{fontSize:11,color:"#50d080"}}>{getStatus(hr)}</div>
        </div>
        {/* Chat header ad */}
        <div id="ad-chat-header" style={{marginLeft:"auto",fontSize:11,color:"#333"}}>
          {/* small native/text ad here */}
        </div>
      </div>

      <div ref={msgsRef} style={{flex:1,overflowY:"auto",padding:"14px 0 8px",display:"flex",flexDirection:"column",gap:3}}>
        {!messages.length&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,color:"#333",padding:40,marginTop:32}}>
            <div style={{fontSize:46}}>{c.emoji}</div>
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:17,color:"#444",fontStyle:"italic"}}>Say something to {c.name}</div>
          </div>
        )}
        {messages.map((m,i)=>{
          const me=m.role==="user",showAv=!me&&(i===0||messages[i-1].role==="user")
          if(m.type==="image")return(
            <div key={i} style={{padding:"2px 18px"}}>
              <div style={{display:"flex",alignItems:"flex-end",gap:10}}>
                <div style={{width:30,flexShrink:0}}>{showAv&&<Av c={c} size={26}/>}</div>
                <PhotoCard caption={m.caption} svgData={m.svgData} onGenerate={(f)=>onGeneratePhoto(i,m.caption,f)}/>
              </div>
              <div style={{fontSize:10,color:"#333",marginTop:4,paddingLeft:40}}>{m.time}</div>
            </div>
          )
          return(
            <div key={i} style={{padding:"1px 18px"}}>
              <div style={{display:"flex",alignItems:"flex-end",gap:10,flexDirection:me?"row-reverse":"row"}}>
                <div style={{width:30,flexShrink:0}}>{!me&&showAv&&<Av c={c} size={26}/>}</div>
                <div style={{maxWidth:"min(70%,500px)",padding:"9px 13px",fontSize:15,lineHeight:1.5,wordBreak:"break-word",borderRadius:me?"18px 18px 4px 18px":"18px 18px 18px 4px",background:m.isErr?"#3a1010":me?"#1e3a6e":"#1a1a24",color:m.isErr?"#f07070":me?"#d0e8ff":"#d0cdc8",border:me?"none":"1px solid #ffffff0d"}}>
                  {m.content}
                </div>
              </div>
              <div style={{fontSize:10,color:"#333",marginTop:3,paddingLeft:me?0:40,textAlign:me?"right":"left"}}>{m.time}</div>
            </div>
          )
        })}
        {busy&&<div style={{padding:"4px 18px"}}><TypingDots c={c}/></div>}
      </div>

      <div style={{padding:"10px 14px 14px",borderTop:"1px solid #ffffff08",display:"flex",alignItems:"flex-end",gap:10,flexShrink:0}}>
        <button onClick={onPhoto} style={{width:34,height:34,borderRadius:"50%",border:"1px solid #ffffff15",background:"rgba(255,255,255,0.04)",fontSize:15,flexShrink:0,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"background .15s"}}
          onMouseEnter={e=>e.target.style.background="rgba(255,255,255,0.1)"}
          onMouseLeave={e=>e.target.style.background="rgba(255,255,255,0.04)"}>📷</button>
        <textarea ref={taRef} value={text}
          onChange={e=>{setText(e.target.value);e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,110)+"px"}}
          onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}}}
          placeholder="Message..." rows={1}
          style={{flex:1,border:"1px solid #ffffff12",borderRadius:20,padding:"9px 15px",fontSize:15,resize:"none",outline:"none",background:"#0a0a0f",color:"#f0ede8",lineHeight:1.4,maxHeight:110,fontFamily:"inherit",transition:"border .2s"}}
          onFocus={e=>e.target.style.borderColor="#ffffff25"}
          onBlur={e=>e.target.style.borderColor="#ffffff12"}
        />
        <button onClick={send} disabled={!text.trim()||busy}
          style={{width:34,height:34,borderRadius:"50%",border:"none",color:!text.trim()||busy?"#333":"#0a0a0f",fontSize:16,flexShrink:0,cursor:!text.trim()||busy?"default":"pointer",background:!text.trim()||busy?"#1a1a24":"linear-gradient(135deg,#7eb8f7,#a58af5)",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s"}}>↑</button>
      </div>
    </div>
  )
}
