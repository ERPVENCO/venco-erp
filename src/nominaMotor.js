// ============================================================
// Motor de nómina — Colombia
// Funciones puras: no leen la base de datos ni tocan la pantalla.
//
// Las reglas legales (salario mínimo, auxilio, recargos, porcentajes, jornada...)
// NO están en este archivo: vienen de la tabla nomina_parametros y se actualizan
// en la pantalla "Parámetros legales". Aquí solo están las FÓRMULAS.
// Si la ley cambia una fórmula (no solo un valor), el ajuste se hace aquí, en un solo lugar.
//
// Convenciones (para que el contador las valide):
//  · Mes comercial de 30 días. Quincena = 15 días; semana = 7 días (lunes a domingo); mes = 30 días.
//  · Valor del día = salario ÷ 30. Valor de la hora = salario ÷ horas_mes_divisor (jornada semanal ÷ 6 × 30).
//  · Días de una novedad = días calendario del rango que caen dentro del período.
//  · Los parámetros se toman a la fecha de FIN del período.
// ============================================================

export const fmtISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const aFecha = (iso) => new Date(iso + 'T00:00:00')
export const sumarDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
export const rangoFechas = (ini, fin) => {
  const out = []
  let d = aFecha(ini)
  const f = aFecha(fin)
  while (d <= f) { out.push(fmtISO(d)); d = sumarDias(d, 1) }
  return out
}

const suma = (arr) => arr.reduce((a, x) => a + x, 0)
const r0 = (n) => Math.round(n)

// ---------------- Catálogo de parámetros (qué significa cada clave) ----------------
export const CATALOGO_PARAMETROS = [
  { clave: 'smmlv', nombre: 'Salario mínimo mensual (SMMLV)', unidad: 'COP', anual: true },
  { clave: 'auxilio_transporte', nombre: 'Auxilio de transporte mensual', unidad: 'COP', anual: true },
  { clave: 'tope_auxilio_smmlv', nombre: 'Tope para recibir auxilio de transporte', unidad: 'SMMLV' },
  { clave: 'salud_empleado', nombre: 'Aporte de salud del trabajador', unidad: '%' },
  { clave: 'pension_empleado', nombre: 'Aporte de pensión del trabajador', unidad: '%' },
  { clave: 'fsp_desde_smmlv', nombre: 'Fondo de solidaridad pensional: desde (SMMLV)', unidad: 'SMMLV' },
  { clave: 'fsp_porcentaje', nombre: 'Fondo de solidaridad pensional: porcentaje base', unidad: '%' },
  { clave: 'limite_no_salarial', nombre: 'Límite de pagos no salariales (Ley 1393)', unidad: '%' },
  { clave: 'dias_mes_nomina', nombre: 'Días del mes comercial', unidad: 'días' },
  { clave: 'horas_mes_divisor', nombre: 'Horas del mes para el valor hora (jornada semanal ÷ 6 × 30)', unidad: 'horas' },
  { clave: 'recargo_extra_diurna', nombre: 'Recargo hora extra diurna', unidad: '%' },
  { clave: 'recargo_extra_nocturna', nombre: 'Recargo hora extra nocturna', unidad: '%' },
  { clave: 'recargo_nocturno', nombre: 'Recargo nocturno (hora ordinaria nocturna)', unidad: '%' },
  { clave: 'recargo_dominical', nombre: 'Recargo dominical y festivo', unidad: '%' },
  { clave: 'incapacidad_porcentaje_empleador', nombre: 'Incapacidad: porcentaje que paga la empresa', unidad: '%' },
  { clave: 'incapacidad_dias_empleador', nombre: 'Incapacidad: días que paga la empresa', unidad: 'días' },
  { clave: 'pension_empleador', nombre: 'Aporte de pensión del empleador', unidad: '%' },
  { clave: 'arl_porcentaje', nombre: 'ARL de la empresa (se usa si el empleado no tiene clase de riesgo ni tarifa propia)', unidad: '%' },
  { clave: 'arl_clase_1', nombre: 'ARL clase de riesgo I (mínimo)', unidad: '%' },
  { clave: 'arl_clase_2', nombre: 'ARL clase de riesgo II (bajo)', unidad: '%' },
  { clave: 'arl_clase_3', nombre: 'ARL clase de riesgo III (medio)', unidad: '%' },
  { clave: 'arl_clase_4', nombre: 'ARL clase de riesgo IV (alto)', unidad: '%' },
  { clave: 'arl_clase_5', nombre: 'ARL clase de riesgo V (máximo)', unidad: '%' },
  { clave: 'caja_porcentaje', nombre: 'Caja de compensación', unidad: '%' },
  { clave: 'salud_empleador', nombre: 'Aporte de salud del empleador (si no está exonerada)', unidad: '%' },
  { clave: 'sena_porcentaje', nombre: 'SENA (si no está exonerada)', unidad: '%' },
  { clave: 'icbf_porcentaje', nombre: 'ICBF (si no está exonerada)', unidad: '%' },
  { clave: 'exoneracion_114_1', nombre: 'Empresa exonerada de salud, SENA e ICBF (1 = sí, 0 = no)', unidad: '' },
  { clave: 'exoneracion_tope_smmlv', nombre: 'Exoneración: aplica a quienes ganan menos de (SMMLV)', unidad: 'SMMLV' },
  { clave: 'prima_dias_anio', nombre: 'Prima de servicios: días por año', unidad: 'días' },
  { clave: 'cesantias_dias_anio', nombre: 'Cesantías: días por año', unidad: 'días' },
  { clave: 'intereses_cesantias', nombre: 'Intereses sobre cesantías (anual)', unidad: '%' },
  { clave: 'vacaciones_dias_anio', nombre: 'Vacaciones: días hábiles por año', unidad: 'días' },
  { clave: 'dias_anio_nomina', nombre: 'Días del año comercial', unidad: 'días' },
  { clave: 'indemn_dias_primer_anio', nombre: 'Indemnización indefinido: días por el primer año', unidad: 'días' },
  { clave: 'indemn_dias_anio_adicional', nombre: 'Indemnización indefinido: días por cada año adicional', unidad: 'días' },
  { clave: 'indemn_alto_dias_primer_anio', nombre: 'Indemnización (salario alto): días por el primer año', unidad: 'días' },
  { clave: 'indemn_alto_dias_anio_adicional', nombre: 'Indemnización (salario alto): días por cada año adicional', unidad: 'días' },
  { clave: 'indemn_tope_alto_smmlv', nombre: 'Indemnización: umbral de salario alto', unidad: 'SMMLV' },
  { clave: 'indemn_obra_dias_minimos', nombre: 'Indemnización obra o labor: mínimo de días', unidad: 'días' },
]
export const infoParametro = (clave) => CATALOGO_PARAMETROS.find(p => p.clave === clave) || { clave, nombre: clave, unidad: '' }

