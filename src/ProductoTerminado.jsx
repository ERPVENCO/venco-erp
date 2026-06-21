import { useState, useEffect } from 'react'
import ModalEliminar from './ModalEliminar'
import { supabase } from './supabase'

export default function ProductoTerminado() {
  const [productos, setProductos] = useState([])
  const [materiasPrimas, setMateriasPrimas] = useState([])
  const [familias, setFamilias] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [filtroFamilia, setFiltroFamilia] = useState('todos')
  const [ingredientes, setIngredientes] = useState([])
  const [fotoArchivo, setFotoArchivo] = useState(null)
  const [fotoPreview, setFotoPreview] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [productoAEliminar, setProductoAEliminar] = useState(null)
  const [nuevo, setNuevo] = useState({
    codigo_manual: '', nombre: '', familia: '',
    descripcion: '', presentacion: 'Kg',
    precio_kg: '', precio2: '', precio3: '', precio4: '', precio5: '',
    stock_actual: '', stock_minimo: '',
    fecha_caducidad: '', informacion_adicional: ''
  })

  useEffect(() => { cargar(); cargarMaterias() }, [])

  const cargar = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('productos')
      .select('*')
      .eq('tipo_inventario', 'producto_terminado')
      .order('familia')
    setProductos(data || [])
    const fams = [...new Set((data || []).map(p => p.familia).filter(Boolean))]
    setFamilias(fams)
    setLoading(false)
  }

  const cargarMaterias = async () => {
    const { data } = await supabase
      .from('productos')
      .select('*')
      .eq('tipo_inventario', 'materia_prima')
      .order('categoria_mp')
    setMateriasPrimas(data || [])
  }

  const seleccionarFoto = (e) => {
    const archivo = e.target.files[0]
    if (!archivo) return
    setFotoArchivo(archivo)
    setFotoPreview(URL.createObjectURL(archivo))
  }

  const subirFoto = async (codigo) => {
    if (!fotoArchivo) return null
    try {
      const extension = fotoArchivo.name.split('.').pop()
      const nombreArchivo = `${codigo}.${extension}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('Productos')
        .upload(nombreArchivo, fotoArchivo, { upsert: true, contentType: fotoArchivo.type })
      if (uploadError) return null
      const { data: urlData } = supabase.storage.from('Productos').getPublicUrl(nombreArchivo)
      return urlData.publicUrl
    } catch (err) {
      return null
    }
  }

  const agregarIngrediente = () => {
    setIngredientes([...ingredientes, { materia_prima_id: '', cantidad: '', unidad: 'kg' }])
  }

  const actualizarIngrediente = (index, campo, valor) => {
    const updated = [...ingredientes]
    updated[index][campo] = valor
    if (campo === 'materia_prima_id') {
      const mp = materiasPrimas.find(m => m.id === valor)
      if (mp) updated[index].unidad = mp.unidad
    }
    setIngredientes(updated)
  }

  const eliminarIngrediente = (index) => {
    setIngredientes(ingredientes.filter((_, i) => i !== index))
  }

  const eliminar = async () => {
    const { error } = await supabase
      .from('productos')
      .delete()
      .eq('id', productoAEliminar.id)
    if (error) {
      alert('Error al eliminar: ' + error.message)
    } else {
      setProductoAEliminar(null)
      cargar()
    }
  }

  const guardar = async () => {
    if (!nuevo.codigo_manual) { alert('El código es obligatorio'); return }
    if (!nuevo.nombre) { alert('El nombre es obligatorio'); return }
    if (!nuevo.precio_kg) { alert('El precio 1 es obligatorio'); return }
    if (!nuevo.familia) { alert('La familia es obligatoria'); return }
    setGuardando(true)
    const { data: existe } = await supabase
      .from('productos').select('id').eq('codigo_manual', nuevo.codigo_manual)
    if (existe?.length > 0) {
      alert('Ese código ya existe. Por favor usa uno diferente.')
      setGuardando(false)
      return
    }
    const foto_url = await subirFoto(nuevo.codigo_manual)
    const { data, error } = await supabase.from('productos').insert([{
      codigo: nuevo.codigo_manual,
      codigo_manual: nuevo.codigo_manual,
      nombre: nuevo.nombre,
      familia: nuevo.familia.toUpperCase(),
      descripcion: nuevo.descripcion,
      presentacion: nuevo.presentacion,
      categoria: 'producto_terminado',
      tipo_inventario: 'producto_terminado',
      precio_kg: parseFloat(nuevo.precio_kg) || 0,
      precio2: parseFloat(nuevo.precio2) || 0,
      precio3: parseFloat(nuevo.precio3) || 0,
      precio4: parseFloat(nuevo.precio4) || 0,
      precio5: parseFloat(nuevo.precio5) || 0,
      stock_actual: parseFloat(nuevo.stock_actual) || 0,
      stock_minimo: parseFloat(nuevo.stock_minimo) || 0,
      unidad: nuevo.presentacion,
      fecha_caducidad: nuevo.fecha_caducidad || null,
      informacion_adicional: nuevo.informacion_adicional,
      foto_url,
    }]).select()
    if (error) { alert('Error: ' + error.message); setGuardando(false); return }
    if (ingredientes.length > 0 && data?.[0]) {
      const items = ingredientes
        .filter(i => i.materia_prima_id && i.cantidad)
        .map(i => ({ producto_id: data[0].id, materia_prima_id: i.materia_prima_id, cantidad: parseFloat(i.cantidad), unidad: i.unidad }))
      if (items.length > 0) await supabase.from('producto_ingredientes').insert(items)
    }
    setMostrarForm(false)
    setIngredientes([])
    setFotoArchivo(null)
    setFotoPreview(null)
    setNuevo({ codigo_manual: '', nombre: '', familia: '', descripcion: '', presentacion: 'Kg', precio_kg: '', precio2: '', precio3: '', precio4: '', precio5: '', stock_actual: '', stock_minimo: '', fecha_caducidad: '', informacion_adicional: '' })
    setGuardando(false)
    cargar()
  }

  const estadoStock = (actual, minimo) => {
    if (actual <= 0) return { texto: 'Sin stock', color: '#B22222', bg: '#FCEAEA' }
    if (actual <= minimo) return { texto: 'Crítico', color: '#B22222', bg: '#FCEAEA' }
    if (actual <= minimo * 1.5) return { texto: 'Bajo', color: '#C07D00', bg: '#FEF3DC' }
    return { texto: 'OK', color: '#1A9156', bg: '#E8F7EF' }
  }

  const productosFiltrados = filtroFamilia === 'todos'
    ? productos
    : productos.filter(p => p.familia === filtroFamilia)

  const mpPorCategoria = materiasPrimas.reduce((acc, mp) => {
    const cat = mp.categoria_mp || 'otros'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(mp)
    return acc
  }, {})

  const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }

  return (
    <div>
      {/* Modal eliminar — AQUÍ arriba de todo */}
      {productoAEliminar && (
        <ModalEliminar
          item={productoAEliminar}
          tabla="productos"
          descripcion={`${productoAEliminar.codigo} — ${productoAEliminar.nombre}`}
          onConfirm={eliminar}
          onCancel={() => setProductoAEliminar(null)}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>🌭 Producto Terminado</div>
          <div style={{ fontSize: 13, color: '#5A4F47', marginTop: 4, fontWeight: 500 }}>
            {productosFiltrados.length} productos registrados
            {filtroFamilia !== 'todos' && ` · filtrando por ${filtroFamilia}`}
          </div>
        </div>
        <button onClick={() => setMostrarForm(true)} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ＋ Nuevo producto
        </button>
      </div>

      {/* Filtros por familia */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {['todos', ...familias].map(fam => (
          <button key={fam} onClick={() => setFiltroFamilia(fam)} style={{
            padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 500,
            cursor: 'pointer', border: 'none',
            background: filtroFamilia === fam ? '#B22222' : '#fff',
            color: filtroFamilia === fam ? '#fff' : '#5A4F47',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
          }}>
            {fam === 'todos' ? 'Todos' : fam}
          </button>
        ))}
      </div>

      {mostrarForm && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Nuevo producto terminado</div>

          {/* Foto */}
          <div style={{ display: 'flex', gap: 20, marginBottom: 16, alignItems: 'flex-start' }}>
            <div style={{ width: 120, height: 120, border: '2px dashed #DDD8CF', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F1ED', overflow: 'hidden', flexShrink: 0 }}>
              {fotoPreview
                ? <img src={fotoPreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ textAlign: 'center', color: '#9A8E85', fontSize: 12 }}><div style={{ fontSize: 28, marginBottom: 4 }}>📷</div><div>Sin foto</div></div>
              }
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>FOTO DEL PRODUCTO</label>
              <input type="file" accept="image/*" onChange={seleccionarFoto} style={{ ...inp, padding: '6px' }} />
              <div style={{ fontSize: 11, color: '#9A8E85', marginTop: 4 }}>Formatos: JPG, PNG. Máx 2MB</div>
            </div>
          </div>

          {/* Campos obligatorios */}
          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>CAMPOS OBLIGATORIOS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>CÓDIGO *</label>
                <input value={nuevo.codigo_manual} onChange={e => setNuevo({...nuevo, codigo_manual: e.target.value.toUpperCase()})} placeholder="Ej. TEK01" style={inp} maxLength={20} />
              </div>
              <div>
                <label style={lbl}>FAMILIA *</label>
                <input value={nuevo.familia} onChange={e => setNuevo({...nuevo, familia: e.target.value.toUpperCase()})} placeholder="Ej. TOCINETA" style={inp} list="familias-list" />
                <datalist id="familias-list">
                  {familias.map(f => <option key={f} value={f} />)}
                </datalist>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>NOMBRE *</label>
                <input value={nuevo.nombre} onChange={e => setNuevo({...nuevo, nombre: e.target.value})} placeholder="Ej. Tocineta Entera M&Y" style={inp} maxLength={100} />
                <div style={{ fontSize: 10, color: '#9A8E85', marginTop: 3, textAlign: 'right' }}>{nuevo.nombre.length}/100</div>
              </div>
              <div>
                <label style={lbl}>PRESENTACIÓN *</label>
                <select value={nuevo.presentacion} onChange={e => setNuevo({...nuevo, presentacion: e.target.value})} style={inp}>
                  <option value="Kg">Kilogramo (Kg)</option>
                  <option value="Lb">Libra (Lb)</option>
                  <option value="Und">Unidad (Und)</option>
                  <option value="g">Gramo (g)</option>
                  <option value="Lt">Litro (Lt)</option>
                </select>
              </div>
              <div>
                <label style={lbl}>DESCRIPCIÓN</label>
                <input value={nuevo.descripcion} onChange={e => setNuevo({...nuevo, descripcion: e.target.value})} placeholder="Ej. Cortes selectos" style={inp} />
              </div>
            </div>
          </div>

          {/* Precios */}
          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>PRECIOS</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
              {[
                { key: 'precio_kg', label: 'PRECIO 1 *' },
                { key: 'precio2', label: 'PRECIO 2' },
                { key: 'precio3', label: 'PRECIO 3' },
                { key: 'precio4', label: 'PRECIO 4' },
                { key: 'precio5', label: 'PRECIO 5' },
              ].map(p => (
                <div key={p.key}>
                  <label style={lbl}>{p.label}</label>
                  <input type="number" value={nuevo[p.key]} onChange={e => setNuevo({...nuevo, [p.key]: e.target.value})} placeholder="0" style={inp} />
                </div>
              ))}
            </div>
          </div>

          {/* Stock */}
          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>STOCK</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>STOCK INICIAL</label>
                <input type="number" value={nuevo.stock_actual} onChange={e => setNuevo({...nuevo, stock_actual: e.target.value})} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={lbl}>STOCK MÍNIMO</label>
                <input type="number" value={nuevo.stock_minimo} onChange={e => setNuevo({...nuevo, stock_minimo: e.target.value})} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={lbl}>FECHA CADUCIDAD</label>
                <input type="date" value={nuevo.fecha_caducidad} onChange={e => setNuevo({...nuevo, fecha_caducidad: e.target.value})} style={inp} />
              </div>
            </div>
          </div>

          {/* Ingredientes */}
          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600 }}>🧂 INGREDIENTES / MATERIAS PRIMAS</div>
              <button onClick={agregarIngrediente} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                ＋ Agregar
              </button>
            </div>
            {materiasPrimas.length === 0 && (
              <div style={{ padding: 12, background: '#FEF3DC', borderRadius: 7, fontSize: 12, color: '#C07D00' }}>
                ⚠️ Primero registra materias primas en el módulo de Materia Prima e Insumos.
              </div>
            )}
            {ingredientes.length === 0 && materiasPrimas.length > 0 && (
              <div style={{ padding: 12, background: '#fff', borderRadius: 7, fontSize: 12, color: '#9A8E85', textAlign: 'center' }}>
                Haz clic en "＋ Agregar" para seleccionar ingredientes
              </div>
            )}
            {ingredientes.map((ing, index) => (
              <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, marginBottom: 10, alignItems: 'end' }}>
                <div>
                  <label style={lbl}>MATERIA PRIMA</label>
                  <select value={ing.materia_prima_id} onChange={e => actualizarIngrediente(index, 'materia_prima_id', e.target.value)} style={inp}>
                    <option value="">Selecciona...</option>
                    {Object.entries(mpPorCategoria).map(([cat, items]) => (
                      <optgroup key={cat} label={cat === 'materia_prima' ? 'MATERIA PRIMA' : cat === 'insumos' ? 'INSUMOS' : 'EMPAQUES'}>
                        {items.map(mp => (
                          <option key={mp.id} value={mp.id}>
                            {mp.nombre} — Stock: {mp.stock_actual} {mp.unidad}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lbl}>CANTIDAD</label>
                  <input type="number" value={ing.cantidad} onChange={e => actualizarIngrediente(index, 'cantidad', e.target.value)} placeholder="0" style={inp} />
                </div>
                <div>
                  <label style={lbl}>UNIDAD</label>
                  <select value={ing.unidad} onChange={e => actualizarIngrediente(index, 'unidad', e.target.value)} style={inp}>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="lt">lt</option>
                    <option value="und">und</option>
                    <option value="lb">lb</option>
                  </select>
                </div>
                <button onClick={() => eliminarIngrediente(index)} style={{ padding: '8px 12px', background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => { setMostrarForm(false); setIngredientes([]); setFotoPreview(null); setFotoArchivo(null) }} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={guardar} disabled={guardando} style={{ padding: '8px 16px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {guardando ? 'Guardando...' : 'Guardar producto'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85' }}>Cargando...</div>
      ) : productosFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🌭</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No hay productos terminados</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Haz clic en "Nuevo producto" para agregar el primero</div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F4F1ED' }}>
                {['Foto','Código','Nombre','Familia','Presentación','Precio 1','Precio 2','Precio 3','Stock','Estado','Acciones'].map(h => (
                  <th key={h} style={{ padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.map(p => {
                const estado = estadoStock(p.stock_actual, p.stock_minimo)
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #DDD8CF' }}>
                    <td style={{ padding: '8px 16px' }}>
                      {p.foto_url
                        ? <img src={p.foto_url} alt={p.nombre} style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} />
                        : <div style={{ width: 40, height: 40, borderRadius: 6, background: '#F4F1ED', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🌭</div>
                      }
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 11, color: '#9A8E85', fontFamily: 'monospace', fontWeight: 600 }}>{p.codigo}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600 }}>{p.nombre}<br/><span style={{ fontSize: 11, color: '#9A8E85', fontWeight: 400 }}>{p.descripcion}</span></td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ background: '#FCEAEA', color: '#B22222', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{p.familia}</span>
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 13 }}>{p.presentacion}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace' }}>${p.precio_kg?.toLocaleString()}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace' }}>{p.precio2 ? '$' + p.precio2?.toLocaleString() : '—'}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace' }}>{p.precio3 ? '$' + p.precio3?.toLocaleString() : '—'}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace' }}>{p.stock_actual}</td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ background: estado.bg, color: estado.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500 }}>{estado.texto}</span>
                    </td>
                    <td style={{ padding: '8px 16px' }}>
                      <button onClick={() => setProductoAEliminar(p)} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                        🗑️ Eliminar
                      </button>
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