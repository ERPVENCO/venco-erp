import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts'
import { supabase } from './supabase'

const C = {
  crema: '#FFF6DC', dorado: '#D9C46A', tarjeta: '#FFFACD', texto: '#2B2417',
  verde: '#00A651', rojo: '#E5252A', azul: '#2F6DB5', marca: '#B22222',
  cobrar: '#F4B183', pagar: '#9DC3E6', saldo: '#A9D18E',
}
const PIE = ['#2F6DB5', '#5B9BD5', '#00A651', '#ED7D31', '#A5A5A5', '#FFC000', '#7F6000', '#C55A9B']
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const $ = (v) => '$ ' + Math.round(v || 0).toLocaleString('es-CO')
const sum = (rows, k = 'monto') => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0)

// Para sumar un módulo nuevo: agregarlo aquí con sus secciones y crear su vista abajo.
const MODULOS = [
  { id: 'ventas', nombre: 'Ventas', desc: 'Productos, clientes y vendedores.', secciones: [] },
  { id: 'compras', nombre: 'Compras', desc: 'Proveedores y materia prima.', secciones: [] },
  {
    id: 'finanzas', nombre: 'Finanzas', desc: 'Caja, gastos y cartera.',
    secciones: [
      { id: 'flujo', nombre: 'Flujo mensual', desc: 'Ingresos contra egresos mes a mes.' },
      { id: 'categorias', nombre: 'Gastos por categoría', desc: 'En qué se va el dinero.' },
      { id: 'cartera', nombre: 'Cartera', desc: 'Lo que falta por cobrar y por pagar.' },
    ],
  },
  { id: 'inventario', nombre: 'Inventario', desc: 'Existencias y lotes.', secciones: [] },
  { id: 'produccion', nombre: 'Producción', desc: 'Batches, rendimiento y consumo.', secciones: [] },
  { id: 'calidad', nombre: 'Calidad', desc: 'Trazabilidad y mantenimiento.', secciones: [] },
]

/* ---------- datos ---------- */
function useDatos() {
  const [d, setD] = useState({ ing: [], egr: [], cxc: [], cxp: [], cargando: true })
  useEffect(() => {
    ;(async () => {
      const [a, b, c, e] = await Promise.all([
        supabase.from('ingresos').select('fecha,monto').range(0, 9999),
        supabase.from('egresos').select('fecha,monto,categoria').range(0, 9999),
        supabase.from('vista_cuentas_por_cobrar').select('saldo,vencida').range(0, 9999),
        supabase.from('vista_cuentas_por_pagar').select('saldo').range(0, 9999),
      ])
      setD({ ing: a.data || [], egr: b.data || [], cxc: c.data || [], cxp: e.data || [], cargando: false })
    })()
  }, [])
  return d
}

function useCalculos(d, anio, mes) {
  return useMemo(() => {
    const delAnio = (r) => (r.fecha || '').slice(0, 4) === String(anio)
    const ing = d.ing.filter(delAnio)
    const egr = d.egr.filter(delAnio)
    const porMes = MESES.map((m, i) => {
      const k = String(i + 1).padStart(2, '0')
      const I = sum(ing.filter((r) => r.fecha.slice(5, 7) === k))
      const E = sum(egr.filter((r) => r.fecha.slice(5, 7) === k))
      return { mes: m, Ingresos: I, Egresos: E, Saldo: I - E }
    })
    const enMes = (r) => mes === null || Number(r.fecha.slice(5, 7)) - 1 === mes
    const egrSel = egr.filter(enMes)
    const cat = {}
    egrSel.forEach((r) => {
      const n = r.categoria || 'Sin categoría'
      cat[n] = (cat[n] || 0) + (Number(r.monto) || 0)
    })
    const categorias = Object.entries(cat).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
    const totI = sum(ing.filter(enMes))
    const totE = sum(egrSel)
    return {
      porMes, categorias, totI, totE, saldo: totI - totE,
      cobrar: sum(d.cxc, 'saldo'), pagar: sum(d.cxp, 'saldo'),
      vencido: sum(d.cxc.filter((r) => r.vencida), 'saldo'),
    }
  }, [d, anio, mes])
}

/* ---------- piezas visuales ---------- */
const caja = { background: C.tarjeta, borderRadius: 14, boxShadow: '0 2px 6px rgba(80,60,0,.18)' }

