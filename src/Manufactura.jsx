import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import ModalEliminar from './ModalEliminar'

// supabase-js NO lanza excepción cuando algo falla: devuelve { error }.
// Con este helper los fallos dejan de pasar en silencio.
const ok = (res) => { if (res.error) throw new Error(res.error.message); return res.data }

// Fecha de HOY en hora local (toISOString() da la fecha UTC: después de las 7 pm ya es "mañana")
const hoyISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
const generarLote = (prefijo) => {
  const hoy = new Date()
  const dd = String(hoy.getDate()).padStart(2, '0')
  const mm = String(hoy.getMonth() + 1).padStart(2, '0')
  const yy = String(hoy.getFullYear()).slice(2)
  return `${prefijo}-${dd}${mm}${yy}`
}

// Si el código base ya existe agrega -2, -3... (dos producciones el mismo día ya no comparten código)
const siguienteCodigo = (base, existentes) => {
  if (!existentes.has(base)) return base
  let n = 2
  while (existentes.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

// Código de lote único para un producto (considera lo que ya existe y lo asignado en este mismo guardado)
const codigoLoteUnico = async (producto_id, base, usados) => {
  const { data } = await supabase.from('lotes').select('codigo_lote').eq('producto_id', producto_id).like('codigo_lote', `${base}%`)
  const existentes = new Set((data || []).map(l => l.codigo_lote))
  usados.forEach(k => { const [pid, cod] = k.split('|'); if (pid === producto_id) existentes.add(cod) })
  const codigo = siguienteCodigo(base, existentes)
  usados.add(`${producto_id}|${codigo}`)
  return codigo
}

// Un código escrito a mano no puede repetirse para el mismo producto
const verificarLoteLibre = async (producto_id, codigo, usados) => {
  const { data } = await supabase.from('lotes').select('id').eq('producto_id', producto_id).eq('codigo_lote', codigo).limit(1)
  if ((data && data.length) || usados.has(`${producto_id}|${codigo}`)) {
    throw new Error(`El lote ${codigo} ya existe para ese producto. Cámbialo o déjalo vacío para que se genere solo.`)
  }
  usados.add(`${producto_id}|${codigo}`)
  return codigo
}

// Lotes con saldo de un producto. En edición, "addBack" suma lo que el documento ya había
// consumido (porque al guardar se revierte primero) e incluye lotes que quedaron en 0 por él.
const fetchLotesDisponibles = async (producto_id, addBack = {}) => {
  const ids = Object.keys(addBack)
  let q = supabase.from('lotes').select('*').eq('producto_id', producto_id).order('fecha_ingreso', { ascending: true })
  q = ids.length ? q.or(`cantidad_actual.gt.0,id.in.(${ids.join(',')})`) : q.gt('cantidad_actual', 0)
  const { data } = await q
  return (data || []).map(l => ({ ...l, cantidad_actual: (parseFloat(l.cantidad_actual) || 0) + (addBack[l.id] || 0) }))
}

// Reparte una cantidad entre los lotes más antiguos (FIFO)
const asignarFIFO = (lotes, cantidad) => {
  const usados = []
  let restante = cantidad
  for (const lote of lotes) {
    if (restante <= 0.00001) break
    const usar = Math.min(lote.cantidad_actual, restante)
    if (usar <= 0) continue
    usados.push({ lote_id: lote.id, codigo_lote: lote.codigo_lote, cantidad_usada: parseFloat(usar.toFixed(4)), disponible: lote.cantidad_actual })
    restante -= usar
  }
  return usados
}

// ── Costos (costo_promedio, y si no hay, precio_kg) ──
const costoUnitario = (ins) => parseFloat(ins?.costo_promedio) || parseFloat(ins?.precio_kg) || 0
// Convierte la unidad del ingrediente a la unidad en la que está costeado el insumo
const factorUnidad = (desde, hasta) => {
  if (!desde || !hasta || desde === hasta) return 1
  if (desde === 'g' && hasta === 'kg') return 0.001
  if (desde === 'kg' && hasta === 'g') return 1000
  if (desde === 'ml' && hasta === 'lt') return 0.001
  if (desde === 'lt' && hasta === 'ml') return 1000
  return 1
}
const costoIngrediente = (cantidad, unidad, ins) =>
  (parseFloat(cantidad) || 0) * factorUnidad(unidad, ins?.unidad || unidad) * costoUnitario(ins)
const fmtMoney = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO')
// Costo por unidad (con decimales: un gramo puede costar $6,5)
const fmtCostoU = (n) => '$' + (n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })

// Familia de productos que reparte el costo del batch de humo (misma regla que en el SQL)
const esFamiliaTocineta = (p) => (p?.familia || '').toLowerCase().includes('tocineta')

// Recalcula el reparto del costo de un batch CERRADO (si está abierto o en uso, no hace nada)
const recalcularBatch = async (batchId) => {
  if (!batchId) return
  const { error } = await supabase.rpc('recalcular_reparto_batch', { p_batch: batchId })
  if (error) alert('El cambio se guardó, pero no se pudo recalcular el costo del batch: ' + error.message)
}

// ── Permisos ──
// ÚNICO punto donde se decide qué puede hacer cada usuario. Los módulos preguntan por
// permisos (ej. puede('formulaciones.ver')), nunca por roles.
// HOY: todos pueden todo. Cuando se definan los roles, solo se cambia el cuerpo de este hook.
// Permisos usados: 'formulaciones.ver' · 'costos.ver' · 'batches.editar' · 'batches.eliminar'
//
// ▶ PRUEBA: pon SIMULAR_OPERARIO en true para ver la pantalla como la vería un operario
//   (sin Formulaciones, sin costos, sin ingredientes, sin eliminar; solo mezcla + nº de baches
//   y siempre con bolsas). Déjalo en false para el uso normal.
const SIMULAR_OPERARIO = false

function usePermisos() {
  const puede = (_permiso) => !SIMULAR_OPERARIO
  return { puede, cargando: false }
}

export default function Manufactura() {
  const [vista, setVista] = useState('menu')
  const { puede, cargando } = usePermisos()

  if (cargando) return <div style={{ padding: 40, textAlign: 'center', color: '#9A8E85' }}>Cargando...</div>

  const opciones = [
    { id: 'formulaciones', icon: '📋', label: 'Formulaciones', permiso: 'formulaciones.ver' },
    { id: 'batches', icon: '🧪', label: 'Batches y mezclas en polvo' },
    { id: 'produccion', icon: '⚙️', label: 'Producción' },
  ].filter(m => !m.permiso || puede(m.permiso))

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>🏭 Manufactura</div>
      {vista === 'menu' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            {opciones.map(m => (
              <button key={m.id} onClick={() => setVista(m.id)} style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: '14px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>{m.icon}</span> {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {vista === 'formulaciones' && puede('formulaciones.ver') && <Formulaciones puede={puede} onVolver={() => setVista('menu')} />}
      {vista === 'batches' && <Batches puede={puede} onVolver={() => setVista('menu')} />}
      {vista === 'produccion' && <Produccion puede={puede} onVolver={() => setVista('menu')} />}
    </div>
  )
}

// ─────────────────────────────────────────────
// FORMULACIONES — con costo por ingrediente y costo total
// ─────────────────────────────────────────────
function Formulaciones({ puede, onVolver }) {
  const [formulaciones, setFormulaciones] = useState([])
  const [insumos, setInsumos] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [aEliminar, setAEliminar] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState({ nombre: '', descripcion: '', cantidad_base: 1, unidad: 'kg' })
  const [ingredientes, setIngredientes] = useState([])

  useEffect(() => { cargar(); cargarInsumos() }, [])

  const cargar = async () => {
    setLoading(true)
    const { data } = await supabase.from('formulaciones').select('*, formulacion_ingredientes(*)').order('nombre')
    setFormulaciones(data || [])
    setLoading(false)
  }

  // Trae siempre el costo_promedio vigente (el que actualiza Compras)
  const cargarInsumos = async () => {
    const { data } = await supabase.from('productos').select('*')
      .eq('tipo_inventario', 'materia_prima').eq('categoria_mp', 'insumos').order('nombre')
    setInsumos(data || [])
  }

  const verCostos = puede('costos.ver')
  const insumoDe = (id) => insumos.find(x => x.id === id)
  const costoFormulacion = (ings) => (ings || []).reduce((s, i) => s + costoIngrediente(i.cantidad, i.unidad, insumoDe(i.insumo_id)), 0)

  const abrirNuevo = () => {
    cargarInsumos() // refresca costos por si hubo compras recientes
    setEditando(null)
    setForm({ nombre: '', descripcion: '', cantidad_base: 1, unidad: 'kg' })
    setIngredientes([])
    setMostrarForm(true)
  }

  const abrirEditar = async (f) => {
    cargarInsumos()
    setEditando(f)
    setForm({ nombre: f.nombre, descripcion: f.descripcion || '', cantidad_base: f.cantidad_base, unidad: f.unidad })
    const { data } = await supabase.from('formulacion_ingredientes').select('*').eq('formulacion_id', f.id)
    setIngredientes((data || []).map(i => ({ insumo_id: i.insumo_id, nombre_insumo: i.nombre_insumo, cantidad: i.cantidad, unidad: i.unidad })))
    setMostrarForm(true)
  }

  const cerrar = () => { setMostrarForm(false); setEditando(null); setIngredientes([]) }
  const agregarIngrediente = () => setIngredientes([...ingredientes, { insumo_id: '', nombre_insumo: '', cantidad: '', unidad: 'kg' }])

  const actualizarIngrediente = (i, campo, valor) => {
    const updated = [...ingredientes]
    updated[i] = { ...updated[i], [campo]: valor }
    if (campo === 'insumo_id') {
      const ins = insumos.find(x => x.id === valor)
      if (ins) { updated[i].nombre_insumo = ins.nombre; updated[i].unidad = ins.unidad || 'kg' }
    }
    setIngredientes(updated)
  }

  const guardar = async () => {
    if (guardando) return
    if (!form.nombre) { alert('Ingresa el nombre'); return }
    if (ingredientes.length === 0) { alert('Agrega al menos un ingrediente'); return }
    if (ingredientes.some(i => !i.insumo_id || !i.cantidad)) { alert('Completa todos los ingredientes'); return }

    setGuardando(true)
    try {
      const cab = { nombre: form.nombre, descripcion: form.descripcion, cantidad_base: parseFloat(form.cantidad_base), unidad: form.unidad }
      let fId
      if (editando) {
        ok(await supabase.from('formulaciones').update(cab).eq('id', editando.id))
        ok(await supabase.from('formulacion_ingredientes').delete().eq('formulacion_id', editando.id))
        fId = editando.id
      } else {
        const data = ok(await supabase.from('formulaciones').insert([cab]).select())
        fId = data[0].id
      }
      ok(await supabase.from('formulacion_ingredientes').insert(
        ingredientes.map(ing => ({ formulacion_id: fId, insumo_id: ing.insumo_id, nombre_insumo: ing.nombre_insumo, cantidad: parseFloat(ing.cantidad), unidad: ing.unidad }))
      ))
      cerrar(); cargar()
    } catch (e) {
      alert('Error al guardar: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  // Si ya hay batches o bolsas hechas con esta fórmula, la base no la deja borrar: se avisa en vez de fallar callado
  const eliminar = async () => {
    const f = aEliminar
    try {
      ok(await supabase.from('formulaciones').delete().eq('id', f.id))
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('auditoria').insert([{
        tabla: 'formulaciones', accion: 'ELIMINACIÓN', descripcion: f.nombre, datos_anteriores: f,
        usuario_email: user?.email || 'desconocido', fecha: new Date().toISOString()
      }])
    } catch (e) {
      alert(`No se pudo eliminar "${f.nombre}": ${e.message}\n(Si ya hay batches o bolsas hechos con esta fórmula, la base no deja borrarla.)`)
    }
    setAEliminar(null); cargar()
  }

  const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }

  const costoTotalForm = costoFormulacion(ingredientes)
  const baseForm = parseFloat(form.cantidad_base) || 0
  const colsIng = verCostos ? '2fr 1fr 1fr 1.3fr auto' : '2fr 1fr 1fr auto'
  const colsTabla = verCostos ? ['Nombre','Cantidad base','Costo fórmula','Costo/unidad','Descripción','Acciones'] : ['Nombre','Cantidad base','Descripción','Acciones']

  return (
    <div>
      {aEliminar && <ModalEliminar item={aEliminar} tabla="formulaciones" descripcion={aEliminar.nombre} onConfirm={eliminar} onCancel={() => setAEliminar(null)} registrarAuditoria={false} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onVolver} style={{ background: '#F4F1ED', border: '1px solid #DDD8CF', borderRadius: 7, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>← Volver</button>
          <div style={{ fontSize: 16, fontWeight: 700 }}>📋 Formulaciones</div>
        </div>
        <button onClick={abrirNuevo} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>＋ Nueva formulación</button>
      </div>

      {mostrarForm && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 22, marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>{editando ? 'Editar formulación' : 'Nueva formulación'}</div>
          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 10 }}>
              <div><label style={lbl}>NOMBRE *</label><input value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} placeholder="Ej. Mezcla de Humo Base" style={inp} /></div>
              <div><label style={lbl}>CANTIDAD BASE (1 bache = 1 bolsa)</label><input type="number" value={form.cantidad_base} onChange={e => setForm({...form, cantidad_base: e.target.value})} style={inp} /></div>
              <div><label style={lbl}>UNIDAD</label>
                <select value={form.unidad} onChange={e => setForm({...form, unidad: e.target.value})} style={inp}>
                  <option value="kg">kg</option><option value="g">g</option><option value="lt">lt</option><option value="und">und</option>
                </select>
              </div>
            </div>
            <div><label style={lbl}>DESCRIPCIÓN</label><input value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})} placeholder="Descripción opcional" style={inp} /></div>
          </div>

          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600 }}>INGREDIENTES (INSUMOS)</div>
              <button onClick={agregarIngrediente} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>＋ Agregar</button>
            </div>
            {ingredientes.map((ing, i) => {
              const ins = insumoDe(ing.insumo_id)
              const cu = costoUnitario(ins)
              const costo = costoIngrediente(ing.cantidad, ing.unidad, ins)
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: colsIng, gap: 8, alignItems: 'end', marginBottom: 8 }}>
                  <div><label style={lbl}>INSUMO</label>
                    <select value={ing.insumo_id} onChange={e => actualizarIngrediente(i, 'insumo_id', e.target.value)} style={inp}>
                      <option value="">Selecciona...</option>
                      {insumos.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>CANTIDAD</label><input type="number" value={ing.cantidad} onChange={e => actualizarIngrediente(i, 'cantidad', e.target.value)} placeholder="0" style={inp} /></div>
                  <div><label style={lbl}>UNIDAD</label>
                    <select value={ing.unidad} onChange={e => actualizarIngrediente(i, 'unidad', e.target.value)} style={inp}>
                      <option value="kg">kg</option><option value="g">g</option><option value="lt">lt</option><option value="und">und</option><option value="ml">ml</option>
                    </select>
                  </div>
                  {verCostos && (
                    <div>
                      <label style={lbl}>COSTO {ins && cu > 0 ? <span style={{ fontSize: 9 }}>({fmtCostoU(cu)}/{ins.unidad || 'kg'})</span> : null}</label>
                      <div style={{ ...inp, background: '#fff', fontFamily: 'monospace', fontWeight: 700, color: ins && cu === 0 ? '#C07D00' : '#B22222' }}>
                        {!ins ? '—' : cu === 0 ? '⚠ sin costo' : fmtMoney(costo)}
                      </div>
                    </div>
                  )}
                  <button onClick={() => setIngredientes(ingredientes.filter((_, j) => j !== i))} style={{ padding: '8px 10px', background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, marginBottom: 1 }}>✕</button>
                </div>
              )
            })}
            {ingredientes.length === 0 && <div style={{ fontSize: 12, color: '#9A8E85', textAlign: 'center', padding: 8 }}>Agrega los insumos de la fórmula</div>}

            {verCostos && ingredientes.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, background: '#fff', borderRadius: 7, padding: '10px 14px', marginTop: 8, fontSize: 13 }}>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>COSTO TOTAL FÓRMULA </span><b style={{ color: '#B22222', fontFamily: 'monospace' }}>{fmtMoney(costoTotalForm)}</b></div>
                {baseForm > 0 && <div><span style={{ color: '#9A8E85', fontSize: 11 }}>COSTO POR {form.unidad.toUpperCase()} </span><b style={{ color: '#1A5FA8', fontFamily: 'monospace' }}>{fmtMoney(costoTotalForm / baseForm)}</b></div>}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={cerrar} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={guardar} disabled={guardando} style={{ padding: '8px 16px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{guardando ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85' }}>Cargando...</div> : formulaciones.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          <div style={{ fontWeight: 600 }}>No hay formulaciones</div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#F4F1ED' }}>
              {colsTabla.map(h => <th key={h} style={{ padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {formulaciones.map(f => {
                const total = costoFormulacion(f.formulacion_ingredientes)
                const base = parseFloat(f.cantidad_base) || 0
                return (
                  <tr key={f.id} style={{ borderBottom: '1px solid #DDD8CF' }}>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600 }}>{f.nombre}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13 }}>{f.cantidad_base} {f.unidad}</td>
                    {verCostos && <td style={{ padding: '11px 16px', fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: '#B22222' }}>{fmtMoney(total)}</td>}
                    {verCostos && <td style={{ padding: '11px 16px', fontSize: 12, fontFamily: 'monospace', color: '#1A5FA8' }}>{base > 0 ? `${fmtMoney(total / base)}/${f.unidad}` : '—'}</td>}
                    <td style={{ padding: '11px 16px', fontSize: 12, color: '#9A8E85' }}>{f.descripcion || '—'}</td>
                    <td style={{ padding: '8px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => abrirEditar(f)} style={{ background: '#FEF3DC', color: '#C07D00', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                        <button onClick={() => setAEliminar(f)} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const estadoVencimiento = (f) => {
  if (!f) return { txt: '—', color: '#9A8E85' }
  const d = Math.floor((new Date(f + 'T00:00:00') - new Date(hoyISO() + 'T00:00:00')) / 86400000)
  if (d < 0) return { txt: `${f} · VENCIDO`, color: '#B22222' }
  if (d <= 30) return { txt: `${f} · en ${d} d`, color: '#C07D00' }
  return { txt: f, color: '#1A9156' }
}

// ─────────────────────────────────────────────
// BATCHES Y MEZCLAS EN POLVO
//
// Flujo:  Insumos (g) → Formulación → Fabricar bolsas (lote + vencimiento)
//         → Inventario de bolsas → Batch → Producción
//
// Un batch se prepara con UNA de dos formas, nunca con las dos:
//   · Directo con insumos (solo quien ve las fórmulas): descuenta los insumos de la fórmula.
//   · Con bolsas (cualquiera, y lo único que ve el operario): descuenta solo bolsas del inventario.
// El registro y la eliminación los hacen las funciones SQL registrar_batch / eliminar_batch.
// ─────────────────────────────────────────────
function Batches({ puede, onVolver }) {
  const [pestana, setPestana] = useState('batches')
  const tab = (id, label) => (
    <button key={id} onClick={() => setPestana(id)} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderRadius: 7, border: '1px solid #DDD8CF', background: pestana === id ? '#B22222' : '#fff', color: pestana === id ? '#fff' : '#1A1A1A' }}>{label}</button>
  )
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {tab('batches', '🧪 Batches')}
        {tab('polvo', '📦 Mezclas en polvo (bolsas)')}
      </div>
      {pestana === 'batches'
        ? <BatchesLista puede={puede} onVolver={onVolver} />
        : <MezclasPolvo puede={puede} onVolver={onVolver} />}
    </div>
  )
}

function BatchesLista({ puede, onVolver }) {
  const verFormulas = puede('formulaciones.ver')
  const verCostos = puede('costos.ver')
  const puedeEliminar = puede('batches.eliminar')
  const puedeEditar = puede('batches.editar')

  const [batches, setBatches] = useState([])
  const [conBolsas, setConBolsas] = useState(() => new Set())  // ids de batches preparados con bolsas
  const [formulaciones, setFormulaciones] = useState([])
  const [insumos, setInsumos] = useState([])
  const [polvoLotes, setPolvoLotes] = useState([])             // lotes de bolsas con existencias
  const [polvoSel, setPolvoSel] = useState([])                 // bolsas elegidas: [{ lote_id, bolsas }]
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [aEliminar, setAEliminar] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [detallePolvo, setDetallePolvo] = useState([])
  const [batchEditar, setBatchEditar] = useState(null)
  const formVacio = () => ({ formulacion_id: '', baches: '1', cantidad_preparada: '', unidad: 'kg', codigo_lote: '', fecha_preparacion: hoyISO(), operario: '', observaciones: '' })
  const [form, setForm] = useState(formVacio())
  // Quien ve las fórmulas elige el origen con el botón que presiona; el operario siempre prepara con bolsas
  const [origen, setOrigen] = useState(verFormulas ? 'insumos' : 'bolsas')
  const guardandoRef = useRef(false)
  const eliminandoRef = useRef(false)

  useEffect(() => { cargar(); cargarFormulaciones(); cargarPolvo(); if (verFormulas && verCostos) cargarInsumos() }, [])

  const cargar = async () => {
    setLoading(true)
    const { data } = await supabase.from('batches').select('*').order('creado_en', { ascending: false })
    setBatches(data || [])
    const { data: bp } = await supabase.from('batch_polvo').select('batch_id')
    setConBolsas(new Set((bp || []).map(x => x.batch_id)))
    setLoading(false)
  }

  // Sin permiso, solo se piden id/nombre/base/unidad: nunca los ingredientes.
  const cargarFormulaciones = async () => {
    const cols = verFormulas ? '*, formulacion_ingredientes(*)' : 'id, nombre, cantidad_base, unidad'
    const { data } = await supabase.from('formulaciones').select(cols).eq('activo', true).order('nombre')
    setFormulaciones(data || [])
  }

  const cargarInsumos = async () => {
    const { data } = await supabase.from('productos').select('*').eq('tipo_inventario', 'materia_prima').eq('categoria_mp', 'insumos')
    setInsumos(data || [])
  }

  // Primero se ofrece el lote que primero vence
  const cargarPolvo = async () => {
    const { data } = await supabase.from('polvo_lotes').select('*').gt('bolsas_actuales', 0)
      .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
    setPolvoLotes(data || [])
  }

  const modoBolsas = !verFormulas || origen === 'bolsas'
  const formSel = formulaciones.find(f => f.id === form.formulacion_id)
  const base = parseFloat(formSel?.cantidad_base) || 0
  const bachesN = parseFloat(form.baches) || 0
  // Con bolsas: baches × cantidad base. Directo: la cantidad digitada.
  const cantidadFinal = modoBolsas ? bachesN * base : (parseFloat(form.cantidad_preparada) || 0)
  const unidadFinal = modoBolsas ? (formSel?.unidad || 'kg') : form.unidad

  // Bolsas de ESTA mezcla que no están vencidas (las vencidas no se ofrecen)
  const hoy = hoyISO()
  const polvoDeMezcla = polvoLotes.filter(l => l.formulacion_id === form.formulacion_id)
  const polvoDisponibles = polvoDeMezcla.filter(l => !(l.fecha_vencimiento && l.fecha_vencimiento < hoy))
  const vencidasN = polvoDeMezcla.length - polvoDisponibles.length
  const bolsasDisponibles = polvoDisponibles.reduce((s, l) => s + (parseFloat(l.bolsas_actuales) || 0), 0)
  const bolsasUsadas = polvoSel.reduce((s, x) => s + (parseFloat(x.bolsas) || 0), 0)
  // Bolsas disponibles (no vencidas) de cualquier mezcla: para el selector del modo "con bolsas"
  const bolsasDeMezcla = (id) => polvoLotes
    .filter(l => l.formulacion_id === id && !(l.fecha_vencimiento && l.fecha_vencimiento < hoy))
    .reduce((s, l) => s + (parseFloat(l.bolsas_actuales) || 0), 0)
  // Con bolsas solo se listan las mezclas que tienen bolsas disponibles; directo lista todas
  const mezclasLista = modoBolsas ? formulaciones.filter(f => bolsasDeMezcla(f.id) > 0) : formulaciones
  const costoPolvo = polvoSel.reduce((s, x) => {
    const l = polvoLotes.find(y => y.id === x.lote_id)
    return s + (parseFloat(x.bolsas) || 0) * (parseFloat(l?.costo_bolsa) || 0)
  }, 0)

  // Sugerencia automática: 1 bache = 1 bolsa, empezando por el lote que primero vence (editable)
  useEffect(() => {
    if (!modoBolsas || !form.formulacion_id || !(bachesN > 0)) { setPolvoSel([]); return }
    let resto = bachesN
    const sel = []
    for (const l of polvoDisponibles) {
      if (resto <= 0.00001) break
      const usar = Math.min(parseFloat(l.bolsas_actuales) || 0, resto)
      if (usar <= 0) continue
      sel.push({ lote_id: l.id, bolsas: String(parseFloat(usar.toFixed(4))) })
      resto -= usar
    }
    setPolvoSel(sel)
  }, [modoBolsas, form.formulacion_id, form.baches, polvoLotes])

  const setPolvo = (i, campo, valor) => setPolvoSel(prev => prev.map((x, k) => k === i ? { ...x, [campo]: valor } : x))
  const agregarPolvo = () => {
    if (polvoDisponibles.length === 0) { alert('No hay bolsas disponibles de esta mezcla'); return }
    setPolvoSel(prev => [...prev, { lote_id: polvoDisponibles[0].id, bolsas: '1' }])
  }

  // Vista previa de ingredientes (solo directo con insumos, y solo quien ve las fórmulas)
  const ingredientesCalc = (!modoBolsas && verFormulas && formSel && cantidadFinal > 0 && base > 0)
    ? (formSel.formulacion_ingredientes || []).map(ing => {
        const cant = parseFloat((ing.cantidad * (cantidadFinal / base)).toFixed(4))
        const ins = insumos.find(x => x.id === ing.insumo_id)
        return { ...ing, cantidad_calculada: cant, costo: costoIngrediente(cant, ing.unidad, ins) }
      })
    : []
  const costoPreview = ingredientesCalc.reduce((s, i) => s + i.costo, 0)

  const cerrar = () => { setMostrarForm(false); setForm(formVacio()); setPolvoSel([]); cargarPolvo() }

  // Abre UN solo formulario según el botón presionado: 'bolsas' o 'insumos'
  const abrirForm = (modo) => {
    cargarPolvo()
    setOrigen(modo)
    setForm(formVacio())
    setPolvoSel([])
    setMostrarForm(true)
  }

  const guardar = async () => {
    if (guardandoRef.current) return
    if (!form.formulacion_id) { alert('Selecciona una mezcla'); return }
    if (!(cantidadFinal > 0)) { alert(modoBolsas ? 'Ingresa el número de baches' : 'Ingresa la cantidad'); return }

    if (modoBolsas) {
      if (polvoSel.length === 0) { alert('Selecciona las bolsas de mezcla en polvo que vas a usar'); return }
      const porLote = {}
      for (const x of polvoSel) {
        const l = polvoDisponibles.find(y => y.id === x.lote_id)
        const b = parseFloat(x.bolsas) || 0
        if (!l || !(b > 0)) { alert('Completa el lote y las bolsas'); return }
        porLote[x.lote_id] = (porLote[x.lote_id] || 0) + b
        if (porLote[x.lote_id] > parseFloat(l.bolsas_actuales) + 0.0001) { alert(`Lote ${l.codigo_lote}: solo hay ${l.bolsas_actuales} bolsas disponibles`); return }
      }
      if (Math.abs(bolsasUsadas - bachesN) > 0.0001 &&
          !window.confirm(`Vas a usar ${parseFloat(bolsasUsadas.toFixed(4))} bolsa(s) para ${bachesN} bache(s) (1 bache = 1 bolsa). ¿Continuar?`)) return
    }

    guardandoRef.current = true
    setGuardando(true)
    try {
      ok(await supabase.rpc('registrar_batch', {
        p_formulacion: form.formulacion_id,
        p_cantidad: cantidadFinal,
        p_unidad: unidadFinal,
        p_lote: form.codigo_lote || null,   // si va vacío, la base genera uno que no se repite
        p_fecha: form.fecha_preparacion,
        p_operario: form.operario || null,
        p_observaciones: form.observaciones || null,
        // Con bolsas se mandan las bolsas; directo se manda vacío (así nunca se descuentan las dos cosas)
        p_polvo: modoBolsas ? polvoSel.map(x => ({ lote_id: x.lote_id, bolsas: parseFloat(x.bolsas) })) : []
      }))
      cerrar(); cargar()
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  // Elimina el batch devolviendo bolsas o insumos al inventario (lo hace la función SQL, que también audita).
  // Se bloquea si ya se usó mezcla en una producción.
  const eliminar = async () => {
    if (eliminandoRef.current) return
    eliminandoRef.current = true
    try {
      let res = await supabase.rpc('eliminar_batch', { p_batch: aEliminar.id })
      if (res.error?.message.includes('SIN_REGISTRO')) {
        if (!window.confirm('Este batch es anterior al control de consumos: se eliminará SIN devolver insumos al inventario. ¿Continuar?')) return
        res = await supabase.rpc('eliminar_batch', { p_batch: aEliminar.id, p_forzar_sin_reversion: true })
      }
      ok(res)
    } catch (e) {
      alert('No se pudo eliminar: ' + e.message)
    } finally {
      eliminandoRef.current = false
      setAEliminar(null); cargar(); cargarPolvo()
    }
  }

  // Editar un batch: solo datos que no mueven inventario. Para cambiar cantidad o bolsas se elimina y se registra de nuevo.
  const abrirEditar = (b) => setBatchEditar({ b, fecha_preparacion: b.fecha_preparacion || hoyISO(), operario: b.operario || '', observaciones: b.observaciones || '' })
  const guardarEdicion = async () => {
    const { b } = batchEditar
    try {
      ok(await supabase.from('batches').update({
        fecha_preparacion: batchEditar.fecha_preparacion, operario: batchEditar.operario || null, observaciones: batchEditar.observaciones || null
      }).eq('id', b.id))
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('auditoria').insert([{
        tabla: 'batches', accion: 'EDICIÓN', descripcion: `${b.folio} — fecha/operario/observaciones`, datos_anteriores: b,
        usuario_email: user?.email || 'desconocido', fecha: new Date().toISOString()
      }])
      setBatchEditar(null); cargar()
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }

  const verDetalle = async (b) => {
    setDetallePolvo([]); setDetalle(b)
    try {
      const { data: bp } = await supabase.from('batch_polvo').select('bolsas, polvo_lote_id').eq('batch_id', b.id)
      if (!bp || bp.length === 0) return
      const { data: lts } = await supabase.from('polvo_lotes').select('id, formulacion_nombre, codigo_lote, fecha_vencimiento').in('id', bp.map(x => x.polvo_lote_id))
      setDetallePolvo(bp.map(x => {
        const l = (lts || []).find(y => y.id === x.polvo_lote_id)
        return { nombre: l?.formulacion_nombre || 'Mezcla en polvo', codigo_lote: l?.codigo_lote || '?', bolsas: x.bolsas, vence: l?.fecha_vencimiento }
      }))
    } catch { /* la trazabilidad es informativa */ }
  }

  const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }
  const fmtU = (n) => (parseFloat(n) || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })
  const columnas = verCostos
    ? ['Folio','Mezcla','Origen','Lote','Cantidad','Stock','Estado','Costo/kg','Fecha','Acciones']
    : ['Folio','Mezcla','Origen','Lote','Cantidad','Stock','Estado','Fecha','Acciones']
  const estadoBatch = (b) => {
    if (b.estado === 'en_uso') return { txt: '▶ En uso', bg: '#FFF8EC', color: '#C07D00' }
    if (b.estado === 'cerrado') return { txt: '■ Cerrado', bg: '#E8F7EF', color: '#1A9156' }
    return { txt: 'Disponible', bg: '#F4F1ED', color: '#5A4F47' }
  }
  const batchActivo = batches.find(b => b.estado === 'en_uso')

  return (
    <div>
      {puedeEliminar && aEliminar && <ModalEliminar item={aEliminar} tabla="batches" descripcion={`${aEliminar.folio} — ${aEliminar.formulacion_nombre}`} onConfirm={eliminar} onCancel={() => setAEliminar(null)} registrarAuditoria={false} />}

      {batchEditar && (
        <div onClick={() => setBatchEditar(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 26, width: 440, maxWidth: '95vw', boxShadow: '0 8px 28px rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>✏️ Editar {batchEditar.b.folio}</div>
            <div style={{ fontSize: 11, color: '#9A8E85', marginBottom: 14 }}>Aquí solo se corrigen fecha, operario y observaciones. Para cambiar la cantidad o las bolsas, elimina el batch (devuelve el inventario) y regístralo de nuevo.</div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div><label style={lbl}>FECHA</label><input type="date" value={batchEditar.fecha_preparacion} onChange={e => setBatchEditar({ ...batchEditar, fecha_preparacion: e.target.value })} style={inp} /></div>
              <div><label style={lbl}>OPERARIO</label><input value={batchEditar.operario} onChange={e => setBatchEditar({ ...batchEditar, operario: e.target.value })} style={inp} /></div>
              <div><label style={lbl}>OBSERVACIONES</label><input value={batchEditar.observaciones} onChange={e => setBatchEditar({ ...batchEditar, observaciones: e.target.value })} style={inp} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
              <button onClick={() => setBatchEditar(null)} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={guardarEdicion} style={{ padding: '8px 16px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>💾 Guardar</button>
            </div>
          </div>
        </div>
      )}

      {detalle && (
        <div onClick={() => setDetalle(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 26, width: 480, maxWidth: '95vw', boxShadow: '0 8px 28px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div><div style={{ fontSize: 15, fontWeight: 700 }}>{detalle.folio}</div><div style={{ fontSize: 12, color: '#9A8E85' }}>{detalle.formulacion_nombre}</div></div>
              <span onClick={() => setDetalle(null)} style={{ cursor: 'pointer', fontSize: 20, color: '#9A8E85' }}>×</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, marginBottom: 12 }}>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>LOTE</span><br/><b style={{ fontFamily: 'monospace', color: '#1A5FA8' }}>{detalle.codigo_lote}</b></div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>CANTIDAD</span><br/><b>{detalle.cantidad_preparada} {detalle.unidad}</b></div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>STOCK ACTUAL</span><br/><b style={{ color: '#1A9156' }}>{detalle.stock_actual} {detalle.unidad}</b></div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>ORIGEN</span><br/><b>{conBolsas.has(detalle.id) ? '📦 Con bolsas' : '🧂 Directo con insumos'}</b></div>
              {verCostos && <div><span style={{ color: '#9A8E85', fontSize: 11 }}>COSTO/KG</span><br/><b>${detalle.costo_por_kg?.toLocaleString('es-CO')}</b></div>}
              {verCostos && <div><span style={{ color: '#9A8E85', fontSize: 11 }}>COSTO TOTAL</span><br/><b>${detalle.costo_total?.toLocaleString('es-CO')}</b></div>}
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>FECHA</span><br/>{detalle.fecha_preparacion}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>ESTADO</span><br/><b>{estadoBatch(detalle).txt}</b></div>
              {detalle.estado === 'cerrado' && <div><span style={{ color: '#9A8E85', fontSize: 11 }}>UNIDADES REPARTIDAS</span><br/><b>{fmtU(detalle.unidades_reparto)}</b></div>}
              {verCostos && detalle.estado === 'cerrado' && detalle.costo_por_unidad_mezcla != null && <div><span style={{ color: '#9A8E85', fontSize: 11 }}>MEZCLA POR UNIDAD</span><br/><b style={{ color: '#B22222' }}>{fmtCostoU(detalle.costo_por_unidad_mezcla)}</b></div>}
              {detalle.operario && <div><span style={{ color: '#9A8E85', fontSize: 11 }}>OPERARIO</span><br/>{detalle.operario}</div>}
            </div>
            {detallePolvo.length > 0 && (
              <div style={{ background: '#FFF8EC', border: '1px solid #F0DFB8', borderRadius: 7, padding: 10, fontSize: 12 }}>
                <div style={{ fontSize: 10, color: '#9A8E85', fontWeight: 600, marginBottom: 6 }}>📦 MEZCLA EN POLVO USADA (trazabilidad)</div>
                {detallePolvo.map((d, i) => (
                  <div key={i}>{d.nombre} — lote <b style={{ fontFamily: 'monospace', color: '#1A5FA8' }}>{d.codigo_lote}</b> — {d.bolsas} bolsa(s){d.vence ? ` — vence ${d.vence}` : ''}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onVolver} style={{ background: '#F4F1ED', border: '1px solid #DDD8CF', borderRadius: 7, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>← Volver</button>
          <div style={{ fontSize: 16, fontWeight: 700 }}>🧪 Batches de Mezcla</div>
        </div>
        {/* Mientras hay un formulario abierto los botones se ocultan: así nunca se mezclan los dos procesos */}
        {!mostrarForm && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => abrirForm('bolsas')} style={{ background: '#1A5FA8', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {verFormulas ? '📦 Batch con bolsas' : '＋ Nuevo batch'}
            </button>
            {verFormulas && (
              <button onClick={() => abrirForm('insumos')} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                🧂 Batch directo con insumos
              </button>
            )}
          </div>
        )}
      </div>

      {batchActivo && (
        <div style={{ background: '#FFF8EC', border: '1px solid #F0DFB8', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#5A4F47', marginBottom: 16 }}>
          ▶ <b>Batch en uso: {batchActivo.codigo_lote}</b> — {batchActivo.formulacion_nombre}. Se pone en uso y se termina desde Producción; mientras tanto toda producción se enlaza a este batch.
        </div>
      )}

      {mostrarForm && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 22, marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>
            {modoBolsas ? '📦 Nuevo batch con bolsas' : '🧂 Nuevo batch directo con insumos'}
          </div>

          <div style={{ fontSize: 11, color: '#9A8E85', marginBottom: 12 }}>
            {modoBolsas
              ? 'Se descuentan solo bolsas del inventario; los insumos no se tocan.'
              : 'Se descuentan los insumos de la fórmula; no se usan bolsas.'}
          </div>

          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={lbl}>{verFormulas ? 'FORMULACIÓN *' : 'MEZCLA *'}</label>
                <select value={form.formulacion_id} onChange={e => setForm({...form, formulacion_id: e.target.value})} style={inp}>
                  <option value="">Selecciona una mezcla...</option>
                  {mezclasLista.map(f => (
                    <option key={f.id} value={f.id}>
                      {modoBolsas
                        ? `${f.nombre} — ${fmtU(bolsasDeMezcla(f.id))} bolsa(s) disp.`
                        : `${f.nombre} (base: ${f.cantidad_base} ${f.unidad})`}
                    </option>
                  ))}
                </select>
              </div>
              {modoBolsas ? (
                <>
                  <div><label style={lbl}>NÚMERO DE BACHES *</label>
                    <input type="number" min="0" step="any" value={form.baches} onChange={e => setForm({...form, baches: e.target.value})} placeholder="1" style={inp} />
                  </div>
                  <div><label style={lbl}>EQUIVALE A</label>
                    <div style={{ ...inp, background: '#fff', fontWeight: 700, color: '#1A5FA8' }}>{formSel && cantidadFinal > 0 ? `${fmtU(cantidadFinal)} ${formSel.unidad}` : '—'}</div>
                  </div>
                </>
              ) : (
                <>
                  <div><label style={lbl}>CANTIDAD A PREPARAR *</label>
                    <input type="number" value={form.cantidad_preparada} onChange={e => setForm({...form, cantidad_preparada: e.target.value})} placeholder="0" style={inp} />
                  </div>
                  <div><label style={lbl}>UNIDAD</label>
                    <select value={form.unidad} onChange={e => setForm({...form, unidad: e.target.value})} style={inp}>
                      <option value="kg">kg</option><option value="g">g</option><option value="lt">lt</option>
                    </select>
                  </div>
                </>
              )}
              <div><label style={lbl}>FECHA</label><input type="date" value={form.fecha_preparacion} onChange={e => setForm({...form, fecha_preparacion: e.target.value})} style={inp} /></div>
              <div><label style={lbl}>LOTE <span style={{ color: '#9A8E85', fontSize: 9 }}>(auto si vacío)</span></label><input value={form.codigo_lote} onChange={e => setForm({...form, codigo_lote: e.target.value})} placeholder={generarLote('BCH')} style={inp} /></div>
              <div><label style={lbl}>OPERARIO</label><input value={form.operario} onChange={e => setForm({...form, operario: e.target.value})} placeholder="Nombre" style={inp} /></div>
            </div>
            <div><label style={lbl}>OBSERVACIONES</label><input value={form.observaciones} onChange={e => setForm({...form, observaciones: e.target.value})} placeholder="Notas" style={inp} /></div>
          </div>

          {/* CON BOLSAS: lotes de bolsas (primero el que vence antes) */}
          {modoBolsas && form.formulacion_id && (
            <div style={{ background: '#FFF8EC', border: '1px solid #F0DFB8', borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600 }}>
                  📦 BOLSAS A USAR <span style={{ fontWeight: 400 }}>(1 bache = 1 bolsa · este batch: {parseFloat(bachesN.toFixed(2))} bolsa(s) · disponibles: {fmtU(bolsasDisponibles)})</span>
                </div>
                <button onClick={agregarPolvo} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>＋ Otro lote</button>
              </div>
              {polvoDisponibles.length === 0 && (
                <div style={{ fontSize: 12, color: '#B22222', marginBottom: 6 }}>⚠️ No hay bolsas disponibles de esta mezcla. Fabrícalas primero en la pestaña "Mezclas en polvo".</div>
              )}
              {vencidasN > 0 && <div style={{ fontSize: 11, color: '#C07D00', marginBottom: 6 }}>{vencidasN} lote(s) vencido(s) no se ofrecen.</div>}
              {polvoSel.map((x, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'end', marginBottom: 6 }}>
                  <div><label style={lbl}>LOTE DE BOLSAS</label>
                    <select value={x.lote_id} onChange={e => setPolvo(i, 'lote_id', e.target.value)} style={inp}>
                      {polvoDisponibles.map(l => <option key={l.id} value={l.id}>{l.codigo_lote} — Disp: {fmtU(l.bolsas_actuales)}{l.fecha_vencimiento ? ` — Vence: ${l.fecha_vencimiento}` : ''}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>BOLSAS</label><input type="number" min="0" step="any" value={x.bolsas} onChange={e => setPolvo(i, 'bolsas', e.target.value)} placeholder="0" style={inp} /></div>
                  <button onClick={() => setPolvoSel(polvoSel.filter((_, k) => k !== i))} style={{ padding: '8px 9px', background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, marginBottom: 1 }}>✕</button>
                </div>
              ))}
              {polvoSel.length > 0 && (
                <div style={{ fontSize: 11, marginTop: 4, color: '#9A8E85' }}>
                  Bolsas elegidas: <b style={{ color: Math.abs(bolsasUsadas - bachesN) < 0.0001 ? '#1A9156' : '#C07D00' }}>{parseFloat(bolsasUsadas.toFixed(4))}</b> / {parseFloat(bachesN.toFixed(4))}
                  {verCostos && <span style={{ marginLeft: 16 }}>COSTO DE LAS BOLSAS <b style={{ color: '#B22222', fontFamily: 'monospace' }}>{fmtMoney(costoPolvo)}</b></span>}
                </div>
              )}
            </div>
          )}

          {/* DIRECTO: ingredientes de la fórmula */}
          {ingredientesCalc.length > 0 && (
            <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 10 }}>INGREDIENTES QUE SE DESCUENTAN</div>
              {ingredientesCalc.map((ing, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', borderRadius: 7, padding: '8px 12px', marginBottom: 6, fontSize: 13 }}>
                  <span style={{ fontWeight: 500 }}>{ing.nombre_insumo}</span>
                  <span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1A5FA8' }}>{ing.cantidad_calculada} {ing.unidad}</span>
                    {verCostos && <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#B22222', marginLeft: 16 }}>{fmtMoney(ing.costo)}</span>}
                  </span>
                </div>
              ))}
              {verCostos && (
                <div style={{ textAlign: 'right', fontSize: 13, marginTop: 6 }}>
                  <span style={{ color: '#9A8E85', fontSize: 11 }}>COSTO TOTAL </span><b style={{ color: '#B22222', fontFamily: 'monospace' }}>{fmtMoney(costoPreview)}</b>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={cerrar} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={guardar} disabled={guardando} style={{ padding: '8px 16px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {guardando ? 'Guardando...' : '🧪 Registrar batch'}
            </button>
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85' }}>Cargando...</div> : batches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🧪</div><div style={{ fontWeight: 600 }}>No hay batches registrados</div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#F4F1ED' }}>
              {columnas.map(h => <th key={h} style={{ padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid #DDD8CF' }}>
                  <td style={{ padding: '11px 16px', fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: '#B22222' }}>{b.folio}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600 }}>{b.formulacion_nombre}</td>
                  <td style={{ padding: '11px 16px', fontSize: 11 }}>
                    <span style={{ background: conBolsas.has(b.id) ? '#FFF8EC' : '#F4F1ED', color: conBolsas.has(b.id) ? '#C07D00' : '#5A4F47', padding: '2px 8px', borderRadius: 20, fontWeight: 600 }}>{conBolsas.has(b.id) ? '📦 Bolsas' : '🧂 Insumos'}</span>
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: 11, fontFamily: 'monospace', color: '#1A5FA8', fontWeight: 600 }}>{b.codigo_lote}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13 }}>{b.cantidad_preparada} {b.unidad}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600, color: b.stock_actual > 0 ? '#1A9156' : '#B22222' }}>{b.stock_actual} {b.unidad}</td>
                  <td style={{ padding: '11px 16px', fontSize: 11 }}>
                    <span style={{ background: estadoBatch(b).bg, color: estadoBatch(b).color, padding: '2px 8px', borderRadius: 20, fontWeight: 600, whiteSpace: 'nowrap' }}>{estadoBatch(b).txt}</span>
                  </td>
                  {verCostos && <td style={{ padding: '11px 16px', fontSize: 12, fontFamily: 'monospace' }}>${b.costo_por_kg?.toLocaleString('es-CO')}</td>}
                  <td style={{ padding: '11px 16px', fontSize: 11, color: '#9A8E85', fontFamily: 'monospace' }}>{b.fecha_preparacion}</td>
                  <td style={{ padding: '8px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => verDetalle(b)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>👁️</button>
                      {puedeEditar && <button onClick={() => abrirEditar(b)} style={{ background: '#FEF3DC', color: '#C07D00', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>✏️</button>}
                      {puedeEliminar && (b.estado || 'disponible') === 'disponible' && <button onClick={() => setAEliminar(b)} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>🗑️</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// MEZCLAS EN POLVO — inventario independiente de bolsas, con lote y vencimiento.
// Se escoge una fórmula, se indica cuántas bolsas se fabrican (1 bache de la fórmula = 1 bolsa)
// y quedan en inventario. La fabricación y su reversión las hacen las funciones SQL
// fabricar_polvo / eliminar_polvo (descuentan los insumos de la fórmula, en stock y en lotes).
// ─────────────────────────────────────────────
function MezclasPolvo({ puede, onVolver }) {
  const verFormulas = puede('formulaciones.ver')
  const verCostos = puede('costos.ver')
  const puedeEliminar = puede('batches.eliminar')

  const [lotes, setLotes] = useState([])
  const [formulaciones, setFormulaciones] = useState([])
  const [insumos, setInsumos] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorSQL, setErrorSQL] = useState(false)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [soloConStock, setSoloConStock] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [aEliminar, setAEliminar] = useState(null)
  const guardandoRef = useRef(false)
  const eliminandoRef = useRef(false)
  const formVacio = () => ({ formulacion_id: '', bolsas: '1', fecha: hoyISO(), vencimiento: '', lote: '', operario: '', observaciones: '' })
  const [form, setForm] = useState(formVacio())

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const { data: lts, error } = await supabase.from('polvo_lotes').select('*').order('creado_en', { ascending: false })
    if (error) { setErrorSQL(true); setLoading(false); return }
    setErrorSQL(false)
    setLotes(lts || [])
    const { data: forms } = await supabase.from('formulaciones')
      .select(verFormulas ? '*, formulacion_ingredientes(*)' : 'id, nombre, cantidad_base, unidad')
      .eq('activo', true).order('nombre')
    setFormulaciones(forms || [])
    if (verFormulas) {
      const { data: ins } = await supabase.from('productos').select('*').eq('tipo_inventario', 'materia_prima').eq('categoria_mp', 'insumos')
      setInsumos(ins || [])
    }
    setLoading(false)
  }

  const bolsas = parseFloat(form.bolsas) || 0
  const formSel = formulaciones.find(f => f.id === form.formulacion_id)
  // 1 batch de la fórmula = 1 bolsa: los ingredientes se multiplican por el número de bolsas
  const ingPrev = (verFormulas && formSel?.formulacion_ingredientes && bolsas > 0)
    ? formSel.formulacion_ingredientes.map(ing => {
        const cant = parseFloat((ing.cantidad * bolsas).toFixed(4))
        const ins = insumos.find(x => x.id === ing.insumo_id)
        const necesario = cant * factorUnidad(ing.unidad, ins?.unidad || ing.unidad)
        const falta = ins ? Math.max(0, necesario - (parseFloat(ins.stock_actual) || 0)) : 0
        return { ...ing, cant, costo: costoIngrediente(cant, ing.unidad, ins), falta, stockUnidad: ins?.unidad }
      })
    : []
  const costoPrev = ingPrev.reduce((s, i) => s + i.costo, 0)

  const fabricar = async () => {
    if (guardandoRef.current) return
    if (!form.formulacion_id) { alert('Selecciona la mezcla'); return }
    if (!(bolsas > 0)) { alert('Ingresa el número de bolsas'); return }
    if (!form.vencimiento) { alert('Ingresa la fecha de vencimiento'); return }
    const faltantes = ingPrev.filter(i => i.falta > 0)
    if (faltantes.length) {
      alert('No hay insumos suficientes:\n' + faltantes.map(i => `• ${i.nombre_insumo}: faltan ${parseFloat(i.falta.toFixed(2))} ${i.stockUnidad || i.unidad}`).join('\n'))
      return
    }
    guardandoRef.current = true
    setGuardando(true)
    try {
      ok(await supabase.rpc('fabricar_polvo', {
        p_formulacion: form.formulacion_id, p_bolsas: bolsas, p_vencimiento: form.vencimiento,
        p_lote: form.lote || null, p_fecha: form.fecha,
        p_operario: form.operario || null, p_observaciones: form.observaciones || null
      }))
      setMostrarForm(false); setForm(formVacio()); cargar()
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  // La función SQL devuelve los insumos y también deja la auditoría
  const eliminarFabricacion = async () => {
    if (eliminandoRef.current) return
    eliminandoRef.current = true
    try {
      ok(await supabase.rpc('eliminar_polvo', { p_id: aEliminar.id }))
    } catch (e) {
      alert('No se pudo eliminar: ' + e.message)
    } finally {
      eliminandoRef.current = false
      setAEliminar(null); cargar()
    }
  }

  const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }
  const th = { padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500 }
  const fmtU = (n) => (parseFloat(n) || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })

  // Resumen: bolsas disponibles por mezcla
  const resumen = Object.values(lotes.reduce((acc, l) => {
    const k = l.formulacion_id
    if (!acc[k]) acc[k] = { nombre: l.formulacion_nombre, bolsas: 0, lotes: 0 }
    const disp = parseFloat(l.bolsas_actuales) || 0
    acc[k].bolsas += disp
    if (disp > 0) acc[k].lotes += 1
    return acc
  }, {}))
  const visibles = lotes.filter(l => !soloConStock || (parseFloat(l.bolsas_actuales) || 0) > 0)

  return (
    <div>
      {puedeEliminar && aEliminar && <ModalEliminar item={aEliminar} tabla="polvo_lotes" descripcion={`${aEliminar.folio} — ${aEliminar.formulacion_nombre}`} onConfirm={eliminarFabricacion} onCancel={() => setAEliminar(null)} registrarAuditoria={false} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onVolver} style={{ background: '#F4F1ED', border: '1px solid #DDD8CF', borderRadius: 7, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>← Volver</button>
          <div style={{ fontSize: 16, fontWeight: 700 }}>📦 Mezclas en polvo</div>
        </div>
        <button onClick={() => setMostrarForm(true)} disabled={errorSQL} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: errorSQL ? 0.5 : 1 }}>＋ Fabricar bolsas</button>
      </div>

      {errorSQL && (
        <div style={{ background: '#FCEAEA', borderRadius: 8, padding: 12, fontSize: 12, color: '#B22222', marginBottom: 14 }}>
          ⚠️ Faltan las tablas de mezclas en polvo. Ejecuta primero el script <b>manufactura_polvo.sql</b> y luego <b>manufactura_polvo_v2.sql</b> en Supabase.
        </div>
      )}

      {mostrarForm && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 22, marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Fabricar bolsas de mezcla en polvo</div>
          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={lbl}>MEZCLA (FORMULACIÓN) *</label>
                <select value={form.formulacion_id} onChange={e => setForm({ ...form, formulacion_id: e.target.value })} style={inp}>
                  <option value="">Selecciona una mezcla...</option>
                  {formulaciones.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                </select>
              </div>
              <div><label style={lbl}>NÚMERO DE BOLSAS *</label><input type="number" min="0" step="any" value={form.bolsas} onChange={e => setForm({ ...form, bolsas: e.target.value })} style={inp} /></div>
              <div><label style={lbl}>FECHA FABRICACIÓN</label><input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} style={inp} /></div>
              <div><label style={lbl}>VENCIMIENTO *</label><input type="date" value={form.vencimiento} onChange={e => setForm({ ...form, vencimiento: e.target.value })} style={inp} /></div>
              <div><label style={lbl}>LOTE <span style={{ fontSize: 9 }}>(auto si vacío)</span></label><input value={form.lote} onChange={e => setForm({ ...form, lote: e.target.value })} placeholder={generarLote('MZP')} style={inp} /></div>
              <div><label style={lbl}>OPERARIO</label><input value={form.operario} onChange={e => setForm({ ...form, operario: e.target.value })} placeholder="Nombre" style={inp} /></div>
              <div style={{ gridColumn: 'span 2' }}><label style={lbl}>OBSERVACIONES</label><input value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} placeholder="Notas" style={inp} /></div>
            </div>
            <div style={{ fontSize: 11, color: '#9A8E85' }}>1 bache de la fórmula = 1 bolsa. Se descuentan los insumos de la fórmula por cada bolsa (del stock y de los lotes más antiguos).</div>
          </div>

          {ingPrev.length > 0 && (
            <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 10 }}>INSUMOS QUE SE DESCUENTAN</div>
              {ingPrev.map((ing, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', background: '#fff', borderRadius: 7, padding: '8px 12px', marginBottom: 6, fontSize: 13, border: ing.falta > 0 ? '1px solid #F5C2C2' : '1px solid transparent' }}>
                  <span style={{ fontWeight: 500 }}>{ing.nombre_insumo}{ing.falta > 0 && <span style={{ color: '#B22222', fontSize: 11, marginLeft: 8 }}>⚠️ faltan {fmtU(ing.falta)} {ing.stockUnidad || ing.unidad}</span>}</span>
                  <span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1A5FA8' }}>{fmtU(ing.cant)} {ing.unidad}</span>
                    {verCostos && <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#B22222', marginLeft: 16 }}>{fmtMoney(ing.costo)}</span>}
                  </span>
                </div>
              ))}
              {verCostos && (
                <div style={{ textAlign: 'right', fontSize: 13, marginTop: 6 }}>
                  <span style={{ color: '#9A8E85', fontSize: 11 }}>COSTO TOTAL </span><b style={{ color: '#B22222', fontFamily: 'monospace' }}>{fmtMoney(costoPrev)}</b>
                  <span style={{ color: '#9A8E85', fontSize: 11, marginLeft: 16 }}>POR BOLSA </span><b style={{ color: '#1A5FA8', fontFamily: 'monospace' }}>{fmtMoney(costoPrev / bolsas)}</b>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setMostrarForm(false); setForm(formVacio()) }} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={fabricar} disabled={guardando} style={{ padding: '8px 16px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{guardando ? 'Guardando...' : '📦 Registrar fabricación'}</button>
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85' }}>Cargando...</div> : !errorSQL && (
        <>
          {resumen.length > 0 && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
              {resumen.map((r, i) => (
                <div key={i} style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: '12px 18px' }}>
                  <div style={{ fontSize: 12, color: '#9A8E85' }}>{r.nombre}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: r.bolsas > 0 ? '#1A9156' : '#B22222' }}>{fmtU(r.bolsas)} <span style={{ fontSize: 12, fontWeight: 500, color: '#9A8E85' }}>bolsas · {r.lotes} lote(s)</span></div>
                </div>
              ))}
            </div>
          )}

          <label style={{ fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <input type="checkbox" checked={soloConStock} onChange={e => setSoloConStock(e.target.checked)} /> Mostrar solo lotes con bolsas disponibles
          </label>

          {visibles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
              <div style={{ fontWeight: 600 }}>{lotes.length === 0 ? 'Aún no hay bolsas fabricadas' : 'No hay lotes con bolsas disponibles'}</div>
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#F4F1ED' }}>
                  {['Folio','Mezcla','Lote','Bolsas','Vence', ...(verCostos ? ['Costo/bolsa'] : []), 'Fabricado','Operario',''].map((h, i) => <th key={i} style={th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {visibles.map(l => {
                    const v = estadoVencimiento(l.fecha_vencimiento)
                    const disp = parseFloat(l.bolsas_actuales) || 0
                    return (
                      <tr key={l.id} style={{ borderBottom: '1px solid #DDD8CF' }}>
                        <td style={{ padding: '11px 16px', fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: '#B22222' }}>{l.folio}</td>
                        <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600 }}>{l.formulacion_nombre}</td>
                        <td style={{ padding: '11px 16px', fontSize: 11, fontFamily: 'monospace', color: '#1A5FA8', fontWeight: 600 }}>{l.codigo_lote}</td>
                        <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600, color: disp > 0 ? '#1A9156' : '#B22222' }}>{fmtU(disp)} <span style={{ color: '#9A8E85', fontSize: 11, fontWeight: 400 }}>de {fmtU(l.bolsas_iniciales)}</span></td>
                        <td style={{ padding: '11px 16px', fontSize: 12, fontFamily: 'monospace', color: v.color, fontWeight: 600 }}>{v.txt}</td>
                        {verCostos && <td style={{ padding: '11px 16px', fontSize: 12, fontFamily: 'monospace' }}>{fmtMoney(l.costo_bolsa)}</td>}
                        <td style={{ padding: '11px 16px', fontSize: 11, fontFamily: 'monospace', color: '#9A8E85' }}>{l.fecha_fabricacion}</td>
                        <td style={{ padding: '11px 16px', fontSize: 12 }}>{l.operario || '—'}</td>
                        <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                          {puedeEliminar && <button onClick={() => setAEliminar(l)} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>🗑️</button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// PRODUCCIÓN — cada "caja" agrupa una materia prima procesada
// compartida por uno o varios productos elaborados a partir de ella.
//
// Cada producto puede ser de receta FIJA (autocompleta consumo desde
// producto_ingredientes) o LIBRE (el consumo se registra manualmente
// para esa producción, sin fórmula fija — ej. Recorte).
//
// Editar = revertir la producción (devuelve materia prima y quita lo producido)
// y volver a registrarla con el mismo folio. Solo se puede si lo producido no se ha vendido ni consumido.
// ─────────────────────────────────────────────
function Produccion({ puede, onVolver }) {
  const verCostos = puede('costos.ver')
  const [producciones, setProducciones] = useState([])
  const [productos, setProductos] = useState([])
  const [subproductos, setSubproductos] = useState([])
  const [materialesLibres, setMaterialesLibres] = useState([])
  const [catalogoCompleto, setCatalogoCompleto] = useState([]) // incluye insumos: para reconocer categorías al editar
  const [batchEnUso, setBatchEnUso] = useState(null) // batch de mezcla de humo en uso (si lo hay)
  const [batchesDisp, setBatchesDisp] = useState([])  // batches disponibles para poner en uso
  const [batchSelUso, setBatchSelUso] = useState('')
  const [cambiandoUso, setCambiandoUso] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [aEliminar, setAEliminar] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [detalleGrupos, setDetalleGrupos] = useState([])
  const [editando, setEditando] = useState(null) // { prod }

  const [fechaProduccion, setFechaProduccion] = useState(hoyISO())
  const [operario, setOperario] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [cajas, setCajas] = useState([])

  // Referencia con el valor más reciente de "cajas" (para leer dentro de
  // funciones async sin depender de un cierre viejo) y temporizadores de
  // debounce por producto, para no golpear la BD en cada tecla.
  const cajasRef = useRef(cajas)
  useEffect(() => { cajasRef.current = cajas }, [cajas])
  const debounceProductoRef = useRef({})
  // Evitan dobles clics y llevan el control de la edición
  const eliminandoRef = useRef(false)
  const guardandoRef = useRef(false)
  const addBackRef = useRef({})        // lote_id -> cantidad que la producción en edición ya había consumido
  const yaRevertidoRef = useRef(false) // true si al editar ya se revirtió lo anterior

  useEffect(() => { cargar(); cargarCatalogos() }, [])

  const cargar = async () => {
    setLoading(true)
    const { data } = await supabase.from('producciones').select('*').order('creado_en', { ascending: false })
    setProducciones(data || [])
    setLoading(false)
  }

  const cargarCatalogos = async () => {
    const [{ data: prods }, { data: subs }, { data: mats }, { data: bchs }] = await Promise.all([
      supabase.from('productos').select('*').eq('tipo_inventario', 'producto_terminado').order('nombre'),
      supabase.from('productos').select('*').eq('tipo_inventario', 'materia_prima').eq('categoria_mp', 'materia_prima').order('nombre'),
      supabase.from('productos').select('*').eq('tipo_inventario', 'materia_prima').order('categoria_mp').order('nombre'),
      supabase.from('batches').select('*').in('estado', ['en_uso', 'disponible']).gt('stock_actual', 0).order('fecha_preparacion', { ascending: true })
    ])
    setProductos(prods || [])
    setSubproductos(subs || [])
    setCatalogoCompleto(mats || [])
    // Receta libre: solo materia prima y empaques (los insumos de mezcla no se ofrecen aquí)
    setMaterialesLibres((mats || []).filter(m => m.categoria_mp === 'materia_prima' || m.categoria_mp === 'empaques'))
    setBatchEnUso((bchs || []).find(b => b.estado === 'en_uso') || null)
    setBatchesDisp((bchs || []).filter(b => b.estado !== 'en_uso'))
  }

  const calcularIngredientes = async (producto_id, cantidad_producida) => {
    const cant = parseFloat(cantidad_producida) || 0
    if (!producto_id) return []

    const { data: receta } = await supabase
      .from('producto_ingredientes')
      .select('*, productos!materia_prima_id (id, nombre, codigo, unidad, stock_actual, tipo_inventario, categoria_mp)')
      .eq('producto_id', producto_id)

    if (!receta || receta.length === 0) return []

    return await Promise.all(receta.map(async (ing) => {
      const cantidad_requerida = parseFloat(ing.cantidad) * cant

      const lotes = await fetchLotesDisponibles(ing.materia_prima_id, addBackRef.current)
      const lotes_usados = asignarFIFO(lotes, cantidad_requerida)

      return {
        materia_prima_id: ing.materia_prima_id,
        nombre: ing.productos?.nombre || '',
        tipo_inventario: ing.productos?.tipo_inventario || 'materia_prima',
        categoria_mp: ing.productos?.categoria_mp || 'materia_prima',
        unidad_receta: ing.unidad,
        cantidad_receta: parseFloat(ing.cantidad),
        cantidad_requerida: parseFloat(cantidad_requerida.toFixed(4)),
        stock_actual: ing.productos?.stock_actual || 0,
        lotes_disponibles: lotes,
        lotes_usados
      }
    }))
  }

  const productoVacio = () => ({
    producto_id: '', nombre_producto: '', receta_tipo: 'fija',
    cantidad_producida: '', unidad_producto: 'kg', lote_producto: '',
    ingredientes: []
  })

  const cajaVacia = () => ({
    cantidad_procesada: '', unidad_mp: 'kg',
    tiene_subproducto: false, subproducto_id: '', cantidad_subproducto: '',
    tiene_recorte: false, recorte_id: '', cantidad_recorte: '',
    tiene_sobrante: false, sobrante_id: '', cantidad_sobrante: '',
    merma: '',
    productos: [productoVacio()]
  })

  const agregarCaja = () => setCajas([...cajas, cajaVacia()])
  const eliminarCaja = (cajaIdx) => setCajas(cajas.filter((_, i) => i !== cajaIdx))

  const agregarProductoACaja = (cajaIdx) => {
    const updated = [...cajas]
    updated[cajaIdx].productos.push(productoVacio())
    setCajas(updated)
  }
  const eliminarProductoDeCaja = (cajaIdx, prodIdx) => {
    const updated = [...cajas]
    updated[cajaIdx].productos = updated[cajaIdx].productos.filter((_, i) => i !== prodIdx)
    setCajas(updated)
  }

  const actualizarCaja = (cajaIdx, campo, valor) => {
    const updated = [...cajas]
    updated[cajaIdx][campo] = valor
    setCajas(updated)
  }

  // Actualiza el campo de inmediato (sin esperar la BD). Para "producto_id"
  // y "cantidad_producida" en receta fija, el cálculo de ingredientes
  // (que consulta Supabase) se difiere 350ms sin más cambios, y solo se
  // aplica si el producto/cantidad no cambiaron mientras se esperaba la
  // respuesta — así se evita el "0" pegado y la lentitud al escribir.
  const actualizarProducto = (cajaIdx, prodIdx, campo, valor) => {
    setCajas(prev => {
      const updated = [...prev]
      const caja = { ...updated[cajaIdx] }
      const productosCaja = [...caja.productos]
      const p = { ...productosCaja[prodIdx], [campo]: valor }

      if (campo === 'producto_id') {
        const prod = productos.find(x => x.id === valor)
        p.nombre_producto = prod?.nombre || ''
        p.receta_tipo = prod?.receta_tipo || 'fija'
        // Se limpia de inmediato; la receta fija llega después via debounce
        p.ingredientes = []
      }

      productosCaja[prodIdx] = p
      caja.productos = productosCaja
      updated[cajaIdx] = caja
      return updated
    })

    if (campo === 'producto_id' || campo === 'cantidad_producida') {
      const key = `${cajaIdx}-${prodIdx}`
      if (debounceProductoRef.current[key]) clearTimeout(debounceProductoRef.current[key])
      debounceProductoRef.current[key] = setTimeout(() => recalcularIngredientesProducto(cajaIdx, prodIdx), 350)
    }
  }

  const recalcularIngredientesProducto = async (cajaIdx, prodIdx) => {
    const caja = cajasRef.current[cajaIdx]
    const p = caja?.productos?.[prodIdx]
    if (!p) return
    const { producto_id, cantidad_producida, receta_tipo } = p

    // La receta libre nunca se autocompleta
    if (!producto_id || receta_tipo !== 'fija') return

    const ingredientes = await calcularIngredientes(producto_id, cantidad_producida)

    setCajas(prev => {
      const cajaVigente = prev[cajaIdx]
      const pVigente = cajaVigente?.productos?.[prodIdx]
      // Si mientras esperábamos la respuesta el usuario cambió el producto
      // o la cantidad, no pisamos su cambio más reciente
      if (!pVigente || pVigente.producto_id !== producto_id || pVigente.cantidad_producida !== cantidad_producida) return prev
      const updated = [...prev]
      const cajaCopy = { ...updated[cajaIdx] }
      const productosCaja = [...cajaCopy.productos]
      productosCaja[prodIdx] = { ...pVigente, ingredientes }
      cajaCopy.productos = productosCaja
      updated[cajaIdx] = cajaCopy
      return updated
    })
  }

  const actualizarLoteIngrediente = (cajaIdx, prodIdx, ingIdx, loteIdx, campo, valor) => {
    const updated = [...cajas]
    const ing = updated[cajaIdx].productos[prodIdx].ingredientes[ingIdx]
    ing.lotes_usados[loteIdx][campo] = valor
    if (campo === 'lote_id') {
      const lote = ing.lotes_disponibles.find(l => l.id === valor)
      if (lote) { ing.lotes_usados[loteIdx].codigo_lote = lote.codigo_lote; ing.lotes_usados[loteIdx].disponible = lote.cantidad_actual }
    }
    setCajas(updated)
  }

  const agregarLoteIngrediente = (cajaIdx, prodIdx, ingIdx) => {
    const updated = [...cajas]
    updated[cajaIdx].productos[prodIdx].ingredientes[ingIdx].lotes_usados.push({ lote_id: '', codigo_lote: '', cantidad_usada: '', disponible: 0 })
    setCajas(updated)
  }
  const eliminarLoteIngrediente = (cajaIdx, prodIdx, ingIdx, loteIdx) => {
    const updated = [...cajas]
    const ing = updated[cajaIdx].productos[prodIdx].ingredientes[ingIdx]
    ing.lotes_usados = ing.lotes_usados.filter((_, i) => i !== loteIdx)
    setCajas(updated)
  }

  // ── Receta libre: agregar/editar/quitar materias primas a mano ──
  // El picker usa `materialesLibres` (materia prima + empaques),
  // no `subproductos` (que solo tiene materia prima real, para los
  // selectores de subproducto/recorte/sobrante de la caja).
  const agregarMateriaPrimaLibre = (cajaIdx, prodIdx) => {
    const updated = [...cajas]
    updated[cajaIdx].productos[prodIdx].ingredientes.push({
      materia_prima_id: '', nombre: '', tipo_inventario: 'materia_prima', categoria_mp: 'materia_prima',
      unidad_receta: 'kg', cantidad_receta: null, cantidad_requerida: '',
      stock_actual: 0, lotes_disponibles: [], lotes_usados: []
    })
    setCajas(updated)
  }

  const actualizarMateriaPrimaLibre = async (cajaIdx, prodIdx, ingIdx, campo, valor) => {
    if (campo === 'materia_prima_id') {
      const mp = materialesLibres.find(s => s.id === valor)
      setCajas(prev => {
        const updated = [...prev]
        const ing = updated[cajaIdx].productos[prodIdx].ingredientes[ingIdx]
        ing.materia_prima_id = valor
        ing.nombre = mp?.nombre || ''
        ing.unidad_receta = mp?.unidad || 'kg'
        ing.categoria_mp = mp?.categoria_mp || 'materia_prima'
        ing.stock_actual = mp?.stock_actual || 0
        ing.lotes_usados = []
        ing.lotes_disponibles = []
        return updated
      })
      if (valor) {
        const lotes = await fetchLotesDisponibles(valor, addBackRef.current)
        // Actualización funcional: lee el estado más reciente, no una copia
        // vieja de antes del await — evita pisar cambios hechos mientras
        // tanto en otras cajas/productos.
        setCajas(prev => {
          const updated = [...prev]
          updated[cajaIdx].productos[prodIdx].ingredientes[ingIdx].lotes_disponibles = lotes
          return updated
        })
      }
      return
    }

    setCajas(prev => {
      const updated = [...prev]
      updated[cajaIdx].productos[prodIdx].ingredientes[ingIdx][campo] = valor
      return updated
    })
  }

  const eliminarMateriaPrimaLibre = (cajaIdx, prodIdx, ingIdx) => {
    const updated = [...cajas]
    updated[cajaIdx].productos[prodIdx].ingredientes = updated[cajaIdx].productos[prodIdx].ingredientes.filter((_, i) => i !== ingIdx)
    setCajas(updated)
  }

  const esEmpaqueOInsumo = (categoria) => categoria === 'insumos' || categoria === 'empaques'
  const consumoMPProducto = (producto) => producto.ingredientes.filter(i => !esEmpaqueOInsumo(i.categoria_mp)).reduce((s, i) => s + (parseFloat(i.cantidad_requerida) || 0), 0)
  const fmtNum = (n) => (parseFloat(n) || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })

  // Agrupa materialesLibres por categoria_mp para mostrar optgroups en el
  // selector de receta libre (Materia Prima / Empaques)
  const materialesPorCategoria = materialesLibres.reduce((acc, mp) => {
    const cat = mp.categoria_mp || 'materia_prima'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(mp)
    return acc
  }, {})
  const etiquetaCategoria = (cat) => cat === 'materia_prima' ? 'MATERIA PRIMA' : cat === 'insumos' ? 'INSUMOS' : cat === 'empaques' ? 'EMPAQUES' : cat.toUpperCase()

  const calcularBalanceCaja = (caja) => {
    const procesada = parseFloat(caja.cantidad_procesada) || 0
    const consumo = caja.productos.reduce((s, p) => s + consumoMPProducto(p), 0)
    const subprod = caja.tiene_subproducto ? (parseFloat(caja.cantidad_subproducto) || 0) : 0
    const recorte = caja.tiene_recorte ? (parseFloat(caja.cantidad_recorte) || 0) : 0
    const sobrante = caja.tiene_sobrante ? (parseFloat(caja.cantidad_sobrante) || 0) : 0
    const merma = parseFloat(caja.merma) || 0
    const suma = consumo + subprod + recorte + sobrante + merma
    return { procesada, consumo, suma, diff: parseFloat((suma - procesada).toFixed(4)), ok: Math.abs(suma - procesada) < 0.001 }
  }

  const siguienteFolio = async () => {
    const { data } = await supabase.from('producciones').select('folio').order('folio', { ascending: false }).limit(1)
    if (!data || data.length === 0) return 'PRO-0001'
    const n = parseInt(data[0].folio.replace('PRO-', '')) + 1
    return `PRO-${String(n).padStart(4, '0')}`
  }

  // ── Batch de mezcla de humo: se pone en uso y al terminarlo se reparte su costo entre los productos de la familia tocineta ──
  const ponerEnUso = async () => {
    if (cambiandoUso || !batchSelUso) return
    setCambiandoUso(true)
    try {
      ok(await supabase.rpc('iniciar_uso_batch', { p_batch: batchSelUso }))
      setBatchSelUso('')
    } catch (e) {
      alert('No se pudo poner en uso: ' + e.message)
    } finally {
      setCambiandoUso(false)
      cargarCatalogos()
    }
  }

  const terminarUso = async () => {
    if (cambiandoUso || !batchEnUso) return
    const b = batchEnUso
    if (!window.confirm(`¿Terminar el batch ${b.folio}?\n\nSe da por consumido y no se podrá volver a usar. ${verCostos ? 'Su costo se reparte entre lo producido de la familia tocineta.' : ''}`)) return
    setCambiandoUso(true)
    try {
      const res = await supabase.rpc('terminar_uso_batch', { p_batch: b.id })
      if (res.error?.message.includes('SIN_PRODUCCION')) {
        if (window.confirm('Todavía no hay producción de tocineta registrada con este batch, así que no hay con qué repartir el costo.\n\n¿Quieres devolverlo a "Disponible" (sin cerrarlo)?')) {
          ok(await supabase.rpc('devolver_batch_disponible', { p_batch: b.id }))
        }
      } else {
        const r = ok(res)
        alert(verCostos
          ? `Batch ${b.folio} terminado.\n${fmtNum(r.unidades)} unidades producidas · costo de mezcla por unidad: $${(r.costo_unidad || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })}`
          : `Batch ${b.folio} terminado.`)
      }
    } catch (e) {
      alert('No se pudo terminar: ' + e.message)
    } finally {
      setCambiandoUso(false)
      cargarCatalogos(); cargar()
    }
  }

  // ── Formulario: abrir / cerrar ──
  const resetForm = () => {
    Object.values(debounceProductoRef.current).forEach(clearTimeout)
    debounceProductoRef.current = {}
    setMostrarForm(false); setCajas([])
    setFechaProduccion(hoyISO()); setOperario(''); setObservaciones('')
    setEditando(null)
    addBackRef.current = {}
    yaRevertidoRef.current = false
  }

  const abrirNueva = () => {
    if (mostrarForm && editando && yaRevertidoRef.current) { alert('Termina o guarda la edición en curso primero.'); return }
    resetForm()
    setMostrarForm(true)
  }

  const cancelarFormulario = () => {
    if (editando && yaRevertidoRef.current &&
        !window.confirm('Esta producción ya fue revertida del inventario. Si cancelas ahora se perderá. ¿Cancelar de todos modos?')) return
    const estabaRevertida = yaRevertidoRef.current
    resetForm()
    cargarCatalogos()
    if (estabaRevertida) cargar()
  }

  // ── Datos de una producción (para revertir o editar) ──
  const cargarDatosProduccion = async (p) => {
    const [r1, r2, r3] = await Promise.all([
      supabase.from('produccion_items').select('*').eq('produccion_id', p.id),
      supabase.from('produccion_grupos').select('*').eq('produccion_id', p.id),
      supabase.from('produccion_subproductos').select('*').eq('produccion_id', p.id)
    ])
    const items = ok(r1) || [], grupos = ok(r2) || [], extras = ok(r3) || []
    const itemIds = items.map(i => i.id)
    const lotesMP = itemIds.length
      ? (ok(await supabase.from('produccion_lotes_mp').select('*').in('produccion_item_id', itemIds)) || [])
      : []
    return { items, grupos, extras, lotesMP }
  }

  // Los lotes que esta producción creó (producto terminado y subproductos) deben estar intactos
  const validarGeneradosIntactos = async (datos) => {
    const { items, grupos, extras } = datos
    const conExtras = grupos.some(g => g.cantidad_subproducto > 0 || g.cantidad_recorte > 0 || g.cantidad_sobrante > 0)
    if (conExtras && extras.length === 0) {
      throw new Error('esta producción generó subproducto/recorte/sobrante sin lote registrado (se guardó con la versión anterior), así que no se puede revertir automáticamente. Pide el script SQL.')
    }
    const generados = [
      ...items.map(i => ({ producto_id: i.producto_id, codigo: i.lote_producto, cantidad: parseFloat(i.cantidad_producida) })),
      ...extras.map(e => ({ producto_id: e.producto_id, codigo: e.lote_generado, cantidad: parseFloat(e.cantidad) }))
    ]
    const lotesGen = []
    for (const g of generados) {
      const { data: l } = await supabase.from('lotes').select('id, producto_id, codigo_lote, cantidad_inicial, cantidad_actual')
        .eq('producto_id', g.producto_id).eq('codigo_lote', g.codigo).eq('cantidad_inicial', g.cantidad).limit(1)
      if (!l || l.length === 0) throw new Error(`no encuentro el lote ${g.codigo} que generó esta producción`)
      if (parseFloat(l[0].cantidad_actual) < parseFloat(l[0].cantidad_inicial) - 0.0001) {
        throw new Error(`del lote ${g.codigo} ya se vendió o consumió material. Elimina primero eso`)
      }
      lotesGen.push({ ...l[0], cantidad: g.cantidad })
    }
    return lotesGen
  }

  // Revierte una producción: devuelve la materia prima a sus lotes y stock, quita el producto terminado
  // (y subproductos) que generó, devuelve la mezcla de humo al batch y borra la producción.
  const revertirProduccion = async (p) => {
    const datos = await cargarDatosProduccion(p)
    const lotesGen = await validarGeneradosIntactos(datos)

    const res = await Promise.all(datos.lotesMP.flatMap(l => [
      supabase.rpc('ajustar_lote', { p_lote: l.lote_id, p_delta: parseFloat(l.cantidad_usada) }),
      supabase.rpc('ajustar_stock', { p_producto: l.insumo_id, p_delta: parseFloat(l.cantidad_usada) })
    ]))
    res.forEach(ok)

    for (const l of lotesGen) {
      ok(await supabase.from('lotes').delete().eq('id', l.id))
      ok(await supabase.rpc('ajustar_stock', { p_producto: l.producto_id, p_delta: -l.cantidad }))
    }
    if (p.batch_id && p.cantidad_batch) {
      const { data: b } = await supabase.from('batches').select('stock_actual').eq('id', p.batch_id).single()
      if (b) ok(await supabase.from('batches').update({ stock_actual: (parseFloat(b.stock_actual) || 0) + parseFloat(p.cantidad_batch) }).eq('id', p.batch_id))
    }
    ok(await supabase.from('produccion_subproductos').delete().eq('produccion_id', p.id))
    ok(await supabase.from('producciones').delete().eq('id', p.id))
    await recalcularBatch(p.batch_id) // si el batch ya estaba cerrado, se reparte de nuevo con lo que queda
  }

  const eliminarProduccion = async () => {
    if (eliminandoRef.current) return // ignora el 2º clic
    eliminandoRef.current = true
    const p = aEliminar
    try {
      await revertirProduccion(p)
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('auditoria').insert([{
        tabla: 'producciones', accion: 'ELIMINACIÓN',
        descripcion: `${p.folio} (Inventario revertido)`, datos_anteriores: p,
        usuario_email: user?.email || 'desconocido', fecha: new Date().toISOString()
      }])
    } catch (e) {
      alert(`No se pudo eliminar ${p.folio}: ${e.message}\nRevisa el inventario antes de reintentar.`)
    } finally {
      eliminandoRef.current = false
      setAEliminar(null); cargar(); cargarCatalogos()
    }
  }

  // ── Editar: carga la producción en el formulario ──
  const abrirEdicion = async (p) => {
    if (guardandoRef.current) return
    if (mostrarForm && editando && yaRevertidoRef.current) { alert('Termina o guarda la edición en curso primero.'); return }
    try {
      const datos = await cargarDatosProduccion(p)
      await validarGeneradosIntactos(datos) // lanza si lo producido ya se vendió o consumió

      // Lo que esta producción ya consumió: al guardar se revierte primero, así que cuenta como disponible
      const addBack = {}
      datos.lotesMP.forEach(l => { addBack[l.lote_id] = (addBack[l.lote_id] || 0) + (parseFloat(l.cantidad_usada) || 0) })
      addBackRef.current = addBack
      yaRevertidoRef.current = false

      const cajasEd = await Promise.all(datos.grupos.map(async (g) => {
        const itemsG = datos.items.filter(i => i.grupo_id === g.id)
        const productosCaja = await Promise.all(itemsG.map(async (it) => {
          const rows = datos.lotesMP.filter(l => l.produccion_item_id === it.id)
          const porInsumo = {}
          rows.forEach(r => { (porInsumo[r.insumo_id] = porInsumo[r.insumo_id] || []).push(r) })
          const ingredientes = await Promise.all(Object.entries(porInsumo).map(async ([insumo_id, rs]) => {
            const disp = await fetchLotesDisponibles(insumo_id, addBack)
            const cat = catalogoCompleto.find(m => m.id === insumo_id)
            const total = rs.reduce((s, r) => s + parseFloat(r.cantidad_usada), 0)
            return {
              materia_prima_id: insumo_id, nombre: rs[0].nombre_insumo || cat?.nombre || '',
              tipo_inventario: cat?.tipo_inventario || 'materia_prima', categoria_mp: cat?.categoria_mp || 'materia_prima',
              unidad_receta: rs[0].unidad, cantidad_receta: null,
              cantidad_requerida: parseFloat(total.toFixed(4)), stock_actual: cat?.stock_actual || 0,
              lotes_disponibles: disp,
              lotes_usados: rs.map(r => ({
                lote_id: r.lote_id, codigo_lote: r.codigo_lote, cantidad_usada: parseFloat(r.cantidad_usada),
                disponible: disp.find(l => l.id === r.lote_id)?.cantidad_actual ?? parseFloat(r.cantidad_usada)
              }))
            }
          }))
          const cat = productos.find(x => x.id === it.producto_id)
          return {
            producto_id: it.producto_id, nombre_producto: it.nombre_producto, receta_tipo: cat?.receta_tipo || 'fija',
            cantidad_producida: it.cantidad_producida, unidad_producto: it.unidad_producto || 'kg',
            lote_producto: it.lote_producto || '', ingredientes
          }
        }))
        return {
          cantidad_procesada: g.cantidad_procesada, unidad_mp: g.unidad_mp || 'kg',
          tiene_subproducto: !!g.subproducto_id, subproducto_id: g.subproducto_id || '', cantidad_subproducto: g.cantidad_subproducto ?? '',
          tiene_recorte: !!g.recorte_id, recorte_id: g.recorte_id || '', cantidad_recorte: g.cantidad_recorte ?? '',
          tiene_sobrante: !!g.sobrante_id, sobrante_id: g.sobrante_id || '', cantidad_sobrante: g.cantidad_sobrante ?? '',
          merma: g.merma ?? '',
          productos: productosCaja
        }
      }))

      setCajas(cajasEd)
      setFechaProduccion(p.fecha_produccion || hoyISO())
      setOperario(p.operario || '')
      setObservaciones(p.observaciones || '')
      setEditando({ prod: p })
      setMostrarForm(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      addBackRef.current = {}
      alert(`No se puede editar ${p.folio}: ${e.message}`)
    }
  }

  const guardar = async () => {
    if (cajas.length === 0) { alert('Agrega al menos una materia prima procesada'); return }

    for (const caja of cajas) {
      if (!caja.cantidad_procesada) { alert('Ingresa la cantidad de materia prima procesada en todas las cajas'); return }
      if (caja.productos.length === 0 || caja.productos.some(p => !p.producto_id)) { alert('Selecciona el producto terminado en todos los ítems'); return }

      for (const p of caja.productos) {
        if (!p.cantidad_producida) { alert(`Ingresa la cantidad producida para: ${p.nombre_producto}`); return }

        if (p.ingredientes.length === 0) {
          alert(p.receta_tipo === 'libre'
            ? `Agrega al menos una materia prima usada para: ${p.nombre_producto}`
            : `El producto ${p.nombre_producto} no tiene receta definida`)
          return
        }

        for (const ing of p.ingredientes) {
          if (!ing.materia_prima_id) { alert(`Selecciona la materia prima en ${p.nombre_producto}`); return }
          const totalUsado = ing.lotes_usados.reduce((s, l) => s + (parseFloat(l.cantidad_usada) || 0), 0)
          const cantReq = parseFloat(ing.cantidad_requerida) || 0
          if (!cantReq) { alert(`Ingresa la cantidad usada de ${ing.nombre} en ${p.nombre_producto}`); return }
          if (Math.abs(totalUsado - cantReq) > 0.001) {
            alert(`${p.nombre_producto} — ${ing.nombre}: la suma de lotes (${totalUsado.toFixed(4)}) debe ser ${cantReq} ${ing.unidad_receta}`)
            return
          }
          for (const lu of ing.lotes_usados) {
            if (!lu.lote_id || !lu.cantidad_usada) { alert(`Completa todos los lotes de ${ing.nombre}`); return }
            if (parseFloat(lu.cantidad_usada) > lu.disponible) { alert(`${ing.nombre} lote ${lu.codigo_lote}: supera el disponible (${lu.disponible})`); return }
          }
        }
      }

      const cajaTieneLibre = caja.productos.some(p => p.receta_tipo === 'libre')
      const bal = calcularBalanceCaja(caja)
      if (!bal.ok && !cajaTieneLibre) {
        alert(`Balance incorrecto: materia prima procesada (${bal.procesada}) debe ser igual a consumo de todos los productos + subproducto + recorte + sobrante + merma (suma actual: ${bal.suma})`)
        return
      }
      if (caja.tiene_subproducto && parseFloat(caja.cantidad_subproducto) > 0 && !caja.subproducto_id) { alert('Selecciona el producto de inventario para el subproducto'); return }
      if (caja.tiene_recorte && parseFloat(caja.cantidad_recorte) > 0 && !caja.recorte_id) { alert('Selecciona el producto de inventario para el recorte'); return }
      if (caja.tiene_sobrante && parseFloat(caja.cantidad_sobrante) > 0 && !caja.sobrante_id) { alert('Selecciona el producto de inventario para el sobrante'); return }
    }

    // Tocineta sin batch en uso: se avisa, porque esa producción quedaría sin costo de mezcla
    if (!editando && !batchEnUso) {
      const hayTocineta = cajas.some(c => c.productos.some(p => esFamiliaTocineta(productos.find(x => x.id === p.producto_id))))
      if (hayTocineta && !window.confirm('No hay ningún batch en uso: esta producción de tocineta quedará SIN costo de mezcla de humo.\n\n¿Registrarla de todos modos?')) return
    }

    // Bloqueo anti doble clic: a partir de aquí todo corre una sola vez
    if (guardandoRef.current) return
    guardandoRef.current = true
    setGuardando(true)
    let folio = '', produccionId = null, fase = 'preparando'
    const lotesCreadosIds = []
    try {
      // Valida el consumo TOTAL por lote contra la BD (suma de todos los productos de la orden)
      const add = yaRevertidoRef.current ? {} : addBackRef.current
      const porLote = {}
      for (const caja of cajas) for (const p of caja.productos) for (const ing of p.ingredientes) for (const lu of ing.lotes_usados) {
        porLote[lu.lote_id] = (porLote[lu.lote_id] || 0) + (parseFloat(lu.cantidad_usada) || 0)
      }
      const idsLotes = Object.keys(porLote)
      if (idsLotes.length) {
        const frescos = ok(await supabase.from('lotes').select('id, codigo_lote, cantidad_actual').in('id', idsLotes)) || []
        for (const l of frescos) {
          const real = (parseFloat(l.cantidad_actual) || 0) + (add[l.id] || 0)
          if (porLote[l.id] > real + 0.0001) {
            throw new Error(`El lote ${l.codigo_lote} no alcanza: esta producción usa ${fmtNum(porLote[l.id])} y quedan ${fmtNum(real)}.`)
          }
        }
      }

      // Edición: revertir lo anterior (una sola vez, aunque se reintente el guardado)
      if (editando && !yaRevertidoRef.current) {
        await revertirProduccion(editando.prod)
        yaRevertidoRef.current = true
        addBackRef.current = {}
      }

      const { data: { user } } = await supabase.auth.getUser()
      folio = editando ? editando.prod.folio : await siguienteFolio()

      // Batch al que se enlaza: una producción nueva toma el que esté en uso; al editar se conserva el original
      const prodOrig = editando ? editando.prod : null
      const batchVinc = prodOrig ? (prodOrig.batch_id || null) : (batchEnUso?.id || null)
      const batchNom = prodOrig ? (prodOrig.batch_nombre || null) : (batchEnUso?.formulacion_nombre || null)
      const batchLot = prodOrig ? (prodOrig.batch_lote || null) : (batchEnUso?.codigo_lote || null)
      // Producciones del sistema anterior (consumo manual de mezcla en kg): se conservan tal cual estaban
      const cantidadLegacy = prodOrig && prodOrig.cantidad_batch ? parseFloat(prodOrig.cantidad_batch) : null
      const costoLegacy = cantidadLegacy ? (parseFloat(prodOrig.costo_batch_total) || 0) : 0
      const totalCantidadProducida = cajas.reduce((s, c) => s + c.productos.reduce((s2, p) => s2 + (parseFloat(p.cantidad_producida) || 0), 0), 0)

      const prodData = ok(await supabase.from('producciones').insert([{
        folio, fecha_produccion: fechaProduccion, operario: operario || null,
        observaciones: observaciones || null, usuario_email: user?.email,
        batch_id: batchVinc, batch_nombre: batchNom, batch_lote: batchLot,
        cantidad_batch: cantidadLegacy,
        costo_batch_total: cantidadLegacy ? costoLegacy : null,
        ...(editando ? { creado_en: editando.prod.creado_en } : {})
      }]).select())
      produccionId = prodData[0].id

      // Se acumula todo y se escribe al final en bloque (antes eran ~50 peticiones seguidas)
      const consumoLote = {}, consumoStock = {}, ingresoStock = {}
      const filasLotesMP = [], lotesNuevos = [], filasExtras = []
      const usadosCodigos = new Set()
      const suma = (obj, k, v) => { obj[k] = (obj[k] || 0) + v }

      for (const caja of cajas) {
        const subprod = subproductos.find(s => s.id === caja.subproducto_id)
        const recorte = subproductos.find(s => s.id === caja.recorte_id)
        const sobrante = subproductos.find(s => s.id === caja.sobrante_id)

        const grupoData = ok(await supabase.from('produccion_grupos').insert([{
          produccion_id: produccionId,
          cantidad_procesada: parseFloat(caja.cantidad_procesada), unidad_mp: caja.unidad_mp,
          subproducto_id: caja.tiene_subproducto ? caja.subproducto_id : null,
          nombre_subproducto: caja.tiene_subproducto ? (subprod?.nombre || null) : null,
          cantidad_subproducto: caja.tiene_subproducto ? (parseFloat(caja.cantidad_subproducto) || 0) : null,
          recorte_id: caja.tiene_recorte ? caja.recorte_id : null,
          nombre_recorte: caja.tiene_recorte ? (recorte?.nombre || null) : null,
          cantidad_recorte: caja.tiene_recorte ? (parseFloat(caja.cantidad_recorte) || 0) : null,
          sobrante_id: caja.tiene_sobrante ? caja.sobrante_id : null,
          nombre_sobrante: caja.tiene_sobrante ? (sobrante?.nombre || null) : null,
          cantidad_sobrante: caja.tiene_sobrante ? (parseFloat(caja.cantidad_sobrante) || 0) : null,
          merma: parseFloat(caja.merma) || 0
        }]).select())
        const grupoId = grupoData[0].id

        for (const p of caja.productos) {
          // Código de lote del producto terminado: el que escribió el usuario o uno automático que no se repite
          const lote_producto = p.lote_producto
            ? await verificarLoteLibre(p.producto_id, p.lote_producto, usadosCodigos)
            : await codigoLoteUnico(p.producto_id, generarLote('PT'), usadosCodigos)
          const cantProd = parseFloat(p.cantidad_producida)
          // Con el sistema nuevo el costo de mezcla se asigna al terminar el batch; aquí solo las producciones anteriores lo traen
          const costoMezclaAsignado = cantidadLegacy && totalCantidadProducida > 0 ? costoLegacy * (cantProd / totalCantidadProducida) : null

          const itemData = ok(await supabase.from('produccion_items').insert([{
            produccion_id: produccionId, grupo_id: grupoId,
            producto_id: p.producto_id, nombre_producto: p.nombre_producto,
            cantidad_producida: cantProd, unidad_producto: p.unidad_producto,
            lote_producto, costo_mezcla_asignado: costoMezclaAsignado
          }]).select())
          const itemId = itemData[0].id

          for (const ing of p.ingredientes) for (const lu of ing.lotes_usados) {
            const cant = parseFloat(lu.cantidad_usada)
            filasLotesMP.push({ produccion_item_id: itemId, insumo_id: ing.materia_prima_id, nombre_insumo: ing.nombre, lote_id: lu.lote_id, codigo_lote: lu.codigo_lote, cantidad_usada: cant, unidad: ing.unidad_receta })
            suma(consumoLote, lu.lote_id, cant)
            suma(consumoStock, ing.materia_prima_id, cant)
          }

          lotesNuevos.push({ producto_id: p.producto_id, codigo_lote: lote_producto, cantidad_inicial: cantProd, cantidad_actual: cantProd, fecha_ingreso: fechaProduccion })
          suma(ingresoStock, p.producto_id, cantProd)
        }

        for (const [activo, prodId, cantidadStr, prefijo, tipo] of [
          [caja.tiene_subproducto, caja.subproducto_id, caja.cantidad_subproducto, 'SB', 'subproducto'],
          [caja.tiene_recorte, caja.recorte_id, caja.cantidad_recorte, 'RC', 'recorte'],
          [caja.tiene_sobrante, caja.sobrante_id, caja.cantidad_sobrante, 'SO', 'sobrante']
        ]) {
          const cantidad = parseFloat(cantidadStr) || 0
          if (activo && prodId && cantidad > 0) {
            const codigo = await codigoLoteUnico(prodId, generarLote(prefijo), usadosCodigos)
            const dest = subproductos.find(s => s.id === prodId)
            lotesNuevos.push({ producto_id: prodId, codigo_lote: codigo, cantidad_inicial: cantidad, cantidad_actual: cantidad, fecha_ingreso: fechaProduccion })
            suma(ingresoStock, prodId, cantidad)
            // Se registra el lote para poder revertirlo al eliminar o editar la producción
            filasExtras.push({ produccion_id: produccionId, producto_id: prodId, producto_nombre: dest?.nombre || '', tipo, cantidad, unidad: caja.unidad_mp, lote_generado: codigo })
          }
        }
      }

      if (filasLotesMP.length) ok(await supabase.from('produccion_lotes_mp').insert(filasLotesMP))
      if (lotesNuevos.length) {
        const creados = ok(await supabase.from('lotes').insert(lotesNuevos).select('id')) || []
        creados.forEach(l => lotesCreadosIds.push(l.id))
      }
      if (filasExtras.length) ok(await supabase.from('produccion_subproductos').insert(filasExtras))

      fase = 'inventario'
      const res = await Promise.all([
        ...Object.entries(consumoLote).map(([id, c]) => supabase.rpc('ajustar_lote', { p_lote: id, p_delta: -c })),
        ...Object.entries(consumoStock).map(([id, c]) => supabase.rpc('ajustar_stock', { p_producto: id, p_delta: -c })),
        ...Object.entries(ingresoStock).map(([id, c]) => supabase.rpc('ajustar_stock', { p_producto: id, p_delta: c }))
      ])
      res.forEach(ok)

      if (cantidadLegacy && batchVinc) {
        const { data: batchAct } = await supabase.from('batches').select('stock_actual').eq('id', batchVinc).single()
        if (batchAct) ok(await supabase.from('batches').update({ stock_actual: Math.max(0, (batchAct.stock_actual || 0) - cantidadLegacy) }).eq('id', batchVinc))
      }

      // Si el batch ya estaba cerrado (edición), se reparte de nuevo su costo con las producciones actuales
      await recalcularBatch(batchVinc)

      if (editando) {
        await supabase.from('auditoria').insert([{
          tabla: 'producciones', accion: 'EDICIÓN',
          descripcion: `${folio} (Inventario revertido y vuelto a registrar)`, datos_anteriores: editando.prod,
          usuario_email: user?.email || 'desconocido', fecha: new Date().toISOString()
        }])
      }

      resetForm(); cargar(); cargarCatalogos()
    } catch (e) {
      let extra = ''
      if (fase !== 'inventario' && produccionId) {
        // Aún no se tocó el inventario: se deshace lo creado
        try {
          if (lotesCreadosIds.length) ok(await supabase.from('lotes').delete().in('id', lotesCreadosIds))
          ok(await supabase.from('produccion_subproductos').delete().eq('produccion_id', produccionId))
          ok(await supabase.from('producciones').delete().eq('id', produccionId))
          extra = '\nSe deshizo lo que alcanzó a guardarse.'
        } catch (e2) {
          extra = `\nNo se pudo deshacer automáticamente (${e2.message}); revisa ${folio}.`
        }
      } else if (fase === 'inventario') {
        extra = '\nAlgunos movimientos de inventario pudieron aplicarse: revisa stock y lotes antes de reintentar.'
      }
      if (editando && yaRevertidoRef.current) {
        extra += `\n⚠️ ${folio} ya fue revertida del inventario: NO cierres este formulario; corrige y vuelve a guardar.`
      }
      alert(`Error al guardar${folio ? ' ' + folio : ''}: ${e.message}${extra}`)
    } finally {
      guardandoRef.current = false
      setGuardando(false)
    }
  }

  const verDetalle = async (prod) => {
    const { data: grupos } = await supabase.from('produccion_grupos').select('*').eq('produccion_id', prod.id)
    const gruposConItems = []
    for (const g of grupos || []) {
      const { data: items } = await supabase.from('produccion_items').select('*').eq('grupo_id', g.id)
      const itemsConLotes = []
      for (const it of items || []) {
        const { data: lotes } = await supabase.from('produccion_lotes_mp').select('*').eq('produccion_item_id', it.id)
        itemsConLotes.push({ ...it, lotes: lotes || [] })
      }
      gruposConItems.push({ ...g, items: itemsConLotes })
    }
    setDetalleGrupos(gruposConItems)
    setDetalle(prod)
  }

  const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }

  return (
    <div>
      {aEliminar && <ModalEliminar item={aEliminar} tabla="producciones" descripcion={aEliminar.folio} onConfirm={eliminarProduccion} onCancel={() => setAEliminar(null)} registrarAuditoria={false} />}

      {detalle && (
        <div onClick={() => setDetalle(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 26, width: 680, maxWidth: '95vw', boxShadow: '0 8px 28px rgba(0,0,0,0.15)', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div><div style={{ fontSize: 15, fontWeight: 700 }}>{detalle.folio}</div><div style={{ fontSize: 12, color: '#9A8E85' }}>{detalle.fecha_produccion} {detalle.operario ? `· ${detalle.operario}` : ''}</div></div>
              <span onClick={() => setDetalle(null)} style={{ cursor: 'pointer', fontSize: 20, color: '#9A8E85' }}>×</span>
            </div>
            {detalle.batch_nombre && (
              <div style={{ background: '#FFF8EC', border: '1px solid #F0DFB8', borderRadius: 7, padding: 10, fontSize: 12, marginBottom: 14 }}>
                🧪 Mezcla de humo: <b>{detalle.batch_nombre}</b> ({detalle.batch_lote}){detalle.cantidad_batch ? ` — ${detalle.cantidad_batch} kg` : ''}{verCostos && detalle.costo_batch_total != null && <> — Costo de mezcla de esta producción: <b style={{ color: '#B22222' }}>${Number(detalle.costo_batch_total).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</b></>}
              </div>
            )}
            {detalleGrupos.map((g, gi) => (
              <div key={gi} style={{ background: '#FFF8EC', border: '1px solid #F0DFB8', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#9A8E85', marginBottom: 8 }}>
                  MATERIA PRIMA PROCESADA: <span style={{ color: '#B22222' }}>{g.cantidad_procesada} {g.unidad_mp}</span>
                </div>
                <div style={{ fontSize: 11, color: '#5A4F47', marginBottom: 10 }}>
                  {g.nombre_subproducto && <>Subproducto: {g.nombre_subproducto} ({g.cantidad_subproducto} {g.unidad_mp}) · </>}
                  {g.nombre_recorte && <>Recorte: {g.nombre_recorte} ({g.cantidad_recorte} {g.unidad_mp}) · </>}
                  {g.nombre_sobrante && <>Sobrante: {g.nombre_sobrante} ({g.cantidad_sobrante} {g.unidad_mp}) · </>}
                  Merma: {g.merma} {g.unidad_mp}
                </div>
                {g.items.map((item, i) => (
                  <div key={i} style={{ background: '#fff', borderRadius: 7, padding: 12, marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#B22222', marginBottom: 6 }}>{item.nombre_producto}</div>
                    <div style={{ fontSize: 12, color: '#5A4F47', marginBottom: 6 }}>
                      Producido: <b>{item.cantidad_producida} {item.unidad_producto}</b> — Lote: <span style={{ fontFamily: 'monospace', color: '#1A5FA8' }}>{item.lote_producto}</span>
                      {verCostos && item.costo_mezcla_asignado != null && <> — Costo mezcla asignado: <b style={{ color: '#B22222' }}>${Number(item.costo_mezcla_asignado).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</b></>}
                    </div>
                    {item.lotes.map((l, j) => (
                      <div key={j} style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', color: '#9A8E85' }}>
                        <span>{l.nombre_insumo}</span>
                        <span style={{ fontFamily: 'monospace' }}>{l.codigo_lote} — {l.cantidad_usada} {l.unidad}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
            {detalle.observaciones && <div style={{ fontSize: 12, color: '#9A8E85', marginTop: 8 }}><b>Observaciones:</b> {detalle.observaciones}</div>}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onVolver} style={{ background: '#F4F1ED', border: '1px solid #DDD8CF', borderRadius: 7, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>← Volver</button>
          <div style={{ fontSize: 16, fontWeight: 700 }}>⚙️ Producción</div>
        </div>
        <button onClick={abrirNueva} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>＋ Nueva producción</button>
      </div>

      {/* Batch de mezcla de humo: se pone en uso aquí y se termina aquí */}
      <div style={{ background: batchEnUso ? '#FFF8EC' : '#fff', border: `1px solid ${batchEnUso ? '#F0DFB8' : '#DDD8CF'}`, borderRadius: 9, padding: '14px 18px', marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 8 }}>🧪 BATCH DE MEZCLA DE HUMO</div>
        {batchEnUso ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13 }}>
              ▶ En uso: <b>{batchEnUso.codigo_lote}</b> — {batchEnUso.formulacion_nombre}
              <div style={{ fontSize: 11, color: '#9A8E85', marginTop: 2 }}>Cada producción que registres se enlaza sola a este batch. Cuando se acabe, presiona "Terminar batch".</div>
            </div>
            <button onClick={terminarUso} disabled={cambiandoUso} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>■ Terminar batch</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={batchSelUso} onChange={e => setBatchSelUso(e.target.value)} style={{ ...inp, width: 'auto', minWidth: 320, flex: 1 }}>
              <option value="">{batchesDisp.length ? 'Selecciona el batch que vas a usar...' : 'No hay batches disponibles'}</option>
              {batchesDisp.map(b => <option key={b.id} value={b.id}>{b.codigo_lote} — {b.formulacion_nombre} (Stock: {fmtNum(b.stock_actual)} {b.unidad})</option>)}
            </select>
            <button onClick={ponerEnUso} disabled={cambiandoUso || !batchSelUso} style={{ background: '#1A5FA8', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', opacity: !batchSelUso ? 0.5 : 1 }}>▶ Poner en uso</button>
          </div>
        )}
      </div>

      {mostrarForm && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>{editando ? `✏️ Editando: ${editando.prod.folio}` : 'Nueva producción'}</div>

          {editando && (
            <div style={{ background: '#FEF3DC', borderRadius: 7, padding: 10, fontSize: 12, color: '#C07D00', marginBottom: 14 }}>
              Al guardar, esta producción se revierte del inventario (devuelve la materia prima y quita lo producido) y se vuelve a registrar con el mismo folio.
            </div>
          )}

          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 10 }}>DATOS GENERALES</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={lbl}>FECHA</label><input type="date" value={fechaProduccion} onChange={e => setFechaProduccion(e.target.value)} style={inp} /></div>
              <div><label style={lbl}>OPERARIO</label><input value={operario} onChange={e => setOperario(e.target.value)} placeholder="Nombre del operario" style={inp} /></div>
              <div style={{ gridColumn: '1/-1' }}><label style={lbl}>OBSERVACIONES</label><input value={observaciones} onChange={e => setObservaciones(e.target.value)} placeholder="Notas" style={inp} /></div>
            </div>
          </div>

          <div style={{ background: batchEnUso && !editando ? '#FFF8EC' : '#F4F1ED', border: batchEnUso && !editando ? '1px solid #F0DFB8' : 'none', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 6 }}>🧪 MEZCLA DE HUMO</div>
            <div style={{ fontSize: 12, color: '#5A4F47' }}>
              {editando
                ? (editando.prod.batch_nombre
                    ? <>Esta producción está enlazada al batch <b>{editando.prod.batch_lote}</b> — {editando.prod.batch_nombre}.</>
                    : 'Esta producción no está enlazada a ningún batch.')
                : batchEnUso
                  ? <>Batch en uso: <b>{batchEnUso.codigo_lote}</b> — {batchEnUso.formulacion_nombre}. Esta producción se enlaza sola; al terminar el batch, su costo se reparte entre lo producido de la familia tocineta.</>
                  : <span style={{ color: '#C07D00' }}>⚠️ No hay ningún batch en uso. Si vas a producir tocineta, primero pon el batch en uso en el recuadro de arriba (▶ Poner en uso).</span>}
            </div>
          </div>

          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600 }}>PRODUCTOS A PROCESAR</div>
              <button onClick={agregarCaja} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>＋ Agregar</button>
            </div>
            {cajas.length === 0 && <div style={{ fontSize: 12, color: '#9A8E85', textAlign: 'center', padding: 10 }}>Haz clic en "＋ Agregar" para iniciar</div>}

            {cajas.map((caja, cajaIdx) => {
              const bal = calcularBalanceCaja(caja)
              const cajaTieneLibre = caja.productos.some(p => p.receta_tipo === 'libre')
              return (
                <div key={cajaIdx} style={{ background: '#fff', borderRadius: 8, padding: 16, marginBottom: 14, border: `1px solid ${!bal.ok && caja.cantidad_procesada && !cajaTieneLibre ? '#F5C2C2' : '#DDD8CF'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#9A8E85' }}>MATERIA PRIMA PROCESADA #{cajaIdx + 1}</div>
                    <button onClick={() => eliminarCaja(cajaIdx)} style={{ padding: '4px 10px', background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>✕ Eliminar caja</button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                    <div><label style={lbl}>CANTIDAD DE MATERIA PRIMA PROCESADA *</label><input type="number" value={caja.cantidad_procesada} onChange={e => actualizarCaja(cajaIdx, 'cantidad_procesada', e.target.value)} placeholder="0" style={inp} /></div>
                    <div><label style={lbl}>UNIDAD</label>
                      <select value={caja.unidad_mp} onChange={e => actualizarCaja(cajaIdx, 'unidad_mp', e.target.value)} style={inp}>
                        <option value="kg">kg</option><option value="lb">lb</option><option value="g">g</option>
                      </select>
                    </div>
                  </div>

                  {caja.productos.map((p, prodIdx) => {
                    return (
                      <div key={prodIdx} style={{ background: '#F4F1ED', borderRadius: 7, padding: 14, marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <div style={{ fontSize: 11, color: '#1A5FA8', fontWeight: 700 }}>
                            PRODUCTO {caja.productos.length > 1 ? `#${prodIdx + 1}` : ''}
                            {p.producto_id && (
                              <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: p.receta_tipo === 'libre' ? '#C07D00' : '#9A8E85', background: p.receta_tipo === 'libre' ? '#FEF3DC' : '#F0ECE5', padding: '2px 7px', borderRadius: 10 }}>
                                {p.receta_tipo === 'libre' ? 'RECETA LIBRE' : 'RECETA FIJA'}
                              </span>
                            )}
                          </div>
                          {caja.productos.length > 1 && (
                            <button onClick={() => eliminarProductoDeCaja(cajaIdx, prodIdx)} style={{ padding: '3px 8px', background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>✕</button>
                          )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                          <div><label style={lbl}>PRODUCTO TERMINADO *</label>
                            <select value={p.producto_id} onChange={e => actualizarProducto(cajaIdx, prodIdx, 'producto_id', e.target.value)} style={inp}>
                              <option value="">Selecciona...</option>
                              {productos.map(pr => <option key={pr.id} value={pr.id}>{pr.codigo} — {pr.nombre}{pr.receta_tipo === 'libre' ? ' (receta libre)' : ''}</option>)}
                            </select>
                          </div>
                          <div><label style={lbl}>CANTIDAD PRODUCIDA *</label><input type="number" value={p.cantidad_producida} onChange={e => actualizarProducto(cajaIdx, prodIdx, 'cantidad_producida', e.target.value)} placeholder="0" style={inp} /></div>
                          <div><label style={lbl}>UNIDAD</label>
                            <select value={p.unidad_producto} onChange={e => actualizarProducto(cajaIdx, prodIdx, 'unidad_producto', e.target.value)} style={inp}>
                              <option value="kg">kg</option><option value="lb">lb</option><option value="und">und</option><option value="g">g</option>
                            </select>
                          </div>
                          <div><label style={lbl}>LOTE PT <span style={{ fontSize: 9, color: '#9A8E85' }}>(auto)</span></label><input value={p.lote_producto} onChange={e => actualizarProducto(cajaIdx, prodIdx, 'lote_producto', e.target.value)} placeholder={generarLote('PT')} style={inp} /></div>
                        </div>

                        {/* RECETA FIJA: autocompletada desde producto_ingredientes */}
                        {p.producto_id && p.receta_tipo === 'fija' && p.cantidad_producida && p.ingredientes.length === 0 && (
                          <div style={{ background: '#FCEAEA', borderRadius: 7, padding: 10, fontSize: 12, color: '#B22222', marginBottom: 10 }}>⚠️ Este producto no tiene receta definida.</div>
                        )}

                        {p.receta_tipo === 'fija' && p.ingredientes.filter(i => !esEmpaqueOInsumo(i.categoria_mp)).length > 0 && (
                          <div style={{ background: '#fff', borderRadius: 7, padding: 12, marginBottom: 10 }}>
                            <div style={{ fontSize: 10, color: '#1A5FA8', fontWeight: 600, marginBottom: 8 }}>🥩 MATERIA(S) PRIMA(S) DE LA RECETA</div>
                            {p.ingredientes.map((ing, ingIdx) => {
                              if (esEmpaqueOInsumo(ing.categoria_mp)) return null
                              const totalUsado = ing.lotes_usados.reduce((s, l) => s + (parseFloat(l.cantidad_usada) || 0), 0)
                              const okTotal = Math.abs(totalUsado - ing.cantidad_requerida) < 0.001
                              return (
                                <div key={ingIdx} style={{ background: '#F4F1ED', borderRadius: 7, padding: 12, marginBottom: 8, border: `1px solid ${okTotal ? '#DDD8CF' : '#F5C2C2'}` }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <div>
                                      <span style={{ fontWeight: 600, fontSize: 13 }}>{ing.nombre}</span>
                                      <span style={{ fontSize: 11, color: '#9A8E85', marginLeft: 10 }}>Requerido: <b style={{ color: '#1A5FA8' }}>{fmtNum(ing.cantidad_requerida)} {ing.unidad_receta}</b></span>
                                    </div>
                                    <button onClick={() => agregarLoteIngrediente(cajaIdx, prodIdx, ingIdx)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>＋ Lote</button>
                                  </div>
                                  {ing.lotes_usados.map((lu, loteIdx) => (
                                    <div key={loteIdx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'end', marginBottom: 6 }}>
                                      <div><label style={lbl}>LOTE</label>
                                        <select value={lu.lote_id} onChange={e => actualizarLoteIngrediente(cajaIdx, prodIdx, ingIdx, loteIdx, 'lote_id', e.target.value)} style={inp}>
                                          <option value="">Selecciona lote...</option>
                                          {ing.lotes_disponibles.map(l => <option key={l.id} value={l.id}>{l.codigo_lote} — Disp: {fmtNum(l.cantidad_actual)} {ing.unidad_receta}</option>)}
                                        </select>
                                      </div>
                                      <div><label style={lbl}>CANTIDAD ({ing.unidad_receta})</label><input type="number" value={lu.cantidad_usada} onChange={e => actualizarLoteIngrediente(cajaIdx, prodIdx, ingIdx, loteIdx, 'cantidad_usada', e.target.value)} placeholder="0" style={inp} /></div>
                                      <button onClick={() => eliminarLoteIngrediente(cajaIdx, prodIdx, ingIdx, loteIdx)} style={{ padding: '8px 9px', background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, marginBottom: 1 }}>✕</button>
                                    </div>
                                  ))}
                                  <div style={{ fontSize: 11, marginTop: 4, color: '#9A8E85' }}>
                                    Total: <b style={{ color: okTotal ? '#1A9156' : '#B22222' }}>{fmtNum(totalUsado)} {ing.unidad_receta}</b> / {fmtNum(ing.cantidad_requerida)} {ing.unidad_receta} {okTotal && <span style={{ color: '#1A9156' }}>✓</span>}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* RECETA LIBRE: materias primas y cantidades a mano, para esta producción puntual */}
                        {p.producto_id && p.receta_tipo === 'libre' && (
                          <div style={{ background: '#fff', borderRadius: 7, padding: 12, marginBottom: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <div style={{ fontSize: 10, color: '#C07D00', fontWeight: 600 }}>🥩 MATERIAS PRIMAS USADAS (receta libre — regístralas para esta producción)</div>
                              <button onClick={() => agregarMateriaPrimaLibre(cajaIdx, prodIdx)} style={{ background: '#FEF3DC', color: '#C07D00', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>＋ Materia prima</button>
                            </div>
                            {p.ingredientes.length === 0 && (
                              <div style={{ fontSize: 12, color: '#9A8E85', textAlign: 'center', padding: 8 }}>Agrega al menos una materia prima usada</div>
                            )}
                            {p.ingredientes.map((ing, ingIdx) => {
                              const totalUsado = ing.lotes_usados.reduce((s, l) => s + (parseFloat(l.cantidad_usada) || 0), 0)
                              const cantReq = parseFloat(ing.cantidad_requerida) || 0
                              const okTotal = Math.abs(totalUsado - cantReq) < 0.001
                              return (
                                <div key={ingIdx} style={{ background: '#F4F1ED', borderRadius: 7, padding: 12, marginBottom: 8, border: `1px solid ${okTotal ? '#DDD8CF' : '#F5C2C2'}` }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'end', marginBottom: 8 }}>
                                    <div><label style={lbl}>MATERIA PRIMA / EMPAQUE</label>
                                      <select value={ing.materia_prima_id} onChange={e => actualizarMateriaPrimaLibre(cajaIdx, prodIdx, ingIdx, 'materia_prima_id', e.target.value)} style={inp}>
                                        <option value="">Selecciona...</option>
                                        {Object.entries(materialesPorCategoria).map(([cat, items]) => (
                                          <optgroup key={cat} label={etiquetaCategoria(cat)}>
                                            {items.map(mp => <option key={mp.id} value={mp.id}>{mp.codigo} — {mp.nombre} (Stock: {fmtNum(mp.stock_actual)} {mp.unidad})</option>)}
                                          </optgroup>
                                        ))}
                                      </select>
                                    </div>
                                    <div><label style={lbl}>CANTIDAD USADA ({ing.unidad_receta})</label>
                                      <input type="number" value={ing.cantidad_requerida} onChange={e => actualizarMateriaPrimaLibre(cajaIdx, prodIdx, ingIdx, 'cantidad_requerida', e.target.value)} placeholder="0" style={inp} />
                                    </div>
                                    <button onClick={() => eliminarMateriaPrimaLibre(cajaIdx, prodIdx, ingIdx)} style={{ padding: '8px 9px', background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, marginBottom: 1 }}>✕</button>
                                  </div>
                                  {ing.materia_prima_id && (
                                    <>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                        <span style={{ fontSize: 11, color: '#9A8E85' }}>Lotes usados</span>
                                        <button onClick={() => agregarLoteIngrediente(cajaIdx, prodIdx, ingIdx)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>＋ Lote</button>
                                      </div>
                                      {ing.lotes_usados.map((lu, loteIdx) => (
                                        <div key={loteIdx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'end', marginBottom: 6 }}>
                                          <div><label style={lbl}>LOTE</label>
                                            <select value={lu.lote_id} onChange={e => actualizarLoteIngrediente(cajaIdx, prodIdx, ingIdx, loteIdx, 'lote_id', e.target.value)} style={inp}>
                                              <option value="">Selecciona lote...</option>
                                              {ing.lotes_disponibles.map(l => <option key={l.id} value={l.id}>{l.codigo_lote} — Disp: {fmtNum(l.cantidad_actual)} {ing.unidad_receta}</option>)}
                                            </select>
                                          </div>
                                          <div><label style={lbl}>CANTIDAD ({ing.unidad_receta})</label><input type="number" value={lu.cantidad_usada} onChange={e => actualizarLoteIngrediente(cajaIdx, prodIdx, ingIdx, loteIdx, 'cantidad_usada', e.target.value)} placeholder="0" style={inp} /></div>
                                          <button onClick={() => eliminarLoteIngrediente(cajaIdx, prodIdx, ingIdx, loteIdx)} style={{ padding: '8px 9px', background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, marginBottom: 1 }}>✕</button>
                                        </div>
                                      ))}
                                      <div style={{ fontSize: 11, marginTop: 4, color: '#9A8E85' }}>
                                        Total: <b style={{ color: okTotal ? '#1A9156' : '#B22222' }}>{fmtNum(totalUsado)} {ing.unidad_receta}</b> / {fmtNum(cantReq)} {ing.unidad_receta} {okTotal && <span style={{ color: '#1A9156' }}>✓</span>}
                                      </div>
                                    </>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {p.ingredientes.filter(i => esEmpaqueOInsumo(i.categoria_mp)).length > 0 && (
                          <div style={{ background: '#fff', borderRadius: 7, padding: 12, marginBottom: 10 }}>
                            <div style={{ fontSize: 10, color: '#9A8E85', fontWeight: 600, marginBottom: 8 }}>📦 EMPAQUES / INSUMOS</div>
                            {p.ingredientes.map((ing, ingIdx) => {
                              if (!esEmpaqueOInsumo(ing.categoria_mp)) return null
                              const totalUsado = ing.lotes_usados.reduce((s, l) => s + (parseFloat(l.cantidad_usada) || 0), 0)
                              const okTotal = Math.abs(totalUsado - ing.cantidad_requerida) < 0.001
                              return (
                                <div key={ingIdx} style={{ background: '#F4F1ED', borderRadius: 7, padding: 12, marginBottom: 8, border: `1px solid ${okTotal ? '#DDD8CF' : '#F5C2C2'}` }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <div>
                                      <span style={{ fontWeight: 600, fontSize: 13 }}>{ing.nombre}</span>
                                      <span style={{ fontSize: 11, color: '#9A8E85', marginLeft: 10 }}>Requerido: <b style={{ color: '#1A5FA8' }}>{fmtNum(ing.cantidad_requerida)} {ing.unidad_receta}</b></span>
                                    </div>
                                    <button onClick={() => agregarLoteIngrediente(cajaIdx, prodIdx, ingIdx)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>＋ Lote</button>
                                  </div>
                                  {ing.lotes_usados.map((lu, loteIdx) => (
                                    <div key={loteIdx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'end', marginBottom: 6 }}>
                                      <div><label style={lbl}>LOTE <span style={{ fontSize: 9, color: '#9A8E85' }}>(editable — por defecto toma el siguiente disponible)</span></label>
                                        <select value={lu.lote_id} onChange={e => actualizarLoteIngrediente(cajaIdx, prodIdx, ingIdx, loteIdx, 'lote_id', e.target.value)} style={inp}>
                                          <option value="">Selecciona lote...</option>
                                          {ing.lotes_disponibles.map(l => <option key={l.id} value={l.id}>{l.codigo_lote} — Disp: {fmtNum(l.cantidad_actual)} {ing.unidad_receta}</option>)}
                                        </select>
                                      </div>
                                      <div><label style={lbl}>CANTIDAD ({ing.unidad_receta})</label>
                                        <input type="number" value={lu.cantidad_usada} disabled style={{ ...inp, opacity: 0.6, cursor: 'not-allowed' }} />
                                      </div>
                                      <button onClick={() => eliminarLoteIngrediente(cajaIdx, prodIdx, ingIdx, loteIdx)} style={{ padding: '8px 9px', background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, marginBottom: 1 }}>✕</button>
                                    </div>
                                  ))}
                                  <div style={{ fontSize: 11, marginTop: 4, color: '#9A8E85' }}>
                                    Total: <b style={{ color: okTotal ? '#1A9156' : '#B22222' }}>{fmtNum(totalUsado)} {ing.unidad_receta}</b> / {fmtNum(ing.cantidad_requerida)} {ing.unidad_receta} {okTotal && <span style={{ color: '#1A9156' }}>✓</span>}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  <button onClick={() => agregarProductoACaja(cajaIdx)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginBottom: 14 }}>
                    ＋ Agregar otro producto de esta misma materia prima
                  </button>

                  <div style={{ background: '#FFF8EC', border: '1px solid #F0DFB8', borderRadius: 7, padding: 12 }}>
                    <div style={{ fontSize: 10, color: '#9A8E85', fontWeight: 600, marginBottom: 10 }}>⚖️ BALANCE DE LA MATERIA PRIMA PROCESADA</div>

                    <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                      <label style={{ fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" checked={caja.tiene_subproducto} onChange={e => actualizarCaja(cajaIdx, 'tiene_subproducto', e.target.checked)} /> Subproducto
                      </label>
                      <label style={{ fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" checked={caja.tiene_recorte} onChange={e => actualizarCaja(cajaIdx, 'tiene_recorte', e.target.checked)} /> Recorte procesado
                      </label>
                      <label style={{ fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" checked={caja.tiene_sobrante} onChange={e => actualizarCaja(cajaIdx, 'tiene_sobrante', e.target.checked)} /> Sobrante (reproceso)
                      </label>
                    </div>

                    {caja.tiene_subproducto && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 8 }}>
                        <div><label style={lbl}>MATERIA PRIMA QUE RECIBE EL SUBPRODUCTO (EJ. "GRASA")</label>
                          <select value={caja.subproducto_id} onChange={e => actualizarCaja(cajaIdx, 'subproducto_id', e.target.value)} style={inp}>
                            <option value="">Selecciona...</option>
                            {subproductos.map(s => <option key={s.id} value={s.id}>{s.codigo} — {s.nombre} (Stock: {s.stock_actual} {s.unidad})</option>)}
                          </select>
                        </div>
                        <div><label style={lbl}>CANTIDAD OBTENIDA ({caja.unidad_mp})</label><input type="number" value={caja.cantidad_subproducto} onChange={e => actualizarCaja(cajaIdx, 'cantidad_subproducto', e.target.value)} placeholder="0" style={inp} /></div>
                      </div>
                    )}
                    {caja.tiene_recorte && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 8 }}>
                        <div><label style={lbl}>MATERIA PRIMA QUE RECIBE EL RECORTE PROCESADO</label>
                          <select value={caja.recorte_id} onChange={e => actualizarCaja(cajaIdx, 'recorte_id', e.target.value)} style={inp}>
                            <option value="">Selecciona...</option>
                            {subproductos.map(s => <option key={s.id} value={s.id}>{s.codigo} — {s.nombre} (Stock: {s.stock_actual} {s.unidad})</option>)}
                          </select>
                        </div>
                        <div><label style={lbl}>CANTIDAD OBTENIDA ({caja.unidad_mp})</label><input type="number" value={caja.cantidad_recorte} onChange={e => actualizarCaja(cajaIdx, 'cantidad_recorte', e.target.value)} placeholder="0" style={inp} /></div>
                      </div>
                    )}
                    {caja.tiene_sobrante && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 8 }}>
                        <div><label style={lbl}>MATERIA PRIMA QUE RECIBE EL SOBRANTE</label>
                          <select value={caja.sobrante_id} onChange={e => actualizarCaja(cajaIdx, 'sobrante_id', e.target.value)} style={inp}>
                            <option value="">Selecciona...</option>
                            {subproductos.map(s => <option key={s.id} value={s.id}>{s.codigo} — {s.nombre} (Stock: {s.stock_actual} {s.unidad})</option>)}
                          </select>
                        </div>
                        <div><label style={lbl}>CANTIDAD OBTENIDA ({caja.unidad_mp})</label><input type="number" value={caja.cantidad_sobrante} onChange={e => actualizarCaja(cajaIdx, 'cantidad_sobrante', e.target.value)} placeholder="0" style={inp} /></div>
                      </div>
                    )}

                    <div style={{ maxWidth: 200, marginBottom: 10 }}><label style={lbl}>MERMA ({caja.unidad_mp})</label><input type="number" value={caja.merma} onChange={e => actualizarCaja(cajaIdx, 'merma', e.target.value)} placeholder="0" style={inp} /></div>

                    {caja.cantidad_procesada && (
                      <div style={{ background: bal.ok ? '#E8F7EF' : (cajaTieneLibre ? '#FFF8EC' : '#FCEAEA'), borderRadius: 7, padding: 10, fontSize: 12 }}>
                        <div style={{ fontWeight: 600, color: bal.ok ? '#1A9156' : (cajaTieneLibre ? '#C07D00' : '#B22222'), marginBottom: 4 }}>
                          {bal.ok ? '✓ Balance correcto' : cajaTieneLibre ? 'ℹ️ Balance no cuadra exacto — informativo, esta caja tiene producto de receta libre' : '⚠️ Balance incorrecto'}
                        </div>
                        <div style={{ color: '#5A4F47' }}>
                          Procesado: <b>{fmtNum(bal.procesada)} {caja.unidad_mp}</b> = Consumo de {caja.productos.length} producto(s): <b>{fmtNum(bal.consumo)}</b>
                          {caja.tiene_subproducto && ` + Subprod: ${fmtNum(caja.cantidad_subproducto)}`}
                          {caja.tiene_recorte && ` + Recorte: ${fmtNum(caja.cantidad_recorte)}`}
                          {caja.tiene_sobrante && ` + Sobrante: ${fmtNum(caja.cantidad_sobrante)}`}
                          {` + Merma: ${fmtNum(caja.merma)}`} = <b style={{ color: bal.ok ? '#1A9156' : (cajaTieneLibre ? '#C07D00' : '#B22222') }}>{fmtNum(bal.suma)}</b>
                          {!bal.ok && <span style={{ color: cajaTieneLibre ? '#C07D00' : '#B22222' }}> (diferencia: {bal.diff > 0 ? '+' : ''}{fmtNum(bal.diff)})</span>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={cancelarFormulario} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={guardar} disabled={guardando} style={{ padding: '8px 16px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {guardando ? 'Guardando...' : editando ? '💾 Actualizar producción' : '⚙️ Registrar producción'}
            </button>
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85' }}>Cargando...</div> : producciones.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚙️</div><div style={{ fontWeight: 600 }}>No hay producciones registradas</div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: '#F4F1ED' }}>
              {['Folio','Fecha','Operario','Acciones'].map(h => <th key={h} style={{ padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {producciones.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #DDD8CF' }}>
                  <td style={{ padding: '11px 16px', fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: '#B22222' }}>{p.folio}</td>
                  <td style={{ padding: '11px 16px', fontSize: 11, fontFamily: 'monospace', color: '#9A8E85' }}>{p.fecha_produccion}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13 }}>{p.operario || '—'}</td>
                  <td style={{ padding: '8px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => verDetalle(p)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>👁️</button>
                      <button onClick={() => abrirEdicion(p)} style={{ background: '#FEF3DC', color: '#C07D00', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                      <button onClick={() => setAEliminar(p)} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}