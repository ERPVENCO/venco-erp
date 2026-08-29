import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export default function Proveedores() {
  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [proveedorDetalle, setProveedorDetalle] = useState(null)
  const [nuevo, setNuevo] = useState({
    empresa: '', encargado: '', nit: '', telefono: '', direccion: ''
  })

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const { data } = await supabase.from('proveedores').select('*').order('creado_en')
    setProveedores(data || [])
    setLoading(false)
  }

  const siguienteNumero = async () => {
    const { data } = await supabase.from('proveedores').select('id')
    return String((data?.length || 0) + 1).padStart(3, '0')
  }

  const abrirEditar = (p) => {
    setEditando(p)
    setNuevo({
      empresa: p.empresa, encargado: p.encargado || '', nit: p.nit || '',
      telefono: p.telefono || '', direccion: p.direccion || ''
    })
    setMostrarForm(true)
  }

  const cerrarForm = () => {
    setMostrarForm(false)
    setEditando(null)
    setNuevo({ empresa: '', encargado: '', nit: '', telefono: '', direccion: '' })
  }

  const guardar = async () => {
    if (!nuevo.empresa) { alert('La empresa es obligatoria'); return }
    if (!nuevo.telefono) { alert('El teléfono es obligatorio'); return }

    if (editando) {
      const { error } = await supabase.from('proveedores').update({
        empresa: nuevo.empresa, encargado: nuevo.encargado, nit: nuevo.nit,
        telefono: nuevo.telefono, direccion: nuevo.direccion
      }).eq('id', editando.id)
      if (error) { alert('Error: ' + error.message); return }
    } else {
      const numero = await siguienteNumero()
      const { error } = await supabase.from('proveedores').insert([{
        codigo_manual: numero,
        empresa: nuevo.empresa, encargado: nuevo.encargado, nit: nuevo.nit,
        telefono: nuevo.telefono, direccion: nuevo.direccion,
        saldo_pendiente: 0
      }])
      if (error) { alert('Error: ' + error.message); return }
    }

    cerrarForm()
    cargar()
  }

  const eliminar = async (p) => {
    const confirmar = window.confirm(`¿Estás segura que deseas eliminar a "${p.empresa}"?`)
    if (!confirmar) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('auditoria').insert([{
      tabla: 'proveedores',
      accion: 'ELIMINACIÓN',
      descripcion: `${p.codigo_manual} — ${p.empresa}`,
      datos_anteriores: p,
      usuario_email: user?.email || 'desconocido',
      fecha: new Date().toISOString()
    }])
    const { error } = await supabase.from('proveedores').delete().eq('id', p.id)
    if (error) { alert('Error al eliminar: ' + error.message); return }
    cargar()
  }

  const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }

  return (
    <div>
      {proveedorDetalle && (
        <div onClick={() => setProveedorDetalle(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 26, width: 420, maxWidth: '95vw', boxShadow: '0 8px 28px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{proveedorDetalle.empresa}</div>
              <span onClick={() => setProveedorDetalle(null)} style={{ cursor: 'pointer', fontSize: 20, color: '#9A8E85' }}>×</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>CÓDIGO</span><br/>{proveedorDetalle.codigo_manual}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>ENCARGADO</span><br/>{proveedorDetalle.encargado || '—'}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>NIT</span><br/>{proveedorDetalle.nit || '—'}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>TELÉFONO</span><br/>{proveedorDetalle.telefono}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>DIRECCIÓN</span><br/>{proveedorDetalle.direccion || '—'}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>SALDO PENDIENTE</span><br/>
                <b style={{ color: proveedorDetalle.saldo_pendiente > 0 ? '#B22222' : '#1A9156' }}>
                  ${(proveedorDetalle.saldo_pendiente || 0).toLocaleString()}
                </b>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>🚛 Proveedores</div>
          <div style={{ fontSize: 13, color: '#5A4F47', marginTop: 4, fontWeight: 500 }}>
            {loading ? '...' : `${proveedores.length} proveedores registrados`}
          </div>
        </div>
        <button onClick={() => setMostrarForm(true)} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ＋ Nuevo proveedor
        </button>
      </div>

      {mostrarForm && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
            {editando ? `Editando: ${editando.empresa}` : 'Nuevo proveedor'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>EMPRESA *</label>
              <input value={nuevo.empresa} onChange={e => setNuevo({...nuevo, empresa: e.target.value})} placeholder="Ej. Frigorífico Sur" style={inp} maxLength={100} />
            </div>
            <div>
              <label style={lbl}>ENCARGADO</label>
              <input value={nuevo.encargado} onChange={e => setNuevo({...nuevo, encargado: e.target.value})} placeholder="Nombre de contacto" style={inp} />
            </div>
            <div>
              <label style={lbl}>NIT</label>
              <input value={nuevo.nit} onChange={e => setNuevo({...nuevo, nit: e.target.value})} placeholder="Ej. 900123456-7" style={inp} />
            </div>
            <div>
              <label style={lbl}>TELÉFONO *</label>
              <input value={nuevo.telefono} onChange={e => setNuevo({...nuevo, telefono: e.target.value})} placeholder="310 000 0000" style={inp} />
            </div>
            <div>
              <label style={lbl}>DIRECCIÓN</label>
              <input value={nuevo.direccion} onChange={e => setNuevo({...nuevo, direccion: e.target.value})} placeholder="Dirección completa" style={inp} />
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
      ) : proveedores.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🚛</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No hay proveedores registrados</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Haz clic en "Nuevo proveedor" para agregar el primero</div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F4F1ED' }}>
                {['#','Empresa','Encargado','Teléfono','Saldo','Acciones'].map(h => (
                  <th key={h} style={{ padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {proveedores.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #DDD8CF' }}>
                  <td style={{ padding: '11px 16px', fontSize: 11, color: '#9A8E85', fontFamily: 'monospace', fontWeight: 600 }}>{p.codigo_manual}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600 }}>
                    {p.empresa}<br/>
                    <span style={{ fontSize: 11, color: '#9A8E85', fontWeight: 400 }}>{p.nit}</span>
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: 13 }}>{p.encargado || '—'}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace' }}>{p.telefono}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace', color: p.saldo_pendiente > 0 ? '#B22222' : '#1A9156' }}>
                    ${(p.saldo_pendiente || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setProveedorDetalle(p)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}