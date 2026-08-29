import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import ModalEliminar from './ModalEliminar'

const hoyISO = () => new Date().toISOString().split('T')[0]
const generarLote = (prefijo) => {
  const hoy = new Date()
  const dd = String(hoy.getDate()).padStart(2, '0')
  const mm = String(hoy.getMonth() + 1).padStart(2, '0')
  const yy = String(hoy.getFullYear()).slice(2)
  return `${prefijo}-${dd}${mm}${yy}`
}

export default function Manufactura() {
  const [vista, setVista] = useState('menu')
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>🏭 Manufactura</div>
      {vista === 'menu' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            {[
              { id: 'formulaciones', icon: '📋', label: 'Formulaciones' },
              { id: 'batches', icon: '🧪', label: 'Batches de Mezcla' },
              { id: 'produccion', icon: '⚙️', label: 'Producción' },
            ].map(m => (
              <button key={m.id} onClick={() => setVista(m.id)} style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: '14px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>{m.icon}</span> {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {vista === 'formulaciones' && <Formulaciones onVolver={() => setVista('menu')} />}
      {vista === 'batches' && <Batches onVolver={() => setVista('menu')} />}
      {vista === 'produccion' && <Produccion onVolver={() => setVista('menu')} />}
    </div>
  )
}

// ─────────────────────────────────────────────
// FORMULACIONES (sin cambios)
// ─────────────────────────────────────────────
function Formulaciones({ onVolver }) {
  const [formulaciones, setFormulaciones] = useState([])
  const [insumos, setInsumos] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [aEliminar, setAEliminar] = useState(null)
  const [form, setForm] = useState({ nombre: '', descripcion: '', cantidad_base: 1, unidad: 'kg' })
  const [ingredientes, setIngredientes] = useState([])

  useEffect(() => { cargar(); cargarInsumos() }, [])

  const cargar = async () => {
    setLoading(true)
    const { data } = await supabase.from('formulaciones').select('*').order('nombre')
    setFormulaciones(data || [])
    setLoading(false)
  }

  const cargarInsumos = async () => {
    const { data } = await supabase.from('productos').select('*')
      .eq('tipo_inventario', 'materia_prima').eq('categoria_mp', 'insumos').order('nombre')
    setInsumos(data || [])
  }

  const abrirNuevo = () => {
    setEditando(null)
    setForm({ nombre: '', descripcion: '', cantidad_base: 1, unidad: 'kg' })
    setIngredientes([])
    setMostrarForm(true)
  }

  const abrirEditar = async (f) => {
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
    updated[i][campo] = valor
    if (campo === 'insumo_id') {
      const ins = insumos.find(x => x.id === valor)
      if (ins) { updated[i].nombre_insumo = ins.nombre; updated[i].unidad = ins.unidad || 'kg' }
    }
    setIngredientes(updated)
  }

  const guardar = async () => {
    if (!form.nombre) { alert('Ingresa el nombre'); return }
    if (ingredientes.length === 0) { alert('Agrega al menos un ingrediente'); return }
    if (ingredientes.some(i => !i.insumo_id || !i.cantidad)) { alert('Completa todos los ingredientes'); return }

    if (editando) {
      const { error: errUpdate } = await supabase.from('formulaciones').update({ nombre: form.nombre, descripcion: form.descripcion, cantidad_base: parseFloat(form.cantidad_base), unidad: form.unidad }).eq('id', editando.id)
      if (errUpdate) { alert('Error al actualizar: ' + errUpdate.message); return }
      await supabase.from('formulacion_ingredientes').delete().eq('formulacion_id', editando.id)
      for (const ing of ingredientes) {
        const { error: errIng } = await supabase.from('formulacion_ingredientes').insert([{ formulacion_id: editando.id, insumo_id: ing.insumo_id, nombre_insumo: ing.nombre_insumo, cantidad: parseFloat(ing.cantidad), unidad: ing.unidad }])
        if (errIng) { alert('Error al guardar ingrediente: ' + errIng.message); return }
      }
    } else {
      const { data, error: errInsert } = await supabase.from('formulaciones').insert([{ nombre: form.nombre, descripcion: form.descripcion, cantidad_base: parseFloat(form.cantidad_base), unidad: form.unidad }]).select()
      if (errInsert) { alert('Error al guardar: ' + errInsert.message); return }
      const fId = data[0].id
      for (const ing of ingredientes) {
        const { error: errIng } = await supabase.from('formulacion_ingredientes').insert([{ formulacion_id: fId, insumo_id: ing.insumo_id, nombre_insumo: ing.nombre_insumo, cantidad: parseFloat(ing.cantidad), unidad: ing.unidad }])
        if (errIng) { alert('Error al guardar ingrediente: ' + errIng.message); return }
      }
    }
    cerrar(); cargar()
  }

  const eliminar = async () => {
    await supabase.from('formulaciones').delete().eq('id', aEliminar.id)
    setAEliminar(null); cargar()
  }

  const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }

  return (
    <div>
      {aEliminar && <ModalEliminar item={aEliminar} tabla="formulaciones" descripcion={aEliminar.nombre} onConfirm={eliminar} onCancel={() => setAEliminar(null)} />}
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
              <div><label style={lbl}>CANTIDAD BASE</label><input type="number" value={form.cantidad_base} onChange={e => setForm({...form, cantidad_base: e.target.value})} style={inp} /></div>
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
            {ingredientes.map((ing, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'end', marginBottom: 8 }}>
                <div><label style={lbl}>INSUMO</label>
                  <select value={ing.insumo_id} onChange={e => actualizarIngrediente(i, 'insumo_id', e.target.value)} style={inp}>
                    <option value="">Selecciona...</option>
                    {insumos.map(ins => <option key={ins.id} value={ins.id}>{ins.nombre}</option>)}
                  </select>
                </div>
                <div><label style={lbl}>CANTIDAD</label><input type="number" value={ing.cantidad} onChange={e => actualizarIngrediente(i, 'cantidad', e.target.value)} placeholder="0" style={inp} /></div>
                <div><label style={lbl}>UNIDAD</label>
                  <select value={ing.unidad} onChange={e => actualizarIngrediente(i, 'unidad', e.target.value)} style={inp}>
                    <option value="kg">kg</option><option value="g">g</option><option value="lt">lt</option><option value="und">und</option><option value="ml">ml</option>
                  </select>
                </div>
                <button onClick={() => setIngredientes(ingredientes.filter((_, j) => j !== i))} style={{ padding: '8px 10px', background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, marginBottom: 1 }}>✕</button>
              </div>
            ))}
            {ingredientes.length === 0 && <div style={{ fontSize: 12, color: '#9A8E85', textAlign: 'center', padding: 8 }}>Agrega los insumos de la fórmula</div>}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={cerrar} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={guardar} style={{ padding: '8px 16px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Guardar</button>
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
              {['Nombre','Cantidad base','Descripción','Acciones'].map(h => <th key={h} style={{ padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {formulaciones.map(f => (
                <tr key={f.id} style={{ borderBottom: '1px solid #DDD8CF' }}>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600 }}>{f.nombre}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13 }}>{f.cantidad_base} {f.unidad}</td>
                  <td style={{ padding: '11px 16px', fontSize: 12, color: '#9A8E85' }}>{f.descripcion || '—'}</td>
                  <td style={{ padding: '8px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => abrirEditar(f)} style={{ background: '#FEF3DC', color: '#C07D00', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                      <button onClick={() => setAEliminar(f)} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
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
// BATCHES (sin cambios)
// ─────────────────────────────────────────────
function Batches({ onVolver }) {
  const [batches, setBatches] = useState([])
  const [formulaciones, setFormulaciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [aEliminar, setAEliminar] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [form, setForm] = useState({ formulacion_id: '', cantidad_preparada: '', unidad: 'kg', codigo_lote: '', fecha_preparacion: hoyISO(), operario: '', observaciones: '' })
  const [ingredientesCalc, setIngredientesCalc] = useState([])

  useEffect(() => { cargar(); cargarFormulaciones() }, [])

  const cargar = async () => {
    setLoading(true)
    const { data } = await supabase.from('batches').select('*').order('creado_en', { ascending: false })
    setBatches(data || [])
    setLoading(false)
  }

  const cargarFormulaciones = async () => {
    const { data } = await supabase.from('formulaciones').select('*, formulacion_ingredientes(*)').eq('activo', true)
    setFormulaciones(data || [])
  }

  const calcularIngredientes = (formulacion_id, cantidad) => {
    const form_sel = formulaciones.find(f => f.id === formulacion_id)
    if (!form_sel || !cantidad) { setIngredientesCalc([]); return }
    const factor = parseFloat(cantidad) / parseFloat(form_sel.cantidad_base)
    setIngredientesCalc((form_sel.formulacion_ingredientes || []).map(ing => ({
      ...ing,
      cantidad_calculada: parseFloat((ing.cantidad * factor).toFixed(4))
    })))
  }

  const cerrar = () => {
    setMostrarForm(false)
    setIngredientesCalc([])
    setForm({ formulacion_id: '', cantidad_preparada: '', unidad: 'kg', codigo_lote: '', fecha_preparacion: hoyISO(), operario: '', observaciones: '' })
  }

  const siguienteFolio = async () => {
    const { data } = await supabase.from('batches').select('folio').order('folio', { ascending: false }).limit(1)
    if (!data || data.length === 0) return 'BCH-0001'
    const n = parseInt(data[0].folio.replace('BCH-', '')) + 1
    return `BCH-${String(n).padStart(4, '0')}`
  }

  const guardar = async () => {
    if (!form.formulacion_id) { alert('Selecciona una formulación'); return }
    if (!form.cantidad_preparada) { alert('Ingresa la cantidad'); return }

    setGuardando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const folio = await siguienteFolio()
    const formulacion = formulaciones.find(f => f.id === form.formulacion_id)
    const codigo_lote = form.codigo_lote || generarLote('BCH')

    let costo_total = 0
    for (const ing of ingredientesCalc) {
      const { data: insumo } = await supabase.from('productos').select('costo_promedio, precio_kg').eq('id', ing.insumo_id).single()
      const costo_unit = parseFloat(insumo?.costo_promedio || insumo?.precio_kg || 0)
      costo_total += costo_unit * ing.cantidad_calculada
    }
    const costo_por_kg = parseFloat(form.cantidad_preparada) > 0 ? costo_total / parseFloat(form.cantidad_preparada) : 0

    const { data: batchData, error } = await supabase.from('batches').insert([{
      folio, formulacion_id: form.formulacion_id, formulacion_nombre: formulacion?.nombre || '',
      cantidad_preparada: parseFloat(form.cantidad_preparada), unidad: form.unidad,
      costo_total: Math.round(costo_total), costo_por_kg: Math.round(costo_por_kg),
      codigo_lote, fecha_preparacion: form.fecha_preparacion,
      operario: form.operario || null, observaciones: form.observaciones || null,
      stock_actual: parseFloat(form.cantidad_preparada), usuario_email: user?.email
    }]).select()

    if (error) { alert('Error: ' + error.message); setGuardando(false); return }

    for (const ing of ingredientesCalc) {
      const { data: ins } = await supabase.from('productos').select('stock_actual').eq('id', ing.insumo_id).single()
      if (ins) await supabase.from('productos').update({ stock_actual: Math.max(0, (ins.stock_actual || 0) - ing.cantidad_calculada) }).eq('id', ing.insumo_id)
    }

    cerrar(); setGuardando(false); cargar()
  }

  const eliminar = async () => {
    await supabase.from('batches').delete().eq('id', aEliminar.id)
    setAEliminar(null); cargar()
  }

  const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }

  return (
    <div>
      {aEliminar && <ModalEliminar item={aEliminar} tabla="batches" descripcion={`${aEliminar.folio} — ${aEliminar.formulacion_nombre}`} onConfirm={eliminar} onCancel={() => setAEliminar(null)} />}

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
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>COSTO/KG</span><br/><b>${detalle.costo_por_kg?.toLocaleString('es-CO')}</b></div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>COSTO TOTAL</span><br/><b>${detalle.costo_total?.toLocaleString('es-CO')}</b></div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>FECHA</span><br/>{detalle.fecha_preparacion}</div>
              {detalle.operario && <div><span style={{ color: '#9A8E85', fontSize: 11 }}>OPERARIO</span><br/>{detalle.operario}</div>}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onVolver} style={{ background: '#F4F1ED', border: '1px solid #DDD8CF', borderRadius: 7, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>← Volver</button>
          <div style={{ fontSize: 16, fontWeight: 700 }}>🧪 Batches de Mezcla</div>
        </div>
        <button onClick={() => setMostrarForm(true)} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>＋ Nuevo batch</button>
      </div>

      {mostrarForm && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 22, marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Nuevo batch de mezcla</div>
          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={lbl}>FORMULACIÓN *</label>
                <select value={form.formulacion_id} onChange={e => { setForm({...form, formulacion_id: e.target.value}); calcularIngredientes(e.target.value, form.cantidad_preparada) }} style={inp}>
                  <option value="">Selecciona una formulación...</option>
                  {formulaciones.map(f => <option key={f.id} value={f.id}>{f.nombre} (base: {f.cantidad_base} {f.unidad})</option>)}
                </select>
              </div>
              <div><label style={lbl}>CANTIDAD A PREPARAR *</label>
                <input type="number" value={form.cantidad_preparada} onChange={e => { setForm({...form, cantidad_preparada: e.target.value}); calcularIngredientes(form.formulacion_id, e.target.value) }} placeholder="0" style={inp} />
              </div>
              <div><label style={lbl}>UNIDAD</label>
                <select value={form.unidad} onChange={e => setForm({...form, unidad: e.target.value})} style={inp}>
                  <option value="kg">kg</option><option value="g">g</option><option value="lt">lt</option>
                </select>
              </div>
              <div><label style={lbl}>FECHA</label><input type="date" value={form.fecha_preparacion} onChange={e => setForm({...form, fecha_preparacion: e.target.value})} style={inp} /></div>
              <div><label style={lbl}>LOTE <span style={{ color: '#9A8E85', fontSize: 9 }}>(auto si vacío)</span></label><input value={form.codigo_lote} onChange={e => setForm({...form, codigo_lote: e.target.value})} placeholder={generarLote('BCH')} style={inp} /></div>
              <div><label style={lbl}>OPERARIO</label><input value={form.operario} onChange={e => setForm({...form, operario: e.target.value})} placeholder="Nombre" style={inp} /></div>
            </div>
            <div><label style={lbl}>OBSERVACIONES</label><input value={form.observaciones} onChange={e => setForm({...form, observaciones: e.target.value})} placeholder="Notas" style={inp} /></div>
          </div>

          {ingredientesCalc.length > 0 && (
            <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 10 }}>INGREDIENTES CALCULADOS</div>
              {ingredientesCalc.map((ing, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', borderRadius: 7, padding: '8px 12px', marginBottom: 6, fontSize: 13 }}>
                  <span style={{ fontWeight: 500 }}>{ing.nombre_insumo}</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1A5FA8' }}>{ing.cantidad_calculada} {ing.unidad}</span>
                </div>
              ))}
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
              {['Folio','Formulación','Lote','Cantidad','Stock','Costo/kg','Fecha','Acciones'].map(h => <th key={h} style={{ padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.id} style={{ borderBottom: '1px solid #DDD8CF' }}>
                  <td style={{ padding: '11px 16px', fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: '#B22222' }}>{b.folio}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600 }}>{b.formulacion_nombre}</td>
                  <td style={{ padding: '11px 16px', fontSize: 11, fontFamily: 'monospace', color: '#1A5FA8', fontWeight: 600 }}>{b.codigo_lote}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13 }}>{b.cantidad_preparada} {b.unidad}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600, color: b.stock_actual > 0 ? '#1A9156' : '#B22222' }}>{b.stock_actual} {b.unidad}</td>
                  <td style={{ padding: '11px 16px', fontSize: 12, fontFamily: 'monospace' }}>${b.costo_por_kg?.toLocaleString('es-CO')}</td>
                  <td style={{ padding: '11px 16px', fontSize: 11, color: '#9A8E85', fontFamily: 'monospace' }}>{b.fecha_preparacion}</td>
                  <td style={{ padding: '8px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setDetalle(b)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>👁️</button>
                      <button onClick={() => setAEliminar(b)} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
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
// PRODUCCIÓN — cada "caja" agrupa una materia prima procesada
// compartida por uno o varios productos elaborados a partir de ella
// ─────────────────────────────────────────────
function Produccion({ onVolver }) {
  const [producciones, setProducciones] = useState([])
  const [productos, setProductos] = useState([])
  const [subproductos, setSubproductos] = useState([])
  const [batches, setBatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [aEliminar, setAEliminar] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [detalleGrupos, setDetalleGrupos] = useState([])

  const [fechaProduccion, setFechaProduccion] = useState(hoyISO())
  const [operario, setOperario] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [cajas, setCajas] = useState([])
  const [batchId, setBatchId] = useState('')
  const [batchLote, setBatchLote] = useState('')
  const [batchNombre, setBatchNombre] = useState('')
  const [cantidadBatch, setCantidadBatch] = useState('')

  const onCambiarBatch = (valor) => {
    setBatchId(valor)
    const b = batches.find(x => x.id === valor)
    setBatchLote(b?.codigo_lote || '')
    setBatchNombre(b?.formulacion_nombre || '')
  }

  useEffect(() => { cargar(); cargarCatalogos() }, [])

  const cargar = async () => {
    setLoading(true)
    const { data } = await supabase.from('producciones').select('*').order('creado_en', { ascending: false })
    setProducciones(data || [])
    setLoading(false)
  }

  const cargarCatalogos = async () => {
    const [{ data: prods }, { data: subs }, { data: bchs }] = await Promise.all([
      supabase.from('productos').select('*').eq('tipo_inventario', 'producto_terminado').order('nombre'),
      supabase.from('productos').select('*').eq('tipo_inventario', 'materia_prima').eq('categoria_mp', 'materia_prima').order('nombre'),
      supabase.from('batches').select('*').gt('stock_actual', 0).order('fecha_preparacion', { ascending: true })
    ])
    setProductos(prods || [])
    setSubproductos(subs || [])
    setBatches(bchs || [])
  }

  const calcularIngredientes = async (producto_id, cantidad_producida) => {
    const cant = parseFloat(cantidad_producida) || 0
    if (!producto_id) return []

    const { data: receta } = await supabase
      .from('producto_ingredientes')
      .select('*, productos!materia_prima_id (id, nombre, codigo, unidad, stock_actual, tipo_inventario)')
      .eq('producto_id', producto_id)

    if (!receta || receta.length === 0) return []

    return await Promise.all(receta.map(async (ing) => {
      const cantidad_requerida = parseFloat(ing.cantidad) * cant

      const { data: lotes } = await supabase
        .from('lotes')
        .select('*')
        .eq('producto_id', ing.materia_prima_id)
        .gt('cantidad_actual', 0)
        .order('fecha_ingreso', { ascending: true })

      const lotes_usados = []
      let restante = cantidad_requerida
      for (const lote of (lotes || [])) {
        if (restante <= 0) break
        const usar = Math.min(lote.cantidad_actual, restante)
        lotes_usados.push({
          lote_id: lote.id, codigo_lote: lote.codigo_lote,
          cantidad_usada: parseFloat(usar.toFixed(4)), disponible: lote.cantidad_actual
        })
        restante -= usar
      }

      return {
        materia_prima_id: ing.materia_prima_id,
        nombre: ing.productos?.nombre || '',
        tipo_inventario: ing.productos?.tipo_inventario || 'materia_prima',
        unidad_receta: ing.unidad,
        cantidad_receta: parseFloat(ing.cantidad),
        cantidad_requerida: parseFloat(cantidad_requerida.toFixed(4)),
        stock_actual: ing.productos?.stock_actual || 0,
        lotes_disponibles: lotes || [],
        lotes_usados
      }
    }))
  }

  const productoVacio = () => ({
    producto_id: '', nombre_producto: '',
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

  const actualizarProducto = async (cajaIdx, prodIdx, campo, valor) => {
    const updated = [...cajas]
    const p = updated[cajaIdx].productos[prodIdx]
    p[campo] = valor

    if (campo === 'producto_id') {
      const prod = productos.find(x => x.id === valor)
      p.nombre_producto = prod?.nombre || ''
      p.ingredientes = valor ? await calcularIngredientes(valor, p.cantidad_producida) : []
    }
    if (campo === 'cantidad_producida') {
      p.ingredientes = p.producto_id ? await calcularIngredientes(p.producto_id, valor) : []
    }

    setCajas(updated)
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

  const consumoMPProducto = (producto) => producto.ingredientes.filter(i => i.tipo_inventario === 'materia_prima').reduce((s, i) => s + i.cantidad_requerida, 0)
  const ingredientesNoMP = (producto) => producto.ingredientes.filter(i => i.tipo_inventario !== 'materia_prima')
  const fmtNum = (n) => (parseFloat(n) || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })

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

  const guardar = async () => {
    if (cajas.length === 0) { alert('Agrega al menos una materia prima procesada'); return }

    for (const caja of cajas) {
      if (!caja.cantidad_procesada) { alert('Ingresa la cantidad de materia prima procesada en todas las cajas'); return }
      if (caja.productos.length === 0 || caja.productos.some(p => !p.producto_id)) { alert('Selecciona el producto terminado en todos los ítems'); return }

      for (const p of caja.productos) {
        if (!p.cantidad_producida) { alert(`Ingresa la cantidad producida para: ${p.nombre_producto}`); return }
        if (p.ingredientes.length === 0) { alert(`El producto ${p.nombre_producto} no tiene receta definida`); return }
        for (const ing of p.ingredientes) {
          const totalUsado = ing.lotes_usados.reduce((s, l) => s + (parseFloat(l.cantidad_usada) || 0), 0)
          if (Math.abs(totalUsado - ing.cantidad_requerida) > 0.001) {
            alert(`${p.nombre_producto} — ${ing.nombre}: la suma de lotes (${totalUsado.toFixed(4)}) debe ser ${ing.cantidad_requerida} ${ing.unidad_receta}`)
            return
          }
          for (const lu of ing.lotes_usados) {
            if (!lu.lote_id || !lu.cantidad_usada) { alert(`Completa todos los lotes de ${ing.nombre}`); return }
            if (parseFloat(lu.cantidad_usada) > lu.disponible) { alert(`${ing.nombre} lote ${lu.codigo_lote}: supera el disponible (${lu.disponible})`); return }
          }
        }
      }

      const bal = calcularBalanceCaja(caja)
      if (!bal.ok) {
        alert(`Balance incorrecto: materia prima procesada (${bal.procesada}) debe ser igual a consumo de todos los productos + subproducto + recorte + sobrante + merma (suma actual: ${bal.suma})`)
        return
      }
      if (caja.tiene_subproducto && parseFloat(caja.cantidad_subproducto) > 0 && !caja.subproducto_id) { alert('Selecciona el producto de inventario para el subproducto'); return }
      if (caja.tiene_recorte && parseFloat(caja.cantidad_recorte) > 0 && !caja.recorte_id) { alert('Selecciona el producto de inventario para el recorte'); return }
      if (caja.tiene_sobrante && parseFloat(caja.cantidad_sobrante) > 0 && !caja.sobrante_id) { alert('Selecciona el producto de inventario para el sobrante'); return }
    }

    if (batchId) {
      if (!cantidadBatch || parseFloat(cantidadBatch) <= 0) { alert('Ingresa la cantidad de mezcla de humo usada'); return }
      const b = batches.find(x => x.id === batchId)
      if (b && parseFloat(cantidadBatch) > b.stock_actual) { alert('La cantidad de mezcla supera el stock disponible del batch'); return }
    }

    setGuardando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const folio = await siguienteFolio()

    const batchSel = batches.find(b => b.id === batchId)
    const costoBatchTotal = batchId ? (parseFloat(cantidadBatch) || 0) * (batchSel?.costo_por_kg || 0) : 0
    const totalCantidadProducida = cajas.reduce((s, c) => s + c.productos.reduce((s2, p) => s2 + (parseFloat(p.cantidad_producida) || 0), 0), 0)

    const { data: prodData, error } = await supabase.from('producciones').insert([{
      folio, fecha_produccion: fechaProduccion, operario: operario || null,
      observaciones: observaciones || null, usuario_email: user?.email,
      batch_id: batchId || null, batch_nombre: batchNombre || null, batch_lote: batchLote || null,
      cantidad_batch: batchId ? parseFloat(cantidadBatch) : null,
      costo_batch_total: batchId ? costoBatchTotal : null
    }]).select()
    if (error) { alert('Error: ' + error.message); setGuardando(false); return }
    const produccionId = prodData[0].id

    for (const caja of cajas) {
      const subprod = subproductos.find(s => s.id === caja.subproducto_id)
      const recorte = subproductos.find(s => s.id === caja.recorte_id)
      const sobrante = subproductos.find(s => s.id === caja.sobrante_id)

      const { data: grupoData } = await supabase.from('produccion_grupos').insert([{
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
      }]).select()
      const grupoId = grupoData[0].id

      for (const p of caja.productos) {
        const lote_producto = p.lote_producto || generarLote('PT')
        const costoMezclaAsignado = batchId && totalCantidadProducida > 0
          ? costoBatchTotal * ((parseFloat(p.cantidad_producida) || 0) / totalCantidadProducida)
          : null

        const { data: itemData } = await supabase.from('produccion_items').insert([{
          produccion_id: produccionId, grupo_id: grupoId,
          producto_id: p.producto_id, nombre_producto: p.nombre_producto,
          cantidad_producida: parseFloat(p.cantidad_producida), unidad_producto: p.unidad_producto,
          lote_producto,
          costo_mezcla_asignado: costoMezclaAsignado
        }]).select()
        const itemId = itemData[0].id

        for (const ing of p.ingredientes) {
          for (const lu of ing.lotes_usados) {
            const cantUsada = parseFloat(lu.cantidad_usada)

            await supabase.from('produccion_lotes_mp').insert([{
              produccion_item_id: itemId, insumo_id: ing.materia_prima_id, nombre_insumo: ing.nombre,
              lote_id: lu.lote_id, codigo_lote: lu.codigo_lote, cantidad_usada: cantUsada, unidad: ing.unidad_receta
            }])

            const { data: loteAct } = await supabase.from('lotes').select('cantidad_actual').eq('id', lu.lote_id).single()
            if (loteAct) await supabase.from('lotes').update({ cantidad_actual: Math.max(0, loteAct.cantidad_actual - cantUsada) }).eq('id', lu.lote_id)

            const { data: insAct } = await supabase.from('productos').select('stock_actual').eq('id', ing.materia_prima_id).single()
            if (insAct) await supabase.from('productos').update({ stock_actual: Math.max(0, (insAct.stock_actual || 0) - cantUsada) }).eq('id', ing.materia_prima_id)
          }
        }

        const { data: ptAct } = await supabase.from('productos').select('stock_actual').eq('id', p.producto_id).single()
        await supabase.from('productos').update({ stock_actual: (ptAct?.stock_actual || 0) + parseFloat(p.cantidad_producida) }).eq('id', p.producto_id)
        await supabase.from('lotes').insert([{ producto_id: p.producto_id, codigo_lote: lote_producto, cantidad_inicial: parseFloat(p.cantidad_producida), cantidad_actual: parseFloat(p.cantidad_producida), fecha_ingreso: fechaProduccion }])
      }

      for (const [activo, prodId, cantidadStr, prefijo] of [
        [caja.tiene_subproducto, caja.subproducto_id, caja.cantidad_subproducto, 'SB'],
        [caja.tiene_recorte, caja.recorte_id, caja.cantidad_recorte, 'RC'],
        [caja.tiene_sobrante, caja.sobrante_id, caja.cantidad_sobrante, 'SO']
      ]) {
        const cantidad = parseFloat(cantidadStr) || 0
        if (activo && prodId && cantidad > 0) {
          const { data: destAct } = await supabase.from('productos').select('stock_actual').eq('id', prodId).single()
          await supabase.from('productos').update({ stock_actual: (destAct?.stock_actual || 0) + cantidad }).eq('id', prodId)
          await supabase.from('lotes').insert([{ producto_id: prodId, codigo_lote: generarLote(prefijo), cantidad_inicial: cantidad, cantidad_actual: cantidad, fecha_ingreso: fechaProduccion }])
        }
      }
    }

    if (batchId && cantidadBatch) {
      const cantB = parseFloat(cantidadBatch)
      const { data: batchAct } = await supabase.from('batches').select('stock_actual').eq('id', batchId).single()
      if (batchAct) await supabase.from('batches').update({ stock_actual: Math.max(0, (batchAct.stock_actual || 0) - cantB) }).eq('id', batchId)
    }

    setCajas([]); setFechaProduccion(hoyISO()); setOperario(''); setObservaciones('')
    setBatchId(''); setBatchLote(''); setBatchNombre(''); setCantidadBatch('')
    setMostrarForm(false); setGuardando(false); cargar(); cargarCatalogos()
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
      {aEliminar && <ModalEliminar item={aEliminar} tabla="producciones" descripcion={aEliminar.folio} onConfirm={async () => { await supabase.from('producciones').delete().eq('id', aEliminar.id); setAEliminar(null); cargar() }} onCancel={() => setAEliminar(null)} />}

      {detalle && (
        <div onClick={() => setDetalle(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 26, width: 680, maxWidth: '95vw', boxShadow: '0 8px 28px rgba(0,0,0,0.15)', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div><div style={{ fontSize: 15, fontWeight: 700 }}>{detalle.folio}</div><div style={{ fontSize: 12, color: '#9A8E85' }}>{detalle.fecha_produccion} {detalle.operario ? `· ${detalle.operario}` : ''}</div></div>
              <span onClick={() => setDetalle(null)} style={{ cursor: 'pointer', fontSize: 20, color: '#9A8E85' }}>×</span>
            </div>
            {detalle.batch_nombre && (
              <div style={{ background: '#FFF8EC', border: '1px solid #F0DFB8', borderRadius: 7, padding: 10, fontSize: 12, marginBottom: 14 }}>
                🧪 Mezcla de humo: <b>{detalle.batch_nombre}</b> ({detalle.batch_lote}) — {detalle.cantidad_batch} kg — Costo total: <b style={{ color: '#B22222' }}>${Number(detalle.costo_batch_total).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</b>
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
                      {item.costo_mezcla_asignado != null && <> — Costo mezcla asignado: <b style={{ color: '#B22222' }}>${Number(item.costo_mezcla_asignado).toLocaleString('es-CO', { maximumFractionDigits: 0 })}</b></>}
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
        <button onClick={() => setMostrarForm(true)} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>＋ Nueva producción</button>
      </div>

      {mostrarForm && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Nueva producción</div>

          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 10 }}>DATOS GENERALES</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={lbl}>FECHA</label><input type="date" value={fechaProduccion} onChange={e => setFechaProduccion(e.target.value)} style={inp} /></div>
              <div><label style={lbl}>OPERARIO</label><input value={operario} onChange={e => setOperario(e.target.value)} placeholder="Nombre del operario" style={inp} /></div>
              <div style={{ gridColumn: '1/-1' }}><label style={lbl}>OBSERVACIONES</label><input value={observaciones} onChange={e => setObservaciones(e.target.value)} placeholder="Notas" style={inp} /></div>
            </div>
          </div>

          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 10 }}>🧪 MEZCLA DE HUMO (costo indirecto de toda la producción)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
              <div><label style={lbl}>BATCH</label>
                <select value={batchId} onChange={e => onCambiarBatch(e.target.value)} style={inp}>
                  <option value="">Sin batch</option>
                  {batches.map(b => <option key={b.id} value={b.id}>{b.codigo_lote} — {b.formulacion_nombre} (Stock: {b.stock_actual} {b.unidad}, ${b.costo_por_kg?.toLocaleString('es-CO')}/kg)</option>)}
                </select>
              </div>
              <div><label style={lbl}>CANTIDAD USADA (KG)</label><input type="number" value={cantidadBatch} onChange={e => setCantidadBatch(e.target.value)} placeholder="0" style={inp} /></div>
            </div>
            {batchId && cantidadBatch && (
              <div style={{ fontSize: 11, color: '#9A8E85', marginTop: 8 }}>
                Costo total del batch usado: <b style={{ color: '#B22222' }}>
                  ${((parseFloat(cantidadBatch) || 0) * (batches.find(b => b.id === batchId)?.costo_por_kg || 0)).toLocaleString('es-CO', { maximumFractionDigits: 0 })}
                </b> — se distribuirá entre los productos de esta orden según su participación (cantidad producida)
              </div>
            )}
          </div>

          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600 }}>PRODUCTOS A PROCESAR</div>
              <button onClick={agregarCaja} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>＋ Agregar</button>
            </div>
            {cajas.length === 0 && <div style={{ fontSize: 12, color: '#9A8E85', textAlign: 'center', padding: 10 }}>Haz clic en "＋ Agregar" para iniciar</div>}

            {cajas.map((caja, cajaIdx) => {
              const bal = calcularBalanceCaja(caja)
              return (
                <div key={cajaIdx} style={{ background: '#fff', borderRadius: 8, padding: 16, marginBottom: 14, border: `1px solid ${!bal.ok && caja.cantidad_procesada ? '#F5C2C2' : '#DDD8CF'}` }}>
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
                    const noMP = ingredientesNoMP(p)
                    return (
                      <div key={prodIdx} style={{ background: '#F4F1ED', borderRadius: 7, padding: 14, marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <div style={{ fontSize: 11, color: '#1A5FA8', fontWeight: 700 }}>PRODUCTO {caja.productos.length > 1 ? `#${prodIdx + 1}` : ''}</div>
                          {caja.productos.length > 1 && (
                            <button onClick={() => eliminarProductoDeCaja(cajaIdx, prodIdx)} style={{ padding: '3px 8px', background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11 }}>✕</button>
                          )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                          <div><label style={lbl}>PRODUCTO TERMINADO *</label>
                            <select value={p.producto_id} onChange={e => actualizarProducto(cajaIdx, prodIdx, 'producto_id', e.target.value)} style={inp}>
                              <option value="">Selecciona...</option>
                              {productos.map(pr => <option key={pr.id} value={pr.id}>{pr.codigo} — {pr.nombre}</option>)}
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

                        {p.producto_id && p.cantidad_producida && p.ingredientes.length === 0 && (
                          <div style={{ background: '#FCEAEA', borderRadius: 7, padding: 10, fontSize: 12, color: '#B22222', marginBottom: 10 }}>⚠️ Este producto no tiene receta definida.</div>
                        )}

                        {p.ingredientes.filter(i => i.tipo_inventario === 'materia_prima').length > 0 && (
                          <div style={{ background: '#fff', borderRadius: 7, padding: 12, marginBottom: 10 }}>
                            <div style={{ fontSize: 10, color: '#1A5FA8', fontWeight: 600, marginBottom: 8 }}>🥩 MATERIA(S) PRIMA(S) DE LA RECETA</div>
                            {p.ingredientes.map((ing, ingIdx) => {
                              if (ing.tipo_inventario !== 'materia_prima') return null
                              const totalUsado = ing.lotes_usados.reduce((s, l) => s + (parseFloat(l.cantidad_usada) || 0), 0)
                              const ok = Math.abs(totalUsado - ing.cantidad_requerida) < 0.001
                              return (
                                <div key={ingIdx} style={{ background: '#F4F1ED', borderRadius: 7, padding: 12, marginBottom: 8, border: `1px solid ${ok ? '#DDD8CF' : '#F5C2C2'}` }}>
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
                                    Total: <b style={{ color: ok ? '#1A9156' : '#B22222' }}>{fmtNum(totalUsado)} {ing.unidad_receta}</b> / {fmtNum(ing.cantidad_requerida)} {ing.unidad_receta} {ok && <span style={{ color: '#1A9156' }}>✓</span>}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {noMP.length > 0 && (
                          <div style={{ background: '#fff', borderRadius: 7, padding: 12, marginBottom: 10 }}>
                            <div style={{ fontSize: 10, color: '#9A8E85', fontWeight: 600, marginBottom: 8 }}>📦 EMPAQUES / INSUMOS (se descuentan automático)</div>
                            {noMP.map((ing, ni) => {
                              const totalUsado = ing.lotes_usados.reduce((s, l) => s + (parseFloat(l.cantidad_usada) || 0), 0)
                              const ok = Math.abs(totalUsado - ing.cantidad_requerida) < 0.001
                              return (
                                <div key={ni} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F4F1ED', borderRadius: 6, padding: '8px 10px', marginBottom: 6, fontSize: 12 }}>
                                  <span>{ing.nombre}</span>
                                  <span style={{ fontWeight: 600, color: ok ? '#1A9156' : '#B22222' }}>{totalUsado.toLocaleString('es-CO', { maximumFractionDigits: 2 })} / {ing.cantidad_requerida.toLocaleString('es-CO', { maximumFractionDigits: 2 })} {ing.unidad_receta}</span>
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
                      <div style={{ background: bal.ok ? '#E8F7EF' : '#FCEAEA', borderRadius: 7, padding: 10, fontSize: 12 }}>
                        <div style={{ fontWeight: 600, color: bal.ok ? '#1A9156' : '#B22222', marginBottom: 4 }}>{bal.ok ? '✓ Balance correcto' : '⚠️ Balance incorrecto'}</div>
                        <div style={{ color: '#5A4F47' }}>
                          Procesado: <b>{fmtNum(bal.procesada)} {caja.unidad_mp}</b> = Consumo de {caja.productos.length} producto(s): <b>{fmtNum(bal.consumo)}</b>
                          {caja.tiene_subproducto && ` + Subprod: ${fmtNum(caja.cantidad_subproducto)}`}
                          {caja.tiene_recorte && ` + Recorte: ${fmtNum(caja.cantidad_recorte)}`}
                          {caja.tiene_sobrante && ` + Sobrante: ${fmtNum(caja.cantidad_sobrante)}`}
                          {` + Merma: ${fmtNum(caja.merma)}`} = <b style={{ color: bal.ok ? '#1A9156' : '#B22222' }}>{fmtNum(bal.suma)}</b>
                          {!bal.ok && <span style={{ color: '#B22222' }}> (diferencia: {bal.diff > 0 ? '+' : ''}{fmtNum(bal.diff)})</span>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setMostrarForm(false); setCajas([]); setBatchId(''); setBatchLote(''); setBatchNombre(''); setCantidadBatch('') }} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={guardar} disabled={guardando} style={{ padding: '8px 16px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {guardando ? 'Guardando...' : '⚙️ Registrar producción'}
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