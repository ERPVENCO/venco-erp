import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { pagarLiquidacion, registrarPagoManual, eliminarPagoNomina, urlSoporte, nombreCuenta } from './nominaDatos'
import { etiquetaPeriodo } from './nominaMotor'
import { CamposFormaPago, pagoInicial } from './PagoFormaModal'
import { validarFormaPago } from './nominaDatos'

const fmtCOP = (n) => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-CO')
const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }
const FORMAS = { efectivo: 'Efectivo', transferencia: 'Transferencia', ambos: 'Ambas', otro: 'Otro' }

const textoForma = (p) => {
  if (p.forma_pago === 'ambos') return `Ambas: efectivo ${fmtCOP(Number(p.monto_efectivo))} + transferencia ${fmtCOP(Number(p.monto_transferencia))} (${nombreCuenta(p.cuenta)})`
  if (p.forma_pago === 'transferencia') return `Transferencia (${nombreCuenta(p.cuenta)})`
  return FORMAS[p.forma_pago || p.medio] || p.medio
}

// Sección "Pagos de nómina" de la pestaña Bonos / Pagos de un empleado:
//  · Pagar nómina generada: toma el neto de una nómina aprobada en 💰 Nómina.
//  · Pago manual: la persona escribe el monto (puede ser un adelanto que se descuenta en la próxima nómina).
// Todo pago genera su gasto en Finanzas con la forma de pago elegida (Efectivo, Transferencia o Ambas).
export default function PagosNomina({ empleado, solicitarClave, onCambio }) {
  const [liquidaciones, setLiquidaciones] = useState([])
  const [pagos, setPagos] = useState([])
  const [modo, setModo] = useState(null) // null | 'nomina' | 'manual'
  const [pagoNomina, setPagoNomina] = useState(pagoInicial())
  const [referencia, setReferencia] = useState('')
  const [manual, setManual] = useState({ concepto: '', valor: '', referencia: '', observaciones: '', esAdelanto: false, autorizado: false })
  const [pagoManual, setPagoManual] = useState(pagoInicial())
  const [archivo, setArchivo] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const cargar = async () => {
    const { data: liqs } = await supabase.from('nomina_liquidaciones')
      .select('*, nomina_periodos(periodicidad, fecha_inicio, fecha_fin)')
      .eq('empleado_id', empleado.id).in('estado', ['aprobada', 'pagada']).order('creado_en', { ascending: false })
    setLiquidaciones(liqs || [])
    const { data: pg } = await supabase.from('nomina_pagos').select('*').eq('empleado_id', empleado.id).order('fecha_pago', { ascending: false })
    setPagos(pg || [])
  }
  useEffect(() => { cargar(); setModo(null) }, [empleado.id])

  const refrescar = () => { cargar(); if (onCambio) onCambio() }
  const etiqueta = (l) => l.nomina_periodos ? etiquetaPeriodo(l.nomina_periodos.periodicidad, { inicio: l.nomina_periodos.fecha_inicio, fin: l.nomina_periodos.fecha_fin }) : 'Período'
  const porPagar = liquidaciones.filter(l => l.estado === 'aprobada')

  const pagarNomina = (liq) => {
    const e = validarFormaPago(liq.neto, pagoNomina)
    if (e) { alert(e); return }
    solicitarClave('Pagar nómina generada', `${empleado.nombre} · ${fmtCOP(Number(liq.neto))}`, async () => {
      setGuardando(true)
      const { error } = await pagarLiquidacion(liq, { empleado, fecha: pagoNomina.fecha, pago: pagoNomina, referencia, concepto: `Nómina ${etiqueta(liq)} — ${empleado.nombre} ${empleado.apellidos || ''}`.trim() })
      setGuardando(false)
      if (error) { alert('Error: ' + error.message); return }
      setModo(null)
      setReferencia('')
      refrescar()
    })
  }

  const guardarManual = () => {
    if (!manual.concepto.trim()) { alert('Escribe el concepto del pago'); return }
    const e = validarFormaPago(manual.valor, pagoManual)
    if (e) { alert(e); return }
    if (manual.esAdelanto && !manual.autorizado) { alert('Para descontar un adelanto en la nómina se necesita la autorización escrita del trabajador (art. 149 del CST). Marca la casilla si la tienes.'); return }
    solicitarClave('Registrar pago manual', `${manual.concepto} · ${fmtCOP(Number(manual.valor))}`, async () => {
      setGuardando(true)
      const { error } = await registrarPagoManual(empleado, { ...manual, fecha: pagoManual.fecha, pago: pagoManual }, archivo)
      setGuardando(false)
      if (error) { alert('Error: ' + error.message); return }
      setManual({ concepto: '', valor: '', referencia: '', observaciones: '', esAdelanto: false, autorizado: false })
      setPagoManual(pagoInicial())
      setArchivo(null)
      setModo(null)
      refrescar()
    })
  }

  const eliminar = (p) => {
    solicitarClave('Eliminar pago de nómina', `${p.concepto || 'Pago'} · ${fmtCOP(Number(p.valor))} (también se elimina su gasto en Finanzas)`, async () => {
      const { error } = await eliminarPagoNomina(p)
      if (error) { alert('Error al eliminar: ' + error.message); return }
      refrescar()
    })
  }

  const verSoporte = async (p) => {
    const { url, error } = await urlSoporte(p.soporte_url)
    if (error) { alert('Error al abrir el archivo: ' + error.message); return }
    window.open(url, '_blank')
  }

  return (
    <div style={{ marginTop: 24, borderTop: '2px solid #EDE8DF', paddingTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#9A8E85', fontWeight: 600 }}>💳 PAGOS DE NÓMINA</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setModo(modo === 'nomina' ? null : 'nomina')} style={{ background: modo === 'nomina' ? '#1A5FA8' : '#1A9156', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            💳 Pagar nómina generada{porPagar.length ? ` (${porPagar.length})` : ''}
          </button>
          <button onClick={() => setModo(modo === 'manual' ? null : 'manual')} style={{ background: modo === 'manual' ? '#5A4F47' : '#fff', color: modo === 'manual' ? '#fff' : '#5A4F47', border: '1px solid #DDD8CF', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            ✍️ Pago manual
          </button>
        </div>
      </div>

      {modo === 'nomina' && (
        <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
          {porPagar.length === 0 ? (
            <div style={{ fontSize: 13, color: '#5A4F47' }}>No hay nómina aprobada pendiente de pago para este empleado. Genera y aprueba la nómina del período en <b>💰 Nómina</b>.</div>
          ) : (
            <>
              <CamposFormaPago pago={pagoNomina} setPago={setPagoNomina} valor={porPagar[0] ? Number(porPagar[0].neto) : 0} />
              <div style={{ marginTop: 10, marginBottom: 12 }}>
                <label style={lbl}>REFERENCIA / COMPROBANTE</label>
                <input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Opcional" style={inp} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {porPagar.map(l => (
                  <div key={l.id} style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{etiqueta(l)}</div>
                      <div style={{ fontSize: 11, color: '#9A8E85' }}>Devengado {fmtCOP(Number(l.devengado))} · Deducciones −{fmtCOP(Number(l.deducciones))}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#1A9156' }}>{fmtCOP(Number(l.neto))}</span>
                      <button onClick={() => pagarNomina(l)} disabled={guardando || !(Number(l.neto) > 0)} style={{ background: '#1A9156', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Pagar este monto</button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: '#9A8E85', marginTop: 8 }}>Si hay varias nóminas por pagar, la forma de pago de arriba se aplica a la que pagues; en "Ambas" el efectivo se toma sobre cada total.</div>
            </>
          )}
        </div>
      )}

      {modo === 'manual' && (
        <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>CONCEPTO *</label><input value={manual.concepto} onChange={e => setManual({ ...manual, concepto: e.target.value })} placeholder="Ej. Adelanto de quincena" style={inp} /></div>
            <div><label style={lbl}>VALOR (COP) *</label><input type="number" min="0" value={manual.valor} onChange={e => setManual({ ...manual, valor: e.target.value })} style={inp} /></div>
            <div><label style={lbl}>REFERENCIA / COMPROBANTE</label><input value={manual.referencia} onChange={e => setManual({ ...manual, referencia: e.target.value })} placeholder="Opcional" style={inp} /></div>
          </div>
          <CamposFormaPago pago={pagoManual} setPago={setPagoManual} valor={manual.valor} />
          <div style={{ background: '#FEF3DC', borderRadius: 7, padding: '8px 12px', margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: '#5A4F47', display: 'flex', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={manual.esAdelanto} onChange={e => setManual({ ...manual, esAdelanto: e.target.checked, autorizado: false })} style={{ marginTop: 2 }} />
              Es un adelanto: se descuenta automáticamente en la próxima nómina (así no se paga dos veces).
            </label>
            {manual.esAdelanto && (
              <label style={{ fontSize: 12, color: '#5A4F47', display: 'flex', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={manual.autorizado} onChange={e => setManual({ ...manual, autorizado: e.target.checked })} style={{ marginTop: 2 }} />
                Cuento con la autorización escrita del trabajador para descontarlo (art. 149 del CST).
              </label>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginBottom: 10 }}>
            <div><label style={lbl}>SOPORTE (comprobante)</label><input type="file" onChange={e => setArchivo(e.target.files[0])} style={{ ...inp, padding: 6 }} /></div>
            <div><label style={lbl}>OBSERVACIONES</label><input value={manual.observaciones} onChange={e => setManual({ ...manual, observaciones: e.target.value })} placeholder="Notas opcionales" style={inp} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setModo(null)} style={{ padding: '6px 14px', border: '1px solid #DDD8CF', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
            <button onClick={guardarManual} disabled={guardando} style={{ padding: '6px 14px', border: 'none', borderRadius: 6, background: '#B22222', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{guardando ? 'Guardando...' : '💾 Registrar pago'}</button>
          </div>
        </div>
      )}

      {pagos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 16, color: '#9A8E85', fontSize: 12, background: '#F4F1ED', borderRadius: 8 }}>Sin pagos de nómina registrados.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pagos.map(p => (
            <div key={p.id} style={{ background: '#F4F1ED', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.concepto || 'Pago'}</div>
                <div style={{ fontSize: 11, color: '#9A8E85' }}>
                  {p.fecha_pago} · {textoForma(p)}{p.referencia ? ` · ${p.referencia}` : ''}{p.observaciones ? ` · ${p.observaciones}` : ''}{p.egreso_id ? ' · gasto registrado en Finanzas' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ background: p.tipo === 'nomina' ? '#E8F0FB' : '#F0ECE5', color: p.tipo === 'nomina' ? '#1A5FA8' : '#5A4F47', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{p.tipo === 'nomina' ? 'Nómina' : p.tipo === 'manual' ? 'Manual' : p.tipo}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#1A9156' }}>{fmtCOP(Number(p.valor))}</span>
                {p.soporte_url && <button onClick={() => verSoporte(p)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>👁️ Ver</button>}
                <button onClick={() => eliminar(p)} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}