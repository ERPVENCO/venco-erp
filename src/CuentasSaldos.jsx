// CuentasSaldos.jsx — NUEVO. Saldos por cuenta, transferencias entre cuentas y extracto.
//
// Es independiente: no importa nada de Finanzas.jsx y no modifica ninguna tabla existente.
//  - LEE (solo lectura): ingresos, egresos, ventas, nomina_provisiones
//  - ESCRIBE solo en tablas nuevas: saldos_iniciales y transferencias
import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import ModalEliminar from './ModalEliminar'

// Mismas cuentas que Finanzas.jsx (si agregas una cuenta allá, agrégala aquí también)
const CUENTAS = { '1': 'Bancolombia Yohe', '2': 'Bancolombia Manu', '3': 'Nequi Yohe' }
const TODAS_CUENTAS = ['efectivo', ...Object.keys(CUENTAS)]
const NOMBRE_CUENTA = (k) => (k === 'efectivo' ? 'Efectivo' : CUENTAS[k] || k)
// Fecha de hoy en hora de Colombia (evita que después de las 7 pm cuente como mañana)
const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
// Compras guarda "transferencia cuenta 1" en metodo_pago (sin columna de cuenta)
const cuentaDeMetodo = (m) => { const x = /transferencia cuenta (\d)/i.exec(m || ''); return x ? x[1] : null }
// NUEVO: registra en la tabla auditoria, igual que Ventas y Compras. Si falla, no interrumpe la operación.
const auditar = async (accion, tabla, descripcion, datosAnteriores = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('auditoria').insert([{
      tabla, accion, descripcion, datos_anteriores: datosAnteriores,
      usuario_email: user?.email || 'desconocido', fecha: new Date().toISOString()
    }])
  } catch (e) {
    console.error('Auditoría:', e)
  }
}
const fmt = (n) => '$' + (Number(n) || 0).toLocaleString('es-CO')
// Si viene solo la fecha (YYYY-MM-DD) se deja igual; si viene con hora, se pasa a fecha de Colombia
const dia = (f) => {
  const t = String(f)
  if (t.length <= 10) return t
  const d = new Date(t)
  return isNaN(d) ? t.slice(0, 10) : d.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
}

async function traerTodo(tabla, cols = '*') {
  let todo = []
  let desde = 0
  while (true) {
    const { data, error } = await supabase.from(tabla).select(cols).order('id').range(desde, desde + 999)
    if (error) throw error
    todo = todo.concat(data || [])
    if (!data || data.length < 1000) break
    desde += 1000
  }
  return todo
}

// Une ingresos, egresos, transferencias y saldos iniciales en UNA lista de movimientos por cuenta.
// monto > 0 entra plata a la cuenta, monto < 0 sale.
async function cargarMovimientos() {
  const [ing, egr, tra, sal, ven] = await Promise.all([
    traerTodo('ingresos'),
    traerTodo('egresos'),
    supabase.from('transferencias').select('*').then(r => { if (r.error) throw r.error; return r.data || [] }),
    supabase.from('saldos_iniciales').select('*').then(r => { if (r.error) throw r.error; return r.data || [] }),
    traerTodo('ventas', 'id, tipo_cuenta'),
  ])

  const ventasMap = Object.fromEntries(ven.map(v => [v.id, v]))
  const saldos = Object.fromEntries(sal.map(s => [s.cuenta, s]))
  const movs = []

  for (const s of sal) {
    movs.push({ fecha: dia(s.fecha), cuenta: s.cuenta, tipo: 'Saldo inicial', detalle: 'Saldo inicial', monto: Number(s.saldo) || 0 })
  }

  for (const i of ing) {
    movs.push({
      fecha: dia(i.fecha),
      cuenta: i.tipo_cuenta || ventasMap[i.venta_id]?.tipo_cuenta || 'efectivo',
      tipo: 'Ingreso',
      detalle: i.concepto || 'Venta',
      monto: Number(i.monto) || 0,
    })
  }

  for (const e of egr) {
    const tipo = e.nomina_pago_id ? 'Nómina' : e.tipo_registro === 'gasto' ? 'Gasto' : e.tipo_registro === 'abono_cxp' ? 'Abono CxP' : e.tipo_registro === 'egreso' ? 'Egreso' : 'Compra'
    const detalle = e.recibe || e.detalle || e.concepto || '—'
    const push = (cuenta, monto) => { if (monto) movs.push({ fecha: dia(e.fecha), cuenta, tipo, detalle, monto: -Number(monto) }) }
    if (e.monto_efectivo || e.monto_transferencia_1 || e.monto_transferencia_2) {
      push('efectivo', e.monto_efectivo)
      if (e.tipo_cuenta_1) push(e.tipo_cuenta_1, e.monto_transferencia_1)
      if (e.tipo_cuenta_2) push(e.tipo_cuenta_2, e.monto_transferencia_2)
    } else {
      push(e.tipo_cuenta || cuentaDeMetodo(e.metodo_pago) || 'efectivo', e.monto)
    }
  }

  for (const t of tra) {
    const monto = Number(t.monto) || 0
    movs.push({ fecha: dia(t.fecha), cuenta: t.cuenta_origen, tipo: 'Transferencia', detalle: `Pasó a ${NOMBRE_CUENTA(t.cuenta_destino)}${t.nota ? ' — ' + t.nota : ''}`, monto: -monto })
    movs.push({ fecha: dia(t.fecha), cuenta: t.cuenta_destino, tipo: 'Transferencia', detalle: `Viene de ${NOMBRE_CUENTA(t.cuenta_origen)}${t.nota ? ' — ' + t.nota : ''}`, monto })
  }

  // Lo anterior a la fecha del saldo inicial de cada cuenta ya está incluido en ese saldo.
  const validos = movs
    .filter(m => m.tipo === 'Saldo inicial' || !saldos[m.cuenta] || m.fecha >= dia(saldos[m.cuenta].fecha))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.tipo === 'Saldo inicial' ? -1 : 0) - (b.tipo === 'Saldo inicial' ? -1 : 0)))

  return { movs: validos, saldos, transferencias: tra }
}

