import { useState } from 'react'
import { supabase } from './supabase'
import { PAL, readTheme } from './theme'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const P = PAL[readTheme()]

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error.message)
    setLoading(false)
  }

  const inp = { width:'100%', padding:'10px 14px', background:P.input, border:'1px solid '+P.l3, borderRadius:10, color:P.tx, fontSize:14, outline:'none', boxSizing:'border-box' }

  return (
    <div style={{ minHeight:'100vh', background:P.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui' }}>
      <div style={{ background:P.card, border:'1px solid '+P.l2, borderRadius:20, padding:40, width:360, maxWidth:'90%', boxShadow:P.shadow }}>
        <h1 style={{ margin:'0 0 6px', fontSize:24, fontWeight:800, fontStyle:'italic', background:`linear-gradient(135deg,${P.ac},${P.up})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', textAlign:'center' }}>JubilFolio</h1>
        <p style={{ textAlign:'center', color:P.t4, fontSize:12, margin:'0 0 28px' }}>Inicia sesión para acceder a tu cartera</p>
        <form onSubmit={handleLogin} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div><label style={{ fontSize:11, color:P.t3, display:'block', marginBottom:4 }}>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" style={inp} /></div>
          <div><label style={{ fontSize:11, color:P.t3, display:'block', marginBottom:4 }}>Contraseña</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required style={inp} /></div>
          {error && <div style={{ background:P.down+'1a', border:'1px solid '+P.down+'33', borderRadius:8, padding:'8px 12px', color:P.down, fontSize:12 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ background:`linear-gradient(135deg,${P.ac2},${P.ac3})`, border:'none', color:'#fff', padding:'12px 20px', borderRadius:10, cursor:loading?'wait':'pointer', fontWeight:700, fontSize:14, marginTop:6, opacity:loading?0.6:1 }}>{loading ? 'Entrando...' : 'Entrar'}</button>
        </form>
        <p style={{ textAlign:'center', color:P.t5, fontSize:10, marginTop:20 }}>Acceso restringido · Solo usuarios autorizados</p>
      </div>
    </div>
  )
}
