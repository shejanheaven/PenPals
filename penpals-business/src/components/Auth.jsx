import { useState } from "react"
import { supabase } from "../supabase.js"

export default function Auth({ mode = "signin", onSuccess, onBack }) {
  const [tab, setTab]       = useState(mode) // signin | signup
  const [email, setEmail]   = useState("")
  const [pass, setPass]     = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState("")
  const [done, setDone]     = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(""); setLoading(true)
    try {
      if (tab === "signup") {
        const { error } = await supabase.auth.signUp({ email, password: pass })
        if (error) throw error
        setDone(true)
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
        if (error) throw error
        onSuccess()
      }
    } catch(e) {
      setError(e.message)
    }
    setLoading(false)
  }

  const s = {
    wrap: {minHeight:"100vh",background:"#0a0a0f",display:"flex",alignItems:"center",justifyContent:"center",padding:24},
    card: {width:"100%",maxWidth:400,background:"#0f0f1a",borderRadius:24,border:"1px solid #ffffff12",padding:"36px 32px",display:"flex",flexDirection:"column",gap:20},
    input: {width:"100%",background:"#0a0a0f",border:"1px solid #ffffff18",borderRadius:12,padding:"12px 16px",fontSize:14,color:"#f0ede8",outline:"none",fontFamily:"inherit",transition:"border .2s"},
    btn: {width:"100%",padding:14,borderRadius:12,border:"none",fontSize:15,fontWeight:600,cursor:"pointer",transition:"all .2s"},
    link: {background:"none",border:"none",color:"#7eb8f7",cursor:"pointer",fontSize:13,padding:0,textDecoration:"underline"},
  }

  if (done) return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:48,marginBottom:12}}>📬</div>
          <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22,marginBottom:8}}>Check your email</div>
          <div style={{fontSize:14,color:"#666",lineHeight:1.7}}>
            We sent a confirmation link to <strong style={{color:"#ccc"}}>{email}</strong>. Click it to activate your account.
          </div>
        </div>
        <button onClick={onBack} style={{...s.btn,background:"#1a1a24",color:"#888"}}>Back to home</button>
      </div>
    </div>
  )

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:10}}>✉️</div>
          <div style={{fontFamily:"'Instrument Serif',serif",fontSize:24,marginBottom:4}}>
            {tab==="signup"?"Create your account":"Welcome back"}
          </div>
          <div style={{fontSize:13,color:"#555"}}>
            {tab==="signup"?"Free forever. Your chats, saved across every device.":"Sign in to access your saved chats."}
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{display:"flex",gap:0,background:"#0a0a0f",borderRadius:10,padding:3,border:"1px solid #ffffff0a"}}>
          {["signin","signup"].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"8px",borderRadius:8,border:"none",background:tab===t?"#1a1a2e":"transparent",color:tab===t?"#a58af5":"#555",fontSize:13,fontWeight:tab===t?600:400,cursor:"pointer",transition:"all .2s"}}>
              {t==="signin"?"Sign in":"Sign up"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{display:"flex",flexDirection:"column",gap:12}}>
          <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required
            style={s.input} onFocus={e=>e.target.style.borderColor="#a58af5"} onBlur={e=>e.target.style.borderColor="#ffffff18"}/>
          <input type="password" placeholder="Password" value={pass} onChange={e=>setPass(e.target.value)} required minLength={6}
            style={s.input} onFocus={e=>e.target.style.borderColor="#a58af5"} onBlur={e=>e.target.style.borderColor="#ffffff18"}/>
          {error && <div style={{fontSize:13,color:"#f07070",background:"#3a101008",padding:"8px 12px",borderRadius:8}}>{error}</div>}
          <button type="submit" disabled={loading}
            style={{...s.btn,background:loading?"#1a1a24":"linear-gradient(135deg,#7eb8f7,#a58af5)",color:loading?"#555":"#0a0a0f"}}>
            {loading?"...":(tab==="signup"?"Create free account":"Sign in")}
          </button>
        </form>

        <div style={{textAlign:"center",fontSize:13,color:"#444"}}>
          <button onClick={onBack} style={s.link}>← Back to home</button>
        </div>
      </div>
    </div>
  )
}
