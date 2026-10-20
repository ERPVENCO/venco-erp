import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { cargarParametros, pagarLiquidacion, crearProvisionesDeLiquidaciones, borrarProvisionesDeLiquidaciones } from './nominaDatos'
import PagoFormaModal from './PagoFormaModal'
import Provisiones from './Provisiones'
import Liquidaciones from './Liquidaciones'
import {
  CATALOGO_PARAMETROS, CATEGORIAS_HORAS, infoParametro, calcularLiquidacion, crearResolvedor,
  parametrosAnualesAlDia, periodoDe, siguientePeriodo, anteriorPeriodo, etiquetaPeriodo, fmtISO
} from './nominaMotor'

const fmtCOP = (n) => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-CO')
const ESTADOS_EN_NOMINA = ['activo', 'vacaciones', 'incapacitado']
const PERIODICIDADES = [['semanal', 'Semanal'], ['quincenal', 'Quincenal'], ['mensual', 'Mensual']]

const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }

const ESTADO_LIQ = {
  borrador: { label: 'Borrador', bg: '#FEF3DC', color: '#C07D00' },
  aprobada: { label: 'Aprobada', bg: '#E8F0FB', color: '#1A5FA8' },
  pagada: { label: 'Pagada', bg: '#E8F7EF', color: '#1A9156' },
}

// Valor de un parámetro para mostrarlo (los porcentajes se guardan como 0.04 y se ven como 4%)
const verValor = (clave, valor) => {
  const u = infoParametro(clave).unidad
  const n = Number(valor)
  if (u === '%') return `${Math.round(n * 10000) / 100}%`
  if (u === 'COP') return fmtCOP(n)
  return `${n}${u ? ' ' + u : ''}`
}

