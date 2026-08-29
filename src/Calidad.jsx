import { useState, useEffect } from 'react'
import { supabase } from './supabase'

const EMPRESA = { nombre: 'ALIMENTOS VENCO M&Y', logo: '/logo.jpg' }

export default function Calidad() {
  const [submodulo, setSubmodulo] = useState('menu')
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>🔬 Calidad</div>
      {submodulo === 'menu' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <div onClick={() => setSubmodulo('recepcion_mp')}
            style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 10, padding: 24, cursor: 'pointer', borderLeft: '4px solid #B22222' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Formato de recepción de materia prima</div>
            <div style={{ fontSize: 12, color: '#9A8E85' }}>Control y trazabilidad de materias primas recibidas</div>
          </div>
          <div onClick={() => setSubmodulo('produccion_diaria')}
            style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 10, padding: 24, cursor: 'pointer', borderLeft: '4px solid #B22222' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⚙️</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Reporte de producción diario</div>
            <div style={{ fontSize: 12, color: '#9A8E85' }}>Balance, rendimiento y trazabilidad de la producción del día</div>
          </div>
          <div onClick={() => setSubmodulo('trazabilidad_despacho')}
            style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 10, padding: 24, cursor: 'pointer', borderLeft: '4px solid #B22222' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🚚</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Guía de trazabilidad de despacho y transporte</div>
            <div style={{ fontSize: 12, color: '#9A8E85' }}>Control de lotes, temperaturas y transporte en la salida de producto</div>
          </div>
          <div onClick={() => setSubmodulo('plantilla_mantenimiento')}
            style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 10, padding: 24, cursor: 'pointer', borderLeft: '4px solid #B22222' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🔧</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Plantilla de mantenimiento</div>
            <div style={{ fontSize: 12, color: '#9A8E85' }}>Registro de mantenimiento de equipos exigido por INVIMA</div>
          </div>
        </div>
      )}
      {submodulo === 'recepcion_mp' && <FormatoRecepcion onVolver={() => setSubmodulo('menu')} />}
      {submodulo === 'produccion_diaria' && <ReporteProduccionDiario onVolver={() => setSubmodulo('menu')} />}
      {submodulo === 'trazabilidad_despacho' && <GuiaTrazabilidadDespacho onVolver={() => setSubmodulo('menu')} />}
      {submodulo === 'plantilla_mantenimiento' && <PlantillaMantenimiento onVolver={() => setSubmodulo('menu')} />}
    </div>
  )
}

