import { useState, useEffect, useMemo } from 'react'
import { cargarProvisiones, cargarApartados, apartarProvisiones, deshacerApartado, nombreCuenta, CUENTAS } from './nominaDatos'

const fmtCOP = (n) => (n < 0 ? '−$' : '$') + Math.abs(Math.round(Number(n) || 0)).toLocaleString('es-CO')
const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }
const CONCEPTOS = [
  ['prima', 'Prima'], ['cesantias', 'Cesantías'], ['intereses_cesantias', 'Intereses cesantías'], ['vacaciones', 'Vacaciones'],
]
const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Provisiones de prima, cesantías, intereses y vacaciones, por empleado.
// Se acumulan al aprobar cada nómina. "Pendiente" = causada y aún no pagada (lo que se liquidará al retiro).
// Provisionar = apartar dinero en una cuenta o en efectivo: no es gasto ni sale plata (Finanzas lo muestra como "reservado").
export default function Provisiones({ empleados, pedirClave, avisar }) {
  const [lineas, setLineas] = useState([])
  const [apartados, setApartados] = useState([])
  const [cargando, setCargando] = useState(true)
  const [abierto, setAbierto] = useState(null)
  const [modal, setModal] = useState(null) // { empleadoId | null (todos) }
  const [form, setForm] = useState({ fecha: hoy(), cuenta: '', observaciones: '' })

  const recargar = async () => {
    setCargando(true)
    const [l, a] = await Promise.all([cargarProvisiones(), cargarApartados()])
    setLineas(l)
    setApartados(a)
    setCargando(false)
  }
  useEffect(() => { recargar() }, [])

  const porEmpleado = useMemo(() => {
    const mapa = {}
    for (const l of lineas) {
      if (l.estado === 'pagada') continue
      if (!mapa[l.empleado_id]) mapa[l.empleado_id] = { total: 0, sinApartar: 0, apartado: 0, conceptos: {}, lineas: [] }
      const m = mapa[l.empleado_id]
      const v = Number(l.valor)
      m.total += v
      if (l.estado === 'calculada') m.sinApartar += v
      else m.apartado += v
      m.conceptos[l.concepto] = (m.conceptos[l.concepto] || 0) + v
      m.lineas.push(l)
    }
    return mapa
  }, [lineas])

  const filas = empleados.filter(e => porEmpleado[e.id]).sort((a, b) => `${a.nombre} ${a.apellidos || ''}`.localeCompare(`${b.nombre} ${b.apellidos || ''}`, 'es'))
  const suma = (campo) => filas.reduce((a, e) => a + porEmpleado[e.id][campo], 0)
  const sumaConcepto = (c) => filas.reduce((a, e) => a + (porEmpleado[e.id].conceptos[c] || 0), 0)

  const lineasPorApartar = (empleadoId) => lineas.filter(l => l.estado === 'calculada' && (!empleadoId || l.empleado_id === empleadoId))

  const abrirModal = (empleadoId) => {
    const pendientes = lineasPorApartar(empleadoId)
    if (!pendientes.length) { avisar('No hay provisiones por apartar.', true); return }
    setForm({ fecha: hoy(), cuenta: '', observaciones: '' })
    setModal({ empleadoId })
  }

  const confirmarApartado = () => {
    if (!form.cuenta) { avisar('Elige en qué cuenta o forma se guarda el dinero.', true); return }
    const pendientes = lineasPorApartar(modal.empleadoId)
    const valor = pendientes.reduce((a, l) => a + Number(l.valor), 0)
    const emp = modal.empleadoId ? empleados.find(e => e.id === modal.empleadoId) : null
    setModal(null)
    pedirClave('Apartar provisiones', `${emp ? emp.nombre : 'Todos los empleados'} · ${fmtCOP(valor)} en ${nombreCuenta(form.cuenta)}`, async () => {
      const { error } = await apartarProvisiones(pendientes, form)
      if (error) { avisar('Error: ' + error.message, true); return }
      avisar('Provisiones apartadas. Finanzas lo muestra como saldo reservado en esa cuenta.')
      recargar()
    })
  }

  const deshacer = (a) => {
    pedirClave('Deshacer apartado', `${a.fecha} · ${nombreCuenta(a.cuenta)} · ${fmtCOP(a.valor)}`, async () => {
      const { error } = await deshacerApartado(a)
      if (error) { avisar('Error: ' + error.message, true); return }
      recargar()
    })
  }

  const caja = { background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: '12px 16px' }

  return (
    <div>
      <div style={{ background: '#E8F0FB', color: '#1A5FA8', borderRadius: 9, padding: '10px 14px', fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
        Las provisiones se acumulan al <b>aprobar</b> cada nómina y muestran lo que la empresa ya debe a cada empleado por prima, cesantías, intereses y vacaciones, aunque todavía no se hayan pagado. Esto es lo que se usará en las liquidaciones.
        <b> Apartar</b> es reservar ese dinero en una cuenta o en efectivo: no es un gasto ni sale plata, pero Finanzas lo muestra como saldo reservado.
      </div>

      {cargando ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85' }}>Cargando...</div>
      ) : filas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF', fontSize: 13 }}>
          Todavía no hay provisiones. Se generan cuando apruebas una nómina.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
            <div style={caja}><div style={{ fontSize: 11, color: '#9A8E85' }}>PROVISIONADO PENDIENTE</div><div style={{ fontSize: 20, fontWeight: 700 }}>{fmtCOP(suma('total'))}</div></div>
            <div style={caja}><div style={{ fontSize: 11, color: '#9A8E85' }}>APARTADO (reservado)</div><div style={{ fontSize: 20, fontWeight: 700, color: '#1A9156' }}>{fmtCOP(suma('apartado'))}</div></div>
            <div style={caja}><div style={{ fontSize: 11, color: '#9A8E85' }}>SIN APARTAR</div><div style={{ fontSize: 20, fontWeight: 700, color: '#C07D00' }}>{fmtCOP(suma('sinApartar'))}</div></div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.1fr 1fr 1fr 1fr 1fr', gap: 8, padding: '8px 14px', background: '#F4F1ED', fontSize: 11, color: '#9A8E85', fontWeight: 600 }}>
              <div>EMPLEADO</div>
              {CONCEPTOS.map(([c, t]) => <div key={c} style={{ textAlign: 'right' }}>{t.toUpperCase()}</div>)}
              <div style={{ textAlign: 'right' }}>TOTAL</div><div style={{ textAlign: 'right' }}>SIN APARTAR</div><div />
            </div>
            {filas.map(e => {
              const m = porEmpleado[e.id]
              return (
                <div key={e.id} style={{ borderTop: '1px solid #EDE8DF' }}>
                  <div onClick={() => setAbierto(abierto === e.id ? null : e.id)} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.1fr 1fr 1fr 1fr 1fr', gap: 8, padding: '10px 14px', alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
                    <div style={{ fontWeight: 600 }}>{e.nombre} {e.apellidos || ''}</div>
                    {CONCEPTOS.map(([c]) => <div key={c} style={{ textAlign: 'right' }}>{fmtCOP(m.conceptos[c] || 0)}</div>)}
                    <div style={{ textAlign: 'right', fontWeight: 700 }}>{fmtCOP(m.total)}</div>
                    <div style={{ textAlign: 'right', color: m.sinApartar ? '#C07D00' : '#9A8E85' }}>{fmtCOP(m.sinApartar)}</div>
                    <div style={{ textAlign: 'right' }} onClick={ev => ev.stopPropagation()}>
                      {m.sinApartar > 0 && <button onClick={() => abrirModal(e.id)} style={{ background: '#1A9156', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Apartar</button>}
                    </div>
                  </div>
                  {abierto === e.id && (
                    <div style={{ background: '#FBF9F6', padding: '8px 18px 12px', borderTop: '1px dashed #DDD8CF', fontSize: 12 }}>
                      {m.lineas.map(l => (
                        <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#5A4F47' }}>
                          <span>{l.periodo_inicio} → {l.periodo_fin} · {CONCEPTOS.find(c => c[0] === l.concepto)?.[1] || l.concepto}</span>
                          <span>{fmtCOP(l.valor)} · {l.estado === 'apartada' ? 'apartada' : 'sin apartar'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.1fr 1fr 1fr 1fr 1fr', gap: 8, padding: '10px 14px', background: '#F4F1ED', fontSize: 13, fontWeight: 700 }}>
              <div>Total</div>
              {CONCEPTOS.map(([c]) => <div key={c} style={{ textAlign: 'right' }}>{fmtCOP(sumaConcepto(c))}</div>)}
              <div style={{ textAlign: 'right' }}>{fmtCOP(suma('total'))}</div><div style={{ textAlign: 'right' }}>{fmtCOP(suma('sinApartar'))}</div><div />
            </div>
          </div>

          <button onClick={() => abrirModal(null)} disabled={suma('sinApartar') <= 0} style={{ background: '#1A9156', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: suma('sinApartar') > 0 ? 1 : 0.5 }}>
            💰 Provisionar (apartar) todo lo pendiente
          </button>
        </>
      )}

      {apartados.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 12, color: '#9A8E85', fontWeight: 600, marginBottom: 8 }}>APARTADOS REGISTRADOS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {apartados.map(a => (
              <div key={a.id} style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 8, padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, gap: 8 }}>
                <span>{a.fecha} · <b>{nombreCuenta(a.cuenta)}</b>{a.observaciones ? ` · ${a.observaciones}` : ''}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <b style={{ color: '#1A9156' }}>{fmtCOP(a.valor)}</b>
                  <button onClick={() => deshacer(a)} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontSize: 11 }}>Deshacer</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {modal && (
        <div onClick={() => setModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1002, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 24, width: 440, maxWidth: '95vw' }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>💰 Apartar provisiones</div>
            <div style={{ background: '#E8F7EF', color: '#1A9156', borderRadius: 8, padding: '10px 14px', margin: '12px 0', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
              <span>{modal.empleadoId ? (() => { const e = empleados.find(x => x.id === modal.empleadoId); return `${e.nombre} ${e.apellidos || ''}` })() : 'Todos los empleados'}</span>
              <span>{fmtCOP(lineasPorApartar(modal.empleadoId).reduce((a, l) => a + Number(l.valor), 0))}</span>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div><label style={lbl}>¿EN QUÉ CUENTA SE GUARDA EL DINERO?</label>
                <select value={form.cuenta} onChange={e => setForm({ ...form, cuenta: e.target.value })} style={inp}>
                  <option value="">Selecciona...</option>
                  <option value="efectivo">Efectivo</option>
                  {Object.entries(CUENTAS).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}
                </select>
              </div>
              <div><label style={lbl}>FECHA</label><input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} style={inp} /></div>
              <div><label style={lbl}>OBSERVACIONES</label><input value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} placeholder="Opcional" style={inp} /></div>
            </div>
            <div style={{ fontSize: 11, color: '#9A8E85', marginTop: 10 }}>No sale plata ni se crea un gasto: el valor queda reservado dentro de esa cuenta y Finanzas lo muestra como "reservado" en el balance.</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setModal(null)} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={confirmarApartado} style={{ padding: '8px 18px', background: '#1A9156', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Continuar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}