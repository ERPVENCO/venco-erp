import { useState, useEffect, useMemo } from 'react'
import {
  cargarDatosLiquidacion, cargarLiquidacionesFinales, guardarLiquidacionFinal, aprobarLiquidacionFinal,
  reabrirLiquidacionFinal, eliminarLiquidacionFinal, pagarLiquidacionFinal
} from './nominaDatos'
import {
  MOTIVOS_LIQUIDACION, motivoInfo, TIPOS_CONTRATO, tipoContratoDesdeTexto, cortesSugeridos, calcularLiquidacionFinal,
  crearResolvedor, fmtISO
} from './nominaMotor'
import PagoFormaModal from './PagoFormaModal'

const fmtCOP = (n) => (n < 0 ? '−$' : '$') + Math.abs(Math.round(Number(n) || 0)).toLocaleString('es-CO')
const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }
const ESTADO = {
  borrador: { label: 'Borrador', bg: '#FEF3DC', color: '#C07D00' },
  aprobada: { label: 'Aprobada', bg: '#E8F0FB', color: '#1A5FA8' },
  pagada: { label: 'Pagada', bg: '#E8F7EF', color: '#1A9156' },
}
const boton = (extra) => ({ border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', ...extra })
const nombreEmp = (e) => `${e.nombre} ${e.apellidos || ''}`.trim()

// Liquidación de un empleado según el motivo: retiro voluntario, mutuo acuerdo, vencimiento de contrato,
// despido con o sin justa causa, o compensación de vacaciones en dinero.
// Flujo: elegir empleado y motivo → Calcular (se revisa el detalle) → Guardar borrador → Aprobar → Pagar.
export default function Liquidaciones({ empleados, parametros, pedirClave, avisar }) {
  const [historial, setHistorial] = useState([])
  const [empleadoId, setEmpleadoId] = useState('')
  const [motivo, setMotivo] = useState('renuncia')
  const [fechaRetiro, setFechaRetiro] = useState(fmtISO(new Date()))
  const [entradas, setEntradas] = useState({})
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const [liqActual, setLiqActual] = useState(null) // liquidación guardada que se está viendo o editando
  const [modalPago, setModalPago] = useState(false)
  const [trabajando, setTrabajando] = useState(false)

  const resolvedor = useMemo(() => crearResolvedor(parametros), [parametros])
  const emp = empleados.find(e => e.id === empleadoId)
  const congelada = liqActual && liqActual.estado !== 'borrador'
  const esVac = motivo === 'vacaciones'

  const recargarHistorial = async () => setHistorial(await cargarLiquidacionesFinales())
  useEffect(() => { recargarHistorial() }, [])

  // Al elegir empleado o cambiar la fecha: se leen sus datos y se sugieren las fechas de corte
  const prepararEmpleado = async (id, fecha, entradasPrevias) => {
    setResultado(null); setError('')
    const e = empleados.find(x => x.id === id)
    if (!e) { setDatos(null); return }
    setCargando(true)
    const d = await cargarDatosLiquidacion(id)
    setDatos(d)
    setCargando(false)
    if (!entradasPrevias) {
      const cortes = e.fecha_ingreso ? cortesSugeridos({ fechaIngreso: e.fecha_ingreso, fechaRetiro: fecha, ultimoPeriodoPagadoFin: d.ultimoPeriodoPagadoFin }) : {}
      setEntradas({
        desdeSalario: cortes.desdeSalario, desdeCesantias: cortes.desdeCesantias, desdePrima: cortes.desdePrima,
        tipoContrato: tipoContratoDesdeTexto(e.tipo_contrato), fechaFinContrato: e.fecha_fin_contrato || '',
        promedioVariable: '', indemnizacionPactada: '', diasCompensar: '',
      })
    }
  }

  const elegirEmpleado = (id) => {
    setEmpleadoId(id)
    setLiqActual(null)
    const e = empleados.find(x => x.id === id)
    const fecha = e?.fecha_retiro || fechaRetiro
    if (e?.fecha_retiro) setFechaRetiro(e.fecha_retiro)
    prepararEmpleado(id, fecha)
  }

  const cambiarFecha = (f) => {
    setFechaRetiro(f)
    if (emp && datos && f) {
      const cortes = emp.fecha_ingreso ? cortesSugeridos({ fechaIngreso: emp.fecha_ingreso, fechaRetiro: f, ultimoPeriodoPagadoFin: datos.ultimoPeriodoPagadoFin }) : {}
      setEntradas(en => ({ ...en, desdeSalario: cortes.desdeSalario, desdeCesantias: cortes.desdeCesantias, desdePrima: cortes.desdePrima }))
      setResultado(null)
    }
  }

  const calcular = () => {
    setError('')
    if (!emp || !datos) { setError('Elige primero al empleado.'); return }
    if (!fechaRetiro) { setError('Indica la fecha de retiro.'); return }
    try {
      const r = calcularLiquidacionFinal({
        empleado: emp, motivo, fechaRetiro,
        entradas: { ...entradas, promedioVariable: Number(entradas.promedioVariable) || 0, indemnizacionPactada: Number(entradas.indemnizacionPactada) || 0, diasCompensar: Number(entradas.diasCompensar) || 0 },
        novedades: datos.novedades, pagosPendientes: datos.pagosPendientes, prestacionesPagadas: datos.prestacionesPagadas,
        diasCompensados: datos.diasCompensados, provisionado: datos.provisionado, parametros: resolvedor,
      })
      setResultado(r)
    } catch (err) {
      setResultado(null)
      setError(err.message)
    }
  }

  const guardar = async () => {
    if (!resultado) { avisar('Primero pulsa Calcular y revisa el detalle.', true); return }
    setTrabajando(true)
    const { data, error: err } = await guardarLiquidacionFinal({ id: liqActual?.id, empleado: emp, motivo, fechaRetiro, entradas, resultado })
    setTrabajando(false)
    if (err) { avisar('Error: ' + err.message, true); return }
    setLiqActual(data)
    avisar('Borrador guardado.')
    recargarHistorial()
  }

  const aprobar = () => {
    if (!liqActual) { avisar('Guarda primero el borrador.', true); return }
    const aviso = esVac ? '' : ` El empleado pasará a estado Retirado.`
    pedirClave('Aprobar liquidación', `${nombreEmp(emp)} · ${fmtCOP(liqActual.neto)}.${aviso}`, async () => {
      setTrabajando(true)
      const { error: err } = await aprobarLiquidacionFinal(liqActual, emp)
      setTrabajando(false)
      if (err) { avisar('Error: ' + err.message, true); return }
      avisar(esVac ? 'Liquidación aprobada.' : 'Liquidación aprobada. El empleado quedó como Retirado.')
      setLiqActual({ ...liqActual, estado: 'aprobada' })
      recargarHistorial()
    })
  }

  const reabrir = () => pedirClave('Reabrir liquidación', nombreEmp(emp), async () => {
    const { error: err } = await reabrirLiquidacionFinal(liqActual)
    if (err) { avisar(err.message, true); return }
    setLiqActual({ ...liqActual, estado: 'borrador' })
    avisar('Liquidación reabierta como borrador.')
    recargarHistorial()
  })

  const eliminar = () => pedirClave('Eliminar borrador de liquidación', nombreEmp(emp), async () => {
    const { error: err } = await eliminarLiquidacionFinal(liqActual)
    if (err) { avisar(err.message, true); return }
    setLiqActual(null); setResultado(null)
    recargarHistorial()
  })

  const confirmarPago = (pago) => {
    setModalPago(false)
    const concepto = `${esVac ? 'Compensación de vacaciones' : 'Liquidación'} — ${motivoInfo(motivo).label} — ${nombreEmp(emp)}`
    pedirClave('Pagar liquidación', `${nombreEmp(emp)} · ${fmtCOP(liqActual.neto)}`, async () => {
      setTrabajando(true)
      const { error: err } = await pagarLiquidacionFinal(liqActual, { empleado: emp, fecha: pago.fecha, pago, concepto })
      setTrabajando(false)
      if (err) { avisar('Error: ' + err.message, true); return }
      avisar('Liquidación pagada y gasto creado en Finanzas. Las provisiones que cubría quedaron cerradas.')
      setLiqActual({ ...liqActual, estado: 'pagada' })
      recargarHistorial()
    })
  }

  // Abrir una liquidación del historial
  const abrirDelHistorial = async (l) => {
    setEmpleadoId(l.empleado_id)
    setMotivo(l.motivo)
    setFechaRetiro(l.fecha_retiro)
    setEntradas(l.entradas || {})
    setLiqActual(l)
    setResultado(l.resultado)
    setError('')
    const d = await cargarDatosLiquidacion(l.empleado_id)
    setDatos(d)
    window.scrollTo?.({ top: 0 })
  }

  const nueva = () => { setLiqActual(null); setResultado(null); setEmpleadoId(''); setDatos(null); setEntradas({}); setError('') }

  const campo = (clave, etiqueta, tipo = 'date', extra = {}) => (
    <div>
      <label style={lbl}>{etiqueta}</label>
      <input type={tipo} value={entradas[clave] ?? ''} disabled={congelada} onChange={e => { setEntradas({ ...entradas, [clave]: e.target.value }); setResultado(null) }} style={inp} {...extra} />
    </div>
  )

  const candidatos = empleados
    .filter(e => (e.estado !== 'retirado' || e.id === empleadoId))
    .sort((a, b) => nombreEmp(a).localeCompare(nombreEmp(b), 'es'))

  return (
    <div>
      <div style={{ background: '#E8F0FB', color: '#1A5FA8', borderRadius: 9, padding: '10px 14px', fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
        Elige al empleado y el motivo; el sistema calcula salario pendiente, cesantías, intereses, prima, vacaciones e indemnización según corresponda, con los parámetros legales vigentes. <b>Revisa el detalle antes de guardar.</b> Al pagar se crea el gasto en Finanzas y se cierran las provisiones que cubría.
      </div>

      <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: '#9A8E85', fontWeight: 600 }}>{liqActual ? `LIQUIDACIÓN ${ESTADO[liqActual.estado].label.toUpperCase()}` : 'NUEVA LIQUIDACIÓN'}</div>
          {(liqActual || empleadoId) && <button onClick={nueva} style={boton({ background: '#F4F1ED', color: '#5A4F47', padding: '4px 12px', fontSize: 12 })}>＋ Nueva</button>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          <div>
            <label style={lbl}>EMPLEADO *</label>
            <select value={empleadoId} disabled={!!liqActual} onChange={e => elegirEmpleado(e.target.value)} style={inp}>
              <option value="">Selecciona...</option>
              {candidatos.map(e => <option key={e.id} value={e.id}>{nombreEmp(e)}{e.estado === 'retirado' ? ' (retirado)' : ''}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>MOTIVO *</label>
            <select value={motivo} disabled={congelada} onChange={e => { setMotivo(e.target.value); setResultado(null) }} style={inp}>
              {MOTIVOS_LIQUIDACION.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>{esVac ? 'FECHA DEL PAGO *' : 'FECHA DE RETIRO *'}</label>
            <input type="date" value={fechaRetiro} disabled={congelada} onChange={e => cambiarFecha(e.target.value)} style={inp} />
          </div>
        </div>

        {emp && (
          <div style={{ fontSize: 12, color: '#5A4F47', marginTop: 10 }}>
            Salario {emp.salario ? fmtCOP(emp.salario) : 'sin registrar'} · ingreso {emp.fecha_ingreso || 'sin registrar'} · contrato: {emp.tipo_contrato || 'sin registrar'}
            {datos && <> · provisionado pendiente: <b>{fmtCOP(Object.values(datos.provisionado).reduce((a, v) => a + v, 0))}</b></>}
          </div>
        )}

        {emp && datos && !cargando && (
          <>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, margin: '16px 0 8px' }}>{esVac ? 'VACACIONES A COMPENSAR' : 'DATOS Y FECHAS DE CORTE (se sugieren solos; cámbialos si hace falta)'}</div>
            {esVac ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                {campo('diasCompensar', 'DÍAS HÁBILES A COMPENSAR', 'number', { min: 0, step: 0.5 })}
                {campo('promedioVariable', 'PROMEDIO SALARIAL VARIABLE MENSUAL (opcional)', 'number', { min: 0 })}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                {campo('desdeSalario', 'SALARIO PENDIENTE DESDE')}
                {campo('desdeCesantias', 'CESANTÍAS E INTERESES DESDE')}
                {campo('desdePrima', 'PRIMA DESDE')}
                <div>
                  <label style={lbl}>TIPO DE CONTRATO</label>
                  <select value={entradas.tipoContrato || 'indefinido'} disabled={congelada} onChange={e => { setEntradas({ ...entradas, tipoContrato: e.target.value }); setResultado(null) }} style={inp}>
                    {TIPOS_CONTRATO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {(entradas.tipoContrato === 'fijo' || entradas.tipoContrato === 'obra') && campo('fechaFinContrato', entradas.tipoContrato === 'obra' ? 'FIN ESTIMADO DE LA OBRA' : 'FECHA DE FIN DEL CONTRATO')}
                {campo('promedioVariable', 'PROMEDIO SALARIAL VARIABLE MENSUAL (opcional)', 'number', { min: 0 })}
                {campo('indemnizacionPactada', 'BONIFICACIÓN O INDEMNIZACIÓN PACTADA (opcional)', 'number', { min: 0 })}
              </div>
            )}
            {!esVac && (
              <div style={{ fontSize: 10, color: '#9A8E85', marginTop: 8, lineHeight: 1.5 }}>
                Si el retiro es antes del 14 de febrero, las cesantías del año anterior todavía no vencían: se incluyen. Si ya las consignaste en el fondo, cambia "Cesantías desde" al 1 de enero de este año. El promedio variable aplica si el trabajador recibe pagos salariales que cambian cada mes (comisiones, extras).
              </div>
            )}
            {!congelada && (
              <div style={{ marginTop: 14 }}>
                <button onClick={calcular} style={boton({ background: '#1A5FA8', color: '#fff' })}>🧮 Calcular liquidación</button>
              </div>
            )}
          </>
        )}
        {cargando && <div style={{ fontSize: 12, color: '#9A8E85', marginTop: 12 }}>Leyendo datos del empleado...</div>}
        {error && <div style={{ fontSize: 12, color: '#B22222', marginTop: 10 }}>⚠️ {error}</div>}
      </div>

      {resultado && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 12, color: '#9A8E85', fontWeight: 600, marginBottom: 8 }}>DETALLE DE LA LIQUIDACIÓN</div>
          {resultado.conceptos.map((c, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 0', borderTop: i ? '1px solid #F0ECE5' : 'none', fontSize: 13 }}>
              <div>
                <div>{c.nombre}</div>
                {c.detalle && <div style={{ fontSize: 11, color: '#9A8E85' }}>{c.detalle}</div>}
              </div>
              <div style={{ whiteSpace: 'nowrap', fontWeight: 600, color: c.tipo === 'devengo' ? '#1A9156' : '#B22222' }}>{c.tipo === 'devengo' ? '+' : '−'}{fmtCOP(c.valor)}</div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #DDD8CF', marginTop: 8, paddingTop: 10, fontSize: 16, fontWeight: 700 }}>
            <span>Neto a pagar al trabajador</span><span style={{ color: '#1A9156' }}>{fmtCOP(resultado.neto)}</span>
          </div>
          <div style={{ fontSize: 11, color: '#9A8E85' }}>Devengado {fmtCOP(resultado.devengado)} · Deducciones −{fmtCOP(resultado.deducciones)}</div>

          {!esVac && resultado.comparacion && (
            <div style={{ background: '#F4F1ED', borderRadius: 8, padding: '10px 14px', marginTop: 14 }}>
              <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 6 }}>PROVISIONADO vs LIQUIDADO</div>
              {resultado.comparacion.map(c => (
                <div key={c.codigo} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
                  <span>{{ prima: 'Prima', cesantias: 'Cesantías', intereses_cesantias: 'Intereses sobre cesantías', vacaciones: 'Vacaciones' }[c.codigo]}</span>
                  <span>provisionado {fmtCOP(c.provisionado)} → liquidado {fmtCOP(c.liquidado)} <b style={{ color: c.liquidado - c.provisionado > 0 ? '#B22222' : '#1A9156' }}>({c.liquidado - c.provisionado >= 0 ? '+' : '−'}{fmtCOP(Math.abs(c.liquidado - c.provisionado))})</b></span>
                </div>
              ))}
              <div style={{ fontSize: 10, color: '#9A8E85', marginTop: 4 }}>Si lo liquidado supera lo provisionado, la diferencia es un costo adicional para la empresa. Al pagar, las provisiones de este empleado quedan cerradas.</div>
            </div>
          )}

          {resultado.advertencias.map((a, i) => <div key={i} style={{ fontSize: 11, color: '#C07D00', marginTop: 6 }}>⚠️ {a}</div>)}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            {(!liqActual || liqActual.estado === 'borrador') && (
              <>
                <button onClick={guardar} disabled={trabajando} style={boton({ background: '#fff', color: '#5A4F47', border: '1px solid #DDD8CF' })}>💾 Guardar borrador</button>
                {liqActual && <button onClick={aprobar} disabled={trabajando} style={boton({ background: '#1A5FA8', color: '#fff' })}>🔒 Aprobar liquidación</button>}
                {liqActual && <button onClick={eliminar} style={boton({ background: '#FCEAEA', color: '#B22222' })}>🗑️ Eliminar borrador</button>}
              </>
            )}
            {liqActual?.estado === 'aprobada' && (
              <>
                <button onClick={() => setModalPago(true)} disabled={trabajando || !(Number(liqActual.neto) > 0)} style={boton({ background: '#1A9156', color: '#fff' })}>💳 Pagar liquidación</button>
                <button onClick={reabrir} style={boton({ background: '#fff', color: '#5A4F47', border: '1px solid #DDD8CF' })}>↺ Reabrir</button>
              </>
            )}
            {liqActual?.estado === 'pagada' && <span style={{ fontSize: 13, color: '#1A9156', fontWeight: 600 }}>✅ Pagada. El pago y su gasto están en Bonos / Pagos del empleado y en Finanzas.</span>}
          </div>
        </div>
      )}

      {historial.length > 0 && (
        <div>
          <div style={{ fontSize: 12, color: '#9A8E85', fontWeight: 600, marginBottom: 8 }}>LIQUIDACIONES REGISTRADAS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {historial.map(l => {
              const e = empleados.find(x => x.id === l.empleado_id)
              const est = ESTADO[l.estado]
              return (
                <div key={l.id} onClick={() => abrirDelHistorial(l)} style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{e ? nombreEmp(e) : 'Empleado'}</div>
                    <div style={{ fontSize: 11, color: '#9A8E85' }}>{motivoInfo(l.motivo).label} · {l.fecha_retiro}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <b style={{ color: '#1A9156' }}>{fmtCOP(l.neto)}</b>
                    <span style={{ background: est.bg, color: est.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{est.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {modalPago && liqActual && (
        <PagoFormaModal titulo="Pagar liquidación" subtitulo={`${nombreEmp(emp)} · ${motivoInfo(motivo).label}`} valor={Number(liqActual.neto)} onConfirmar={confirmarPago} onCancelar={() => setModalPago(false)} />
      )}
    </div>
  )
}