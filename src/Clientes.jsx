import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [guardando, setGuardando] = useState(false)
  const [nuevo, setNuevo] = useState({
    tipo_cliente: 'registrado',
    empresa: '', encargado: '', cedula_nit: '',
    telefono: '', direccion: '', cumpleanos: '',
    informacion_adicional: '', limite_credito: '', dias_credito: ''
  })

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .order('creado_en')
    setClientes(data || [])
    setLoading(false)
  }

  const siguienteNumero = async () => {
    const { data } = await supabase.from('clientes').select('id')
    return String((data?.length || 0) + 1).padStart(3, '0')
  }

  const guardar = async () => {
    if (!nuevo.empresa) { alert('El nombre/empresa es obligatorio'); return }
    if (!nuevo.telefono) { alert('El teléfono es obligatorio'); return }

    setGuardando(true)
    const numero = await siguienteNumero()

    const { error } = await supabase.from('clientes').insert([{
      nombre: nuevo.empresa,
      codigo_manual: numero,
      tipo_cliente: nuevo.tipo_cliente,
      empresa: nuevo.empresa,
      encargado: nuevo.encargado,
      cedula_nit: nuevo.cedula_nit,
      telefono: nuevo.telefono,
      direccion: nuevo.direccion,
      cumpleanos: nuevo.cumpleanos || null,
      informacion_adicional: nuevo.informacion_adicional,
      limite_credito: parseFloat(nuevo.limite_credito) || 0,
      dias_credito: parseInt(nuevo.dias_credito) || 0,
      saldo_pendiente: 0,
    }])

    if (error) {
      alert('Error: ' + error.message)
    } else {
      setMostrarForm(false)
      setNuevo({ tipo_cliente: 'registrado', empresa: '', encargado: '', cedula_nit: '', telefono: '', direccion: '', cumpleanos: '', informacion_adicional: '', limite_credito: '', dias_credito: '' })
      cargar()
    }
    setGuardando(false)
  }

  const eliminar = async (c) => {
    const confirmar = window.confirm(`¿Estás segura que deseas eliminar a "${c.empresa}"?`)
    if (!confirmar) return

    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('auditoria').insert([{
      tabla: 'clientes',
      accion: 'ELIMINACIÓN',
      descripcion: `${c.codigo_manual} — ${c.empresa}`,
      datos_anteriores: c,
      usuario_email: user?.email || 'desconocido',
      fecha: new Date().toISOString()
    }])

    const { error } = await supabase.from('clientes').delete().eq('id', c.id)
    if (error) {
      alert('Error al eliminar: ' + error.message)
    } else {
      cargar()
    }
  }

  const clientesFiltrados = filtroTipo === 'todos'
    ? clientes
    : clientes.filter(c => c.tipo_cliente === filtroTipo)

  const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>👥 Clientes</div>
          <div style={{ fontSize: 13, color: '#5A4F47', marginTop: 4, fontWeight: 500 }}>
            {loading ? '...' : `${clientes.length} clientes registrados`}
          </div>
        </div>
        <button onClick={() => setMostrarForm(true)} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ＋ Nuevo cliente
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {['todos', 'registrado', 'temporal'].map(t => (
          <button key={t} onClick={() => setFiltroTipo(t)} style={{
            padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 500,
            cursor: 'pointer', border: 'none',
            background: filtroTipo === t ? '#B22222' : '#fff',
            color: filtroTipo === t ? '#fff' : '#5A4F47',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
          }}>
            {t === 'todos' ? 'Todos' : t === 'registrado' ? 'Registrado' : 'Temporal'}
          </button>
        ))}
      </div>

      {mostrarForm && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Nuevo cliente</div>

          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>TIPO DE CLIENTE</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" checked={nuevo.tipo_cliente === 'registrado'} onChange={() => setNuevo({...nuevo, tipo_cliente: 'registrado'})} />
                Cliente Registrado
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" checked={nuevo.tipo_cliente === 'temporal'} onChange={() => setNuevo({...nuevo, tipo_cliente: 'temporal'})} />
                Cliente Temporal
              </label>
            </div>
          </div>

          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>CAMPOS OBLIGATORIOS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>EMPRESA / NOMBRE *</label>
                <input value={nuevo.empresa} onChange={e => setNuevo({...nuevo, empresa: e.target.value})} placeholder="Ej. Restaurante El Asado" style={inp} maxLength={100} />
              </div>
              <div>
                <label style={lbl}>TELÉFONO *</label>
                <input value={nuevo.telefono} onChange={e => setNuevo({...nuevo, telefono: e.target.value})} placeholder="310 000 0000" style={inp} />
              </div>
              <div>
                <label style={lbl}>ENCARGADO</label>
                <input value={nuevo.encargado} onChange={e => setNuevo({...nuevo, encargado: e.target.value})} placeholder="Nombre de contacto" style={inp} />
              </div>
            </div>
          </div>

          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>CAMPOS OPCIONALES</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>CÉDULA / NIT</label>
                <input value={nuevo.cedula_nit} onChange={e => setNuevo({...nuevo, cedula_nit: e.target.value})} placeholder="Ej. 900123456-7" style={inp} />
              </div>
              <div>
                <label style={lbl}>CUMPLEAÑOS</label>
                <input type="date" value={nuevo.cumpleanos} onChange={e => setNuevo({...nuevo, cumpleanos: e.target.value})} style={inp} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>DIRECCIÓN</label>
                <input value={nuevo.direccion} onChange={e => setNuevo({...nuevo, direccion: e.target.value})} placeholder="Dirección completa" style={inp} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>INFORMACIÓN ADICIONAL</label>
                <textarea value={nuevo.informacion_adicional} onChange={e => setNuevo({...nuevo, informacion_adicional: e.target.value})} placeholder="Notas, preferencias, etc." style={{ ...inp, height: 60, resize: 'none' }} />
              </div>
            </div>
          </div>

          {nuevo.tipo_cliente === 'registrado' && (
            <div style={{ background: '#FEF3DC', borderRadius: 8, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#C07D00', fontWeight: 600, marginBottom: 12 }}>💳 CONDICIONES DE CRÉDITO</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>LÍMITE DE CRÉDITO</label>
                  <input type="number" value={nuevo.limite_credito} onChange={e => setNuevo({...nuevo, limite_credito: e.target.value})} placeholder="0" style={inp} />
                </div>
                <div>
                  <label style={lbl}>DÍAS DE CRÉDITO</label>
                  <input type="number" value={nuevo.dias_credito} onChange={e => setNuevo({...nuevo, dias_credito: e.target.value})} placeholder="Ej. 30" style={inp} />
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setMostrarForm(false)} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={guardar} disabled={guardando} style={{ padding: '8px 16px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {guardando ? 'Guardando...' : 'Guardar cliente'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85' }}>Cargando...</div>
      ) : clientesFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No hay clientes registrados</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Haz clic en "Nuevo cliente" para agregar el primero</div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F4F1ED' }}>
                {['#','Empresa','Encargado','Teléfono','Tipo','Crédito','Saldo','Acciones'].map(h => (
                  <th key={h} style={{ padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clientesFiltrados.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #DDD8CF' }}>
                  <td style={{ padding: '11px 16px', fontSize: 11, color: '#9A8E85', fontFamily: 'monospace', fontWeight: 600 }}>{c.codigo_manual}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600 }}>{c.empresa}<br/><span style={{ fontSize: 11, color: '#9A8E85', fontWeight: 400 }}>{c.cedula_nit}</span></td>
                  <td style={{ padding: '11px 16px', fontSize: 13 }}>{c.encargado || '—'}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace' }}>{c.telefono}</td>
                  <td style={{ padding: '11px 16px' }}>
                    <span style={{ background: c.tipo_cliente === 'registrado' ? '#E8F0FB' : '#FEF3DC', color: c.tipo_cliente === 'registrado' ? '#1A5FA8' : '#C07D00', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                      {c.tipo_cliente === 'registrado' ? 'Registrado' : 'Temporal'}
                    </span>
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace' }}>{c.limite_credito ? '$' + c.limite_credito.toLocaleString() : '—'}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace', color: c.saldo_pendiente > 0 ? '#B22222' : '#1A9156' }}>${(c.saldo_pendiente || 0).toLocaleString()}</td>
                  <td style={{ padding: '8px 16px' }}>
                    <button onClick={() => eliminar(c)} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                      🗑️
                    </button>
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