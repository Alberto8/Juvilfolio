import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { supabase } from './supabase'
import Login from './Login'
import App from './App'

function Root() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])
  if (loading) return <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#0b0f1a',color:'#64748b',fontFamily:'system-ui' }}>Cargando...</div>
  if (!session) return <Login />
  return <App session={session} />
}

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><Root /></React.StrictMode>)
