import { useState } from "react"

const PALS = [
  {emoji:"⚽",name:"Alex"},{emoji:"✈️",name:"Maya"},{emoji:"🍳",name:"Sam"},
  {emoji:"🎸",name:"Jordan"},{emoji:"📚",name:"Priya"},{emoji:"🏄",name:"Marco"},
  {emoji:"🎨",name:"Zara"},{emoji:"🍕",name:"Luca"},{emoji:"🌸",name:"Aiko"},
  {emoji:"🎷",name:"Darius"},{emoji:"🌿",name:"Elena"},{emoji:"🚀",name:"Raj"},
]

const FEATURES = [
  {icon:"🧠",label:"Remembers everything"},
  {icon:"⏰",label:"Time & mood aware"},
  {icon:"📸",label:"Shares AI photos"},
  {icon:"☁️",label:"Saves across devices"},
  {icon:"✦",label:"Unlimited random pals"},
  {icon:"💬",label:"Feels genuinely human"},
]

export default function Landing({ onStart, onSignIn, onSignUp }) {
  return (
    <div style={{minHeight:"100vh",background:"#0a0a0f",overflowY:"auto",display:"flex",flexDirection:"column"}}>

      {/* Nav */}
      <nav style={{padding:"18px 32px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #ffffff08",backdropFilter:"blur(10px)",position:"sticky",top:0,background:"rgba(10,10,15,0.92)",zIndex:10}}>
        <div style={{fontFamily:"'Instrument Serif',serif",fontSize:20,letterSpacing:"-0.5px"}}>Pen Pals ✉️</div>
        <div style={{display:"flex",gap:12,alignItems:"center"}}>
          <button onClick={onSignIn} style={{padding:"7px 18px",borderRadius:100,border:"1px solid #ffffff20",background:"transparent",color:"#ccc",fontSize:13,cursor:"pointer",transition:"all .2s"}}
            onMouseEnter={e=>{e.target.style.borderColor="#ffffff40";e.target.style.color="#fff"}}
            onMouseLeave={e=>{e.target.style.borderColor="#ffffff20";e.target.style.color="#ccc"}}>
            Sign in
          </button>
          <button onClick={onStart} style={{padding:"7px 18px",borderRadius:100,border:"none",background:"linear-gradient(135deg,#7eb8f7,#a58af5)",color:"#0a0a0f",fontSize:13,fontWeight:600,cursor:"pointer",transition:"transform .2s"}}
            onMouseEnter={e=>e.target.style.transform="translateY(-1px)"}
            onMouseLeave={e=>e.target.style.transform="translateY(0)"}>
            Start free
          </button>
        </div>
      </nav>

      {/* Top ad banner */}
      <div id="ad-top" style={{textAlign:"center",padding:"8px",borderBottom:"1px solid #ffffff05",minHeight:0}}>
        {/* ADSENSE TOP BANNER
        <ins className="adsbygoogle" style={{display:"block"}} data-ad-client="ca-pub-XXXXXXXX" data-ad-slot="XXXXXXXXXX" data-ad-format="auto" data-full-width-responsive="true"></ins>
        <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
        */}
      </div>

      {/* Hero */}
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"72px 24px 48px",textAlign:"center",maxWidth:700,margin:"0 auto",gap:32}}>
        <div style={{display:"flex",gap:10,fontSize:36,flexWrap:"wrap",justifyContent:"center"}}>
          {["⚽","✈️","🍳","🎸","📚","🏄"].map((e,i)=>(
            <span key={i} style={{display:"inline-block",animation:`float ${2.5+i*0.3}s ease-in-out infinite`,animationDelay:`${i*0.15}s`}}>{e}</span>
          ))}
        </div>
        <div>
          <h1 style={{fontFamily:"'Instrument Serif',serif",fontSize:"clamp(38px,6.5vw,68px)",fontWeight:400,lineHeight:1.1,letterSpacing:"-2px",marginBottom:18}}>
            AI friends who<br/><em style={{color:"#a58af5"}}>actually</em> feel real
          </h1>
          <p style={{fontSize:"clamp(14px,1.8vw,17px)",color:"#666",lineHeight:1.8,maxWidth:460,margin:"0 auto"}}>
            Pen Pals have jobs, schedules, pets, problems. They remember what you talked about. They text like real people. Chat free — no account needed.
          </p>
        </div>

        <div style={{display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center"}}>
          <button onClick={onStart} style={{padding:"14px 36px",borderRadius:100,border:"none",background:"linear-gradient(135deg,#7eb8f7,#a58af5)",color:"#0a0a0f",fontSize:16,fontWeight:600,cursor:"pointer",transition:"all .2s",boxShadow:"0 0 40px rgba(126,184,247,0.25)"}}
            onMouseEnter={e=>e.target.style.transform="translateY(-2px)"}
            onMouseLeave={e=>e.target.style.transform="translateY(0)"}>
            Start chatting free →
          </button>
          <button onClick={onSignUp} style={{padding:"14px 36px",borderRadius:100,border:"1px solid #ffffff20",background:"transparent",color:"#ccc",fontSize:16,cursor:"pointer",transition:"all .2s"}}
            onMouseEnter={e=>{e.target.style.borderColor="#a58af5";e.target.style.color="#fff"}}
            onMouseLeave={e=>{e.target.style.borderColor="#ffffff20";e.target.style.color="#ccc"}}>
            Create free account
          </button>
        </div>

        <p style={{fontSize:12,color:"#444"}}>No credit card. No signup required to start.</p>

        {/* Pal pills */}
        <div style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:"center",marginTop:4}}>
          {PALS.map(p=>(
            <div key={p.name} style={{display:"flex",alignItems:"center",gap:7,padding:"6px 14px",borderRadius:100,background:"#ffffff07",border:"1px solid #ffffff0c",fontSize:13,color:"#888"}}>
              <span>{p.emoji}</span>{p.name}
            </div>
          ))}
          <div style={{display:"flex",alignItems:"center",gap:7,padding:"6px 14px",borderRadius:100,background:"#a58af715",border:"1px solid #a58af730",fontSize:13,color:"#a58af5"}}>
            ✦ Generate unlimited
          </div>
        </div>

        {/* Features */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,width:"100%",maxWidth:560,marginTop:8}}>
          {FEATURES.map(f=>(
            <div key={f.label} style={{padding:"14px 16px",borderRadius:14,background:"#ffffff06",border:"1px solid #ffffff0a",display:"flex",alignItems:"center",gap:10,fontSize:13,color:"#777"}}>
              <span style={{fontSize:18}}>{f.icon}</span>{f.label}
            </div>
          ))}
        </div>

        {/* Free vs Account comparison */}
        <div style={{width:"100%",maxWidth:480,borderRadius:20,border:"1px solid #ffffff0f",overflow:"hidden",marginTop:8}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr"}}>
            <div style={{padding:"20px",borderRight:"1px solid #ffffff0a"}}>
              <div style={{fontSize:13,fontWeight:600,color:"#888",marginBottom:12}}>Free — No account</div>
              {["Chat with all 12 pals","Generate random pals","Photos with Next › button","Chats save in browser only","Ads supported"].map(f=>(
                <div key={f} style={{fontSize:12,color:"#555",marginBottom:6,display:"flex",gap:6}}><span style={{color:"#555"}}>✓</span>{f}</div>
              ))}
            </div>
            <div style={{padding:"20px",background:"#0f0f1a"}}>
              <div style={{fontSize:13,fontWeight:600,color:"#a58af5",marginBottom:12}}>Free Account ✦</div>
              {["Everything in Free","Chats saved forever","Sync across all devices","Never lose a conversation","Early access to new pals"].map(f=>(
                <div key={f} style={{fontSize:12,color:"#888",marginBottom:6,display:"flex",gap:6}}><span style={{color:"#a58af5"}}>✓</span>{f}</div>
              ))}
            </div>
          </div>
          <div style={{padding:"12px 20px",borderTop:"1px solid #ffffff0a",textAlign:"center"}}>
            <button onClick={onSignUp} style={{padding:"9px 24px",borderRadius:100,border:"none",background:"#a58af5",color:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>
              Create free account →
            </button>
          </div>
        </div>
      </div>

      {/* Bottom ad banner */}
      <div id="ad-bottom" style={{textAlign:"center",padding:"10px",borderTop:"1px solid #ffffff06"}}>
        {/* ADSENSE BOTTOM BANNER
        <ins className="adsbygoogle" style={{display:"block"}} data-ad-client="ca-pub-XXXXXXXX" data-ad-slot="XXXXXXXXXX" data-ad-format="auto" data-full-width-responsive="true"></ins>
        <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
        */}
      </div>

      {/* Footer */}
      <footer style={{padding:"20px 32px",borderTop:"1px solid #ffffff08",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
        <div style={{fontFamily:"'Instrument Serif',serif",fontSize:15,color:"#333"}}>Pen Pals ✉️</div>
        <div style={{display:"flex",gap:20,fontSize:12,color:"#444",alignItems:"center"}}>
          {/* BUY ME A COFFEE — replace YOUR_NAME */}
          <a href="https://buymeacoffee.com/YOUR_NAME" target="_blank" rel="noreferrer" style={{color:"#7eb8f7",textDecoration:"none",fontSize:12}}>
            ☕ Support this project
          </a>
          <span>Built with Claude</span>
        </div>
      </footer>

      <style>{`
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
      `}</style>
    </div>
  )
}