// Devuelve una función (clave, fecha) → valor vigente a esa fecha
export function crearResolvedor(filas) {
  const porClave = {}
  for (const f of filas || []) {
    if (!porClave[f.clave]) porClave[f.clave] = []
    porClave[f.clave].push({ desde: f.vigente_desde, valor: Number(f.valor) })
  }
  for (const k of Object.keys(porClave)) porClave[k].sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0))
  return (clave, fechaISO) => {
    const lista = porClave[clave]
    if (!lista) throw new Error(`Falta el parámetro "${infoParametro(clave).nombre}" en Parámetros legales.`)
    let elegido = null
    for (const v of lista) if (v.desde <= fechaISO) elegido = v
    if (!elegido) throw new Error(`El parámetro "${infoParametro(clave).nombre}" no tiene un valor vigente al ${fechaISO}.`)
    return elegido.valor
  }
}

// Parámetros anuales (salario mínimo, auxilio) que todavía no tienen valor para el año de la fecha dada
export function parametrosAnualesAlDia(filas, fechaISO) {
  const anio = fechaISO.slice(0, 4)
  return CATALOGO_PARAMETROS
    .filter(p => p.anual)
    .filter(p => !(filas || []).some(f => f.clave === p.clave && String(f.vigente_desde).slice(0, 4) === anio))
    .map(p => p.nombre)
}