// ─────────────────────────────────────────────
// CUENTAS Y SALDOS (cuánta plata hay HOY en cada cuenta) + transferencias
// ─────────────────────────────────────────────
export function Saldos() {
  const [datos, setDatos] = useState(null)
  const [reservado, setReservado] = useState({})
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(false)
  const [formSaldos, setFormSaldos] = useState({})
  const [mostrarTransf, setMostrarTransf] = useState(false)
  const transfVacia = { fecha: hoyISO(), cuenta_origen: '', cuenta_destino: '', monto: '', nota: '' }
  const [formTransf, setFormTransf] = useState(transfVacia)
  const [guardando, setGuardando] = useState(false)
  const [transfAEliminar, setTransfAEliminar] = useState(null)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    try {
      setError('')
      const d = await cargarMovimientos()
      setDatos(d)
      const { data: reservas } = await supabase.from('nomina_provisiones').select('valor, nomina_apartados(cuenta)').eq('estado', 'apartada')
      const r = {}
      for (const x of reservas || []) {
        const k = x.nomina_apartados?.cuenta
        if (k) r[k] = (r[k] || 0) + (Number(x.valor) || 0)
      }
      setReservado(r)
    } catch (e) {
      setError(e.message)
    }
  }

  const inp = { padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, background: '#F4F1ED', width: '100%', boxSizing: 'border-box' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }

  if (error) return <div style={{ textAlign: 'center', padding: 40, color: '#B22222' }}>Error: {error}<div style={{ fontSize: 12, marginTop: 6 }}>¿Ya ejecutaste el SQL del paso 1 en Supabase?</div></div>
  if (!datos) return <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85' }}>Cargando...</div>

  const saldoDe = (k) => datos.movs.filter(m => m.cuenta === k).reduce((s, m) => s + m.monto, 0)
  const totalGeneral = TODAS_CUENTAS.reduce((s, k) => s + saldoDe(k), 0)
  const totalReservado = TODAS_CUENTAS.reduce((s, k) => s + (reservado[k] || 0), 0)

  const abrirEditar = () => {
    const f = {}
    for (const k of TODAS_CUENTAS) {
      const s = datos.saldos[k]
      f[k] = { saldo: s ? String(s.saldo) : '', fecha: s ? dia(s.fecha) : hoyISO() }
    }
    setFormSaldos(f)
    setEditando(true)
  }

  const guardarSaldos = async () => {
    const filas = TODAS_CUENTAS
      .filter(k => formSaldos[k]?.saldo !== '' && formSaldos[k]?.saldo != null)
      .map(k => ({ cuenta: k, saldo: parseFloat(formSaldos[k].saldo) || 0, fecha: formSaldos[k].fecha || hoyISO() }))
    if (filas.length === 0) { setEditando(false); return }
    setGuardando(true)
    const { error } = await supabase.from('saldos_iniciales').upsert(filas, { onConflict: 'cuenta' })
    setGuardando(false)
    if (error) { alert('Error: ' + error.message); return }
    await auditar('SALDO INICIAL', 'saldos_iniciales', 'Saldos iniciales: ' + filas.map(f => `${NOMBRE_CUENTA(f.cuenta)} ${fmt(f.saldo)} (al ${f.fecha})`).join(' · '), datos.saldos)
    setEditando(false)
    cargar()
  }

  const guardarTransferencia = async () => {
    const monto = parseFloat(formTransf.monto) || 0
    if (!formTransf.cuenta_origen || !formTransf.cuenta_destino) { alert('Elige la cuenta de origen y la de destino'); return }
    if (formTransf.cuenta_origen === formTransf.cuenta_destino) { alert('El origen y el destino deben ser distintos'); return }
    if (monto <= 0) { alert('Ingresa el monto'); return }
    setGuardando(true)
    const { error } = await supabase.from('transferencias').insert([{
      fecha: formTransf.fecha,
      cuenta_origen: formTransf.cuenta_origen,
      cuenta_destino: formTransf.cuenta_destino,
      monto,
      nota: formTransf.nota || null,
    }])
    setGuardando(false)
    if (error) { alert('Error: ' + error.message); return }
    await auditar('TRANSFERENCIA', 'transferencias', `${NOMBRE_CUENTA(formTransf.cuenta_origen)} → ${NOMBRE_CUENTA(formTransf.cuenta_destino)} — ${fmt(monto)}${formTransf.nota ? ' — ' + formTransf.nota : ''}`)
    setMostrarTransf(false)
    setFormTransf(transfVacia)
    cargar()
  }

  const eliminarTransferencia = async () => {
    await supabase.from('transferencias').delete().eq('id', transfAEliminar.id)
    setTransfAEliminar(null)
    cargar()
  }

  const ultimasTransf = [...datos.transferencias].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 10)

  return (
    <div>
      {transfAEliminar && (
        <ModalEliminar item={transfAEliminar} tabla="transferencias"
          descripcion={`${NOMBRE_CUENTA(transfAEliminar.cuenta_origen)} → ${NOMBRE_CUENTA(transfAEliminar.cuenta_destino)} — ${fmt(transfAEliminar.monto)}`}
          onConfirm={eliminarTransferencia} onCancel={() => setTransfAEliminar(null)} />
      )}

      <div style={{ background: '#E8F0FB', borderRadius: 9, padding: 16, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: '#1A5FA8', fontWeight: 600 }}>Plata total hoy (todas las cuentas)</div>
          {totalReservado > 0 && <div style={{ fontSize: 11, color: '#9A8E85', marginTop: 2 }}>De esto, {fmt(totalReservado)} está reservado para provisiones</div>}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#1A5FA8' }}>{fmt(totalGeneral)}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 16 }}>
        {TODAS_CUENTAS.map(k => {
          const saldo = saldoDe(k)
          const res = reservado[k] || 0
          const sinSaldoInicial = !datos.saldos[k]
          return (
            <div key={k} style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 16, borderLeft: `3px solid ${saldo >= 0 ? '#1A9156' : '#B22222'}` }}>
              <div style={{ fontSize: 12, color: '#9A8E85', marginBottom: 6 }}>{NOMBRE_CUENTA(k)}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: saldo >= 0 ? '#1A9156' : '#B22222' }}>{fmt(saldo)}</div>
              {res > 0 && <div style={{ fontSize: 11, color: '#C07D00', marginTop: 4 }}>Reservado {fmt(res)} · Disponible {fmt(saldo - res)}</div>}
              <div style={{ fontSize: 10, color: '#9A8E85', marginTop: 6 }}>
                {sinSaldoInicial ? 'Sin saldo inicial (arranca en $0)' : `Saldo inicial ${fmt(datos.saldos[k].saldo)} el ${dia(datos.saldos[k].fecha)}`}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => setMostrarTransf(true)} style={{ background: '#1A5FA8', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>⇄ Transferir entre cuentas</button>
        <button onClick={abrirEditar} style={{ background: '#fff', color: '#5A4F47', border: '1px solid #DDD8CF', borderRadius: 7, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>✎ Fijar saldos iniciales</button>
      </div>

      {editando && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Saldos iniciales</div>
          <div style={{ fontSize: 12, color: '#9A8E85', marginBottom: 14 }}>
            Escribe cuánta plata tenías en cada cuenta el día que empezaste a usar el sistema. Los movimientos de esa fecha en adelante se suman o restan a este valor; los anteriores se ignoran. Deja vacío lo que no quieras cambiar.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12, marginBottom: 14, alignItems: 'end' }}>
            {TODAS_CUENTAS.map(k => (
              <div key={k} style={{ display: 'contents' }}>
                <div style={{ fontSize: 13, fontWeight: 600, padding: '9px 0' }}>{NOMBRE_CUENTA(k)}</div>
                <div><label style={lbl}>SALDO</label><input type="number" value={formSaldos[k]?.saldo ?? ''} onChange={e => setFormSaldos({ ...formSaldos, [k]: { ...formSaldos[k], saldo: e.target.value } })} placeholder="0" style={inp} /></div>
                <div><label style={lbl}>AL DÍA</label><input type="date" value={formSaldos[k]?.fecha || ''} onChange={e => setFormSaldos({ ...formSaldos, [k]: { ...formSaldos[k], fecha: e.target.value } })} style={inp} /></div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => setEditando(false)} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={guardarSaldos} disabled={guardando} style={{ padding: '8px 16px', background: '#1A5FA8', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{guardando ? 'Guardando...' : 'Guardar saldos'}</button>
          </div>
        </div>
      )}

      {mostrarTransf && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Nueva transferencia entre cuentas</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div><label style={lbl}>FECHA</label><input type="date" value={formTransf.fecha} onChange={e => setFormTransf({ ...formTransf, fecha: e.target.value })} style={inp} /></div>
            <div><label style={lbl}>MONTO</label><input type="number" value={formTransf.monto} onChange={e => setFormTransf({ ...formTransf, monto: e.target.value })} placeholder="0" style={inp} /></div>
            <div>
              <label style={lbl}>SALE DE</label>
              <select value={formTransf.cuenta_origen} onChange={e => setFormTransf({ ...formTransf, cuenta_origen: e.target.value })} style={inp}>
                <option value="">Selecciona...</option>
                {TODAS_CUENTAS.map(k => <option key={k} value={k}>{NOMBRE_CUENTA(k)}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>ENTRA A</label>
              <select value={formTransf.cuenta_destino} onChange={e => setFormTransf({ ...formTransf, cuenta_destino: e.target.value })} style={inp}>
                <option value="">Selecciona...</option>
                {TODAS_CUENTAS.map(k => <option key={k} value={k}>{NOMBRE_CUENTA(k)}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>NOTA (opcional)</label><input value={formTransf.nota} onChange={e => setFormTransf({ ...formTransf, nota: e.target.value })} placeholder="Ej. Retiro para pagar proveedores en efectivo" style={inp} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => { setMostrarTransf(false); setFormTransf(transfVacia) }} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={guardarTransferencia} disabled={guardando} style={{ padding: '8px 16px', background: '#1A5FA8', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{guardando ? 'Guardando...' : 'Guardar transferencia'}</button>
          </div>
        </div>
      )}

      {ultimasTransf.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Últimas transferencias</div>
          <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F4F1ED' }}>
                  {['Fecha', 'Sale de', 'Entra a', 'Nota', 'Valor', ''].map(h => (
                    <th key={h} style={{ padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ultimasTransf.map(t => (
                  <tr key={t.id} style={{ borderBottom: '1px solid #DDD8CF' }}>
                    <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: 'monospace', color: '#9A8E85' }}>{dia(t.fecha)}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13 }}>{NOMBRE_CUENTA(t.cuenta_origen)}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13 }}>{NOMBRE_CUENTA(t.cuenta_destino)}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: '#9A8E85' }}>{t.nota || '—'}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: '#1A5FA8' }}>{fmt(t.monto)}</td>
                    <td style={{ padding: '8px 16px' }}>
                      <button onClick={() => setTransfAEliminar(t)} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// EXTRACTO (todos los movimientos en orden, con saldo corrido por cuenta)
// ─────────────────────────────────────────────
export function Extracto({ desde, hasta }) {
  const [datos, setDatos] = useState(null)
  const [cuenta, setCuenta] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { cargarMovimientos().then(setDatos).catch(e => setError(e.message)) }, [])

  const inp = { padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, background: '#F4F1ED' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }

  if (error) return <div style={{ textAlign: 'center', padding: 40, color: '#B22222' }}>Error: {error}</div>
  if (!datos) return <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85' }}>Cargando...</div>

  // El saldo corrido se calcula con TODO el historial, para que no cambie al mover las fechas.
  const acum = {}
  const conSaldo = datos.movs.map(m => {
    acum[m.cuenta] = (acum[m.cuenta] || 0) + m.monto
    return { ...m, saldo: acum[m.cuenta] }
  })
  const filas = conSaldo.filter(m => m.fecha >= desde && m.fecha <= hasta && (!cuenta || m.cuenta === cuenta)).reverse()
  const entra = filas.filter(m => m.monto > 0 && m.tipo !== 'Saldo inicial').reduce((s, m) => s + m.monto, 0)
  const sale = filas.filter(m => m.monto < 0).reduce((s, m) => s - m.monto, 0)

  const badge = (t) => {
    if (t === 'Ingreso') return { bg: '#E8F7EF', color: '#1A9156' }
    if (t === 'Gasto') return { bg: '#FEF3DC', color: '#C07D00' }
    if (t === 'Egreso') return { bg: '#E8F0FB', color: '#1A5FA8' }
    if (t === 'Abono CxP') return { bg: '#F3E8FB', color: '#7A1FA2' }
    if (t === 'Nómina') return { bg: '#E8F7EF', color: '#1A9156' }
    if (t === 'Transferencia') return { bg: '#E8F0FB', color: '#1A5FA8' }
    return { bg: '#F4F1ED', color: '#5A4F47' }
  }

  // ── Exportar / imprimir / compartir (en orden cronológico, como un extracto bancario) ──
  const cronologicas = [...filas].reverse()
  const nombreCuenta = cuenta ? NOMBRE_CUENTA(cuenta) : 'Todas las cuentas'
  const tituloExtracto = `Extracto — ${nombreCuenta} — ${desde} a ${hasta}`
  const nombreArchivo = `extracto_${nombreCuenta.replace(/\s+/g, '_')}_${desde}_${hasta}`

  const construirCSV = () => {
    const celda = (v) => (typeof v === 'number' ? String(v) : `"${String(v ?? '').replace(/"/g, '""')}"`)
    const lineas = [
      ['Fecha', 'Cuenta', 'Tipo', 'Detalle', 'Entra', 'Sale', 'Saldo de la cuenta'],
      ...cronologicas.map(m => [m.fecha, NOMBRE_CUENTA(m.cuenta), m.tipo, m.detalle, m.monto > 0 ? m.monto : '', m.monto < 0 ? -m.monto : '', m.saldo]),
    ]
    // Separador ";" y BOM UTF-8: así Excel en español abre las columnas y las tildes bien
    return '\uFEFF' + lineas.map(l => l.map(celda).join(';')).join('\r\n')
  }

  const descargarCSV = () => {
    const blob = new Blob([construirCSV()], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nombreArchivo + '.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  const imprimir = () => {
    const w = window.open('', '_blank')
    if (!w) { alert('El navegador bloqueó la ventana. Permite las ventanas emergentes para imprimir.'); return }
    const filasHTML = cronologicas.map(m => `
      <tr>
        <td>${esc(m.fecha)}</td><td>${esc(NOMBRE_CUENTA(m.cuenta))}</td><td>${esc(m.tipo)}</td><td>${esc(m.detalle)}</td>
        <td class="n">${m.monto > 0 ? esc(fmt(m.monto)) : ''}</td>
        <td class="n">${m.monto < 0 ? esc(fmt(-m.monto)) : ''}</td>
        <td class="n b">${esc(fmt(m.saldo))}</td>
      </tr>`).join('')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(tituloExtracto)}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #222; margin: 24px; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .sub { font-size: 12px; color: #666; margin-bottom: 14px; }
        .res { font-size: 13px; margin-bottom: 14px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { text-align: left; background: #F4F1ED; padding: 6px 8px; border-bottom: 1px solid #999; }
        td { padding: 5px 8px; border-bottom: 1px solid #ddd; vertical-align: top; }
        .n { text-align: right; white-space: nowrap; }
        .b { font-weight: bold; }
        tr { page-break-inside: avoid; }
      </style></head><body>
      <h1>Ahumados M&amp;Y — Extracto de cuentas</h1>
      <div class="sub">${esc(nombreCuenta)} · del ${esc(desde)} al ${esc(hasta)}</div>
      <div class="res"><b>Entró:</b> ${esc(fmt(entra))} &nbsp;&nbsp; <b>Salió:</b> ${esc(fmt(sale))} &nbsp;&nbsp; <b>Movimientos:</b> ${cronologicas.length}</div>
      <table>
        <thead><tr><th>Fecha</th><th>Cuenta</th><th>Tipo</th><th>Detalle</th><th class="n">Entra</th><th class="n">Sale</th><th class="n">Saldo cuenta</th></tr></thead>
        <tbody>${filasHTML}</tbody>
      </table>
      </body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  const compartir = async () => {
    const ultimas = filas.slice(0, 25).map(m => `${m.fecha} · ${m.tipo} · ${m.detalle} · ${m.monto > 0 ? '+' : '-'}${fmt(Math.abs(m.monto))}`).join('\n')
    const resumen = `${tituloExtracto}\nEntró: ${fmt(entra)}\nSalió: ${fmt(sale)}\nMovimientos: ${filas.length}\n\nÚltimos movimientos:\n${ultimas}`
    try {
      if (navigator.share) {
        const archivo = new File([construirCSV()], nombreArchivo + '.csv', { type: 'text/csv' })
        if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
          await navigator.share({ title: tituloExtracto, text: resumen, files: [archivo] })
        } else {
          await navigator.share({ title: tituloExtracto, text: resumen })
        }
      } else {
        // Computador sin menú de compartir: abre WhatsApp con el resumen
        window.open('https://wa.me/?text=' + encodeURIComponent(resumen), '_blank')
      }
    } catch (e) {
      if (e.name !== 'AbortError') alert('No se pudo compartir: ' + e.message)
    }
  }

  const btnAccion = { background: '#fff', color: '#5A4F47', border: '1px solid #DDD8CF', borderRadius: 7, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <label style={lbl}>CUENTA</label>
          <select value={cuenta} onChange={e => setCuenta(e.target.value)} style={inp}>
            <option value="">Todas</option>
            {TODAS_CUENTAS.map(k => <option key={k} value={k}>{NOMBRE_CUENTA(k)}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={descargarCSV} disabled={filas.length === 0} style={btnAccion}>⬇ Exportar a Excel</button>
          <button onClick={imprimir} disabled={filas.length === 0} style={btnAccion}>🖨 Imprimir / PDF</button>
          <button onClick={compartir} disabled={filas.length === 0} style={btnAccion}>↗ Compartir</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#E8F7EF', borderRadius: 9, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#1A9156', fontWeight: 600 }}>Entró</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#1A9156' }}>{fmt(entra)}</span>
        </div>
        <div style={{ background: '#FCEAEA', borderRadius: 9, padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#B22222', fontWeight: 600 }}>Salió</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#B22222' }}>{fmt(sale)}</span>
        </div>
      </div>

      {filas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF' }}>
          No hay movimientos en este rango de fechas
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F4F1ED' }}>
                {['Fecha', 'Cuenta', 'Tipo', 'Detalle', 'Entra', 'Sale', 'Saldo de la cuenta'].map(h => (
                  <th key={h} style={{ padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((m, idx) => {
                const b = badge(m.tipo)
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid #DDD8CF' }}>
                    <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: 'monospace', color: '#9A8E85' }}>{m.fecha}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13 }}>{NOMBRE_CUENTA(m.cuenta)}</td>
                    <td style={{ padding: '10px 16px' }}><span style={{ background: b.bg, color: b.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{m.tipo}</span></td>
                    <td style={{ padding: '10px 16px', fontSize: 13 }}>{m.detalle}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, fontFamily: 'monospace', color: '#1A9156' }}>{m.monto > 0 ? fmt(m.monto) : ''}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, fontFamily: 'monospace', color: '#B22222' }}>{m.monto < 0 ? fmt(-m.monto) : ''}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: m.saldo >= 0 ? '#1A5FA8' : '#B22222' }}>{fmt(m.saldo)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 11, color: '#9A8E85', marginTop: 8 }}>
        El saldo de cada fila es el de esa cuenta en ese momento (incluye todo el historial, no solo el rango de fechas). Los ingresos sin cuenta de transferencia se cuentan como efectivo.
      </div>
    </div>
  )
}