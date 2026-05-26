import { useState, useEffect } from "react"
import { supabase } from "./supabase.js"
import Landing from "./components/Landing.jsx"
import Auth from "./components/Auth.jsx"
import PenPalsApp from "./components/PenPalsApp.jsx"

export default function App() {
  const [screen, setScreen] = useState("landing") // landing | signin | signup | app
  const [user,   setUser]   = useState(null)
  const [loading,setLoading]= useState(true)

  useEffect(() => {
    // Check existing session
    supabase?.auth.getSession().then(({ data }) => {
      setUser(data?.session?.user || null)
      if (data?.session?.user) setScreen("app")
      setLoading(false)
    })
    // Listen for auth changes
    const { data: { subscription } } = supabase?.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null)
      if (session?.user) setScreen("app")
      else if (event === "SIGNED_OUT") setScreen("landing")
    }) || { data: { subscription: { unsubscribe: () => {} } } }
    return () => subscription.unsubscribe()
  }, [])

  if (loading) return (
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0a0a0f",flexDirection:"column",gap:16}}>
      <div style={{fontSize:44}}>✉️</div>
      <div style={{fontSize:14,color:"#444"}}>Loading...</div>
    </div>
  )

  async function handleSignOut() {
    await supabase?.auth.signOut()
    setUser(null)
    setScreen("landing")
  }

  return (
    <>
      <style>{`
        @keyframes bnc{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-5px)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        *{-webkit-tap-highlight-color:transparent;box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-thumb{background:#222;border-radius:4px;}
        textarea{font-family:inherit;} button{font-family:inherit;} input{font-family:inherit;}
        button:active{opacity:.8;}
      `}</style>

      {screen === "landing" && (
        <Landing
          onStart={() => setScreen("app")}
          onSignIn={() => setScreen("signin")}
          onSignUp={() => setScreen("signup")}
        />
      )}
      {screen === "signin" && <Auth mode="signin" onSuccess={() => setScreen("app")} onBack={() => setScreen("landing")} />}
      {screen === "signup" && <Auth mode="signup" onSuccess={() => setScreen("app")} onBack={() => setScreen("landing")} />}
      {screen === "app" && (
        <PenPalsApp
          user={user}
          onSignIn={() => setScreen("signin")}
          onSignUp={() => setScreen("signup")}
          onSignOut={handleSignOut}
        />
      )}
    </>
  )
}
