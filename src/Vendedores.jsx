import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export default function Vendedores() {
  const [vendedores, setVendedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [nuevo, setNuevo] = useState({
    nombre: '', telefono: '',
    comision_tipo: 'porcentaje',
    comision_porcentaje: '',
    comision_valor_fijo: ''
  })

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const { data } = await supabase.from('vendedores').select('*').order('nombre')
    setVendedores(data || [])
    setLoading(false)
  }

  const abrirEditar = (v) => {
    setEditando(v)
    setNuevo({
      nombre: v.nombre,
      telefono: v.telefono || '',
      comision_tipo: v.comision_tipo || 'porcentaje',
      comision_porcentaje: v.comision_porcentaje || '',
      comision_valor_fijo: v.comision_valor_fijo || ''
    })
    setMostrarForm(true)
  }

  const cerrarForm = () => {
    setMostrarForm(false)
    setEditando(null)
    setNuevo({ nombre: '', telefono: '', comision_tipo: 'porcentaje', comision_porcentaje: '', comision_valor_fijo: '' })
  }

  const guardar = async () => {
    if (!nuevo.nombre) { alert('El nombre es obligatorio'); return }

    const datos = {
      nombre: nuevo.nombre,
      telefono: nuevo.telefono,
      comision_tipo: nuevo.comision_tipo,
      comision_porcentaje: parseFloat(nuevo.comision_porcentaje) || 0,
      comision_valor_fijo: parseFloat(nuevo.comision_valor_fijo) || 0,
    }

    if (editando) {
      const { error } = await supabase.from('vendedores').update(datos).eq('id', editando.id)
      if (error) { alert('Error: ' + error.message); return }
    } else {
      const { error } = await supabase.from('vendedores').insert([datos])
      if (error) { alert('Error: ' + error.message); return }
    }

    cerrarForm()
    cargar()
  }

  const eliminar = async (v) => {
    const confirmar = window.confirm(`¿Estás segura que deseas eliminar a "${v.nombre}"?`)
    if (!confirmar) return
    const { error } = await supabase.from('vendedores').delete().eq('id', v.id)
    if (error) { alert('Error: ' + error.message); return }
    cargar()
  }

  const toggleActivo = async (v) => {
    await supabase.from('vendedores').update({ activo: !v.activo }).eq('id', v.id)
    cargar()
  }

  const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>🧑‍💼 Vendedores</div>
          <div style={{ fontSize: 13, color: '#5A4F47', marginTop: 4 }}>
            {loading ? '...' : `${vendedores.length} vendedores registrados`}
          </div>
        </div>
        <button onClick={() => setMostrarForm(true)} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ＋ Nuevo vendedor
        </button>
      </div>

      {mostrarForm && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
            {editando ? `Editando: ${editando.nombre}` : 'Nuevo vendedor'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={lbl}>NOMBRE *</label>
              <input value={nuevo.nombre} onChange={e => setNuevo({...nuevo, nombre: e.target.value})} placeholder="Nombre completo" style={inp} />
            </div>
            <div>
              <label style={lbl}>TELÉFONO</label>
              <input value={nuevo.telefono} onChange={e => setNuevo({...nuevo, telefono: e.target.value})} placeholder="310 000 0000" style={inp} />
            </div>
            <div>
              <label style={lbl}>TIPO COMISIÓN</label>
              <select value={nuevo.comision_tipo} onChange={e => setNuevo({...nuevo, comision_tipo: e.target.value})} style={inp}>
                <option value="porcentaje">Porcentaje (%)</option>
                <option value="pesos">Valor fijo ($)</option>
              </select>
            </div>
            <div>
              <label style={lbl}>{nuevo.comision_tipo === 'porcentaje' ? 'COMISIÓN %' : 'COMISIÓN $'}</label>
              <input
                type="number"
                value={nuevo.comision_tipo === 'porcentaje' ? nuevo.comision_porcentaje : nuevo.comision_valor_fijo}
                onChange={e => nuevo.comision_tipo === 'porcentaje'
                  ? setNuevo({...nuevo, comision_porcentaje: e.target.value})
                  : setNuevo({...nuevo, comision_valor_fijo: e.target.value})
                }
                placeholder="0"
                style={inp}
              />
            </div>
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
      ) : vendedores.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🧑‍💼</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No hay vendedores registrados</div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F4F1ED' }}>
                {['Nombre','Teléfono','Tipo comisión','Comisión','Estado','Acciones'].map(h => (
                  <th key={h} style={{ padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vendedores.map(v => (
                <tr key={v.id} style={{ borderBottom: '1px solid #DDD8CF' }}>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600 }}>{v.nombre}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13 }}>{v.telefono || '—'}</td>
                  <td style={{ padding: '11px 16px' }}>
                    <span style={{ background: v.comision_tipo === 'porcentaje' ? '#E8F0FB' : '#E8F7EF', color: v.comision_tipo === 'porcentaje' ? '#1A5FA8' : '#1A9156', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500 }}>
                      {v.comision_tipo === 'porcentaje' ? 'Porcentaje' : 'Valor fijo'}
                    </span>
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}>
                    {v.comision_tipo === 'porcentaje'
                      ? `${v.comision_porcentaje}%`
                      : `$${v.comision_valor_fijo?.toLocaleString()}`
                    }
                  </td>
                  <td style={{ padding: '11px 16px' }}>
                    <button onClick={() => toggleActivo(v)} style={{ background: v.activo ? '#E8F7EF' : '#FCEAEA', color: v.activo ? '#1A9156' : '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                      {v.activo ? '✓ Activo' : '✗ Inactivo'}
                    </button>
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => abrirEditar(v)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                        ✏️ Editar
                      </button>
                      <button onClick={() => eliminar(v)} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                        🗑️
                      </button>
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