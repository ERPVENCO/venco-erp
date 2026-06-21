import { useState } from 'react'
import { supabase } from './supabase'

const CLAVE_ELIMINACION = '1234'

export default function ModalEliminar({ item, tabla, descripcion, onConfirm, onCancel }) {
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const confirmar = async () => {
    if (clave !== CLAVE_ELIMINACION) {
      setError('Contraseña incorrecta')
      return
    }
    setLoading(true)
    setError('')

    // Registrar en auditoría
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('auditoria').insert([{
      tabla,
      accion: 'ELIMINACIÓN',
      descripcion,
      datos_anteriores: item,
      usuario_email: user?.email || 'desconocido',
      fecha: new Date().toISOString()
    }])

    setLoading(false)
    onConfirm()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 999
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 28,
        width: 400, maxWidth: '95vw', boxShadow: '0 8px 28px rgba(0,0,0,0.15)'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 42, height: 42, background: '#FCEAEA', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🗑️</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#18120E' }}>Confirmar eliminación</div>
            <div style={{ fontSize: 12, color: '#9A8E85', marginTop: 2 }}>Esta acción no se puede deshacer</div>
          </div>
        </div>

        {/* Info del item */}
        <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: '#9A8E85', marginBottom: 4 }}>PRODUCTO A ELIMINAR</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#18120E' }}>{descripcion}</div>
        </div>

        {/* Contraseña */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 5 }}>
            🔐 CONTRASEÑA DE AUTORIZACIÓN
          </label>
          <input
            type="password"
            value={clave}
            onChange={e => { setClave(e.target.value); setError('') }}
            placeholder="Ingresa la contraseña"
            onKeyDown={e => e.key === 'Enter' && confirmar()}
            style={{
              width: '100%', padding: '9px 12px', border: `1px solid ${error ? '#B22222' : '#DDD8CF'}`,
              borderRadius: 7, fontSize: 13, background: '#F4F1ED',
              outline: 'none', boxSizing: 'border-box'
            }}
          />
          {error && (
            <div style={{ fontSize: 12, color: '#B22222', marginTop: 5 }}>⚠️ {error}</div>
          )}
        </div>

        {/* Advertencia */}
        <div style={{ background: '#FCEAEA', borderRadius: 7, padding: 10, marginBottom: 20, fontSize: 12, color: '#B22222' }}>
          ⚠️ Se registrará la eliminación con fecha, hora y usuario en el historial de auditoría.
        </div>

        {/* Botones */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '8px 18px', border: '1px solid #DDD8CF', borderRadius: 7,
            background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500
          }}>Cancelar</button>
          <button onClick={confirmar} disabled={loading || !clave} style={{
            padding: '8px 18px', background: loading || !clave ? '#ccc' : '#B22222',
            color: '#fff', border: 'none', borderRadius: 7,
            cursor: loading || !clave ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 600
          }}>
            {loading ? 'Procesando...' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}