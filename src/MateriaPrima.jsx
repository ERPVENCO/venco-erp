import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export default function MateriaPrima() {
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [filtroCategoria, setFiltroCategoria] = useState('todos')
  const [editando, setEditando] = useState(null)
  const [materiaDetalle, setMateriaDetalle] = useState(null)
  const [nuevo, setNuevo] = useState({
    nombre: '', categoria_mp: 'materia_prima',
    precio_kg: '', stock_actual: '', stock_minimo: '',
    unidad: 'kg', codigo_barras: '',
    fecha_caducidad: '', informacion_adicional: ''
  })

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('productos')
      .select('*')
      .eq('tipo_inventario', 'materia_prima')
      .order('categoria_mp')
    setProductos(data || [])
    setLoading(false)
  }

  const generarIniciales = (nombre) => {
    return nombre.trim().split(/\s+/).map(palabra => {
      const match = palabra.match(/[a-zA-Z0-9]+/)
      if (!match) return ''
      const p = match[0]
      if (/^\d/.test(p)) return p
      return p[0].toUpperCase()
    }).join('').toUpperCase()
  }

  const generarPrefijo = (categoria_mp) => {
    const prefijos = { materia_prima: 'MP', insumos: 'INS', empaques: 'EMP' }
    return prefijos[categoria_mp] || 'MP'
  }

  const obtenerConsecutivo = async (prefijoCodigo) => {
    const { data } = await supabase
      .from('productos')
      .select('codigo')
      .like('codigo', `${prefijoCodigo}-%`)
    const siguiente = (data?.length || 0) + 1
    return String(siguiente).padStart(3, '0')
  }

  const generarCodigo = async (nombre, categoria_mp) => {
    const prefijo = generarPrefijo(categoria_mp)
    const iniciales = generarIniciales(nombre)
    const prefijoCodigo = `${prefijo}-${iniciales}`
    const consecutivo = await obtenerConsecutivo(prefijoCodigo)
    return `${prefijoCodigo}-${consecutivo}`
  }

  const codigoPreview = nuevo.nombre
    ? `${generarPrefijo(nuevo.categoria_mp)}-${generarIniciales(nuevo.nombre)}-001`
    : '—'

  const abrirEditar = (p) => {
    setEditando(p)
    setNuevo({
      nombre: p.nombre || '',
      categoria_mp: p.categoria_mp || 'materia_prima',
      precio_kg: p.precio_kg ?? '',
      stock_actual: p.stock_actual ?? '',
      stock_minimo: p.stock_minimo ?? '',
      unidad: p.unidad || 'kg',
      codigo_barras: p.codigo_barras || '',
      fecha_caducidad: p.fecha_caducidad || '',
      informacion_adicional: p.informacion_adicional || ''
    })
    setMostrarForm(true)
  }

  const cerrarForm = () => {
    setMostrarForm(false)
    setEditando(null)
    setNuevo({ nombre: '', categoria_mp: 'materia_prima', precio_kg: '', stock_actual: '', stock_minimo: '', unidad: 'kg', codigo_barras: '', fecha_caducidad: '', informacion_adicional: '' })
  }

  const guardar = async () => {
    if (!nuevo.nombre) { alert('El nombre es obligatorio'); return }
    if (!nuevo.precio_kg) { alert('El costo es obligatorio'); return }

    if (editando) {
      // No se toca el código ni el costo_promedio (ponderado por compras) al editar manualmente
      const { error } = await supabase.from('productos').update({
        nombre: nuevo.nombre,
        categoria_mp: nuevo.categoria_mp,
        precio_kg: parseFloat(nuevo.precio_kg) || 0,
        stock_actual: parseFloat(nuevo.stock_actual) || 0,
        stock_minimo: parseFloat(nuevo.stock_minimo) || 0,
        unidad: nuevo.unidad,
        codigo_barras: nuevo.codigo_barras,
        fecha_caducidad: nuevo.fecha_caducidad || null,
        informacion_adicional: nuevo.informacion_adicional,
      }).eq('id', editando.id)
      if (error) { alert('Error: ' + error.message); return }
    } else {
      const codigo = await generarCodigo(nuevo.nombre, nuevo.categoria_mp)
      const { error } = await supabase.from('productos').insert([{
        codigo,
        nombre: nuevo.nombre,
        categoria: 'materia_prima',
        categoria_mp: nuevo.categoria_mp,
        tipo_inventario: 'materia_prima',
        precio_kg: parseFloat(nuevo.precio_kg) || 0,
        costo_promedio: parseFloat(nuevo.precio_kg) || 0,
        stock_actual: parseFloat(nuevo.stock_actual) || 0,
        stock_minimo: parseFloat(nuevo.stock_minimo) || 0,
        unidad: nuevo.unidad,
        codigo_barras: nuevo.codigo_barras,
        fecha_caducidad: nuevo.fecha_caducidad || null,
        informacion_adicional: nuevo.informacion_adicional,
      }])
      if (error) { alert('Error: ' + error.message); return }
    }

    cerrarForm()
    cargar()
  }

  const eliminar = async (p) => {
    const { data: enUso } = await supabase
      .from('producto_ingredientes')
      .select('id')
      .eq('materia_prima_id', p.id)

    const estaEnUso = enUso && enUso.length > 0

    const mensaje = estaEnUso
      ? `⚠️ No se puede eliminar porque está siendo utilizado en un ingrediente.\n\n¿Estás segura de que deseas eliminarlo? Ten en cuenta que también se eliminará el ingrediente del producto.`
      : `¿Estás segura que deseas eliminar "${p.nombre}"?`

    const confirmar = window.confirm(mensaje)
    if (!confirmar) return

    if (estaEnUso) {
      await supabase.from('producto_ingredientes').delete().eq('materia_prima_id', p.id)
    }

    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('auditoria').insert([{
      tabla: 'productos',
      accion: 'ELIMINACIÓN',
      descripcion: `${p.codigo} — ${p.nombre}${estaEnUso ? ' (también se eliminaron ingredientes vinculados)' : ''}`,
      datos_anteriores: p,
      usuario_email: user?.email || 'desconocido',
      fecha: new Date().toISOString()
    }])

    const { error } = await supabase.from('productos').delete().eq('id', p.id)

    if (error) {
      alert('Error al eliminar: ' + error.message)
    } else {
      cargar()
    }
  }

  const estadoStock = (actual, minimo) => {
    if (actual <= 0) return { texto: 'Sin stock', color: '#B22222', bg: '#FCEAEA' }
    if (actual <= minimo) return { texto: 'Crítico', color: '#B22222', bg: '#FCEAEA' }
    if (actual <= minimo * 1.5) return { texto: 'Bajo', color: '#C07D00', bg: '#FEF3DC' }
    return { texto: 'OK', color: '#1A9156', bg: '#E8F7EF' }
  }

  const categoriaColor = (cat) => {
    const c = { materia_prima: '#1A5FA8', insumos: '#6B3FA0', empaques: '#C07D00' }
    return c[cat] || '#9A8E85'
  }

  const categoriaNombre = (cat) => {
    const n = { materia_prima: 'Materia Prima', insumos: 'Insumos', empaques: 'Empaques' }
    return n[cat] || cat
  }

  const productosFiltrados = filtroCategoria === 'todos'
    ? productos
    : productos.filter(p => p.categoria_mp === filtroCategoria)

  const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }

  return (
    <div>
      {/* Modal ver detalle */}
      {materiaDetalle && (
        <div onClick={() => setMateriaDetalle(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 26, width: 420, maxWidth: '95vw', boxShadow: '0 8px 28px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{materiaDetalle.nombre}</div>
              <span onClick={() => setMateriaDetalle(null)} style={{ cursor: 'pointer', fontSize: 20, color: '#9A8E85' }}>×</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>CÓDIGO</span><br/>{materiaDetalle.codigo}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>CATEGORÍA</span><br/>{categoriaNombre(materiaDetalle.categoria_mp)}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>UNIDAD</span><br/>{materiaDetalle.unidad}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>STOCK ACTUAL</span><br/>{materiaDetalle.stock_actual} {materiaDetalle.unidad}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>STOCK MÍNIMO</span><br/>{materiaDetalle.stock_minimo} {materiaDetalle.unidad}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>COSTO PROMEDIO</span><br/>${(materiaDetalle.costo_promedio ?? materiaDetalle.precio_kg)?.toLocaleString('es-CO')}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>ÚLTIMO COSTO</span><br/>{materiaDetalle.ultimo_costo ? `$${materiaDetalle.ultimo_costo?.toLocaleString('es-CO')}` : '—'}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>CÓDIGO DE BARRAS</span><br/>{materiaDetalle.codigo_barras || '—'}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>CADUCIDAD</span><br/>{materiaDetalle.fecha_caducidad || '—'}</div>
              {materiaDetalle.informacion_adicional && (
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>NOTAS</span><br/>{materiaDetalle.informacion_adicional}</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>🧂 Materia Prima e Insumos</div>
          <div style={{ fontSize: 13, color: '#9A8E85', marginTop: 4 }}>
            {productos.length} insumos registrados
            {filtroCategoria !== 'todos' && ` · ${productosFiltrados.length} en esta categoría`}
          </div>
        </div>
        <button onClick={() => setMostrarForm(true)} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ＋ Nuevo insumo
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {['todos', 'materia_prima', 'insumos', 'empaques'].map(cat => (
          <button key={cat} onClick={() => setFiltroCategoria(cat)} style={{
            padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 500,
            cursor: 'pointer', border: 'none',
            background: filtroCategoria === cat ? '#B22222' : '#fff',
            color: filtroCategoria === cat ? '#fff' : '#5A4F47',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
          }}>
            {cat === 'todos' ? 'Todos' : categoriaNombre(cat)}
          </button>
        ))}
      </div>

      {mostrarForm && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{editando ? 'Editar insumo' : 'Nuevo insumo'}</div>
            <div style={{ background: '#F4F1ED', padding: '6px 14px', borderRadius: 7, fontSize: 12 }}>
              Código: <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#B22222' }}>{editando ? editando.codigo : codigoPreview}</span>
            </div>
          </div>

          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>CAMPOS OBLIGATORIOS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>NOMBRE *</label>
                <input value={nuevo.nombre} onChange={e => setNuevo({...nuevo, nombre: e.target.value})} placeholder="Ej. Papada Importada" style={inp} maxLength={100} />
                <div style={{ fontSize: 10, color: '#9A8E85', marginTop: 3, textAlign: 'right' }}>{nuevo.nombre.length}/100</div>
              </div>
              <div>
                <label style={lbl}>COSTO / UNIDAD *</label>
                <input type="number" value={nuevo.precio_kg} onChange={e => setNuevo({...nuevo, precio_kg: e.target.value})} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={lbl}>CATEGORÍA *</label>
                <select value={nuevo.categoria_mp} onChange={e => setNuevo({...nuevo, categoria_mp: e.target.value})} style={inp}>
                  <option value="materia_prima">Materia Prima</option>
                  <option value="insumos">Insumos</option>
                  <option value="empaques">Empaques</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>CAMPOS OPCIONALES</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>CÓDIGO DE BARRAS</label>
                <input value={nuevo.codigo_barras} onChange={e => setNuevo({...nuevo, codigo_barras: e.target.value})} placeholder="Escanea o escribe" style={inp} maxLength={60} />
                <div style={{ fontSize: 10, color: '#9A8E85', marginTop: 3, textAlign: 'right' }}>{nuevo.codigo_barras.length}/60</div>
              </div>
              <div>
                <label style={lbl}>UNIDAD DE MEDIDA</label>
                <select value={nuevo.unidad} onChange={e => setNuevo({...nuevo, unidad: e.target.value})} style={inp}>
                  <option value="kg">Kilogramo (kg)</option>
                  <option value="g">Gramo (g)</option>
                  <option value="lt">Litro (lt)</option>
                  <option value="und">Unidad (und)</option>
                  <option value="lb">Libra (lb)</option>
                </select>
              </div>
              <div>
                <label style={lbl}>CANTIDAD {editando ? 'ACTUAL' : 'INICIAL'}</label>
                <input type="number" value={nuevo.stock_actual} onChange={e => setNuevo({...nuevo, stock_actual: e.target.value})} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={lbl}>CANTIDAD MÍNIMA</label>
                <input type="number" value={nuevo.stock_minimo} onChange={e => setNuevo({...nuevo, stock_minimo: e.target.value})} placeholder="0" style={inp} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>INFORMACIÓN ADICIONAL</label>
                <textarea value={nuevo.informacion_adicional} onChange={e => setNuevo({...nuevo, informacion_adicional: e.target.value})} placeholder="Notas opcionales..." style={{ ...inp, height: 70, resize: 'none' }} maxLength={250} />
                <div style={{ fontSize: 10, color: '#9A8E85', marginTop: 3, textAlign: 'right' }}>{nuevo.informacion_adicional.length}/250</div>
              </div>
            </div>
          </div>

          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 8 }}>CADUCIDAD</div>
            <input type="date" value={nuevo.fecha_caducidad} onChange={e => setNuevo({...nuevo, fecha_caducidad: e.target.value})} style={inp} />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={cerrarForm} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={guardar} style={{ padding: '8px 16px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {editando ? 'Actualizar' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85' }}>Cargando...</div>
      ) : productosFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🧂</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No hay insumos registrados</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Haz clic en "Nuevo insumo" para agregar el primero</div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F4F1ED' }}>
                {['Código','Nombre','Categoría','Unidad','Stock actual','Stock mínimo','Costo promedio','Último costo','Caducidad','Estado','Acciones'].map(h => (
                  <th key={h} style={{ padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.map(p => {
                const estado = estadoStock(p.stock_actual, p.stock_minimo)
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #DDD8CF' }}>
                    <td style={{ padding: '11px 16px', fontSize: 11, color: '#9A8E85', fontFamily: 'monospace' }}>{p.codigo}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600 }}>{p.nombre}</td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ background: categoriaColor(p.categoria_mp) + '20', color: categoriaColor(p.categoria_mp), padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500 }}>
                        {categoriaNombre(p.categoria_mp)}
                      </span>
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 13 }}>{p.unidad}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace' }}>{p.stock_actual} {p.unidad}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace' }}>{p.stock_minimo} {p.unidad}</td>
                    {/* Costo promedio ponderado — se actualiza automáticamente con cada compra */}
                    <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: '#1A5FA8' }}>
                      ${(p.costo_promedio ?? p.precio_kg)?.toLocaleString('es-CO')}
                    </td>
                    {/* Último costo pagado en la compra más reciente */}
                    <td style={{ padding: '11px 16px', fontSize: 12, fontFamily: 'monospace', color: '#9A8E85' }}>
                      {p.ultimo_costo ? `$${p.ultimo_costo?.toLocaleString('es-CO')}` : '—'}
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 12, color: p.fecha_caducidad ? '#B22222' : '#9A8E85' }}>{p.fecha_caducidad || '—'}</td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ background: estado.bg, color: estado.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500 }}>{estado.texto}</span>
                    </td>
                    <td style={{ padding: '8px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setMateriaDetalle(p)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                          👁️
                        </button>
                        <button onClick={() => abrirEditar(p)} style={{ background: '#FEF3DC', color: '#C07D00', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                          ✏️
                        </button>
                        <button onClick={() => eliminar(p)} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                          🗑️
                        </button>
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