export default function Nomina({ empleados, onCerrar, pedirClave }) {
  const [vista, setVista] = useState('nomina') // 'nomina' | 'parametros'
  const [parametros, setParametros] = useState([])
  const [periodicidad, setPeriodicidad] = useState('quincenal')
  const [periodo, setPeriodo] = useState(() => periodoDe('quincenal', fmtISO(new Date())))
  const [periodoRow, setPeriodoRow] = useState(null)
  const [liquidaciones, setLiquidaciones] = useState([])
  const [novedades, setNovedades] = useState([])
  const [pagos, setPagos] = useState([])
  const [horas, setHoras] = useState({})
  const [abierto, setAbierto] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [trabajando, setTrabajando] = useState(false)
  const [modalPago, setModalPago] = useState(null) // { c } = pagar a una persona · { todas: true } = pagar toda la nómina
  const [mensaje, setMensaje] = useState(null)

  // Formulario de parámetros
  const [nuevoParametro, setNuevoParametro] = useState({ clave: 'smmlv', valor: '', vigente_desde: '', fuente: '' })
  const [verHistorial, setVerHistorial] = useState(null)

  const recargarParametros = async () => setParametros(await cargarParametros())
  useEffect(() => { recargarParametros() }, [])

  const recargarPeriodo = async () => {
    setCargando(true)
    const { data: per } = await supabase.from('nomina_periodos').select('*')
      .eq('periodicidad', periodicidad).eq('fecha_inicio', periodo.inicio).maybeSingle()
    setPeriodoRow(per || null)
    let liqs = []
    if (per) {
      const { data } = await supabase.from('nomina_liquidaciones').select('*').eq('periodo_id', per.id)
      liqs = data || []
    }
    setLiquidaciones(liqs)
    const h = {}
    for (const l of liqs) h[l.empleado_id] = l.horas || {}
    setHoras(h)
    const { data: nov } = await supabase.from('novedades_asistencia').select('*')
      .lte('fecha_inicio', periodo.fin).gte('fecha_fin', periodo.inicio)
    setNovedades(nov || [])
    const { data: pg } = await supabase.from('pagos_empleado').select('*')
      .eq('estado', 'pendiente').lte('fecha', periodo.fin).lte('periodo', periodo.fin.slice(0, 7))
    const ids = new Set(liqs.map(l => l.id))
    setPagos((pg || []).filter(p => !p.liquidacion_id || ids.has(p.liquidacion_id)))
    setCargando(false)
  }
  useEffect(() => { recargarPeriodo() }, [periodicidad, periodo.inicio])

  const cambiarPeriodicidad = (p) => {
    setPeriodicidad(p)
    setPeriodo(periodoDe(p, fmtISO(new Date())))
    setAbierto(null)
  }

  const resolvedor = useMemo(() => crearResolvedor(parametros), [parametros])
  const faltantes = useMemo(() => parametrosAnualesAlDia(parametros, periodo.fin), [parametros, periodo.fin])
  const aprobada = periodoRow?.estado === 'aprobada'

  const empleadosPeriodo = useMemo(() => empleados
    .filter(e => (e.periodicidad_pago || 'quincenal') === periodicidad && ESTADOS_EN_NOMINA.includes(e.estado) && (!e.fecha_ingreso || e.fecha_ingreso <= periodo.fin))
    .sort((a, b) => `${a.nombre} ${a.apellidos || ''}`.localeCompare(`${b.nombre} ${b.apellidos || ''}`, 'es')),
  [empleados, periodicidad, periodo.fin])

  const calculos = useMemo(() => empleadosPeriodo.map(emp => {
    const liq = liquidaciones.find(l => l.empleado_id === emp.id)
    if (liq && liq.estado !== 'borrador') return { emp, liq, res: liq.resultado, congelada: true }
    if (aprobada && !liq) return { emp, liq: null, noIncluido: true }
    if (parametros.length === 0) return { emp, liq, error: 'Cargando parámetros legales...' }
    try {
      const res = calcularLiquidacion({
        empleado: emp, periodicidad, periodo,
        novedades: novedades.filter(n => n.empleado_id === emp.id),
        pagos: pagos.filter(p => p.empleado_id === emp.id),
        horas: horas[emp.id] || {}, parametros: resolvedor
      })
      return { emp, liq, res }
    } catch (err) {
      return { emp, liq, error: err.message }
    }
  }), [empleadosPeriodo, liquidaciones, novedades, pagos, horas, parametros, resolvedor, periodicidad, periodo, aprobada])

  const conResultado = calculos.filter(c => c.res)
  const total = (campo) => conResultado.reduce((a, c) => a + Number(c.res[campo] || 0), 0)
  const hayErrores = calculos.some(c => c.error)
  const hayPagadas = liquidaciones.some(l => l.estado === 'pagada')

  const avisar = (texto, error = false) => {
    setMensaje({ texto, error })
    setTimeout(() => setMensaje(null), 6000)
  }

  // ---------- Acciones ----------
  const guardarBorrador = async () => {
    if (aprobada) return
    if (hayErrores) { avisar('Hay empleados con errores de cálculo. Corrígelos antes de guardar.', true); return }
    setTrabajando(true)
    let per = periodoRow
    if (!per) {
      const { data, error } = await supabase.from('nomina_periodos')
        .insert([{ periodicidad, fecha_inicio: periodo.inicio, fecha_fin: periodo.fin }]).select().single()
      if (error) { setTrabajando(false); avisar('Error: ' + error.message, true); return }
      per = data
    }
    const filas = conResultado.map(c => ({
      periodo_id: per.id, empleado_id: c.emp.id, horas: horas[c.emp.id] || {},
      resultado: c.res, parametros: c.res.parametrosUsados,
      devengado: c.res.devengado, deducciones: c.res.deducciones, neto: c.res.neto,
      estado: 'borrador', actualizado_en: new Date().toISOString()
    }))
    if (filas.length) {
      const { error } = await supabase.from('nomina_liquidaciones').upsert(filas, { onConflict: 'periodo_id,empleado_id' })
      if (error) { setTrabajando(false); avisar('Error: ' + error.message, true); return }
    }
    setTrabajando(false)
    avisar('Borrador guardado.')
    recargarPeriodo()
  }

  const aprobar = () => {
    if (!periodoRow || liquidaciones.length === 0) { avisar('Primero guarda el borrador de la nómina.', true); return }
    const sinGuardar = conResultado.filter(c => !c.liq).length
    if (sinGuardar > 0) { avisar(`Hay ${sinGuardar} empleado(s) sin guardar. Guarda el borrador antes de aprobar.`, true); return }
    if (liquidaciones.some(l => !l.resultado?.costoEmpresa)) { avisar('Este borrador es anterior a la versión con costo real. Pulsa "Guardar borrador" de nuevo antes de aprobar.', true); return }
    if (faltantes.length > 0 && !window.confirm(`Estos parámetros anuales no tienen valor para ${periodo.fin.slice(0, 4)}: ${faltantes.join(', ')}.\n\nEl cálculo está usando los del año anterior. ¿Aprobar de todos modos?`)) return
    pedirClave('Aprobar nómina', etiquetaPeriodo(periodicidad, periodo), async () => {
      setTrabajando(true)
      const { error } = await supabase.from('nomina_periodos').update({ estado: 'aprobada', aprobada_en: new Date().toISOString() }).eq('id', periodoRow.id)
      if (error) { setTrabajando(false); avisar('Error: ' + error.message, true); return }
      await supabase.from('nomina_liquidaciones').update({ estado: 'aprobada', actualizado_en: new Date().toISOString() }).eq('periodo_id', periodoRow.id)
      for (const l of liquidaciones) {
        const ids = (l.resultado?.pagosIncluidos || [])
        if (ids.length) await supabase.from('pagos_empleado').update({ liquidacion_id: l.id }).in('id', ids)
      }
      const rp = await crearProvisionesDeLiquidaciones(liquidaciones, periodo)
      setTrabajando(false)
      avisar(rp.error ? 'Nómina aprobada, pero no se guardaron las provisiones: ' + rp.error.message : 'Nómina aprobada y congelada. Las provisiones quedaron registradas.', !!rp.error)
      recargarPeriodo()
    })
  }

  const reabrir = () => {
    if (hayPagadas) { avisar('No se puede reabrir: ya hay pagos registrados. Elimina primero esos pagos.', true); return }
    pedirClave('Reabrir nómina', etiquetaPeriodo(periodicidad, periodo), async () => {
      setTrabajando(true)
      const rb = await borrarProvisionesDeLiquidaciones(liquidaciones.map(l => l.id))
      if (rb.error) { setTrabajando(false); avisar(rb.error.message, true); return }
      await supabase.from('nomina_periodos').update({ estado: 'borrador', aprobada_en: null }).eq('id', periodoRow.id)
      await supabase.from('nomina_liquidaciones').update({ estado: 'borrador', actualizado_en: new Date().toISOString() }).eq('periodo_id', periodoRow.id)
      const ids = liquidaciones.map(l => l.id)
      if (ids.length) await supabase.from('pagos_empleado').update({ liquidacion_id: null }).in('liquidacion_id', ids)
      setTrabajando(false)
      avisar('Nómina reabierta como borrador.')
      recargarPeriodo()
    })
  }

  // Pagar: primero se elige la forma de pago (Efectivo, Transferencia o Ambas); luego la contraseña.
  // Cada pago genera su gasto en Finanzas.
  const conceptoNomina = (emp) => `Nómina ${etiquetaPeriodo(periodicidad, periodo)} — ${emp.nombre} ${emp.apellidos || ''}`.trim()

  const pagarUna = (c) => setModalPago({ c })
  const pagarTodas = () => {
    const pendientes = liquidaciones.filter(l => l.estado === 'aprobada' && Number(l.neto) > 0)
    if (pendientes.length === 0) { avisar('No hay nóminas aprobadas pendientes de pago.', true); return }
    setModalPago({ todas: true })
  }

  const confirmarPago = (pago) => {
    const m = modalPago
    setModalPago(null)
    if (m.c) {
      const c = m.c
      pedirClave('Pagar nómina generada', `${c.emp.nombre} ${c.emp.apellidos || ''} · ${fmtCOP(c.liq.neto)}`, async () => {
        setTrabajando(true)
        const { error } = await pagarLiquidacion(c.liq, { empleado: c.emp, fecha: pago.fecha, pago, concepto: conceptoNomina(c.emp) })
        setTrabajando(false)
        if (error) { avisar('Error: ' + error.message, true); return }
        avisar('Pago registrado y gasto creado en Finanzas.')
        recargarPeriodo()
      })
    } else {
      const pendientes = liquidaciones.filter(l => l.estado === 'aprobada' && Number(l.neto) > 0)
      const suma = pendientes.reduce((a, l) => a + Number(l.neto), 0)
      pedirClave('Pagar toda la nómina', `${pendientes.length} empleado(s) · ${fmtCOP(suma)}`, async () => {
        setTrabajando(true)
        let fallos = 0
        for (const l of pendientes) {
          const emp = empleados.find(e => e.id === l.empleado_id)
          if (!emp) { fallos++; continue }
          const { error } = await pagarLiquidacion(l, { empleado: emp, fecha: pago.fecha, pago: { ...pago, efectivo: '' }, concepto: conceptoNomina(emp) })
          if (error) fallos++
        }
        setTrabajando(false)
        avisar(fallos ? `Se registraron ${pendientes.length - fallos} pagos; ${fallos} fallaron.` : 'Pagos registrados y gastos creados en Finanzas.', fallos > 0)
        recargarPeriodo()
      })
    }
  }

  const cambiarHoras = (empId, clave, valor) =>
    setHoras(h => ({ ...h, [empId]: { ...(h[empId] || {}), [clave]: valor === '' ? '' : Number(valor) } }))

  // ---------- Parámetros ----------
  const guardarParametro = () => {
    const p = nuevoParametro
    if (!p.clave || p.valor === '' || !p.vigente_desde) { avisar('Indica el parámetro, el valor y desde qué fecha rige.', true); return }
    const unidad = infoParametro(p.clave).unidad
    const valor = unidad === '%' ? Number(p.valor) / 100 : Number(p.valor)
    pedirClave('Agregar parámetro legal', `${infoParametro(p.clave).nombre} desde ${p.vigente_desde}`, async () => {
      const { error } = await supabase.from('nomina_parametros').insert([{ clave: p.clave, valor, vigente_desde: p.vigente_desde, fuente: p.fuente || null }])
      if (error) { avisar(error.message.includes('duplicate') ? 'Ya existe un valor de ese parámetro para esa fecha.' : 'Error: ' + error.message, true); return }
      setNuevoParametro({ clave: p.clave, valor: '', vigente_desde: '', fuente: '' })
      avisar('Parámetro agregado. Las nóminas nuevas ya usarán este valor.')
      recargarParametros()
    })
  }

  const eliminarParametro = (fila) => {
    pedirClave('Eliminar vigencia', `${infoParametro(fila.clave).nombre} desde ${fila.vigente_desde}`, async () => {
      const { error } = await supabase.from('nomina_parametros').delete().eq('id', fila.id)
      if (error) { avisar('Error: ' + error.message, true); return }
      recargarParametros()
    })
  }

  const hoy = fmtISO(new Date())
  const vigenteHoy = (clave) => {
    const lista = parametros.filter(p => p.clave === clave && p.vigente_desde <= hoy)
    return lista.length ? lista[lista.length - 1] : null
  }

  const boton = (extra) => ({ border: 'none', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', ...extra })

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#F4F1ED', zIndex: 1000, overflowY: 'auto', padding: 24 }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>💰 Nómina</div>
            <div style={{ fontSize: 13, color: '#5A4F47', marginTop: 4 }}>Cálculo por período con las reglas legales vigentes</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setVista('nomina')} style={boton({ background: vista === 'nomina' ? '#B22222' : '#fff', color: vista === 'nomina' ? '#fff' : '#5A4F47' })}>Nómina</button>
            <button onClick={() => setVista('liquidaciones')} style={boton({ background: vista === 'liquidaciones' ? '#B22222' : '#fff', color: vista === 'liquidaciones' ? '#fff' : '#5A4F47' })}>📋 Liquidaciones</button>
            <button onClick={() => setVista('provisiones')} style={boton({ background: vista === 'provisiones' ? '#B22222' : '#fff', color: vista === 'provisiones' ? '#fff' : '#5A4F47' })}>🏦 Provisiones</button>
            <button onClick={() => setVista('parametros')} style={boton({ background: vista === 'parametros' ? '#B22222' : '#fff', color: vista === 'parametros' ? '#fff' : '#5A4F47' })}>⚖️ Parámetros legales</button>
            <button onClick={onCerrar} style={boton({ background: '#fff', color: '#5A4F47', border: '1px solid #DDD8CF' })}>Cerrar</button>
          </div>
        </div>

        {mensaje && (
          <div style={{ background: mensaje.error ? '#FCEAEA' : '#E8F7EF', color: mensaje.error ? '#B22222' : '#1A9156', borderRadius: 9, padding: '10px 14px', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{mensaje.texto}</div>
        )}

        {modalPago && (
          modalPago.c ? (
            <PagoFormaModal titulo="Pagar nómina generada" subtitulo={`${modalPago.c.emp.nombre} ${modalPago.c.emp.apellidos || ''}`} valor={Number(modalPago.c.liq.neto)} onConfirmar={confirmarPago} onCancelar={() => setModalPago(null)} />
          ) : (
            <PagoFormaModal titulo="Pagar toda la nómina" subtitulo="La misma forma de pago para todos. Para pagar parte en efectivo y parte por transferencia a alguien, págale por separado con el botón Pagar de su fila."
              valor={liquidaciones.filter(l => l.estado === 'aprobada' && Number(l.neto) > 0).reduce((a, l) => a + Number(l.neto), 0)} permitirAmbas={false} onConfirmar={confirmarPago} onCancelar={() => setModalPago(null)} />
          )
        )}

        {vista === 'liquidaciones' && <Liquidaciones empleados={empleados} parametros={parametros} pedirClave={pedirClave} avisar={avisar} />}

        {vista === 'provisiones' && <Provisiones empleados={empleados} pedirClave={pedirClave} avisar={avisar} />}

        {/* ============ PARÁMETROS LEGALES ============ */}
        {vista === 'parametros' && (
          <div>
            <div style={{ background: '#E8F0FB', color: '#1A5FA8', borderRadius: 9, padding: '10px 14px', fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
              Aquí están las reglas que cambian por año o por ley. Cuando cambie algo (por ejemplo, el salario mínimo de enero), agrega una <b>nueva vigencia</b> con la fecha desde la que rige. Cada nómina usa los valores vigentes en su período, y las nóminas aprobadas quedan congeladas con los valores que se usaron.
            </div>

            <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#9A8E85', fontWeight: 600, marginBottom: 10 }}>AGREGAR NUEVA VIGENCIA</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={lbl}>PARÁMETRO</label>
                  <select value={nuevoParametro.clave} onChange={e => setNuevoParametro({ ...nuevoParametro, clave: e.target.value })} style={inp}>
                    {CATALOGO_PARAMETROS.map(p => <option key={p.clave} value={p.clave}>{p.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>VALOR ({infoParametro(nuevoParametro.clave).unidad || 'número'}){infoParametro(nuevoParametro.clave).unidad === '%' ? ' — escribe 4 para 4%' : ''}</label>
                  <input type="number" step="any" value={nuevoParametro.valor} onChange={e => setNuevoParametro({ ...nuevoParametro, valor: e.target.value })} style={inp} />
                </div>
                <div>
                  <label style={lbl}>RIGE DESDE</label>
                  <input type="date" value={nuevoParametro.vigente_desde} onChange={e => setNuevoParametro({ ...nuevoParametro, vigente_desde: e.target.value })} style={inp} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>FUENTE (decreto o ley)</label>
                  <input value={nuevoParametro.fuente} onChange={e => setNuevoParametro({ ...nuevoParametro, fuente: e.target.value })} placeholder="Ej. Decreto xxxx de 2026" style={inp} />
                </div>
              </div>
              <div style={{ textAlign: 'right', marginTop: 12 }}>
                <button onClick={guardarParametro} style={boton({ background: '#B22222', color: '#fff' })}>＋ Agregar vigencia</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CATALOGO_PARAMETROS.map(p => {
                const vig = vigenteHoy(p.clave)
                const hist = parametros.filter(x => x.clave === p.clave)
                const falta = p.anual && faltantes.includes(p.nombre)
                return (
                  <div key={p.clave} style={{ background: '#fff', border: `1px solid ${falta ? '#F5C6C6' : '#DDD8CF'}`, borderRadius: 9, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{p.nombre}{p.anual ? ' · anual' : ''}</div>
                        <div style={{ fontSize: 11, color: '#9A8E85' }}>{vig ? `Vigente desde ${vig.vigente_desde}${vig.fuente ? ' · ' + vig.fuente : ''}` : 'Sin valor vigente'}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: vig ? '#2B2420' : '#B22222' }}>{vig ? verValor(p.clave, vig.valor) : '—'}</span>
                        <button onClick={() => setVerHistorial(verHistorial === p.clave ? null : p.clave)} style={boton({ background: '#F4F1ED', color: '#5A4F47', padding: '4px 10px', fontSize: 11 })}>Historial ({hist.length})</button>
                      </div>
                    </div>
                    {falta && <div style={{ fontSize: 11, color: '#B22222', marginTop: 6 }}>⚠️ Todavía no hay valor para {periodo.fin.slice(0, 4)}. Agrégalo antes de aprobar nóminas de ese año.</div>}
                    {verHistorial === p.clave && (
                      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {[...hist].reverse().map(h => (
                          <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, background: '#F4F1ED', borderRadius: 6, padding: '5px 10px', gap: 8 }}>
                            <span>{h.vigente_desde} · <b>{verValor(p.clave, h.valor)}</b>{h.fuente ? ` · ${h.fuente}` : ''}</span>
                            <button onClick={() => eliminarParametro(h)} style={boton({ background: '#FCEAEA', color: '#B22222', padding: '3px 8px', fontSize: 11 })}>🗑️</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ============ NÓMINA DEL PERÍODO ============ */}
        {vista === 'nomina' && (
          <div>
            {faltantes.length > 0 && (
              <div style={{ background: '#FEF3DC', color: '#C07D00', borderRadius: 9, padding: '10px 14px', fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
                ⚠️ Faltan parámetros anuales para {periodo.fin.slice(0, 4)}: <b>{faltantes.join(', ')}</b>. El cálculo usa los del año anterior hasta que los agregues en ⚖️ Parámetros legales.
              </div>
            )}

            <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {PERIODICIDADES.map(([v, t]) => (
                  <button key={v} onClick={() => cambiarPeriodicidad(v)} style={boton({ padding: '6px 14px', fontSize: 12, background: periodicidad === v ? '#1A5FA8' : '#F4F1ED', color: periodicidad === v ? '#fff' : '#5A4F47' })}>{t}</button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={() => { setPeriodo(anteriorPeriodo(periodicidad, periodo)); setAbierto(null) }} style={boton({ background: '#F4F1ED', color: '#5A4F47', padding: '5px 12px' })}>◀</button>
                <div style={{ fontSize: 14, fontWeight: 700, minWidth: 250, textAlign: 'center' }}>{etiquetaPeriodo(periodicidad, periodo)}</div>
                <button onClick={() => { setPeriodo(siguientePeriodo(periodicidad, periodo)); setAbierto(null) }} style={boton({ background: '#F4F1ED', color: '#5A4F47', padding: '5px 12px' })}>▶</button>
              </div>
              <span style={{ background: aprobada ? '#E8F0FB' : '#FEF3DC', color: aprobada ? '#1A5FA8' : '#C07D00', padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                {aprobada ? '🔒 Nómina aprobada' : periodoRow ? '✏️ Borrador guardado' : 'Sin guardar'}
              </span>
            </div>

            {cargando ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85' }}>Cargando...</div>
            ) : empleadosPeriodo.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF', fontSize: 13 }}>
                No hay empleados con pago {PERIODICIDADES.find(p => p[0] === periodicidad)[1].toLowerCase()} en este período.<br />
                La periodicidad se define en la ficha de cada empleado (Datos laborales).
              </div>
            ) : (
              <div>
                <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden', marginBottom: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 0.6fr 1fr 1fr 1fr 1fr 0.9fr 1fr', gap: 8, padding: '8px 14px', background: '#F4F1ED', fontSize: 11, color: '#9A8E85', fontWeight: 600 }}>
                    <div>EMPLEADO</div><div style={{ textAlign: 'right' }}>DÍAS</div><div style={{ textAlign: 'right' }}>DEVENGADO</div><div style={{ textAlign: 'right' }}>DEDUCCIONES</div><div style={{ textAlign: 'right' }}>NETO</div><div style={{ textAlign: 'right' }}>COSTO EMPRESA</div><div style={{ textAlign: 'center' }}>ESTADO</div><div />
                  </div>
                  {calculos.map(c => {
                    const est = c.liq ? ESTADO_LIQ[c.liq.estado] : { label: 'Sin guardar', bg: '#F0ECE5', color: '#5A4F47' }
                    const abiertoAqui = abierto === c.emp.id
                    return (
                      <div key={c.emp.id} style={{ borderTop: '1px solid #EDE8DF' }}>
                        <div onClick={() => setAbierto(abiertoAqui ? null : c.emp.id)} style={{ display: 'grid', gridTemplateColumns: '2.2fr 0.6fr 1fr 1fr 1fr 1fr 0.9fr 1fr', gap: 8, padding: '10px 14px', alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#F4F1ED', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, overflow: 'hidden', flexShrink: 0 }}>
                              {c.emp.foto_url ? <img src={c.emp.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👤'}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600 }}>{c.emp.nombre} {c.emp.apellidos || ''}</div>
                              <div style={{ fontSize: 11, color: '#9A8E85' }}>{c.emp.cargo || 'Sin cargo'} · {c.emp.salario ? fmtCOP(c.emp.salario) : 'sin salario'}</div>
                            </div>
                          </div>
                          {c.res ? (
                            <>
                              <div style={{ textAlign: 'right' }}>{c.res.dias.periodo - c.res.dias.noVinculado}</div>
                              <div style={{ textAlign: 'right' }}>{fmtCOP(c.res.devengado)}</div>
                              <div style={{ textAlign: 'right', color: '#B22222' }}>−{fmtCOP(c.res.deducciones).replace('$', '$')}</div>
                              <div style={{ textAlign: 'right', fontWeight: 700, color: '#1A9156' }}>{fmtCOP(c.res.neto)}</div>
                              <div style={{ textAlign: 'right', color: '#5A4F47' }}>{c.res.costoEmpresa ? fmtCOP(c.res.costoEmpresa.costoTotal) : '—'}</div>
                            </>
                          ) : (
                            <div style={{ gridColumn: 'span 5', fontSize: 12, color: c.error ? '#B22222' : '#9A8E85' }}>{c.error || 'No incluido en la nómina aprobada'}</div>
                          )}
                          <div style={{ textAlign: 'center' }}><span style={{ background: est.bg, color: est.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{est.label}</span></div>
                          <div style={{ textAlign: 'right' }} onClick={ev => ev.stopPropagation()}>
                            {c.liq?.estado === 'aprobada' && Number(c.liq.neto) > 0 && (
                              <button onClick={() => pagarUna(c)} disabled={trabajando} style={boton({ background: '#1A9156', color: '#fff', padding: '5px 12px', fontSize: 12 })}>💳 Pagar</button>
                            )}
                          </div>
                        </div>

                        {abiertoAqui && c.res && (
                          <div style={{ background: '#FBF9F6', padding: '12px 18px 16px', borderTop: '1px dashed #DDD8CF' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
                              <div>
                                <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 6 }}>CONCEPTOS</div>
                                {c.res.conceptos.map((k, i) => (
                                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', gap: 10 }}>
                                    <span>{k.nombre}{k.detalle ? <span style={{ color: '#9A8E85' }}> · {k.detalle}</span> : null}</span>
                                    <span style={{ color: k.tipo === 'devengo' ? '#1A9156' : '#B22222', whiteSpace: 'nowrap' }}>{k.tipo === 'devengo' ? '+' : '−'}{fmtCOP(k.valor)}</span>
                                  </div>
                                ))}
                                <div style={{ fontSize: 10, color: '#9A8E85', marginTop: 6 }}>Base de cotización (IBC) del período: {fmtCOP(c.res.ibc)}</div>
                                {c.res.advertencias.map((a, i) => <div key={i} style={{ fontSize: 11, color: '#C07D00', marginTop: 4 }}>⚠️ {a}</div>)}
                              </div>
                              <div>
                                <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 6 }}>COSTO REAL PARA LA EMPRESA</div>
                                {c.res.costoEmpresa ? (() => {
                                  const ce = c.res.costoEmpresa
                                  const fila = (t, v, o = {}) => (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: o.chico ? 11 : 12, padding: '2px 0', gap: 10, fontWeight: o.fuerte ? 700 : 400, color: o.color || '#2B2420', borderTop: o.linea ? '1px solid #DDD8CF' : 'none', paddingLeft: o.chico ? 10 : 0 }}>
                                      <span>{t}</span><span style={{ whiteSpace: 'nowrap' }}>{fmtCOP(v)}</span>
                                    </div>
                                  )
                                  return (
                                    <div>
                                      {fila('Pago al trabajador (neto)', ce.pagoTrabajador, { fuerte: true, color: '#1A9156' })}
                                      {fila('Retenciones al trabajador (salud y pensión: se pagan por PILA)', ce.retenciones, { chico: true, color: '#5A4F47' })}
                                      {fila(`Aportes de la empresa${ce.exonerada ? ' (exonerada de salud, SENA e ICBF)' : ''}`, ce.totalAportes, { fuerte: true, linea: true })}
                                      {ce.aportes.map((a, i) => <div key={i}>{fila(a.nombre, a.valor, { chico: true, color: '#5A4F47' })}</div>)}
                                      {fila('Provisiones (prima, cesantías, intereses, vacaciones)', ce.totalProvisiones, { fuerte: true, linea: true })}
                                      {ce.provisiones.map((p, i) => <div key={i}>{fila(p.nombre, p.valor, { chico: true, color: '#5A4F47' })}</div>)}
                                      {fila('Costo total aproximado para la empresa', ce.costoTotal, { fuerte: true, linea: true, color: '#B22222' })}
                                      <div style={{ fontSize: 10, color: '#9A8E85', marginTop: 4 }}>Costo = devengado ({fmtCOP(ce.devengado)}, que incluye lo que se retiene al trabajador) + aportes + provisiones.</div>
                                    </div>
                                  )
                                })() : <div style={{ fontSize: 11, color: '#C07D00' }}>Este borrador es anterior a esta versión. Pulsa "Guardar borrador" para calcular el costo real.</div>}
                              </div>
                              <div>
                                <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 6 }}>HORAS EXTRAS Y RECARGOS DEL PERÍODO</div>
                                {aprobada || c.congelada ? (
                                  <div style={{ fontSize: 12, color: '#5A4F47' }}>
                                    {CATEGORIAS_HORAS.filter(h => Number((horas[c.emp.id] || {})[h.clave]) > 0).map(h => <div key={h.clave}>{h.nombre}: {(horas[c.emp.id] || {})[h.clave]} h</div>)}
                                    {!CATEGORIAS_HORAS.some(h => Number((horas[c.emp.id] || {})[h.clave]) > 0) && 'Sin horas extras ni recargos.'}
                                  </div>
                                ) : (
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px', gap: '4px 8px', alignItems: 'center' }}>
                                    {CATEGORIAS_HORAS.map(h => (
                                      <div key={h.clave} style={{ display: 'contents' }}>
                                        <label style={{ fontSize: 12 }}>{h.nombre}</label>
                                        <input type="number" min="0" step="0.5" value={(horas[c.emp.id] || {})[h.clave] ?? ''} onChange={e => cambiarHoras(c.emp.id, h.clave, e.target.value)} style={{ ...inp, padding: '4px 6px' }} />
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div style={{ fontSize: 10, color: '#9A8E85', marginTop: 8, lineHeight: 1.4 }}>
                                  Las horas se digitan por ahora a mano. Cuando el control de asistencia esté completo se tomarán de las marcaciones.
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 0.6fr 1fr 1fr 1fr 1fr 0.9fr 1fr', gap: 8, padding: '10px 14px', background: '#F4F1ED', fontSize: 13, fontWeight: 700 }}>
                    <div>Total ({conResultado.length})</div><div />
                    <div style={{ textAlign: 'right' }}>{fmtCOP(total('devengado'))}</div>
                    <div style={{ textAlign: 'right', color: '#B22222' }}>−{fmtCOP(total('deducciones'))}</div>
                    <div style={{ textAlign: 'right', color: '#1A9156' }}>{fmtCOP(total('neto'))}</div>
                    <div style={{ textAlign: 'right', color: '#5A4F47' }}>{fmtCOP(conResultado.reduce((a, c) => a + (c.res.costoEmpresa?.costoTotal || 0), 0))}</div><div /><div />
                  </div>
                </div>

                {(() => {
                  const conCosto = conResultado.filter(c => c.res.costoEmpresa)
                  if (!conCosto.length) return null
                  const t = (f) => conCosto.reduce((a, c) => a + f(c.res.costoEmpresa), 0)
                  const caja = { background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: '10px 14px' }
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 14 }}>
                      <div style={caja}><div style={{ fontSize: 11, color: '#9A8E85' }}>PAGO A LOS TRABAJADORES</div><div style={{ fontSize: 18, fontWeight: 700, color: '#1A9156' }}>{fmtCOP(t(x => x.pagoTrabajador))}</div></div>
                      <div style={caja}><div style={{ fontSize: 11, color: '#9A8E85' }}>APORTES DE LA EMPRESA</div><div style={{ fontSize: 18, fontWeight: 700 }}>{fmtCOP(t(x => x.totalAportes))}</div></div>
                      <div style={caja}><div style={{ fontSize: 11, color: '#9A8E85' }}>PROVISIONES</div><div style={{ fontSize: 18, fontWeight: 700 }}>{fmtCOP(t(x => x.totalProvisiones))}</div></div>
                      <div style={{ ...caja, borderColor: '#F5C6C6' }}><div style={{ fontSize: 11, color: '#9A8E85' }}>COSTO TOTAL APROXIMADO</div><div style={{ fontSize: 18, fontWeight: 700, color: '#B22222' }}>{fmtCOP(t(x => x.costoTotal))}</div></div>
                    </div>
                  )
                })()}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {!aprobada && (
                    <>
                      <button onClick={guardarBorrador} disabled={trabajando} style={boton({ background: '#fff', color: '#5A4F47', border: '1px solid #DDD8CF' })}>💾 Guardar borrador</button>
                      <button onClick={aprobar} disabled={trabajando} style={boton({ background: '#1A5FA8', color: '#fff' })}>🔒 Aprobar nómina</button>
                    </>
                  )}
                  {aprobada && (
                    <>
                      <button onClick={pagarTodas} disabled={trabajando} style={boton({ background: '#1A9156', color: '#fff' })}>💳 Pagar toda la nómina</button>
                      <button onClick={reabrir} disabled={trabajando} style={boton({ background: '#fff', color: '#5A4F47', border: '1px solid #DDD8CF' })}>↺ Reabrir</button>
                    </>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#9A8E85', marginTop: 12, lineHeight: 1.5 }}>
                  Estimación de nómina de apoyo: no incluye prima, cesantías, aportes del empleador, retención en la fuente ni PILA. Valídala con tu contador antes de pagar.
                </div>

                <details style={{ marginTop: 14, background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: '10px 14px' }}>
                  <summary style={{ fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cómo se calcula (para validar con el contador)</summary>
                  <div style={{ fontSize: 12, color: '#5A4F47', lineHeight: 1.6, marginTop: 8 }}>
                    · Mes comercial de 30 días: quincena de 15 días, semana de 7 (lunes a domingo). Valor del día = salario ÷ 30.<br />
                    · Una novedad descuenta o altera los días calendario de su rango que caen dentro del período.<br />
                    · Ausencia injustificada y licencia sin goce: no se pagan. Permiso y otros: se pagan salvo que se marquen sin remuneración.<br />
                    · Vacaciones: se paga el salario normal; no se paga auxilio de transporte por esos días.<br />
                    · Incapacidad: la empresa paga los días definidos en parámetros al porcentaje definido, nunca menos del salario mínimo diario; el resto queda a cargo de la EPS.<br />
                    · Auxilio de transporte: hasta el tope de salarios mínimos, proporcional a los días con asistencia.<br />
                    · Valor hora = salario ÷ horas del mes (parámetro). Recargos y extras según los parámetros vigentes; los recargos se acumulan.<br />
                    · Base de cotización (IBC): salario y pagos salariales, más el exceso de pagos no salariales sobre el límite; nunca menos del mínimo proporcional.<br />
                    · Los parámetros se toman a la fecha de fin del período.
                  </div>
                </details>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}