// ---------------- Períodos ----------------
export function periodoDe(periodicidad, fechaISO) {
  const d = aFecha(fechaISO)
  if (periodicidad === 'semanal') {
    const dow = (d.getDay() + 6) % 7 // lunes = 0
    const ini = sumarDias(d, -dow)
    return { inicio: fmtISO(ini), fin: fmtISO(sumarDias(ini, 6)) }
  }
  const y = d.getFullYear()
  const m = d.getMonth()
  const ultimo = new Date(y, m + 1, 0).getDate()
  if (periodicidad === 'quincenal') {
    return d.getDate() <= 15
      ? { inicio: fmtISO(new Date(y, m, 1)), fin: fmtISO(new Date(y, m, 15)) }
      : { inicio: fmtISO(new Date(y, m, 16)), fin: fmtISO(new Date(y, m, ultimo)) }
  }
  return { inicio: fmtISO(new Date(y, m, 1)), fin: fmtISO(new Date(y, m, ultimo)) }
}
export const siguientePeriodo = (periodicidad, p) => periodoDe(periodicidad, fmtISO(sumarDias(aFecha(p.fin), 1)))
export const anteriorPeriodo = (periodicidad, p) => periodoDe(periodicidad, fmtISO(sumarDias(aFecha(p.inicio), -1)))
export function etiquetaPeriodo(periodicidad, p) {
  const f = (iso) => aFecha(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
  const nombre = periodicidad === 'semanal' ? 'Semana' : periodicidad === 'mensual' ? 'Mes' : (p.inicio.slice(8) === '01' ? '1.ª quincena' : '2.ª quincena')
  return `${nombre} · ${f(p.inicio)} – ${f(p.fin)} de ${p.fin.slice(0, 4)}`
}

// Peso de un día en el cálculo. Quincena y mes usan el mes comercial de 30 días:
// el día 31 no cuenta y el último día de febrero cuenta por los días que faltan para 30.
export function pesoDia(periodicidad, iso) {
  if (periodicidad === 'semanal') return 1
  const d = aFecha(iso)
  const dia = d.getDate()
  if (dia === 31) return 0
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  if (d.getMonth() === 1 && dia === ultimo) return 30 - dia + 1
  return 1
}

// ---------------- Horas extras y recargos ----------------
export const CATEGORIAS_HORAS = [
  { clave: 'hed', nombre: 'Hora extra diurna' },
  { clave: 'hen', nombre: 'Hora extra nocturna' },
  { clave: 'rn', nombre: 'Recargo nocturno (hora ordinaria nocturna)' },
  { clave: 'rd', nombre: 'Hora dominical o festiva (diurna)' },
  { clave: 'rnd', nombre: 'Hora dominical o festiva nocturna' },
  { clave: 'hedd', nombre: 'Hora extra diurna dominical o festiva' },
  { clave: 'hend', nombre: 'Hora extra nocturna dominical o festiva' },
]

// Cuántas veces el valor de la hora ordinaria se paga ADICIONAL al salario mensual
export function factoresHoras(P) {
  const ED = P('recargo_extra_diurna')
  const EN = P('recargo_extra_nocturna')
  const RN = P('recargo_nocturno')
  const D = P('recargo_dominical')
  return { hed: 1 + ED, hen: 1 + EN, rn: RN, rd: 1 + D, rnd: 1 + D + RN, hedd: 1 + D + ED, hend: 1 + D + EN }
}

// Sin dato explícito: la ausencia injustificada y la licencia no son remuneradas; el resto sí
export function esRemunerada(nov) {
  if (nov.remunerada === true || nov.remunerada === false) return nov.remunerada
  return !['ausencia', 'licencia'].includes(nov.tipo)
}

// ---------------- Cálculo de la liquidación de un empleado en un período ----------------
export function calcularLiquidacion({ empleado, periodicidad, periodo, novedades = [], pagos = [], horas = {}, parametros }) {
  const usados = {}
  const P = (k) => { const v = parametros(k, periodo.fin); usados[k] = v; return v }
  const advertencias = []

  const sal = Number(empleado.salario) || 0
  if (!sal) advertencias.push('El empleado no tiene salario registrado en su ficha.')
  const baseDias = P('dias_mes_nomina')
  const smmlv = P('smmlv')
  const peso = (iso) => pesoDia(periodicidad, iso)

  const fechas = rangoFechas(periodo.inicio, periodo.fin)
  const diasPeriodo = suma(fechas.map(peso))
  const ingreso = empleado.fecha_ingreso || null
  if (!ingreso) advertencias.push('El empleado no tiene fecha de ingreso: se asume vinculado todo el período.')
  const vinculado = (f) => !ingreso || f >= ingreso
  const diasNoVinculado = suma(fechas.filter(f => !vinculado(f)).map(peso))

  const diasDe = (nov) => suma(
    rangoFechas(nov.fecha_inicio, nov.fecha_fin)
      .filter(f => f >= periodo.inicio && f <= periodo.fin && vinculado(f))
      .map(peso))

  let dVac = 0, dIncap = 0, dNoRem = 0, dRemNoVac = 0
  for (const n of novedades) {
    const d = diasDe(n)
    if (!d) continue
    if (n.tipo === 'vacaciones') dVac += d
    else if (n.tipo === 'incapacidad') dIncap += d
    else if (esRemunerada(n)) dRemNoVac += d
    else dNoRem += d
  }

  // Incapacidad: los primeros días los paga la empresa; el resto, la EPS
  const diasEmpIncap = P('incapacidad_dias_empleador')
  let dIncapEmpleador = 0
  for (const n of novedades.filter(x => x.tipo === 'incapacidad')) {
    rangoFechas(n.fecha_inicio, n.fecha_fin).forEach((f, i) => {
      if (i < diasEmpIncap && f >= periodo.inicio && f <= periodo.fin && vinculado(f)) dIncapEmpleador += peso(f)
    })
  }
  const dIncapEps = Math.max(0, dIncap - dIncapEmpleador)

  const diasSalario = Math.max(0, diasPeriodo - diasNoVinculado - dNoRem - dIncap)
  const diasAux = Math.max(0, diasPeriodo - diasNoVinculado - dVac - dIncap - dNoRem - dRemNoVac)
  const diasCotizados = Math.max(0, diasPeriodo - diasNoVinculado - dNoRem)

  const conceptos = []
  const dev = (codigo, nombre, valor, detalle, extra = {}) => {
    if (valor) conceptos.push({ codigo, tipo: 'devengo', nombre, valor: r0(valor), detalle, ...extra })
  }
  const ded = (codigo, nombre, valor, detalle, extra = {}) => {
    if (valor) conceptos.push({ codigo, tipo: 'deduccion', nombre, valor: r0(valor), detalle, ...extra })
  }

  // Devengos
  dev('salario', 'Salario', (sal / baseDias) * diasSalario, `${diasSalario} de ${diasPeriodo} días`)
  const valorDiaIncap = Math.max(P('incapacidad_porcentaje_empleador') * sal, smmlv) / baseDias
  dev('incapacidad', 'Incapacidad pagada por la empresa', valorDiaIncap * dIncapEmpleador, `${dIncapEmpleador} día(s)`)

  const vh = sal / P('horas_mes_divisor')
  const fac = factoresHoras(P)
  for (const c of CATEGORIAS_HORAS) {
    const h = Number(horas[c.clave]) || 0
    if (h > 0) dev('horas_' + c.clave, c.nombre, h * vh * fac[c.clave], `${h} h`)
  }

  const pagosIncluidos = []
  for (const p of pagos) {
    pagosIncluidos.push(p.id)
    if (p.sentido === 'devengo') {
      dev('pago_' + p.tipo, p.concepto, Number(p.valor), p.naturaleza === 'salarial' ? 'Salarial' : 'No salarial', { naturaleza: p.naturaleza, pagoId: p.id })
    } else {
      ded('desc_' + p.tipo, p.concepto, Number(p.valor), 'Descuento autorizado', { pagoId: p.id })
    }
  }

  const topeAux = P('tope_auxilio_smmlv') * smmlv
  if (sal > 0 && sal <= topeAux) {
    dev('auxilio', 'Auxilio de transporte', (P('auxilio_transporte') / baseDias) * diasAux, `${diasAux} día(s) con asistencia`, { naturaleza: 'auxilio' })
  }

  // Base de cotización (IBC) del período
  const sumC = (f) => suma(conceptos.filter(f).map(c => c.valor))
  const baseSalarial = sumC(c => c.tipo === 'devengo' && (c.codigo === 'salario' || c.codigo === 'incapacidad' || c.codigo.startsWith('horas_') || c.naturaleza === 'salarial'))
  const noSalarial = sumC(c => c.tipo === 'devengo' && c.naturaleza === 'no_salarial')
  const exceso = Math.max(0, noSalarial - P('limite_no_salarial') * (baseSalarial + noSalarial))
  const ibcMinimo = (smmlv / baseDias) * diasCotizados
  const ibc = diasCotizados > 0 ? Math.max(baseSalarial + exceso, ibcMinimo) : 0

  // Deducciones de ley del trabajador
  ded('salud', `Salud del trabajador (${r0(P('salud_empleado') * 1000) / 10}%)`, ibc * P('salud_empleado'), `IBC ${r0(ibc)}`)
  ded('pension', `Pensión del trabajador (${r0(P('pension_empleado') * 1000) / 10}%)`, ibc * P('pension_empleado'), `IBC ${r0(ibc)}`)
  const ibcMensualEq = diasCotizados > 0 ? (ibc * baseDias) / diasCotizados : 0
  if (ibcMensualEq >= P('fsp_desde_smmlv') * smmlv) {
    ded('fsp', 'Fondo de solidaridad pensional', ibc * P('fsp_porcentaje'), `IBC ${r0(ibc)}`)
    if (ibcMensualEq >= 16 * smmlv) advertencias.push('El IBC mensual supera 16 salarios mínimos: el porcentaje del fondo de solidaridad es mayor al base. Confírmalo con tu contador.')
  }

  const devengado = sumC(c => c.tipo === 'devengo')
  const deducciones = sumC(c => c.tipo === 'deduccion')
  const neto = devengado - deducciones
  if (neto < 0) advertencias.push('Las deducciones superan lo devengado en este período.')
  if (dIncapEps > 0) advertencias.push(`${dIncapEps} día(s) de incapacidad quedan a cargo de la EPS: la empresa no los paga y puede recobrarlos.`)
  if (exceso > 0) advertencias.push('Hay pagos no salariales que superan el 40% de la remuneración: el exceso se sumó a la base de aportes (Ley 1393).')

  // ---------- Costo real para la empresa ----------
  // Pago al trabajador (neto) + retenciones que la empresa paga luego por PILA = devengado.
  // A eso se suman los aportes de la empresa y las provisiones de prestaciones.
  const exonerada = P('exoneracion_114_1') === 1 && ibcMensualEq < P('exoneracion_tope_smmlv') * smmlv
  const aportes = []
  const apo = (codigo, nombre, valor, detalle) => { if (valor) aportes.push({ codigo, nombre, valor: r0(valor), detalle }) }
  apo('pension_empleador', 'Pensión (aporte del empleador)', ibc * P('pension_empleador'), `IBC ${r0(ibc)}`)
  // ARL: la tarifa propia del empleado (clase de riesgo de su centro de trabajo) o, si no tiene, la de la empresa
  // Orden: tarifa exacta del empleado → clase de riesgo del empleado (I a V) → tarifa de la empresa
  const arlPropia = empleado.arl_tarifa !== null && empleado.arl_tarifa !== undefined && empleado.arl_tarifa !== '' && Number(empleado.arl_tarifa) > 0
  const clase = Number(empleado.arl_riesgo) >= 1 && Number(empleado.arl_riesgo) <= 5 ? Number(empleado.arl_riesgo) : 0
  const tarifaArl = arlPropia ? Number(empleado.arl_tarifa) : clase ? P('arl_clase_' + clase) : P('arl_porcentaje')
  const origenArl = arlPropia ? 'tarifa exacta del empleado' : clase ? `clase de riesgo ${['', 'I', 'II', 'III', 'IV', 'V'][clase]}` : 'tarifa de la empresa (clase sin definir)'
  const textoTarifa = `${Math.round(tarifaArl * 100000) / 1000}% · ${origenArl}`
  apo('arl', 'ARL', ibc * tarifaArl, `IBC ${r0(ibc)} · ${textoTarifa}`)
  apo('caja', 'Caja de compensación', baseSalarial * P('caja_porcentaje'), `Base ${r0(baseSalarial)}`)
  if (!exonerada) {
    apo('salud_empleador', 'Salud (aporte del empleador)', ibc * P('salud_empleador'), `IBC ${r0(ibc)}`)
    apo('sena', 'SENA', baseSalarial * P('sena_porcentaje'), `Base ${r0(baseSalarial)}`)
    apo('icbf', 'ICBF', baseSalarial * P('icbf_porcentaje'), `Base ${r0(baseSalarial)}`)
  }

  const baseAux = sumC(c => c.codigo === 'auxilio')
  const basePrimaCes = baseSalarial + baseAux            // prima y cesantías incluyen el auxilio de transporte
  const anio = P('dias_anio_nomina')
  const provisiones = []
  const prov = (codigo, nombre, valor, detalle) => { if (valor) provisiones.push({ codigo, nombre, valor: r0(valor), detalle }) }
  prov('prima', 'Prima de servicios', (basePrimaCes * P('prima_dias_anio')) / anio, `Base ${r0(basePrimaCes)}`)
  const cesantias = (basePrimaCes * P('cesantias_dias_anio')) / anio
  prov('cesantias', 'Cesantías', cesantias, `Base ${r0(basePrimaCes)}`)
  prov('intereses_cesantias', 'Intereses sobre cesantías', cesantias * P('intereses_cesantias'), '12% anual sobre las cesantías')
  prov('vacaciones', 'Vacaciones', (baseSalarial * P('vacaciones_dias_anio')) / anio, `Base ${r0(baseSalarial)} (sin auxilio)`)

  const retenciones = sumC(c => c.tipo === 'deduccion' && ['salud', 'pension', 'fsp'].includes(c.codigo))
  const totalAportes = suma(aportes.map(a => a.valor))
  const totalProvisiones = suma(provisiones.map(p => p.valor))
  const costoEmpresa = {
    pagoTrabajador: neto, retenciones, devengado,
    aportes, totalAportes, provisiones, totalProvisiones, exonerada,
    costoTotal: devengado + totalAportes + totalProvisiones,
  }

  return {
    devengado, deducciones, neto, ibc: r0(ibc), exceso: r0(exceso), costoEmpresa,
    conceptos, advertencias, pagosIncluidos,
    dias: { periodo: diasPeriodo, salario: diasSalario, auxilio: diasAux, vacaciones: dVac, incapacidad: dIncap, incapacidadEmpleador: dIncapEmpleador, incapacidadEps: dIncapEps, noRemunerados: dNoRem, remuneradosNoVac: dRemNoVac, noVinculado: diasNoVinculado, cotizados: diasCotizados },
    parametrosUsados: usados,
  }
}


// ============================================================
// LIQUIDACIÓN FINAL (retiro del empleado) y compensación de vacaciones
// ============================================================

export const MOTIVOS_LIQUIDACION = [
  { value: 'renuncia', label: 'Retiro voluntario (renuncia)', retiro: true },
  { value: 'mutuo_acuerdo', label: 'Terminación de contrato por mutuo acuerdo', retiro: true },
  { value: 'vencimiento_contrato', label: 'Finalización de contrato a término fijo (vencimiento)', retiro: true },
  { value: 'justa_causa', label: 'Despido con justa causa', retiro: true },
  { value: 'sin_justa_causa', label: 'Despido sin justa causa (con indemnización)', retiro: true },
  { value: 'vacaciones', label: 'Vacaciones compensadas en dinero (el empleado sigue en la empresa)', retiro: false },
]
export const motivoInfo = (m) => MOTIVOS_LIQUIDACION.find(x => x.value === m) || MOTIVOS_LIQUIDACION[0]

export const TIPOS_CONTRATO = [
  { value: 'indefinido', label: 'Término indefinido' },
  { value: 'fijo', label: 'Término fijo' },
  { value: 'obra', label: 'Obra o labor' },
]
// Adivina el tipo de contrato a partir del texto libre de la ficha del empleado
export const tipoContratoDesdeTexto = (txt) => {
  const t = (txt || '').toLowerCase()
  if (t.includes('fijo')) return 'fijo'
  if (t.includes('obra') || t.includes('labor')) return 'obra'
  return 'indefinido'
}

// Días entre dos fechas con el mes comercial de 30 días (inclusive). El último día de febrero cuenta como 30.
export function dias360(desdeISO, hastaISO) {
  const a = aFecha(desdeISO)
  const b = aFecha(hastaISO)
  const ajustar = (d) => {
    const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    return d.getMonth() === 1 && d.getDate() === ultimo ? 30 : Math.min(d.getDate(), 30)
  }
  const d1 = ajustar(a)
  const d2 = ajustar(b)
  return (b.getFullYear() - a.getFullYear()) * 360 + (b.getMonth() - a.getMonth()) * 30 + (d2 - d1) + 1
}

// ---- Festivos y días hábiles de vacaciones (mismo cálculo que la ficha del empleado) ----
// OJO: SABADO_CUENTA_PARA_VACACIONES también existe en Empleados.jsx; si lo cambias, cámbialo en los dos.
const SABADO_CUENTA_PARA_VACACIONES = false
const aLunes = (d) => (d.getDay() === 1 ? d : sumarDias(d, (8 - d.getDay()) % 7))
const domingoDePascua = (y) => {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  return new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1)
}
const cacheFestivos = {}
const festivosDelAnio = (y) => {
  if (cacheFestivos[y]) return cacheFestivos[y]
  const f = new Set()
  const add = (d) => f.add(fmtISO(d))
  for (const [m, d] of [[0, 1], [4, 1], [6, 20], [7, 7], [11, 8], [11, 25]]) add(new Date(y, m, d))
  for (const [m, d] of [[0, 6], [2, 19], [5, 29], [7, 15], [9, 12], [10, 1], [10, 11]]) add(aLunes(new Date(y, m, d)))
  const p = domingoDePascua(y)
  add(sumarDias(p, -3)); add(sumarDias(p, -2))
  add(aLunes(sumarDias(p, 39))); add(aLunes(sumarDias(p, 60))); add(aLunes(sumarDias(p, 68)))
  cacheFestivos[y] = f
  return f
}
export const esDiaHabilVacaciones = (iso) => {
  const dow = aFecha(iso).getDay()
  if (dow === 0 || festivosDelAnio(Number(iso.slice(0, 4))).has(iso)) return false
  if (dow === 6) return SABADO_CUENTA_PARA_VACACIONES
  return true
}