function FormatoRecepcion({ onVolver }) {
  const [registros, setRegistros] = useState([])
  const [itemsMap, setItemsMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)

    const { data: traz } = await supabase
      .from('trazabilidad_recepcion')
      .select('*, compras(folio, factura_proveedor, lote_proveedor, proveedor_nombre, creado_en)')
      .order('creado_en', { ascending: true })

    if (traz && traz.length > 0) {
      const ids = traz.map(r => r.compra_item_id).filter(Boolean)
      if (ids.length > 0) {
        const { data: citems } = await supabase
          .from('compra_items')
          .select('id, cantidad, unidad, codigo_lote')
          .in('id', ids)
        const map = {}
        ;(citems || []).forEach(ci => { map[ci.id] = ci })
        setItemsMap(map)
      }
    }

    setRegistros(traz || [])
    setLoading(false)
  }

  const imprimir = () => {
    const contenido = document.getElementById('formato-recepcion').innerHTML
    const ventana = window.open('', '_blank')
    ventana.document.write(`
      <html><head><title>Control de Materias Primas en Recepción</title>
      <style>
        @page { size: letter landscape; margin: 6mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 7px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #444; padding: 2px 3px; text-align: center; vertical-align: middle; }
        th { background: #ffffff !important; color: #000000 !important; font-weight: 700; font-size: 6.5px; }
        img { max-width: 55px; max-height: 35px; object-fit: contain; }
      </style></head>
      <body>${contenido}</body></html>
    `)
    ventana.document.close()
    ventana.focus()
    setTimeout(() => { ventana.print(); ventana.close() }, 500)
  }

  const fmt = (iso) => {
    if (!iso) return ''
    const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bogota' })
  }

  const fmtHora = (iso) => {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })
  }

  const checkInsp = (val) => {
    if (val === 'cumple') return '✓'
    if (val === 'no_cumple') return 'X'
    if (val === 'na') return 'NA'
    return ''
  }

  const checkCalidad = (val) => {
    if (val === true) return '✓'
    if (val === false) return 'X'
    return ''
  }

  const filasVacias = Math.max(0, 20 - registros.length)

  const thS = { background: '#ffffff', color: '#000000', padding: '4px 3px', fontSize: 8, fontWeight: 700, border: '1px solid #333', textAlign: 'center', verticalAlign: 'middle' }
  const tdS = { padding: '4px 3px', border: '1px solid #aaa', fontSize: 8, textAlign: 'center', verticalAlign: 'middle' }
  const tdV = { ...tdS, height: 20 }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'center' }}>
        <button onClick={onVolver} style={{ background: '#F4F1ED', border: '1px solid #DDD8CF', borderRadius: 7, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}>← Volver</button>
        <button onClick={imprimir} style={{ background: '#1A5FA8', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🖨️ Imprimir formato</button>
        <button onClick={cargar} style={{ background: '#E8F7EF', color: '#1A9156', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🔄 Actualizar</button>
        {loading && <span style={{ fontSize: 12, color: '#9A8E85' }}>Cargando...</span>}
      </div>

      <div id="formato-recepcion" style={{ background: '#fff', padding: 14, borderRadius: 8, border: '1px solid #DDD8CF', overflowX: 'auto' }}>

        {/* ENCABEZADO */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 5 }}>
          <tbody>
            <tr>
              <td style={{ width: '20%', background: '#ffffff', border: '2px solid #222', padding: '8px 6px', textAlign: 'center', verticalAlign: 'middle' }}>
                <img src={EMPRESA.logo} alt="Logo" style={{ width: 55, height: 38, objectFit: 'contain', display: 'block', margin: '0 auto 5px' }} />
                <div style={{ color: '#000000', fontWeight: 700, fontSize: 9 }}>{EMPRESA.nombre}</div>
              </td>
              <td style={{ background: '#ffffff', border: '2px solid #222', padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                <div style={{ color: '#000000', fontWeight: 700, fontSize: 12 }}>CONTROL DE MATERIAS PRIMAS EN RECEPCIÓN</div>
              </td>
              <td style={{ width: '18%', background: '#ffffff', border: '2px solid #222', padding: '8px 6px', textAlign: 'center', verticalAlign: 'middle' }}>
                <div style={{ color: '#000000', fontWeight: 700, fontSize: 9, marginBottom: 3 }}>CONTROL DE PROVEEDORES</div>
                <div style={{ color: '#2c2b2b', fontSize: 8 }}>VERSIÓN: 1</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* TABLA PRINCIPAL */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 8 }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ ...thS, width: '4.5%' }}>FECHA</th>
              <th rowSpan={2} style={{ ...thS, width: '3.5%' }}>HORA</th>
              <th rowSpan={2} style={{ ...thS, width: '7%' }}>MATERIA PRIMA</th>
              <th rowSpan={2} style={{ ...thS, width: '5.5%' }}>Nº LOTE</th>
              <th rowSpan={2} style={{ ...thS, width: '5.5%' }}>LOTE PROVEEDOR</th>
              <th rowSpan={2} style={{ ...thS, width: '5.5%' }}>N° FACTURA</th>
              <th rowSpan={2} style={{ ...thS, width: '7%' }}>PROVEEDOR</th>
              <th colSpan={4} style={{ ...thS }}>INSPECCIÓN TRANSPORTE</th>
              <th colSpan={3} style={{ ...thS }}>CARACTERÍSTICAS DE CALIDAD</th>
              <th rowSpan={2} style={{ ...thS, width: '5%' }}>FECHA VENC.</th>
              <th rowSpan={2} style={{ ...thS, width: '4.5%' }}>PESO</th>
              <th rowSpan={2} style={{ ...thS, width: '4.5%' }}>N° UNIDADES</th>
              <th rowSpan={2} style={{ ...thS, width: '6%' }}>RESPONSABLE</th>
            </tr>
            <tr>
              <th style={{ ...thS, fontSize: 7 }}>Vehículo limpio</th>
              <th style={{ ...thS, fontSize: 7 }}>Libre de plagas</th>
              <th style={{ ...thS, fontSize: 7 }}>Temperatura</th>
              <th style={{ ...thS, fontSize: 7 }}>N° placa</th>
              <th style={{ ...thS, fontSize: 7 }}>Cumple especif.</th>
              <th style={{ ...thS, fontSize: 7 }}>Temperatura</th>
              <th style={{ ...thS, fontSize: 7 }}>Empaque</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r, i) => {
              const c = r.compras || {}
              const it = itemsMap[r.compra_item_id] || {}
              return (
                <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={tdS}>{fmt(c.creado_en)}</td>
                  <td style={tdS}>{r.hora_recepcion ? r.hora_recepcion.slice(0, 5) : fmtHora(c.creado_en)}</td>
                  <td style={{ ...tdS, textAlign: 'left', fontWeight: 500 }}>{r.nombre_producto}</td>
                  <td style={{ ...tdS, fontSize: 7, color: '#1A5FA8', fontWeight: 600 }}>{it.codigo_lote || '—'}</td>
                  <td style={tdS}>{r.lote_proveedor || c.lote_proveedor || '—'}</td>
                  <td style={tdS}>{c.factura_proveedor || '—'}</td>
                  <td style={{ ...tdS, textAlign: 'left' }}>{c.proveedor_nombre || '—'}</td>
                  <td style={tdS}>{checkInsp(r.vehiculo_limpio)}</td>
                  <td style={tdS}>{checkInsp(r.libre_plagas)}</td>
                  <td style={tdS}>{r.temperatura_transporte != null ? `${r.temperatura_transporte}°C` : ''}</td>
                  <td style={tdS}>{r.numero_placa || ''}</td>
                  <td style={tdS}>{checkCalidad(r.cumple_especificaciones)}</td>
                  <td style={tdS}>{r.temperatura_recepcion != null ? `${r.temperatura_recepcion}°C` : ''}</td>
                  <td style={tdS}>{r.estado_empaque || ''}</td>
                  <td style={tdS}>{fmt(r.fecha_vencimiento)}</td>
                  <td style={tdS}>{it.cantidad ? `${it.cantidad} ${it.unidad || ''}` : ''}</td>
                  <td style={tdS}>{r.numero_unidades || ''}</td>
                  <td style={{ ...tdS, textAlign: 'left' }}>{r.responsable || ''}</td>
                </tr>
              )
            })}
            {Array.from({ length: filasVacias }).map((_, i) => (
              <tr key={`e-${i}`}>{Array.from({ length: 18 }).map((_, j) => <td key={j} style={tdV}></td>)}</tr>
            ))}
          </tbody>
        </table>

        {/* OBSERVACIONES */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
          <tbody>
            <tr>
              <td style={{ border: '1px solid #444', padding: '5px 8px' }}>
                <div style={{ fontWeight: 700, fontSize: 9, marginBottom: 3 }}>OBSERVACIONES:</div>
                <div style={{ minHeight: 40 }}></div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* FIRMAS */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
          <tbody>
            <tr>
              {['ELABORADO POR:', 'REVISADO POR:', 'APROBADO POR:'].map(firma => (
                <td key={firma} style={{ border: '1px solid #444', padding: '8px 12px', width: '33%' }}>
                  <div style={{ fontSize: 8.5, fontWeight: 700, marginBottom: 16 }}>{firma}</div>
                  <div style={{ borderTop: '1px solid #444', paddingTop: 3, fontSize: 8, color: '#555' }}>Nombre y firma &nbsp;&nbsp; FECHA: ___________</div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// REPORTE DE PRODUCCIÓN DIARIO
// ─────────────────────────────────────────────
function ReporteProduccionDiario({ onVolver }) {
  const hoyISO = () => new Date().toISOString().split('T')[0]
  const [fecha, setFecha] = useState(hoyISO())
  const [filas, setFilas] = useState([])
  const [mezclas, setMezclas] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { cargar() }, [fecha])

  const cargar = async () => {
    setLoading(true)

    const { data: producciones } = await supabase
      .from('producciones')
      .select('*')
      .eq('fecha_produccion', fecha)
      .order('creado_en', { ascending: true })

    const filasCalc = []
    const mezclasCalc = []

    for (const prod of producciones || []) {
      if (prod.batch_nombre) {
        mezclasCalc.push({
          folio: prod.folio, batch_nombre: prod.batch_nombre, batch_lote: prod.batch_lote,
          cantidad_batch: prod.cantidad_batch, costo_batch_total: prod.costo_batch_total
        })
      }

      const { data: grupos } = await supabase.from('produccion_grupos').select('*').eq('produccion_id', prod.id)

      for (const g of grupos || []) {
        const { data: items } = await supabase.from('produccion_items').select('*').eq('grupo_id', g.id)
        const totalProducido = (items || []).reduce((s, it) => s + (parseFloat(it.cantidad_producida) || 0), 0)
        const rendimiento = g.cantidad_procesada > 0 ? (totalProducido / g.cantidad_procesada) * 100 : 0

        for (let idx = 0; idx < (items || []).length; idx++) {
          const it = items[idx]
          const { data: lotesUsados } = await supabase.from('produccion_lotes_mp').select('*').eq('produccion_item_id', it.id)
          const loteMpTexto = (lotesUsados || [])
            .map(l => `${l.codigo_lote} (${l.cantidad_usada} ${l.unidad})`)
            .join(', ')

          filasCalc.push({
            folio: prod.folio,
            operario: prod.operario,
            cantidad_procesada: idx === 0 ? g.cantidad_procesada : null,
            unidad_mp: g.unidad_mp,
            lote_mp: loteMpTexto,
            producto_nombre: it.nombre_producto,
            cantidad_producida: it.cantidad_producida,
            unidad_producto: it.unidad_producto,
            lote_producto: it.lote_producto,
            recorte: idx === 0 ? g.cantidad_recorte : null,
            sobrante: idx === 0 ? g.cantidad_sobrante : null,
            merma: idx === 0 ? g.merma : null,
            rendimiento: idx === 0 ? rendimiento : null,
            rowSpanGrupo: idx === 0 ? (items || []).length : 0
          })
        }
      }
    }

    setFilas(filasCalc)
    setMezclas(mezclasCalc)
    setLoading(false)
  }

  const imprimir = () => {
    const contenido = document.getElementById('reporte-produccion').innerHTML
    const ventana = window.open('', '_blank')
    ventana.document.write(`
      <html><head><title>Reporte de Producción Diario</title>
      <style>
        @page { size: letter landscape; margin: 8mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 8px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #444; padding: 3px 4px; text-align: center; vertical-align: middle; }
        th { background: #ffffff !important; color: #000000 !important; font-weight: 700; font-size: 7.5px; }
        img { max-width: 55px; max-height: 35px; object-fit: contain; }
      </style></head>
      <body>${contenido}</body></html>
    `)
    ventana.document.close()
    ventana.focus()
    setTimeout(() => { ventana.print(); ventana.close() }, 500)
  }

  const fmtFecha = (iso) => {
    if (!iso) return ''
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bogota' })
  }

  const thS = { background: '#ffffff', color: '#000000', padding: '5px 4px', fontSize: 9, fontWeight: 700, border: '1px solid #333', textAlign: 'center', verticalAlign: 'middle' }
  const tdS = { padding: '5px 4px', border: '1px solid #aaa', fontSize: 9, textAlign: 'center', verticalAlign: 'middle' }

  const inp = { padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, background: '#F4F1ED' }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={onVolver} style={{ background: '#F4F1ED', border: '1px solid #DDD8CF', borderRadius: 7, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}>← Volver</button>
        <label style={{ fontSize: 12, color: '#9A8E85', fontWeight: 600 }}>FECHA:</label>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inp} />
        <button onClick={imprimir} style={{ background: '#1A5FA8', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🖨️ Imprimir reporte</button>
        <button onClick={cargar} style={{ background: '#E8F7EF', color: '#1A9156', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🔄 Actualizar</button>
        {loading && <span style={{ fontSize: 12, color: '#9A8E85' }}>Cargando...</span>}
      </div>

      <div id="reporte-produccion" style={{ background: '#fff', padding: 14, borderRadius: 8, border: '1px solid #DDD8CF', overflowX: 'auto' }}>

        {/* ENCABEZADO */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
          <tbody>
            <tr>
              <td style={{ width: '20%', background: '#ffffff', border: '2px solid #222', padding: '8px 6px', textAlign: 'center', verticalAlign: 'middle' }}>
                <img src={EMPRESA.logo} alt="Logo" style={{ width: 55, height: 38, objectFit: 'contain', display: 'block', margin: '0 auto 5px' }} />
                <div style={{ color: '#000000', fontWeight: 700, fontSize: 9 }}>{EMPRESA.nombre}</div>
              </td>
              <td style={{ background: '#ffffff', border: '2px solid #222', padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                <div style={{ color: '#000000', fontWeight: 700, fontSize: 12 }}>REPORTE DE PRODUCCIÓN DIARIO</div>
              </td>
              <td style={{ width: '18%', background: '#ffffff', border: '2px solid #222', padding: '8px 6px', textAlign: 'center', verticalAlign: 'middle' }}>
                <div style={{ color: '#000000', fontWeight: 700, fontSize: 9, marginBottom: 3 }}>FECHA</div>
                <div style={{ color: '#2c2b2b', fontSize: 9 }}>{fmtFecha(fecha)}</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* TABLA PRINCIPAL: balance por materia prima procesada / producto */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, marginBottom: 10 }}>
          <thead>
            <tr>
              <th style={{ ...thS, width: '7%' }}>FOLIO</th>
              <th style={{ ...thS, width: '9%' }}>OPERARIO</th>
              <th style={{ ...thS, width: '9%' }}>MAT. PRIMA PROCESADA</th>
              <th style={{ ...thS, width: '10%' }}>LOTE(S) MAT. PRIMA</th>
              <th style={{ ...thS, width: '15%' }}>PRODUCTO</th>
              <th style={{ ...thS, width: '8%' }}>LOTE PT</th>
              <th style={{ ...thS, width: '8%' }}>CANT. PRODUCIDA</th>
              <th style={{ ...thS, width: '7%' }}>RECORTE</th>
              <th style={{ ...thS, width: '7%' }}>SOBRANTE</th>
              <th style={{ ...thS, width: '7%' }}>MERMA</th>
              <th style={{ ...thS, width: '8%' }}>RENDIMIENTO</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && !loading && (
              <tr><td colSpan={11} style={{ ...tdS, padding: 16, color: '#9A8E85' }}>No hay producción registrada para esta fecha</td></tr>
            )}
            {filas.map((f, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{ ...tdS, fontFamily: 'monospace', fontWeight: 600, color: '#B22222' }}>{f.folio}</td>
                <td style={tdS}>{f.operario || '—'}</td>
                <td style={tdS}>{f.cantidad_procesada != null ? `${f.cantidad_procesada} ${f.unidad_mp}` : ''}</td>
                <td style={{ ...tdS, fontSize: 8, fontFamily: 'monospace', color: '#1A5FA8' }}>{f.lote_mp}</td>
                <td style={{ ...tdS, textAlign: 'left', fontWeight: 500 }}>{f.producto_nombre}</td>
                <td style={{ ...tdS, fontFamily: 'monospace', color: '#1A5FA8', fontWeight: 600 }}>{f.lote_producto}</td>
                <td style={tdS}>{f.cantidad_producida} {f.unidad_producto}</td>
                <td style={tdS}>{f.recorte != null ? `${f.recorte} ${f.unidad_mp}` : ''}</td>
                <td style={tdS}>{f.sobrante != null ? `${f.sobrante} ${f.unidad_mp}` : ''}</td>
                <td style={tdS}>{f.merma != null ? `${f.merma} ${f.unidad_mp}` : ''}</td>
                <td style={{ ...tdS, fontWeight: 700, color: f.rendimiento != null ? '#1A9156' : undefined }}>{f.rendimiento != null ? `${f.rendimiento.toFixed(1)}%` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* MEZCLAS DE HUMO USADAS EN EL DÍA */}
        {mezclas.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, marginBottom: 10 }}>
            <thead>
              <tr>
                <th style={thS}>FOLIO</th>
                <th style={thS}>MEZCLA DE HUMO</th>
                <th style={thS}>LOTE</th>
                <th style={thS}>CANTIDAD (KG)</th>
                <th style={thS}>COSTO TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {mezclas.map((m, i) => (
                <tr key={i}>
                  <td style={{ ...tdS, fontFamily: 'monospace', fontWeight: 600, color: '#B22222' }}>{m.folio}</td>
                  <td style={tdS}>{m.batch_nombre}</td>
                  <td style={{ ...tdS, fontFamily: 'monospace', color: '#1A5FA8' }}>{m.batch_lote}</td>
                  <td style={tdS}>{m.cantidad_batch} kg</td>
                  <td style={tdS}>${Number(m.costo_batch_total).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* OBSERVACIONES */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
          <tbody>
            <tr>
              <td style={{ border: '1px solid #444', padding: '5px 8px' }}>
                <div style={{ fontWeight: 700, fontSize: 9, marginBottom: 3 }}>OBSERVACIONES:</div>
                <div style={{ minHeight: 40 }}></div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* FIRMAS */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
          <tbody>
            <tr>
              {['ELABORADO POR:', 'REVISADO POR:', 'APROBADO POR:'].map(firma => (
                <td key={firma} style={{ border: '1px solid #444', padding: '8px 12px', width: '33%' }}>
                  <div style={{ fontSize: 8.5, fontWeight: 700, marginBottom: 16 }}>{firma}</div>
                  <div style={{ borderTop: '1px solid #444', paddingTop: 3, fontSize: 8, color: '#555' }}>Nombre y firma &nbsp;&nbsp; FECHA: ___________</div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// GUÍA DE TRAZABILIDAD DE DESPACHO Y TRANSPORTE
// ─────────────────────────────────────────────
function GuiaTrazabilidadDespacho({ onVolver }) {
  const hoyISO = () => new Date().toISOString().split('T')[0]
  const [fecha, setFecha] = useState(hoyISO())
  const [guias, setGuias] = useState([]) // una guía por despacho, cada una con su lista de items
  const [loading, setLoading] = useState(true)

  useEffect(() => { cargar() }, [fecha])

  const cargar = async () => {
    setLoading(true)

    const { data: despachos } = await supabase.from('trazabilidad_despacho').select('*')
    const despachosDelDia = (despachos || []).filter(d => {
      if (!d.fecha_hora_salida) return false
      return d.fecha_hora_salida.slice(0, 10) === fecha
    })

    const guiasCalc = []

    for (const d of despachosDelDia) {
      const { data: venta } = await supabase.from('ventas').select('*').eq('id', d.venta_id).single()
      if (!venta) continue

      const { data: itemsVenta } = await supabase.from('venta_items').select('*').eq('venta_id', venta.id)
      const filasItems = []

      for (const item of itemsVenta || []) {
        const { data: lotesItem } = await supabase.from('venta_item_lotes').select('*').eq('venta_item_id', item.id)

        for (const li of (lotesItem && lotesItem.length > 0 ? lotesItem : [{ codigo_lote: '—', cantidad_usada: item.cantidad }])) {
          let fechaVencimiento = ''
          if (li.lote_id) {
            const { data: lote } = await supabase.from('lotes').select('fecha_vencimiento').eq('id', li.lote_id).single()
            fechaVencimiento = lote?.fecha_vencimiento || ''
          }

          filasItems.push({
            lote: li.codigo_lote,
            producto: item.nombre_producto,
            cantidad: li.cantidad_usada,
            unidad: item.unidad,
            fecha_vencimiento: fechaVencimiento,
            temp_producto: d.temperatura_producto
          })
        }
      }

      guiasCalc.push({
        folio_guia: d.folio || '—',
        folio: venta.tipo === 'remision' ? `Pendiente (Rem. ${venta.folio})` : venta.folio,
        cliente: venta.cliente_nombre,
        destino: [d.destino_direccion, d.destino_ciudad].filter(Boolean).join(', '),
        fecha_hora_salida: d.fecha_hora_salida,
        temp_producto: d.temperatura_producto,
        temp_vehiculo: d.temperatura_vehiculo,
        transportador: d.transportador,
        placa: d.placa_vehiculo,
        observaciones: d.observaciones,
        responsable: d.responsable_despacho,
        firma_transportador: d.firma_transportador,
        items: filasItems
      })
    }

    setGuias(guiasCalc)
    setLoading(false)
  }

  const imprimir = () => {
    const contenido = document.getElementById('guia-trazabilidad').innerHTML
    const ventana = window.open('', '_blank')
    ventana.document.write(`
      <html><head><title>Guía de Trazabilidad de Despacho y Transporte</title>
      <style>
        @page { size: letter landscape; margin: 8mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 8px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #444; padding: 3px 4px; text-align: center; vertical-align: middle; }
        th { background: #ffffff !important; color: #000000 !important; font-weight: 700; font-size: 7.5px; }
        img { max-width: 55px; max-height: 35px; object-fit: contain; }
        .guia { page-break-inside: avoid; margin-bottom: 14px; }
      </style></head>
      <body>${contenido}</body></html>
    `)
    ventana.document.close()
    ventana.focus()
    setTimeout(() => { ventana.print(); ventana.close() }, 500)
  }

  const fmtHora = (iso) => {
    if (!iso) return ''
    return new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })
  }

  const fmtFechaCorta = (iso) => {
    if (!iso) return ''
    const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bogota' })
  }

  const thS = { background: '#ffffff', color: '#000000', padding: '5px 4px', fontSize: 9, fontWeight: 700, border: '1px solid #333', textAlign: 'center', verticalAlign: 'middle' }
  const tdS = { padding: '5px 4px', border: '1px solid #aaa', fontSize: 9, textAlign: 'center', verticalAlign: 'middle' }

  const inp = { padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, background: '#F4F1ED' }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={onVolver} style={{ background: '#F4F1ED', border: '1px solid #DDD8CF', borderRadius: 7, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}>← Volver</button>
        <label style={{ fontSize: 12, color: '#9A8E85', fontWeight: 600 }}>FECHA:</label>
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inp} />
        <button onClick={imprimir} style={{ background: '#1A5FA8', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🖨️ Imprimir guía(s)</button>
        <button onClick={cargar} style={{ background: '#E8F7EF', color: '#1A9156', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🔄 Actualizar</button>
        {loading && <span style={{ fontSize: 12, color: '#9A8E85' }}>Cargando...</span>}
      </div>

      <div id="guia-trazabilidad">
        {guias.length === 0 && !loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF' }}>
            No hay despachos registrados para esta fecha
          </div>
        )}

        {guias.map((g, gi) => (
          <div key={gi} className="guia" style={{ background: '#fff', padding: 14, borderRadius: 8, border: '1px solid #DDD8CF', overflowX: 'auto', marginBottom: 20 }}>

            {/* ENCABEZADO: empresa + título + folio/factura */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 5 }}>
              <tbody>
                <tr>
                  <td style={{ width: '12%', background: '#ffffff', border: '2px solid #222', padding: '4px', textAlign: 'center', verticalAlign: 'middle' }}>
                    <img src={EMPRESA.logo} alt="Logo" style={{ width: 36, height: 26, objectFit: 'contain', display: 'block', margin: '0 auto 3px' }} />
                    <div style={{ color: '#000000', fontWeight: 700, fontSize: 7 }}>{EMPRESA.nombre}</div>
                  </td>
                  <td style={{ background: '#ffffff', border: '2px solid #222', padding: '5px', textAlign: 'center', verticalAlign: 'middle' }}>
                    <div style={{ color: '#000000', fontWeight: 700, fontSize: 10 }}>GUÍA DE TRAZABILIDAD DE DESPACHO Y TRANSPORTE</div>
                  </td>
                  <td style={{ width: '12%', background: '#ffffff', border: '2px solid #222', padding: '4px', textAlign: 'center', verticalAlign: 'middle' }}>
                    <div style={{ color: '#000000', fontWeight: 700, fontSize: 7 }}>N° GUÍA</div>
                    <div style={{ color: '#B22222', fontSize: 9, fontWeight: 700, fontFamily: 'monospace' }}>{g.folio_guia}</div>
                  </td>
                  <td style={{ width: '12%', background: '#ffffff', border: '2px solid #222', padding: '4px', textAlign: 'center', verticalAlign: 'middle' }}>
                    <div style={{ color: '#000000', fontWeight: 700, fontSize: 7 }}>N° FACTURA</div>
                    <div style={{ color: '#B22222', fontSize: 9, fontWeight: 700, fontFamily: 'monospace' }}>{g.folio}</div>
                  </td>
                </tr>
              </tbody>
            </table>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8, fontSize: 9 }}>
              <tbody>
                <tr>
                  <td style={{ ...thS, width: '10%' }}>CLIENTE</td>
                  <td style={{ ...tdS, textAlign: 'left', fontWeight: 600 }} colSpan={3}>{g.cliente}</td>
                  <td style={{ ...thS, width: '10%' }}>FECHA/HORA SALIDA</td>
                  <td style={tdS}>{fmtHora(g.fecha_hora_salida)}</td>
                </tr>
                <tr>
                  <td style={thS}>DESTINO</td>
                  <td style={{ ...tdS, textAlign: 'left' }} colSpan={3}>{g.destino || '—'}</td>
                  <td style={thS}>TEMP. VEHÍCULO</td>
                  <td style={tdS}>{g.temp_vehiculo != null ? `${g.temp_vehiculo}°C` : ''}</td>
                </tr>
                <tr>
                  <td style={thS}>TRANSPORTADOR</td>
                  <td style={tdS}>{g.transportador}</td>
                  <td style={thS}>PLACA</td>
                  <td style={tdS} colSpan={3}>{g.placa}</td>
                </tr>
              </tbody>
            </table>

            {/* TABLA DE PRODUCTOS/LOTES */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, marginBottom: 8 }}>
              <thead>
                <tr>
                  <th style={{ ...thS, width: '13%' }}>LOTE</th>
                  <th style={{ ...thS, width: '32%' }}>PRODUCTO</th>
                  <th style={{ ...thS, width: '16%' }}>CANTIDAD</th>
                  <th style={{ ...thS, width: '17%' }}>TEMP. PRODUCTO</th>
                  <th style={{ ...thS, width: '22%' }}>FECHA VENC.</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((it, ii) => (
                  <tr key={ii}>
                    <td style={{ ...tdS, fontFamily: 'monospace', color: '#1A5FA8', fontWeight: 600 }}>{it.lote}</td>
                    <td style={{ ...tdS, textAlign: 'left', fontWeight: 500 }}>{it.producto}</td>
                    <td style={tdS}>{it.cantidad} {it.unidad}</td>
                    <td style={tdS}>{it.temp_producto != null ? `${it.temp_producto}°C` : ''}</td>
                    <td style={tdS}>{it.fecha_vencimiento ? fmtFechaCorta(it.fecha_vencimiento) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* OBSERVACIONES */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
              <tbody>
                <tr>
                  <td style={{ border: '1px solid #444', padding: '5px 8px' }}>
                    <div style={{ fontWeight: 700, fontSize: 9, marginBottom: 3 }}>OBSERVACIONES:</div>
                    <div style={{ fontSize: 9, minHeight: 24 }}>{g.observaciones}</div>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* FIRMAS */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  {[
                    { titulo: 'RESPONSABLE DE DESPACHO:', nombre: g.responsable },
                    { titulo: 'TRANSPORTADOR:', nombre: g.firma_transportador }
                  ].map(f => (
                    <td key={f.titulo} style={{ border: '1px solid #444', padding: '10px 14px', width: '50%' }}>
                      <div style={{ fontSize: 9, fontWeight: 700, marginBottom: 6 }}>{f.titulo}</div>
                      <div style={{ fontSize: 9, marginBottom: 16 }}>{f.nombre}</div>
                      <div style={{ borderTop: '1px solid #444', paddingTop: 4, fontSize: 8, color: '#555' }}>Firma &nbsp;&nbsp; FECHA: ___________</div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// PLANTILLA DE MANTENIMIENTO (INVIMA)
// Se alimenta automáticamente desde Finanzas > Caja > Egresos y Gastos
// cuando se elige la categoría "Mantenimiento". Aquí es solo consulta/impresión.
// ─────────────────────────────────────────────
function PlantillaMantenimiento({ onVolver }) {
  const primerDiaAnio = () => { const d = new Date(); return `${d.getFullYear()}-01-01` }
  const hoyISO = () => new Date().toISOString().split('T')[0]

  const [desde, setDesde] = useState(primerDiaAnio())
  const [hasta, setHasta] = useState(hoyISO())
  const [registros, setRegistros] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { cargar() }, [desde, hasta])

  const cargar = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('mantenimientos')
      .select('*')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true })
    setRegistros(data || [])
    setLoading(false)
  }

  const imprimir = () => {
    const contenido = document.getElementById('plantilla-mantenimiento').innerHTML
    const ventana = window.open('', '_blank')
    ventana.document.write(`
      <html><head><title>Registro de Mantenimiento de Equipos</title>
      <style>
        @page { size: letter landscape; margin: 8mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 8px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #444; padding: 3px 4px; text-align: center; vertical-align: middle; }
        th { background: #ffffff !important; color: #000000 !important; font-weight: 700; font-size: 7.5px; }
        img { max-width: 55px; max-height: 35px; object-fit: contain; }
      </style></head>
      <body>${contenido}</body></html>
    `)
    ventana.document.close()
    ventana.focus()
    setTimeout(() => { ventana.print(); ventana.close() }, 500)
  }

  const fmt = (iso) => {
    if (!iso) return ''
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Bogota' })
  }

  const inp = { padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, background: '#F4F1ED' }
  const thS = { background: '#ffffff', color: '#000000', padding: '5px 4px', fontSize: 9, fontWeight: 700, border: '1px solid #333', textAlign: 'center', verticalAlign: 'middle' }
  const tdS = { padding: '5px 4px', border: '1px solid #aaa', fontSize: 9, textAlign: 'center', verticalAlign: 'middle' }
  const tdV = { ...tdS, height: 18 }

  const totalCosto = registros.reduce((s, r) => s + (Number(r.costo) || 0), 0)
  const filasVacias = Math.max(0, 15 - registros.length)

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={onVolver} style={{ background: '#F4F1ED', border: '1px solid #DDD8CF', borderRadius: 7, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}>← Volver</button>
        <label style={{ fontSize: 12, color: '#9A8E85', fontWeight: 600 }}>DESDE:</label>
        <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inp} />
        <label style={{ fontSize: 12, color: '#9A8E85', fontWeight: 600 }}>HASTA:</label>
        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={inp} />
        <button onClick={imprimir} style={{ background: '#1A5FA8', color: '#fff', border: 'none', borderRadius: 7, padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🖨️ Imprimir plantilla</button>
        <button onClick={cargar} style={{ background: '#E8F7EF', color: '#1A9156', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🔄 Actualizar</button>
        {loading && <span style={{ fontSize: 12, color: '#9A8E85' }}>Cargando...</span>}
      </div>

      <div style={{ fontSize: 11, color: '#9A8E85', marginBottom: 10 }}>
        Estos registros se crean automáticamente desde Finanzas → Caja → Egresos y Gastos, al elegir la categoría "Mantenimiento". Aquí solo se consultan e imprimen.
      </div>

      <div id="plantilla-mantenimiento" style={{ background: '#fff', padding: 14, borderRadius: 8, border: '1px solid #DDD8CF', overflowX: 'auto' }}>

        {/* ENCABEZADO */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
          <tbody>
            <tr>
              <td style={{ width: '20%', background: '#ffffff', border: '2px solid #222', padding: '8px 6px', textAlign: 'center', verticalAlign: 'middle' }}>
                <img src={EMPRESA.logo} alt="Logo" style={{ width: 55, height: 38, objectFit: 'contain', display: 'block', margin: '0 auto 5px' }} />
                <div style={{ color: '#000000', fontWeight: 700, fontSize: 9 }}>{EMPRESA.nombre}</div>
              </td>
              <td style={{ background: '#ffffff', border: '2px solid #222', padding: '8px', textAlign: 'center', verticalAlign: 'middle' }}>
                <div style={{ color: '#000000', fontWeight: 700, fontSize: 12 }}>REGISTRO DE MANTENIMIENTO DE EQUIPOS</div>
              </td>
              <td style={{ width: '18%', background: '#ffffff', border: '2px solid #222', padding: '8px 6px', textAlign: 'center', verticalAlign: 'middle' }}>
                <div style={{ color: '#000000', fontWeight: 700, fontSize: 9, marginBottom: 3 }}>PERIODO</div>
                <div style={{ color: '#2c2b2b', fontSize: 8 }}>{fmt(desde)} — {fmt(hasta)}</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* TABLA PRINCIPAL */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
          <thead>
            <tr>
              <th style={{ ...thS, width: '8%' }}>FECHA</th>
              <th style={{ ...thS, width: '16%' }}>EQUIPO</th>
              <th style={{ ...thS, width: '12%' }}>TIPO DE MANTENIMIENTO</th>
              <th style={{ ...thS, width: '9%' }}>COSTO</th>
              <th style={{ ...thS, width: '14%' }}>REALIZADO POR</th>
              <th style={{ ...thS, width: '10%' }}>PRÓXIMA FECHA PROGRAMADA</th>
              <th style={{ ...thS, width: '31%' }}>OBSERVACIONES</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r, i) => (
              <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={tdS}>{fmt(r.fecha)}</td>
                <td style={{ ...tdS, textAlign: 'left', fontWeight: 500 }}>{r.equipo}</td>
                <td style={tdS}>{r.tipo_mantenimiento}</td>
                <td style={{ ...tdS, fontFamily: 'monospace', fontWeight: 600 }}>${Number(r.costo || 0).toLocaleString('es-CO')}</td>
                <td style={tdS}>{r.realizado_por || '—'}</td>
                <td style={tdS}>{r.proxima_fecha_programada ? fmt(r.proxima_fecha_programada) : '—'}</td>
                <td style={{ ...tdS, textAlign: 'left' }}>{r.observaciones || ''}</td>
              </tr>
            ))}
            {registros.length === 0 && !loading && (
              <tr><td colSpan={7} style={{ ...tdS, padding: 16, color: '#9A8E85' }}>No hay mantenimientos registrados en este periodo</td></tr>
            )}
            {registros.length > 0 && Array.from({ length: filasVacias }).map((_, i) => (
              <tr key={`e-${i}`}>{Array.from({ length: 7 }).map((_, j) => <td key={j} style={tdV}></td>)}</tr>
            ))}
          </tbody>
          {registros.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={3} style={{ ...thS, textAlign: 'right' }}>TOTAL INVERTIDO EN MANTENIMIENTO</td>
                <td style={{ ...tdS, fontFamily: 'monospace', fontWeight: 700, color: '#B22222' }}>${totalCosto.toLocaleString('es-CO')}</td>
                <td colSpan={3} style={tdS}></td>
              </tr>
            </tfoot>
          )}
        </table>

        {/* OBSERVACIONES GENERALES */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
          <tbody>
            <tr>
              <td style={{ border: '1px solid #444', padding: '5px 8px' }}>
                <div style={{ fontWeight: 700, fontSize: 9, marginBottom: 3 }}>OBSERVACIONES GENERALES:</div>
                <div style={{ minHeight: 40 }}></div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* FIRMAS */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
          <tbody>
            <tr>
              {['ELABORADO POR:', 'REVISADO POR:', 'APROBADO POR:'].map(firma => (
                <td key={firma} style={{ border: '1px solid #444', padding: '8px 12px', width: '33%' }}>
                  <div style={{ fontSize: 8.5, fontWeight: 700, marginBottom: 16 }}>{firma}</div>
                  <div style={{ borderTop: '1px solid #444', paddingTop: 3, fontSize: 8, color: '#555' }}>Nombre y firma &nbsp;&nbsp; FECHA: ___________</div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}