import { useState } from 'react'
import { supabase } from './supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error.message)
    setLoading(false)
  }

  const inp = { width:'100%', padding:'10px 14px', background:'rgba(10,18,32,.8)', border:'1px solid rgba(148,163,184,.12)', borderRadius:10, color:'#e2e8f0', fontSize:14, outline:'none', boxSizing:'border-box' }

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#0b0f1a,#101729,#0d1321)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui' }}>
      <div style={{ background:'rgba(22,33,55,.65)', border:'1px solid rgba(148,163,184,.08)', borderRadius:20, padding:40, width:360, maxWidth:'90%' }}>
        <h1 style={{ margin:'0 0 6px', fontSize:24, fontWeight:800, fontStyle:'italic', background:'linear-gradient(135deg,#818cf8,#34d399)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', textAlign:'center' }}>Portfolio Tracker</h1>
        <p style={{ textAlign:'center', color:'#4b5563', fontSize:12, margin:'0 0 28px' }}>Inicia sesión para acceder a tu cartera</p>
        <form onSubmit={handleLogin} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div><label style={{ fontSize:11, color:'#64748b', display:'block', marginBottom:4 }}>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" style={inp} /></div>
          <div><label style={{ fontSize:11, color:'#64748b', display:'block', marginBottom:4 }}>Contraseña</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required style={inp} /></div>
          {error && <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', borderRadius:8, padding:'8px 12px', color:'#f87171', fontSize:12 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ background:'linear-gradient(135deg,#6366f1,#4f46e5)', border:'none', color:'#fff', padding:'12px 20px', borderRadius:10, cursor:loading?'wait':'pointer', fontWeight:700, fontSize:14, marginTop:6, opacity:loading?0.6:1 }}>{loading ? 'Entrando...' : 'Entrar'}</button>
        </form>
        <p style={{ textAlign:'center', color:'#374151', fontSize:10, marginTop:20 }}>Acceso restringido · Solo usuarios autorizados</p>
      </div>
    </div>
  )
}
