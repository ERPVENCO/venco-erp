// src/PanelGeneral.jsx
//
// Panel General (pantalla de bienvenida) — reemplaza los KPIs fijos en $0
// por datos reales, reutilizando las vistas que ya existen para Reportes.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { formatearMoneda, formatearNumero } from './reportes/formato'

export default function PanelGeneral() {
  const [datos, setDatos] = useState({ ventasHoy: 0, productos: 0, clientes: 0, stockCritico: 0 })
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true

    async function cargar() {
      const [ventasRes, productosRes, clientesRes, stockRes] = await Promise.all([
        supabase.from('vista_dashboard_ventas').select('total_dia').single(),
        supabase.from('productos').select('id', { count: 'exact', head: true }).eq('activo', true),
        supabase.from('clientes').select('id', { count: 'exact', head: true }),
        supabase.from('vista_dashboard_inventario_productos').select('id', { count: 'exact', head: true }).in('estado', ['bajo', 'agotado']),
      ])

      if (!activo) return
      setDatos({
        ventasHoy: ventasRes.data?.total_dia ?? 0,
        productos: productosRes.count ?? 0,
        clientes: clientesRes.count ?? 0,
        stockCritico: stockRes.count ?? 0,
      })
      setCargando(false)
    }

    cargar()
    return () => { activo = false }
  }, [])

  const kpis = [
    { label: 'Ventas hoy', value: cargando ? '...' : formatearMoneda(datos.ventasHoy), icon: '💰', color: '#1A9156' },
    { label: 'Productos', value: cargando ? '...' : formatearNumero(datos.productos), icon: '📦', color: '#1A5FA8' },
    { label: 'Clientes', value: cargando ? '...' : formatearNumero(datos.clientes), icon: '👥', color: '#6B3FA0' },
    { label: 'Stock crítico', value: cargando ? '...' : formatearNumero(datos.stockCritico), icon: '⚠️', color: '#B22222' },
  ]

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>¡Bienvenida! 👋</div>
      <div style={{ fontSize: 13, color: '#9A8E85', marginBottom: 28 }}>Panel de control — Ahumados M&Y</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 18, borderLeft: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 11, color: '#9A8E85', marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 20, marginTop: 4 }}>{k.icon}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
