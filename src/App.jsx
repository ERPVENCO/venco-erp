import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import Inventario from './Inventario'
import MateriaPrima from './MateriaPrima'
import ProductoTerminado from './ProductoTerminado'
import Login from './Login'

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modulo, setModulo] = useState('dashboard')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', background: '#F4F1ED' }}>
      <div style={{ fontSize: 14, color: '#9A8E85' }}>Cargando...</div>
    </div>
  )

  if (!user) return <Login onLogin={setUser} />

  const menu = [
    { id: 'dashboard', nombre: 'Panel General', icon: '▦' },
    { separador: 'INVENTARIO' },
    { id: 'materia_prima', nombre: 'Materia Prima', icon: '🧂' },
    { id: 'producto_terminado', nombre: 'Producto Terminado', icon: '🌭' },
    { separador: 'VENTAS' },
    { id: 'ventas', nombre: 'Ventas', icon: '🛒' },
    { id: 'clientes', nombre: 'Clientes', icon: '👥' },
    { separador: 'OPERACIONES' },
    { id: 'manufactura', nombre: 'Manufactura', icon: '🏭' },
    { id: 'compras', nombre: 'Compras', icon: '🚛' },
    { separador: 'FINANZAS' },
    { id: 'finanzas', nombre: 'Finanzas', icon: '💰' },
    { id: 'empleados', nombre: 'Empleados', icon: '👤' },
    { separador: 'REPORTES' },
    { id: 'reportes', nombre: 'Reportes', icon: '📊' },
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'sans-serif', background: '#F4F1ED' }}>

      {/* Sidebar */}
      <div style={{ width: 220, background: '#130D09', display: 'flex', flexDirection: 'column', position: 'fixed', height: '100vh', overflowY: 'auto' }}>
        <div style={{ padding: '22px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <img src="/logo.jpg" alt="logo" style={{ width: 60, objectFit: 'contain', marginBottom: 10 }} />
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>Ahumados M&Y</div>
          <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>Sistema ERP</div>
        </div>

        <nav style={{ padding: '12px 10px', flex: 1 }}>
          {menu.map((item, i) => item.separador ? (
            <div key={i} style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9.5, letterSpacing: '0.12em', padding: '14px 10px 5px', fontWeight: 500 }}>
              {item.separador}
            </div>
          ) : (
            <div key={item.id}
              onClick={() => setModulo(item.id)}
              style={{
                padding: '9px 12px', borderRadius: 7,
                color: modulo === item.id ? '#fff' : 'rgba(255,255,255,0.5)',
                background: modulo === item.id ? '#B22222' : 'none',
                fontSize: 13, cursor: 'pointer', marginBottom: 2,
                display: 'flex', alignItems: 'center', gap: 8,
                transition: 'all 0.15s'
              }}
            >
              <span>{item.icon}</span> {item.nombre}
            </div>
          ))}
        </nav>

        <div style={{ padding: '12px 10px 18px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: 7 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#B22222', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>
              {user.email[0].toUpperCase()}
            </div>
            <div>
              <div style={{ color: '#fff', fontSize: 11 }}>{user.email}</div>
              <div onClick={() => supabase.auth.signOut()} style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, cursor: 'pointer' }}>
                Cerrar sesión
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div style={{ marginLeft: 220, flex: 1, padding: 28 }}>

        {modulo === 'dashboard' && (
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>¡Bienvenida! 👋</div>
            <div style={{ fontSize: 13, color: '#9A8E85', marginBottom: 28 }}>Panel de control — Ahumados M&Y</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
              {[
                { label: 'Ventas hoy', value: '$0', icon: '💰', color: '#1A9156' },
                { label: 'Productos', value: '0', icon: '📦', color: '#1A5FA8' },
                { label: 'Clientes', value: '0', icon: '👥', color: '#6B3FA0' },
                { label: 'Stock crítico', value: '0', icon: '⚠️', color: '#B22222' },
              ].map(k => (
                <div key={k.label} style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 18, borderLeft: `3px solid ${k.color}` }}>
                  <div style={{ fontSize: 11, color: '#9A8E85', marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: k.color }}>{k.value}</div>
                  <div style={{ fontSize: 20, marginTop: 4 }}>{k.icon}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {modulo === 'materia_prima' && <MateriaPrima />}
        {modulo === 'producto_terminado' && <ProductoTerminado />}
        {modulo === 'ventas' && <div style={{ fontSize: 20, fontWeight: 700 }}>🛒 Ventas — próximamente</div>}
        {modulo === 'clientes' && <div style={{ fontSize: 20, fontWeight: 700 }}>👥 Clientes — próximamente</div>}
        {modulo === 'manufactura' && <div style={{ fontSize: 20, fontWeight: 700 }}>🏭 Manufactura — próximamente</div>}
        {modulo === 'compras' && <div style={{ fontSize: 20, fontWeight: 700 }}>🚛 Compras — próximamente</div>}
        {modulo === 'finanzas' && <div style={{ fontSize: 20, fontWeight: 700 }}>💰 Finanzas — próximamente</div>}
        {modulo === 'empleados' && <div style={{ fontSize: 20, fontWeight: 700 }}>👤 Empleados — próximamente</div>}
        {modulo === 'reportes' && <div style={{ fontSize: 20, fontWeight: 700 }}>📊 Reportes — próximamente</div>}

      </div>
    </div>
  )
}