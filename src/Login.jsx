import { useState } from 'react'
import { supabase } from './supabase'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    if (error) {
      setError('Correo o contraseña incorrectos')
    } else {
      onLogin(data.user)
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#F4F1ED',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'sans-serif'
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 40,
        width: 360, boxShadow: '0 4px 24px rgba(0,0,0,0.10)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img 
  src="/logo.jpg" 
  alt="Ahumados M&Y"
  style={{
    width: 100, height: 100, 
    objectFit: 'contain',
    margin: '0 auto 12px',
    display: 'block'
  }} 
/>
          <div style={{ fontSize: 20, fontWeight: 700 }}>ALIMENTOS VENCO M&Y</div>
          <div style={{ fontSize: 13, color: '#9A8E85', marginTop: 4 }}>Sistema ERP — Alimentos Cárnicos</div>
        </div>

        {error && (
          <div style={{
            background: '#FCEAEA', color: '#D2B48C', padding: '10px 14px',
            borderRadius: 7, fontSize: 13, marginBottom: 16
          }}>{error}</div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: '#9A8E85', display: 'block', marginBottom: 5 }}>
            CORREO
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            style={{
              width: '100%', padding: '9px 12px', border: '1px solid #DDD8CF',
              borderRadius: 7, fontSize: 13, outline: 'none',
              background: '#F4F1ED', boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: '#9A8E85', display: 'block', marginBottom: 5 }}>
            CONTRASEÑA
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{
              width: '100%', padding: '9px 12px', border: '1px solid #DDD8CF',
              borderRadius: 7, fontSize: 13, outline: 'none',
              background: '#F4F1ED', boxSizing: 'border-box'
            }}
          />
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%', padding: '11px', background: '#D2B48C',
            color: '#fff', border: 'none', borderRadius: 7,
            fontSize: 14, fontWeight: 600, cursor: 'pointer'
          }}
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </div>
    </div>
  )
}