// Días hábiles de vacaciones ya disfrutados hasta una fecha
export function diasVacacionesTomados(novedades, hastaISO) {
  let n = 0
  for (const nov of novedades || []) {
    if (nov.tipo !== 'vacaciones') continue
    for (const d of rangoFechas(nov.fecha_inicio, nov.fecha_fin)) if (d <= hastaISO && esDiaHabilVacaciones(d)) n++
  }
  return n
}

// Fechas de corte sugeridas (se pueden cambiar a mano en la pantalla)
export function cortesSugeridos({ fechaIngreso, fechaRetiro, ultimoPeriodoPagadoFin }) {
  const anio = Number(fechaRetiro.slice(0, 4))
  const mayor = (a, b) => (a && a > b ? a : b)
  const enero = (y) => `${y}-01-01`
  // Cesantías: del 1 de enero del año; si el retiro es antes del 14 de febrero, aún no vence el plazo
  // para consignar las del año anterior, así que se incluyen
  const antesDe14Feb = fechaRetiro <= `${anio}-02-14`
  const desdeCesantias = mayor(fechaIngreso, antesDe14Feb ? enero(anio - 1) : enero(anio))
  // Prima: del inicio del semestre en curso
  const desdePrima = mayor(fechaIngreso, Number(fechaRetiro.slice(5, 7)) <= 6 ? enero(anio) : `${anio}-07-01`)
  // Salario pendiente: desde el día siguiente al último período de nómina aprobado
  const desdeSalario = ultimoPeriodoPagadoFin ? fmtISO(sumarDias(aFecha(ultimoPeriodoPagadoFin), 1)) : mayor(fechaIngreso, enero(anio))
  return { desdeSalario, desdeCesantias, desdePrima, antesDe14Feb }
}