function Kpi({ label, value, bg }) {
  return (
    <div style={{ ...caja, background: bg || C.tarjeta, padding: '14px 18px', flex: '1 1 170px', textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  )
}

function Grafica({ titulo, onClick, children, alto = 260 }) {
  return (
    <div
      onClick={onClick}
      title={onClick ? 'Clic para ver el reporte' : undefined}
      style={{ ...caja, background: '#fff', padding: 14, flex: '1 1 380px', cursor: onClick ? 'pointer' : 'default' }}
    >
      <div style={{ textAlign: 'center', fontWeight: 800, marginBottom: 6 }}>{titulo}</div>
      <div style={{ height: alto }}>
        <ResponsiveContainer>{children}</ResponsiveContainer>
      </div>
    </div>
  )
}

const GBarras = ({ data }) => (
  <BarChart data={data}>
    <CartesianGrid strokeDasharray="3 3" vertical={false} />
    <XAxis dataKey="mes" />
    <YAxis tickFormatter={(v) => (v / 1e6).toLocaleString('es-CO') + ' M'} />
    <Tooltip formatter={$} />
    <Legend />
    <Bar dataKey="Ingresos" fill={C.verde} radius={[4, 4, 0, 0]} />
    <Bar dataKey="Egresos" fill={C.rojo} radius={[4, 4, 0, 0]} />
  </BarChart>
)
const GSaldo = ({ data }) => (
  <LineChart data={data}>
    <CartesianGrid strokeDasharray="3 3" vertical={false} />
    <XAxis dataKey="mes" />
    <YAxis tickFormatter={(v) => (v / 1e6).toLocaleString('es-CO') + ' M'} />
    <Tooltip formatter={$} />
    <Line dataKey="Saldo" stroke={C.azul} strokeWidth={3} dot={{ r: 4 }} />
  </LineChart>
)
const GDona = ({ data }) => (
  <PieChart>
    <Pie data={data} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="80%" paddingAngle={2}>
      {data.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
    </Pie>
    <Tooltip formatter={$} />
    <Legend />
  </PieChart>
)

function Tabla({ cols, filas }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 10, overflow: 'hidden' }}>
      <thead>
        <tr>{cols.map((c) => <th key={c} style={{ background: C.dorado, padding: '8px 12px', textAlign: c === cols[0] ? 'left' : 'right' }}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i} style={{ borderTop: '1px solid #eee' }}>
            {f.map((v, j) => <td key={j} style={{ padding: '7px 12px', textAlign: j === 0 ? 'left' : 'right' }}>{v}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Banda({ titulo }) {
  return (
    <div style={{ background: C.dorado, border: '2px solid #fff', borderRadius: 6, padding: '10px 20px', textAlign: 'center', fontSize: 30, fontWeight: 900, letterSpacing: 1 }}>
      {titulo}
    </div>
  )
}

/* ---------- vistas de Finanzas ---------- */
function KpisFinanzas({ k }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <Kpi label="Ingresos" value={$(k.totI)} />
      <Kpi label="Egresos" value={$(k.totE)} />
      <Kpi label="Saldo del periodo" value={$(k.saldo)} bg={C.saldo} />
      <Kpi label="Cuentas por cobrar" value={$(k.cobrar)} bg={C.cobrar} />
      <Kpi label="Cuentas por pagar" value={$(k.pagar)} bg={C.pagar} />
    </div>
  )
}

function VistaFinanzas({ vista, k }) {
  if (vista === 'flujo')
    return (
      <>
        <Grafica titulo="Ingresos vs egresos" alto={300}><GBarras data={k.porMes} /></Grafica>
        <Tabla cols={['Mes', 'Ingresos', 'Egresos', 'Saldo']} filas={k.porMes.map((m) => [m.mes, $(m.Ingresos), $(m.Egresos), $(m.Saldo)])} />
      </>
    )
  if (vista === 'categorias')
    return (
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Grafica titulo="Distribución de egresos" alto={320}><GDona data={k.categorias} /></Grafica>
        <div style={{ flex: '1 1 340px' }}>
          <Tabla cols={['Categoría', 'Total']} filas={[...k.categorias.map((c) => [c.name, $(c.value)]), ['Total', $(k.totE)]]} />
        </div>
      </div>
    )
  if (vista === 'cartera')
    return (
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Kpi label="Por cobrar" value={$(k.cobrar)} bg={C.cobrar} />
        <Kpi label="Vencido por cobrar" value={$(k.vencido)} bg={C.rojo + '55'} />
        <Kpi label="Por pagar" value={$(k.pagar)} bg={C.pagar} />
        <Kpi label="Cartera neta" value={$(k.cobrar - k.pagar)} bg={C.saldo} />
      </div>
    )
  // dashboard final
  return (
    <>
      <KpisFinanzas k={k} />
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Grafica titulo="Ingresos vs egresos"><GBarras data={k.porMes} /></Grafica>
        <Grafica titulo="Saldo mensual"><GSaldo data={k.porMes} /></Grafica>
        <Grafica titulo="Egresos por categoría"><GDona data={k.categorias} /></Grafica>
      </div>
    </>
  )
}

/* ---------- módulo principal ---------- */
export default function Reportes() {
  const datos = useDatos()
  const [nav, setNav] = useState({ mod: null, vista: 'portada' })
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [mes, setMes] = useState(null)
  const k = useCalculos(datos, anio, mes)
  const ir = (mod, vista = 'portada') => setNav({ mod, vista })
  const mod = MODULOS.find((m) => m.id === nav.mod)

  const item = (activo) => ({
    padding: '10px 16px', cursor: 'pointer', fontWeight: 700, borderRadius: 8, marginBottom: 4,
    background: activo ? C.marca : 'transparent', color: activo ? '#fff' : C.texto,
  })

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.crema, color: C.texto, fontFamily: 'system-ui, sans-serif' }}>
      <aside style={{ width: 210, background: '#EFE3A6', padding: 14, flexShrink: 0 }}>
        <img src="/logo.jpg" alt="Ahumados M&Y" style={{ width: 90, display: 'block', margin: '0 auto 16px', borderRadius: 8 }} />
        <div style={item(!mod)} onClick={() => ir(null)}>Inicio</div>
        {MODULOS.map((m) => (
          <div key={m.id} style={item(nav.mod === m.id)} onClick={() => ir(m.id)}>{m.nombre}</div>
        ))}
      </aside>

      <main style={{ flex: 1, padding: 18, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        <Banda titulo={mod ? mod.nombre.toUpperCase() : 'REPORTES'} />

        {/* filtros globales */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ padding: 6, borderRadius: 6 }}>
            {[0, 1, 2].map((i) => { const y = new Date().getFullYear() - i; return <option key={y}>{y}</option> })}
          </select>
          {[null, ...MESES.keys()].map((i) => (
            <button key={String(i)} onClick={() => setMes(i)} style={{
              border: 'none', borderRadius: 12, padding: '4px 12px', cursor: 'pointer', fontWeight: 700,
              background: mes === i ? C.marca : C.dorado, color: mes === i ? '#fff' : C.texto,
            }}>{i === null ? 'Todo' : MESES[i]}</button>
          ))}
        </div>

        {datos.cargando && <div>Cargando datos…</div>}

        {/* INICIO */}
        {!mod && (
          <>
            <KpisFinanzas k={k} />
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <Grafica titulo="Ingresos vs egresos" onClick={() => ir('finanzas', 'flujo')}><GBarras data={k.porMes} /></Grafica>
              <Grafica titulo="Saldo mensual" onClick={() => ir('finanzas', 'dashboard')}><GSaldo data={k.porMes} /></Grafica>
              <Grafica titulo="Egresos por categoría" onClick={() => ir('finanzas', 'categorias')}><GDona data={k.categorias} /></Grafica>
            </div>
          </>
        )}

        {/* MÓDULO: submenú + vistas */}
        {mod && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[{ id: 'portada', nombre: 'Portada' }, ...mod.secciones, { id: 'dashboard', nombre: 'Dashboard final' }].map((s) => (
                <button key={s.id} onClick={() => ir(mod.id, s.id)} style={{
                  border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 700,
                  background: nav.vista === s.id ? C.marca : C.dorado, color: nav.vista === s.id ? '#fff' : C.texto,
                }}>{s.nombre}</button>
              ))}
            </div>

            {nav.vista === 'portada' && (
              <div style={{ ...caja, padding: 28 }}>
                <h2 style={{ margin: 0 }}>{mod.nombre}</h2>
                <p style={{ marginTop: 6 }}>{mod.desc}</p>
                {mod.secciones.length === 0 ? (
                  <p style={{ fontWeight: 700 }}>Este módulo se construye en la siguiente fase.</p>
                ) : (
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
                    {[...mod.secciones, { id: 'dashboard', nombre: 'Dashboard final', desc: 'Resumen de todo el módulo.' }].map((s) => (
                      <div key={s.id} onClick={() => ir(mod.id, s.id)} style={{ ...caja, background: '#fff', padding: 16, width: 210, cursor: 'pointer' }}>
                        <div style={{ fontWeight: 800 }}>{s.nombre}</div>
                        <div style={{ fontSize: 13, marginTop: 4 }}>{s.desc}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {nav.vista !== 'portada' && mod.id === 'finanzas' && <VistaFinanzas vista={nav.vista} k={k} />}
          </>
        )}
      </main>
    </div>
  )
}
