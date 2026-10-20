import { useState } from 'react'
import { CUENTAS, validarFormaPago } from './nominaDatos'

const fmtCOP = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO')
const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }

const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const pagoInicial = () => ({ fecha: hoy(), forma: 'transferencia', efectivo: '', cuenta: '1' })

// Campos de forma de pago (se usan dentro de formularios y dentro de la ventana de abajo).
// "Ambas": se escribe cuánto fue en efectivo; el resto sale por transferencia.
export function CamposFormaPago({ pago, setPago, valor, permitirAmbas = true }) {
  const total = Number(valor) || 0
  const ef = pago.forma === 'ambos' ? Number(pago.efectivo) || 0 : 0
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
      <div>
        <label style={lbl}>FECHA DE PAGO</label>
        <input type="date" value={pago.fecha} onChange={e => setPago({ ...pago, fecha: e.target.value })} style={inp} />
      </div>
      <div>
        <label style={lbl}>FORMA DE PAGO</label>
        <select value={pago.forma} onChange={e => setPago({ ...pago, forma: e.target.value })} style={inp}>
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          {permitirAmbas && <option value="ambos">Ambas (efectivo + transferencia)</option>}
        </select>
      </div>
      {pago.forma === 'ambos' && (
        <div>
          <label style={lbl}>MONTO EN EFECTIVO</label>
          <input type="number" min="0" value={pago.efectivo} onChange={e => setPago({ ...pago, efectivo: e.target.value })} placeholder="0" style={inp} />
        </div>
      )}
      {pago.forma !== 'efectivo' && (
        <div>
          <label style={lbl}>CUENTA DE LA TRANSFERENCIA</label>
          <select value={pago.cuenta} onChange={e => setPago({ ...pago, cuenta: e.target.value })} style={inp}>
            {Object.entries(CUENTAS).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
          </select>
        </div>
      )}
      {pago.forma === 'ambos' && total > 0 && (
        <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#5A4F47', background: '#fff', borderRadius: 7, padding: '8px 12px' }}>
          Efectivo <b>{fmtCOP(ef)}</b> + transferencia <b>{fmtCOP(total - ef)}</b> = <b>{fmtCOP(total)}</b>
        </div>
      )}
    </div>
  )
}

// Ventana para elegir la forma de pago antes de registrar un pago.
// onConfirmar(pago) recibe { fecha, forma, efectivo, cuenta }; el pago y el gasto en Finanzas los hace quien llama.
export default function PagoFormaModal({ titulo, subtitulo, valor, permitirAmbas = true, onConfirmar, onCancelar }) {
  const [pago, setPago] = useState(pagoInicial())
  const [error, setError] = useState('')

  const confirmar = () => {
    const e = validarFormaPago(valor, pago)
    if (e) { setError(e); return }
    onConfirmar(pago)
  }

  return (
    <div onClick={onCancelar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1002, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 24, width: 460, maxWidth: '95vw', boxShadow: '0 8px 28px rgba(0,0,0,0.15)' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>💳 {titulo}</div>
        {subtitulo && <div style={{ fontSize: 12, color: '#9A8E85', marginTop: 2 }}>{subtitulo}</div>}
        <div style={{ background: '#E8F7EF', color: '#1A9156', borderRadius: 8, padding: '10px 14px', margin: '14px 0', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
          <span>Total a pagar</span><span>{fmtCOP(valor)}</span>
        </div>
        <CamposFormaPago pago={pago} setPago={setPago} valor={valor} permitirAmbas={permitirAmbas} />
        <div style={{ fontSize: 11, color: '#9A8E85', marginTop: 10 }}>
          Al registrar el pago se crea el gasto en Finanzas (categoría Nómina) con esta forma de pago y se refleja en el balance por cuenta.
        </div>
        {error && <div style={{ fontSize: 12, color: '#B22222', marginTop: 8 }}>⚠️ {error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onCancelar} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
          <button onClick={confirmar} style={{ padding: '8px 18px', background: '#1A9156', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Continuar</button>
        </div>
      </div>
    </div>
  )
}