// Calcula la liquidación completa. Es pura: recibe los datos ya leídos de la base.
//  empleado: { salario, fecha_ingreso }
//  entradas: { desdeSalario, desdeCesantias, desdePrima, tipoContrato, fechaFinContrato, promedioVariable, indemnizacionPactada, diasCompensar, horas }
//  novedades: todas las del empleado · pagosPendientes: bonos y descuentos sin liquidar
//  prestacionesPagadas: pagos previos de prima, cesantías, intereses o vacaciones [{ tipo, valor, fecha_pago }]
//  diasCompensados: vacaciones ya compensadas antes · provisionado: { prima, cesantias, intereses_cesantias, vacaciones } acumulado pendiente
export function calcularLiquidacionFinal({ empleado, motivo, fechaRetiro, entradas = {}, novedades = [], pagosPendientes = [], prestacionesPagadas = [], diasCompensados = 0, provisionado = {}, parametros }) {
  const usados = {}
  const P = (k) => { const v = parametros(k, fechaRetiro); usados[k] = v; return v }
  const adv = []
  const conceptos = []
  const dev = (codigo, nombre, valor, detalle, extra = {}) => { if (valor) conceptos.push({ codigo, tipo: 'devengo', nombre, valor: r0(valor), detalle, ...extra }) }
  const ded = (codigo, nombre, valor, detalle, extra = {}) => { if (valor) conceptos.push({ codigo, tipo: 'deduccion', nombre, valor: r0(valor), detalle, ...extra }) }

  const sal = Number(empleado.salario) || 0
  if (!sal) adv.push('El empleado no tiene salario registrado en su ficha.')
  const ingreso = empleado.fecha_ingreso
  if (!ingreso) adv.push('El empleado no tiene fecha de ingreso: no se pueden calcular las prestaciones.')
  const smmlv = P('smmlv')
  const anio = P('dias_anio_nomina')
  const variable = Number(entradas.promedioVariable) || 0
  const salarioBase = sal + variable                               // para prestaciones, vacaciones e indemnización
  const conAuxilio = sal > 0 && sal <= P('tope_auxilio_smmlv') * smmlv
  const baseCes = salarioBase + (conAuxilio ? P('auxilio_transporte') : 0)   // cesantías y prima incluyen el auxilio de transporte
  const dias = { salario: 0, cesantias: 0, prima: 0, antiguedad: ingreso ? dias360(ingreso, fechaRetiro) : 0 }
  let nominaPeriodo = null

  const esVacaciones = motivo === 'vacaciones'
  const pendientesVac = ingreso
    ? Math.max(0, (P('vacaciones_dias_anio') * dias.antiguedad) / anio - diasVacacionesTomados(novedades, fechaRetiro) - (Number(diasCompensados) || 0))
    : 0

  if (esVacaciones) {
    // ---- Compensación de vacaciones en dinero ----
    const d = Number(entradas.diasCompensar) || 0
    if (d <= 0) adv.push('Indica cuántos días de vacaciones se compensan.')
    if (d > pendientesVac + 0.0001) adv.push(`Solo hay ${pendientesVac.toFixed(1)} días de vacaciones pendientes: no se pueden compensar ${d}.`)
    else if (d > pendientesVac / 2 + 0.0001) adv.push('La ley solo permite compensar en dinero hasta la mitad de las vacaciones (art. 189 del CST); el resto se debe disfrutar.')
    dev('vacaciones_compensadas', 'Vacaciones compensadas en dinero', d * (salarioBase / 30), `${d} día(s) × ${r0(salarioBase / 30)} por día`)
  } else {
    // ---- 1. Salario y novedades del último período (se calcula como una nómina) ----
    const desdeSal = entradas.desdeSalario
    if (desdeSal && desdeSal <= fechaRetiro) {
      nominaPeriodo = calcularLiquidacion({
        empleado, periodicidad: 'mensual', periodo: { inicio: desdeSal, fin: fechaRetiro },
        novedades, pagos: pagosPendientes, horas: entradas.horas || {}, parametros,
      })
      dias.salario = nominaPeriodo.dias.salario
      for (const c of nominaPeriodo.conceptos) {
        const nombre = c.codigo === 'salario' ? 'Salario pendiente' : c.codigo === 'auxilio' ? 'Auxilio de transporte pendiente' : c.nombre
        if (c.tipo === 'devengo') dev(c.codigo, nombre, c.valor, c.detalle, { naturaleza: c.naturaleza, pagoId: c.pagoId })
        else ded(c.codigo, nombre, c.valor, c.detalle, { pagoId: c.pagoId })
      }
      for (const a of nominaPeriodo.advertencias) adv.push(a)
      for (const k of Object.keys(nominaPeriodo.parametrosUsados)) usados[k] = nominaPeriodo.parametrosUsados[k]
    } else if (desdeSal) {
      adv.push(`El salario ya está pagado hasta ${fmtISO(sumarDias(aFecha(desdeSal), -1))}: no hay salario pendiente.`)
      for (const p of pagosPendientes) {
        if (p.sentido === 'devengo') dev('pago_' + p.tipo, p.concepto, Number(p.valor), 'Pendiente de pago', { pagoId: p.id })
        else ded('desc_' + p.tipo, p.concepto, Number(p.valor), 'Descuento autorizado', { pagoId: p.id })
      }
    }

    // ---- 2. Cesantías, intereses y prima proporcionales ----
    if (ingreso) {
      dias.cesantias = Math.max(0, dias360(entradas.desdeCesantias || ingreso, fechaRetiro))
      dias.prima = Math.max(0, dias360(entradas.desdePrima || ingreso, fechaRetiro))
      const cesantias = (baseCes * dias.cesantias * (P('cesantias_dias_anio') / 30)) / anio
      dev('cesantias', 'Cesantías proporcionales', cesantias, `${dias.cesantias} días desde ${entradas.desdeCesantias || ingreso} · base ${r0(baseCes)}`)
      dev('intereses_cesantias', 'Intereses sobre cesantías', (cesantias * dias.cesantias * P('intereses_cesantias')) / anio, `12% anual × ${dias.cesantias} días`)
      dev('prima', 'Prima de servicios proporcional', (baseCes * dias.prima * (P('prima_dias_anio') / 30)) / anio, `${dias.prima} días desde ${entradas.desdePrima || ingreso} · base ${r0(baseCes)}`)

      // Lo que ya se pagó de esas prestaciones en esos mismos períodos se descuenta
      const yaPagado = (tipo, desde) => prestacionesPagadas.filter(p => p.tipo === tipo && p.fecha_pago >= desde).reduce((a, p) => a + Number(p.valor), 0)
      ded('ya_cesantias', 'Cesantías ya pagadas en el período', yaPagado('cesantias', entradas.desdeCesantias || ingreso), 'Pagos registrados')
      ded('ya_intereses', 'Intereses ya pagados en el período', yaPagado('intereses_cesantias', entradas.desdeCesantias || ingreso), 'Pagos registrados')
      ded('ya_prima', 'Prima ya pagada en el semestre', yaPagado('prima', entradas.desdePrima || ingreso), 'Pagos registrados')

      // ---- 3. Vacaciones proporcionales pendientes ----
      dev('vacaciones', 'Vacaciones pendientes en dinero', pendientesVac * (salarioBase / 30),
        `${pendientesVac.toFixed(1)} días hábiles pendientes (causados ${((P('vacaciones_dias_anio') * dias.antiguedad) / anio).toFixed(1)}, disfrutados ${diasVacacionesTomados(novedades, fechaRetiro)}${diasCompensados ? `, compensados ${diasCompensados}` : ''})`)
    }

    // ---- 4. Indemnización ----
    const tipo = entradas.tipoContrato || 'indefinido'
    if (motivo === 'sin_justa_causa' && ingreso) {
      if (tipo === 'indefinido') {
        const alto = sal >= P('indemn_tope_alto_smmlv') * smmlv
        const base = alto ? P('indemn_alto_dias_primer_anio') : P('indemn_dias_primer_anio')
        const adic = alto ? P('indemn_alto_dias_anio_adicional') : P('indemn_dias_anio_adicional')
        const anios = dias.antiguedad / 360
        const diasIndem = base + adic * Math.max(0, anios - 1)
        dev('indemnizacion', 'Indemnización por despido sin justa causa', diasIndem * (salarioBase / 30),
          `${diasIndem.toFixed(1)} días de salario (${base} del primer año + ${adic} por cada año adicional; antigüedad ${anios.toFixed(2)} años)`, { naturaleza: 'indemnizacion' })
      } else {
        const fin = entradas.fechaFinContrato
        if (!fin) adv.push('Para la indemnización de un contrato fijo o por obra, indica la fecha de fin del contrato.')
        const faltan = fin && fin > fechaRetiro ? dias360(fmtISO(sumarDias(aFecha(fechaRetiro), 1)), fin) : 0
        const diasIndem = tipo === 'obra' ? Math.max(P('indemn_obra_dias_minimos'), faltan) : faltan
        dev('indemnizacion', 'Indemnización por despido sin justa causa', diasIndem * (salarioBase / 30),
          `${diasIndem} días de salario (${tipo === 'obra' ? 'lo que falta de la obra o labor, mínimo ' + P('indemn_obra_dias_minimos') + ' días' : 'el tiempo que falta para terminar el contrato'})`, { naturaleza: 'indemnizacion' })
      }
    }
    if (Number(entradas.indemnizacionPactada) > 0) {
      dev('indemnizacion_pactada', 'Bonificación o indemnización pactada', Number(entradas.indemnizacionPactada), 'Valor acordado con el trabajador', { naturaleza: 'indemnizacion' })
    }
    if (motivo === 'vencimiento_contrato' && tipo !== 'fijo') adv.push('Este motivo corresponde a un contrato a término fijo: revisa el tipo de contrato.')
    if (motivo === 'vencimiento_contrato') adv.push('Recuerda el preaviso de 30 días antes del vencimiento del contrato a término fijo.')
  }

  const sumC = (f) => conceptos.filter(f).reduce((a, c) => a + c.valor, 0)
  const devengado = sumC(c => c.tipo === 'devengo')
  const deducciones = sumC(c => c.tipo === 'deduccion')
  const neto = devengado - deducciones
  if (neto < 0) adv.push('Las deducciones superan lo devengado en esta liquidación.')
  if (devengado > 0 && !esVacaciones) adv.push('Si el ingreso laboral de este pago es alto, puede aplicar retención en la fuente: este cálculo no la incluye. Confírmalo con tu contador.')
  adv.push('Pagar tarde la liquidación genera indemnización moratoria (art. 65 del CST): un día de salario por cada día de retraso.')

  const detalleProvisiones = ['prima', 'cesantias', 'intereses_cesantias', 'vacaciones'].map(k => {
    const liquidado = conceptos.filter(c => c.tipo === 'devengo' && c.codigo === (k === 'vacaciones' && esVacaciones ? 'vacaciones_compensadas' : k)).reduce((a, c) => a + c.valor, 0)
    const yaPag = k === 'prima' ? sumC(c => c.codigo === 'ya_prima') : k === 'cesantias' ? sumC(c => c.codigo === 'ya_cesantias') : k === 'intereses_cesantias' ? sumC(c => c.codigo === 'ya_intereses') : 0
    return { codigo: k, liquidado: liquidado - yaPag, provisionado: r0(Number(provisionado[k]) || 0) }
  })

  return {
    conceptos, devengado, deducciones, neto, advertencias: adv, dias,
    diasVacacionesPendientes: pendientesVac, diasCompensados: esVacaciones ? Number(entradas.diasCompensar) || 0 : 0,
    pagosIncluidos: nominaPeriodo ? nominaPeriodo.pagosIncluidos : pagosPendientes.map(p => p.id),
    nominaPeriodo: nominaPeriodo ? { devengado: nominaPeriodo.devengado, deducciones: nominaPeriodo.deducciones, neto: nominaPeriodo.neto, costoEmpresa: nominaPeriodo.costoEmpresa } : null,
    comparacion: detalleProvisiones,
    totalProvisionado: r0(detalleProvisiones.reduce((a, c) => a + c.provisionado, 0)),
    parametrosUsados: usados,
  }
}