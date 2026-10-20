import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import Nomina from './Nomina'
import PagosNomina from './PagosNomina'
import PagoFormaModal from './PagoFormaModal'
import { pagarBonoSuelto, cargarDiasCompensados } from './nominaDatos'

const CLAVE_EDICION = '1234'

const ROLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'ventas', label: 'Ventas' },
  { value: 'produccion', label: 'Producción / Manufactura' },
  { value: 'bodega', label: 'Bodega / Inventario' },
  { value: 'compras', label: 'Compras' },
]

const ESTADOS = [
  { value: 'activo', label: 'Activo', bg: '#E8F7EF', color: '#1A9156' },
  { value: 'vacaciones', label: 'Vacaciones', bg: '#E8F0FB', color: '#1A5FA8' },
  { value: 'incapacitado', label: 'Incapacitado', bg: '#FEF3DC', color: '#C07D00' },
  { value: 'inactivo', label: 'Inactivo', bg: '#F0ECE5', color: '#5A4F47' },
  { value: 'retirado', label: 'Retirado', bg: '#FCEAEA', color: '#B22222' },
]

const estadoInfo = (estado) => ESTADOS.find(e => e.value === estado) || ESTADOS[0]
const rolLabel = (rol) => ROLES.find(r => r.value === rol)?.label || rol

const vacioNuevo = () => ({
  nombre: '', apellidos: '', cedula: '', fecha_nacimiento: '', direccion: '',
  telefono: '', correo_personal: '', ciudad: '',
  cargo: '', area: '', fecha_ingreso: fmtISO(new Date()),
  tipo_contrato: '', salario: '', periodicidad_pago: 'quincenal', fecha_fin_contrato: '', fecha_retiro: '', arl_tarifa: '', arl_riesgo: '',
  eps: '', arl: '', fondo_pensiones: '', caja_compensacion: '',
  estado: 'activo', apto_produccion: true,
  notas_laborales: '', motivo_retiro: '',
  contacto_emergencia_nombre: '', contacto_emergencia_parentesco: '',
  contacto_emergencia_telefono: '', contacto_emergencia_info: '',
  informacion_adicional: ''
})

const TABS_FICHA = [
  { id: 'documentos', nombre: 'Documentos', icon: '📄' },
  { id: 'capacitaciones', nombre: 'Capacitaciones', icon: '🎓' },
  { id: 'dotaciones', nombre: 'Dotaciones', icon: '👕' },
  { id: 'asistencia', nombre: 'Asistencia', icon: '🗓️' },
  { id: 'bonos', nombre: 'Bonos / Pagos', icon: '💵' },
]

const TIPOS_DOCUMENTO = [
  { value: 'cedula', label: 'Cédula' },
  { value: 'contrato', label: 'Contrato' },
  { value: 'examen_medico', label: 'Examen médico' },
  { value: 'certificado_capacitacion', label: 'Certificado de capacitación' },
  { value: 'seguridad_social', label: 'Seguridad social' },
  { value: 'otro', label: 'Otro' },
]

const tipoDocLabel = (t) => TIPOS_DOCUMENTO.find(td => td.value === t)?.label || t

// Vigente / Por vencer (≤30 días) / Vencido, según fecha_vencimiento
const estadoDocumento = (fechaVencimiento) => {
  if (!fechaVencimiento) return { label: 'Sin vencimiento', bg: '#F0ECE5', color: '#5A4F47' }
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const venc = new Date(fechaVencimiento + 'T00:00:00')
  const dias = Math.round((venc - hoy) / 86400000)
  if (dias < 0) return { label: 'Vencido', bg: '#FCEAEA', color: '#B22222' }
  if (dias <= 30) return { label: `Vence en ${dias}d`, bg: '#FEF3DC', color: '#C07D00' }
  return { label: 'Vigente', bg: '#E8F7EF', color: '#1A9156' }
}

// Igual que estadoDocumento, pero contempla "Pendiente" cuando la
// capacitación todavía no se ha realizado (sin fecha)
const estadoCapacitacion = (fecha, fechaVencimiento) => {
  if (!fecha) return { label: 'Pendiente', bg: '#E8F0FB', color: '#1A5FA8' }
  return estadoDocumento(fechaVencimiento)
}

// ── Dotaciones ──
// Ciclo: 1ª dotación a los 3 meses del ingreso; luego cada 6 meses desde la
// última entrega "ordinaria". Las "adicionales" (desgaste/higiene) no mueven el ciclo.
const fmtISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const sumarMeses = (fechaISO, meses) => {
  const d = new Date(fechaISO + 'T00:00:00')
  const dia = d.getDate()
  d.setMonth(d.getMonth() + meses)
  if (d.getDate() !== dia) d.setDate(0) // ej. 31 ago + 6 meses → último día de feb
  return fmtISO(d)
}

const proximaDotacion = (fechaIngreso, ultimaEntrega) => {
  if (ultimaEntrega) return sumarMeses(ultimaEntrega, 6)
  if (fechaIngreso) return sumarMeses(fechaIngreso, 3)
  return null
}

const estadoDotacion = (fechaIngreso, ultimaEntrega) => {
  const proxima = proximaDotacion(fechaIngreso, ultimaEntrega)
  if (!proxima) return { label: 'Sin fecha de ingreso', bg: '#F0ECE5', color: '#5A4F47', proxima: null, cuenta: false }
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const dias = Math.round((new Date(proxima + 'T00:00:00') - hoy) / 86400000)
  if (dias < 0) return { label: ultimaEntrega ? 'Vencida' : 'Pendiente de primera entrega', bg: '#FCEAEA', color: '#B22222', proxima, cuenta: true }
  if (dias <= 30) return { label: dias === 0 ? 'Le toca hoy' : `Próxima en ${dias}d`, bg: '#FEF3DC', color: '#C07D00', proxima, cuenta: true }
  if (!ultimaEntrega) return { label: 'Aún no aplica', bg: '#E8F0FB', color: '#1A5FA8', proxima, cuenta: false }
  return { label: 'Al día', bg: '#E8F7EF', color: '#1A9156', proxima, cuenta: false }
}

// ── Asistencia ──
// Mientras sea null, la marcación de entrada/salida es OPCIONAL: un día laboral sin novedad
// cuenta como "asistió". Cuando se implemente el control completo, pon aquí la fecha de
// arranque (ej. '2026-11-01'): desde ese día, un día laboral sin marcación ni novedad
// aparece como "Sin registro". Los días anteriores no se reclasifican.
const CONTROL_COMPLETO_DESDE = null

// Semana laboral actual: lunes a viernes (domingos y festivos no se laboran)
const DIAS_LABORALES = [1, 2, 3, 4, 5] // 0 = domingo ... 6 = sábado

// Para vacaciones: ¿el sábado cuenta como día hábil aunque no se trabaje?
// Confirmar con el asesor laboral y ajustar aquí.
const SABADO_CUENTA_PARA_VACACIONES = false

const TIPOS_NOVEDAD = [
  { value: 'vacaciones', label: 'Vacaciones', estado: 'En vacaciones', icono: '🏖️', bg: '#E8F0FB', color: '#1A5FA8' },
  { value: 'incapacidad', label: 'Incapacidad', estado: 'Incapacitado', icono: '🩺', bg: '#FEF3DC', color: '#C07D00' },
  { value: 'permiso', label: 'Permiso', estado: 'En permiso', icono: '📝', bg: '#F3E8FB', color: '#6B3FA0' },
  { value: 'licencia', label: 'Licencia', estado: 'En licencia', icono: '📄', bg: '#E6F4F1', color: '#1A7F6E' },
  { value: 'ausencia', label: 'Ausencia injustificada', estado: 'Ausente', icono: '⚠️', bg: '#FCEAEA', color: '#B22222' },
  { value: 'otro', label: 'Otro', estado: 'Con novedad', icono: '🗓️', bg: '#F0ECE5', color: '#5A4F47' },
]
// Con estas novedades vigentes, el kiosco no deja registrar entrada/salida
// (un administrador debe corregir la novedad si la persona sí va a trabajar)
const NOVEDADES_BLOQUEAN_REGISTRO = ['vacaciones', 'incapacidad', 'licencia']

// El kiosco pide el PIN personal (inicialmente los últimos 4 dígitos de la cédula)
const KIOSCO_REQUIERE_PIN = true

const novedadInfo = (t) => TIPOS_NOVEDAD.find(n => n.value === t) || TIPOS_NOVEDAD[TIPOS_NOVEDAD.length - 1]

// Valor sugerido de "remunerado" según el tipo (ausencia injustificada y licencia, no; el resto, sí)
const remuneradaPorDefecto = (tipo) => !['ausencia', 'licencia'].includes(tipo)

const sumarDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
// Ley Emiliani: el festivo que no cae lunes pasa al lunes siguiente
const aLunes = (d) => (d.getDay() === 1 ? d : sumarDias(d, (8 - d.getDay()) % 7))

const domingoDePascua = (y) => {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(y, mes - 1, dia)
}

// Festivos de Colombia calculados por año (no hay que cargarlos a mano)
const cacheFestivos = {}
const festivosDelAnio = (y) => {
  if (cacheFestivos[y]) return cacheFestivos[y]
  const f = new Set()
  const add = (d) => f.add(fmtISO(d))
  // Fijos
  for (const [m, d] of [[0, 1], [4, 1], [6, 20], [7, 7], [11, 8], [11, 25]]) add(new Date(y, m, d))
  // Trasladables al lunes
  for (const [m, d] of [[0, 6], [2, 19], [5, 29], [7, 15], [9, 12], [10, 1], [10, 11]]) add(aLunes(new Date(y, m, d)))
  // Semana Santa y los que dependen de la Pascua
  const p = domingoDePascua(y)
  add(sumarDias(p, -3))
  add(sumarDias(p, -2))
  add(aLunes(sumarDias(p, 39)))
  add(aLunes(sumarDias(p, 60)))
  add(aLunes(sumarDias(p, 68)))
  cacheFestivos[y] = f
  return f
}

const esFestivo = (iso) => festivosDelAnio(Number(iso.slice(0, 4))).has(iso)
const diaSemana = (iso) => new Date(iso + 'T00:00:00').getDay()
const esDiaLaboral = (iso) => DIAS_LABORALES.includes(diaSemana(iso)) && !esFestivo(iso)

const esDiaHabilVacaciones = (iso) => {
  const dow = diaSemana(iso)
  if (dow === 0 || esFestivo(iso)) return false
  if (dow === 6) return SABADO_CUENTA_PARA_VACACIONES
  return true
}

const rangoFechas = (ini, fin) => {
  const out = []
  let d = new Date(ini + 'T00:00:00')
  const f = new Date(fin + 'T00:00:00')
  while (d <= f) { out.push(fmtISO(d)); d = sumarDias(d, 1) }
  return out
}

// Vacaciones: 15 días hábiles por cada año de servicio (360 días), causadas día a día
const saldoVacaciones = (fechaIngreso, novedades, compensados = 0) => {
  if (!fechaIngreso) return null
  const hoy = fmtISO(new Date())
  const dias = Math.max(0, Math.round((new Date(hoy + 'T00:00:00') - new Date(fechaIngreso + 'T00:00:00')) / 86400000))
  const causados = (dias / 360) * 15
  let tomados = 0
  let programados = 0
  for (const n of novedades) {
    if (n.tipo !== 'vacaciones') continue
    for (const d of rangoFechas(n.fecha_inicio, n.fecha_fin)) {
      if (!esDiaHabilVacaciones(d)) continue
      if (d <= hoy) tomados++
      else programados++
    }
  }
  tomados += Number(compensados) || 0 // las vacaciones compensadas en dinero también se descuentan del saldo
  return { causados, tomados, programados, disponibles: causados - tomados }
}

// Días hábiles de una novedad (vacaciones usa la regla de vacaciones; las demás, días laborales)
const diasHabilesNovedad = (tipo, ini, fin) =>
  rangoFechas(ini, fin).filter(tipo === 'vacaciones' ? esDiaHabilVacaciones : esDiaLaboral).length

// Primer día laboral después de la fecha de fin (cuando regresa)
const fechaReintegro = (fin) => {
  let d = sumarDias(new Date(fin + 'T00:00:00'), 1)
  for (let i = 0; i < 15; i++) {
    const iso = fmtISO(d)
    if (esDiaLaboral(iso)) return iso
    d = sumarDias(d, 1)
  }
  return fmtISO(d)
}

// Fecha de fin al programar N días hábiles de vacaciones desde una fecha de inicio
const finPorDiasHabiles = (ini, n) => {
  if (!ini || !n || n < 1) return null
  let d = new Date(ini + 'T00:00:00')
  let c = 0
  for (let i = 0; i < 400; i++) {
    const iso = fmtISO(d)
    if (esDiaHabilVacaciones(iso)) { c++; if (c === n) return iso }
    d = sumarDias(d, 1)
  }
  return null
}

const fechaLarga = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })

const horaCorta = (iso) => new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })

// Estado de un día para un empleado (alimenta el calendario)
const estadoDiaAsistencia = (iso, fechaIngreso, novedades, marcacionesDelDia) => {
  if (fechaIngreso && iso < fechaIngreso) return { tipo: 'previo' }
  const nov = novedades.find(n => iso >= n.fecha_inicio && iso <= n.fecha_fin)
  if (nov) return { tipo: 'novedad', novedad: nov }
  if (!esDiaLaboral(iso)) return { tipo: 'no_laboral', festivo: esFestivo(iso) }
  if (iso > fmtISO(new Date())) return { tipo: 'futuro' }
  if (marcacionesDelDia.length > 0) return { tipo: 'asistio', conMarcacion: true }
  if (CONTROL_COMPLETO_DESDE && iso >= CONTROL_COMPLETO_DESDE) return { tipo: 'sin_registro' }
  return { tipo: 'asistio', conMarcacion: false }
}

// ── Bonos / Pagos ──
// Valores legales 2026 (actualizar cada enero):
// Decreto 1469 de 2025 (salario mínimo) y Decreto 1470 de 2025 (auxilio de transporte)
const SMMLV = 1750905
const AUXILIO_TRANSPORTE = 249095
const APORTE_SALUD_EMPLEADO = 0.04
const APORTE_PENSION_EMPLEADO = 0.04
const LIMITE_NO_SALARIAL = 0.4 // Ley 1393 de 2010, art. 30: lo no salarial que pase del 40% entra a la base de aportes

const TIPOS_PAGO = [
  { value: 'bono', label: 'Bono', sentido: 'devengo', icono: '🎁' },
  { value: 'comision', label: 'Comisión', sentido: 'devengo', icono: '📈', salarialObligatorio: true },
  { value: 'horas_extras', label: 'Horas extras y recargos', sentido: 'devengo', icono: '⏱️', salarialObligatorio: true },
  { value: 'otro_pago', label: 'Otro pago', sentido: 'devengo', icono: '💵' },
  { value: 'anticipo', label: 'Anticipo de salario', sentido: 'deduccion', icono: '↩️' },
  { value: 'descuento_prestamo', label: 'Descuento de préstamo', sentido: 'deduccion', icono: '🏦' },
  { value: 'otro_descuento', label: 'Otro descuento', sentido: 'deduccion', icono: '➖' },
]
const tipoPagoInfo = (t) => TIPOS_PAGO.find(x => x.value === t) || TIPOS_PAGO[3]

const fmtCOP = (n) => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-CO')
const mesActual = () => fmtISO(new Date()).slice(0, 7)
const sumarMesesPeriodo = (periodo, delta) => {
  const [y, m] = periodo.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const nombreMes = (periodo) => {
  const [y, m] = periodo.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
}

// Resumen REFERENCIAL de un mes completo: salario + auxilio + pagos − aportes del trabajador − descuentos
const resumenPagosMes = (salario, pagosMes) => {
  const sal = Number(salario) || 0
  const suma = (f) => pagosMes.filter(f).reduce((a, p) => a + Number(p.valor || 0), 0)
  const salariales = suma(p => p.sentido === 'devengo' && p.naturaleza === 'salarial')
  const noSalariales = suma(p => p.sentido === 'devengo' && p.naturaleza === 'no_salarial')
  const descuentos = suma(p => p.sentido === 'deduccion')
  const auxilio = sal > 0 && sal <= 2 * SMMLV ? AUXILIO_TRANSPORTE : 0
  const exceso = Math.max(0, noSalariales - LIMITE_NO_SALARIAL * (sal + salariales + noSalariales))
  const ibc = Math.max(SMMLV, sal + salariales + exceso)
  const salud = ibc * APORTE_SALUD_EMPLEADO
  const pension = ibc * APORTE_PENSION_EMPLEADO
  const devengado = sal + auxilio + salariales + noSalariales
  const neto = devengado - salud - pension - descuentos
  return { sal, auxilio, salariales, noSalariales, descuentos, exceso, ibc, salud, pension, devengado, neto }
}

export default function Empleados() {
  const [empleados, setEmpleados] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [editando, setEditando] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [nuevo, setNuevo] = useState(vacioNuevo())
  const [fotoArchivo, setFotoArchivo] = useState(null)
  const [fotoPreview, setFotoPreview] = useState(null)

  const [fichaEmpleado, setFichaEmpleado] = useState(null)
  const [tabFicha, setTabFicha] = useState('documentos')

  // Contraseña de autorización (editar / eliminar / editar acceso)
  const [pidiendoClave, setPidiendoClave] = useState(null) // { empleado, accion }
  const [claveInput, setClaveInput] = useState('')
  const [claveError, setClaveError] = useState('')

  // Acceso al sistema (sección independiente en la ficha)
  const [editandoAcceso, setEditandoAcceso] = useState(false)
  const [accesoForm, setAccesoForm] = useState({ email: '', rol: 'ventas', activo: true })
  const [guardandoAcceso, setGuardandoAcceso] = useState(false)

  // Documentos del empleado (pestaña dentro de la ficha)
  const [documentos, setDocumentos] = useState([])
  const [cargandoDocumentos, setCargandoDocumentos] = useState(false)
  const [mostrarFormDocumento, setMostrarFormDocumento] = useState(false)
  const [guardandoDocumento, setGuardandoDocumento] = useState(false)
  const [subiendoArchivo, setSubiendoArchivo] = useState(false)
  const [nuevoDocumento, setNuevoDocumento] = useState({ tipo: 'cedula', nombre_documento: '', fecha_emision: '', fecha_vencimiento: '', observaciones: '' })
  const [archivoDocumento, setArchivoDocumento] = useState(null)
  const [editandoDocumento, setEditandoDocumento] = useState(null)
  const [documentosPorVencerTotal, setDocumentosPorVencerTotal] = useState(null)

  // Capacitaciones del empleado (pestaña dentro de la ficha)
  const [capacitaciones, setCapacitaciones] = useState([])
  const [cargandoCapacitaciones, setCargandoCapacitaciones] = useState(false)
  const [mostrarFormCapacitacion, setMostrarFormCapacitacion] = useState(false)
  const [guardandoCapacitacion, setGuardandoCapacitacion] = useState(false)
  const [subiendoCertificado, setSubiendoCertificado] = useState(false)
  const [nuevaCapacitacion, setNuevaCapacitacion] = useState({ tema: '', fecha: '', responsable: '', fecha_vencimiento: '', observaciones: '' })
  const [archivoCertificado, setArchivoCertificado] = useState(null)
  const [editandoCapacitacion, setEditandoCapacitacion] = useState(null)
  const [capacitacionesPorVencerTotal, setCapacitacionesPorVencerTotal] = useState(null)

  // Dotaciones del empleado (pestaña dentro de la ficha)
  const [dotaciones, setDotaciones] = useState([])
  const [cargandoDotaciones, setCargandoDotaciones] = useState(false)
  const [mostrarFormDotacion, setMostrarFormDotacion] = useState(false)
  const [guardandoDotacion, setGuardandoDotacion] = useState(false)
  const [subiendoSoporte, setSubiendoSoporte] = useState(false)
  const [nuevaDotacion, setNuevaDotacion] = useState({ tipo_entrega: 'ordinaria', fecha_entrega: fmtISO(new Date()), prendas: '', talla: '', entregado_por: '', observaciones: '' })
  const [archivoSoporte, setArchivoSoporte] = useState(null)
  const [editandoDotacion, setEditandoDotacion] = useState(null)
  const [dotacionesProximasTotal, setDotacionesProximasTotal] = useState(null)

  // Asistencia: novedades y marcaciones del empleado (pestaña dentro de la ficha)
  const [novedades, setNovedades] = useState([])
  const [cargandoNovedades, setCargandoNovedades] = useState(false)
  const [mostrarFormNovedad, setMostrarFormNovedad] = useState(false)
  const [guardandoNovedad, setGuardandoNovedad] = useState(false)
  const [subiendoSoporteNovedad, setSubiendoSoporteNovedad] = useState(false)
  const [nuevaNovedad, setNuevaNovedad] = useState({ tipo: 'permiso', fecha_inicio: fmtISO(new Date()), fecha_fin: fmtISO(new Date()), motivo: '', observaciones: '' })
  const [archivoNovedad, setArchivoNovedad] = useState(null)
  const [remuneradaNovedad, setRemuneradaNovedad] = useState(true)
  const [editandoNovedad, setEditandoNovedad] = useState(null)
  const [novedadesHoy, setNovedadesHoy] = useState(null) // novedades vigentes hoy (todos los empleados)
  const [mostrarNovedadesHoy, setMostrarNovedadesHoy] = useState(false) // panel de notificaciones del día
  const [mostrarNomina, setMostrarNomina] = useState(false)
  const [diasCompensados, setDiasCompensados] = useState(0)
  const [modalPagoBono, setModalPagoBono] = useState(null) // bono o comisión que se va a pagar fuera de nómina
  const [modoVacaciones, setModoVacaciones] = useState('fechas') // 'fechas' | 'dias'
  const [diasVacaciones, setDiasVacaciones] = useState('')
  const [avisoNovedad, setAvisoNovedad] = useState(null)
  const [marcacionesMes, setMarcacionesMes] = useState([])
  const [mesAsistencia, setMesAsistencia] = useState(() => { const h = new Date(); return { anio: h.getFullYear(), mes: h.getMonth() } })
  const [mostrarFormMarcacion, setMostrarFormMarcacion] = useState(false)
  const [guardandoMarcacion, setGuardandoMarcacion] = useState(false)
  const [nuevaMarcacion, setNuevaMarcacion] = useState({ tipo: 'entrada', fecha_hora: '', observaciones: '' })

  // Registro de asistencia tipo kiosco (foto + nombre)
  const [mostrarKiosko, setMostrarKiosko] = useState(false)
  const [marcacionesHoy, setMarcacionesHoy] = useState([])
  const [empleadoKiosko, setEmpleadoKiosko] = useState(null)
  const [registrandoMarcacion, setRegistrandoMarcacion] = useState(false)
  const [avisoKiosko, setAvisoKiosko] = useState(null)

  // PIN personal del kiosco (se guarda cifrado en la base; el navegador nunca lo recibe)
  const [pasoKiosko, setPasoKiosko] = useState('pin') // 'pin' | 'nuevo' | 'confirmar_nuevo'
  const [pinKiosko, setPinKiosko] = useState('')
  const [pinActualKiosko, setPinActualKiosko] = useState('')
  const [pinNuevoKiosko, setPinNuevoKiosko] = useState('')
  const [errorPinKiosko, setErrorPinKiosko] = useState('')
  const [verificandoPin, setVerificandoPin] = useState(false)
  const [estadoPinFicha, setEstadoPinFicha] = useState(null)

  // Bonos / Pagos del empleado (pestaña dentro de la ficha)
  const [pagos, setPagos] = useState([])
  const [cargandoPagos, setCargandoPagos] = useState(false)
  const [mesPagos, setMesPagos] = useState(() => mesActual())
  const [mostrarFormPago, setMostrarFormPago] = useState(false)
  const [guardandoPago, setGuardandoPago] = useState(false)
  const [subiendoSoportePago, setSubiendoSoportePago] = useState(false)
  const [nuevoPago, setNuevoPago] = useState({ tipo: 'bono', naturaleza: 'salarial', concepto: '', valor: '', periodo: mesActual(), fecha: fmtISO(new Date()), estado: 'pendiente', fecha_pago: '', soporte_escrito: false, observaciones: '' })
  const [archivoPago, setArchivoPago] = useState(null)
  const [editandoPago, setEditandoPago] = useState(null)
  const [pagosPendientes, setPagosPendientes] = useState(null) // pagos pendientes de todos los empleados (panel de Novedades)
  const periodoPagoDestino = useRef(null) // mes al que abrir la pestaña Bonos / Pagos desde el panel

  useEffect(() => { cargar(); cargarDocumentosPorVencer(); cargarCapacitacionesPorVencer(); cargarDotacionesProximas(); cargarNovedadesHoy(); cargarPagosPendientes() }, [])

  // Cuando se abre la ficha de un empleado, carga sus documentos, capacitaciones y dotaciones
  useEffect(() => {
    if (fichaEmpleado) {
      cargarDocumentos(fichaEmpleado.id)
      cargarCapacitaciones(fichaEmpleado.id)
      cargarDotaciones(fichaEmpleado.id)
      cargarNovedades(fichaEmpleado.id)
      cargarEstadoPin(fichaEmpleado.id)
      cargarDiasCompensados(fichaEmpleado.id).then(setDiasCompensados)
      cargarPagos(fichaEmpleado.id)
      setMesPagos(periodoPagoDestino.current || mesActual())
      periodoPagoDestino.current = null
      const h = new Date()
      setMesAsistencia({ anio: h.getFullYear(), mes: h.getMonth() })
    } else {
      setDocumentos([])
      setCapacitaciones([])
      setDotaciones([])
      setNovedades([])
      setMarcacionesMes([])
      setEstadoPinFicha(null)
      setDiasCompensados(0)
      setPagos([])
    }
    setMostrarFormDocumento(false)
    setMostrarFormCapacitacion(false)
    setMostrarFormDotacion(false)
    setMostrarFormNovedad(false)
    setMostrarFormMarcacion(false)
    setMostrarFormPago(false)
  }, [fichaEmpleado?.id])

  // Marcaciones del mes que se está viendo en el calendario de la ficha
  useEffect(() => {
    if (fichaEmpleado) cargarMarcacionesMes(fichaEmpleado.id, mesAsistencia)
  }, [fichaEmpleado?.id, mesAsistencia.anio, mesAsistencia.mes])

  // Al abrir el registro de asistencia, trae las marcaciones de hoy
  useEffect(() => {
    if (mostrarKiosko) cargarMarcacionesHoy()
  }, [mostrarKiosko])

  const cargarDocumentos = async (empleadoId) => {
    setCargandoDocumentos(true)
    const { data } = await supabase.from('documentos_empleado').select('*').eq('empleado_id', empleadoId).order('creado_en', { ascending: false })
    setDocumentos(data || [])
    setCargandoDocumentos(false)
  }

  // Cuenta cuántos documentos (de cualquier empleado) vencen en los próximos 30 días,
  // para la tarjeta del dashboard principal
  const cargarDocumentosPorVencer = async () => {
    const hoy = fmtISO(new Date())
    const en30dias = fmtISO(new Date(Date.now() + 30 * 86400000))
    const { count } = await supabase
      .from('documentos_empleado')
      .select('id', { count: 'exact', head: true })
      .gte('fecha_vencimiento', hoy)
      .lte('fecha_vencimiento', en30dias)
    setDocumentosPorVencerTotal(count ?? 0)
  }

  const abrirFormDocumento = (doc = null) => {
    if (doc) {
      setEditandoDocumento(doc)
      setNuevoDocumento({
        tipo: doc.tipo || 'cedula',
        nombre_documento: doc.nombre_documento || '',
        fecha_emision: doc.fecha_emision || '',
        fecha_vencimiento: doc.fecha_vencimiento || '',
        observaciones: doc.observaciones || ''
      })
    } else {
      setEditandoDocumento(null)
      setNuevoDocumento({ tipo: 'cedula', nombre_documento: '', fecha_emision: '', fecha_vencimiento: '', observaciones: '' })
    }
    setArchivoDocumento(null)
    setMostrarFormDocumento(true)
  }

  const guardarDocumento = async () => {
    setGuardandoDocumento(true)
    // Si estamos editando y ya había un archivo, lo conservamos salvo que se suba uno nuevo
    let archivo_url = editandoDocumento ? (editandoDocumento.archivo_url || null) : null

    if (archivoDocumento) {
      setSubiendoArchivo(true)
      // Si había un archivo anterior (edición con reemplazo), lo borramos primero
      if (editandoDocumento?.archivo_url) {
        await supabase.storage.from('DocumentosEmpleados').remove([editandoDocumento.archivo_url])
      }
      const extension = archivoDocumento.name.split('.').pop()
      const ruta = `${fichaEmpleado.codigo}/${nuevoDocumento.tipo}-${Date.now()}.${extension}`
      const { error: errorSubida } = await supabase.storage
        .from('DocumentosEmpleados')
        .upload(ruta, archivoDocumento, { upsert: true, contentType: archivoDocumento.type })
      setSubiendoArchivo(false)
      if (errorSubida) {
        alert('Error al subir el archivo: ' + errorSubida.message)
        setGuardandoDocumento(false)
        return
      }
      archivo_url = ruta // guardamos la RUTA dentro del bucket (privado) — se firma al momento de verlo
    }

    const payload = {
      tipo: nuevoDocumento.tipo,
      nombre_documento: nuevoDocumento.nombre_documento || null,
      fecha_emision: nuevoDocumento.fecha_emision || null,
      fecha_vencimiento: nuevoDocumento.fecha_vencimiento || null,
      archivo_url,
      observaciones: nuevoDocumento.observaciones || null
    }

    const { error } = editandoDocumento
      ? await supabase.from('documentos_empleado').update(payload).eq('id', editandoDocumento.id)
      : await supabase.from('documentos_empleado').insert([{ ...payload, empleado_id: fichaEmpleado.id }])

    if (error) { alert('Error: ' + error.message); setGuardandoDocumento(false); return }

    setMostrarFormDocumento(false)
    setEditandoDocumento(null)
    setGuardandoDocumento(false)
    cargarDocumentos(fichaEmpleado.id)
    cargarDocumentosPorVencer()
  }

  const verDocumento = async (doc) => {
    if (!doc.archivo_url) { alert('Este documento no tiene un archivo adjunto.'); return }
    const { data, error } = await supabase.storage.from('DocumentosEmpleados').createSignedUrl(doc.archivo_url, 60)
    if (error) { alert('Error al abrir el archivo: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  const ejecutarEliminarDocumento = async (doc) => {
    if (doc.archivo_url) {
      await supabase.storage.from('DocumentosEmpleados').remove([doc.archivo_url])
    }
    const { error } = await supabase.from('documentos_empleado').delete().eq('id', doc.id)
    if (error) { alert('Error al eliminar: ' + error.message); return }
    cargarDocumentos(fichaEmpleado.id)
    cargarDocumentosPorVencer()
  }

  // Último examen médico: se calcula solo, tomando el documento de tipo
  // "examen_medico" más reciente (no se edita a mano)
  // ── Capacitaciones ──
  const cargarCapacitaciones = async (empleadoId) => {
    setCargandoCapacitaciones(true)
    const { data } = await supabase.from('capacitaciones_empleado').select('*').eq('empleado_id', empleadoId).order('creado_en', { ascending: false })
    setCapacitaciones(data || [])
    setCargandoCapacitaciones(false)
  }

  const cargarCapacitacionesPorVencer = async () => {
    const hoy = fmtISO(new Date())
    const en30dias = fmtISO(new Date(Date.now() + 30 * 86400000))
    const { count } = await supabase
      .from('capacitaciones_empleado')
      .select('id', { count: 'exact', head: true })
      .gte('fecha_vencimiento', hoy)
      .lte('fecha_vencimiento', en30dias)
    setCapacitacionesPorVencerTotal(count ?? 0)
  }

  const abrirFormCapacitacion = (cap = null) => {
    if (cap) {
      setEditandoCapacitacion(cap)
      setNuevaCapacitacion({
        tema: cap.tema || '', fecha: cap.fecha || '', responsable: cap.responsable || '',
        fecha_vencimiento: cap.fecha_vencimiento || '', observaciones: cap.observaciones || ''
      })
    } else {
      setEditandoCapacitacion(null)
      setNuevaCapacitacion({ tema: '', fecha: '', responsable: '', fecha_vencimiento: '', observaciones: '' })
    }
    setArchivoCertificado(null)
    setMostrarFormCapacitacion(true)
  }

  const guardarCapacitacion = async () => {
    if (!nuevaCapacitacion.tema) { alert('El tema es obligatorio'); return }

    setGuardandoCapacitacion(true)
    let certificado_url = editandoCapacitacion ? (editandoCapacitacion.certificado_url || null) : null

    if (archivoCertificado) {
      setSubiendoCertificado(true)
      if (editandoCapacitacion?.certificado_url) {
        await supabase.storage.from('DocumentosEmpleados').remove([editandoCapacitacion.certificado_url])
      }
      const extension = archivoCertificado.name.split('.').pop()
      const ruta = `${fichaEmpleado.codigo}/capacitacion-${Date.now()}.${extension}`
      const { error: errorSubida } = await supabase.storage
        .from('DocumentosEmpleados')
        .upload(ruta, archivoCertificado, { upsert: true, contentType: archivoCertificado.type })
      setSubiendoCertificado(false)
      if (errorSubida) {
        alert('Error al subir el certificado: ' + errorSubida.message)
        setGuardandoCapacitacion(false)
        return
      }
      certificado_url = ruta
    }

    const payload = {
      tema: nuevaCapacitacion.tema,
      fecha: nuevaCapacitacion.fecha || null,
      responsable: nuevaCapacitacion.responsable || null,
      fecha_vencimiento: nuevaCapacitacion.fecha_vencimiento || null,
      certificado_url,
      observaciones: nuevaCapacitacion.observaciones || null
    }

    const { error } = editandoCapacitacion
      ? await supabase.from('capacitaciones_empleado').update(payload).eq('id', editandoCapacitacion.id)
      : await supabase.from('capacitaciones_empleado').insert([{ ...payload, empleado_id: fichaEmpleado.id }])

    if (error) { alert('Error: ' + error.message); setGuardandoCapacitacion(false); return }

    setMostrarFormCapacitacion(false)
    setEditandoCapacitacion(null)
    setGuardandoCapacitacion(false)
    cargarCapacitaciones(fichaEmpleado.id)
    cargarCapacitacionesPorVencer()
  }

  const verCertificado = async (cap) => {
    if (!cap.certificado_url) { alert('Esta capacitación no tiene un certificado adjunto.'); return }
    const { data, error } = await supabase.storage.from('DocumentosEmpleados').createSignedUrl(cap.certificado_url, 60)
    if (error) { alert('Error al abrir el archivo: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  const ejecutarEliminarCapacitacion = async (cap) => {
    if (cap.certificado_url) {
      await supabase.storage.from('DocumentosEmpleados').remove([cap.certificado_url])
    }
    const { error } = await supabase.from('capacitaciones_empleado').delete().eq('id', cap.id)
    if (error) { alert('Error al eliminar: ' + error.message); return }
    cargarCapacitaciones(fichaEmpleado.id)
    cargarCapacitacionesPorVencer()
  }

  // ── Dotaciones ──
  const cargarDotaciones = async (empleadoId) => {
    setCargandoDotaciones(true)
    const { data } = await supabase.from('dotaciones_empleado').select('*').eq('empleado_id', empleadoId).order('fecha_entrega', { ascending: false })
    setDotaciones(data || [])
    setCargandoDotaciones(false)
  }

  // Cuenta (para la tarjeta del dashboard) los empleados con dotación vencida
  // o que vence en los próximos 30 días, según el ciclo de 6 meses
  const cargarDotacionesProximas = async () => {
    const { data: emps } = await supabase.from('empleados').select('id, fecha_ingreso, estado')
    const { data: ents } = await supabase.from('dotaciones_empleado').select('empleado_id, fecha_entrega').eq('tipo_entrega', 'ordinaria')
    const ultima = {}
    for (const e of (ents || [])) {
      if (!ultima[e.empleado_id] || e.fecha_entrega > ultima[e.empleado_id]) ultima[e.empleado_id] = e.fecha_entrega
    }
    let total = 0
    for (const e of (emps || [])) {
      if (!['activo', 'vacaciones', 'incapacitado'].includes(e.estado)) continue
      if (estadoDotacion(e.fecha_ingreso, ultima[e.id]).cuenta) total++
    }
    setDotacionesProximasTotal(total)
  }

  // Fecha de la última entrega ordinaria del empleado abierto en la ficha
  const ultimaDotacionOrdinaria = () => {
    const ord = dotaciones.filter(d => d.tipo_entrega === 'ordinaria' && d.fecha_entrega)
    if (ord.length === 0) return null
    return ord.reduce((m, d) => (d.fecha_entrega > m ? d.fecha_entrega : m), ord[0].fecha_entrega)
  }

  const abrirFormDotacion = (dot = null) => {
    if (dot) {
      setEditandoDotacion(dot)
      setNuevaDotacion({
        tipo_entrega: dot.tipo_entrega || 'ordinaria',
        fecha_entrega: dot.fecha_entrega || '',
        prendas: dot.prendas || '',
        talla: dot.talla || '',
        entregado_por: dot.entregado_por || '',
        observaciones: dot.observaciones || ''
      })
    } else {
      setEditandoDotacion(null)
      setNuevaDotacion({ tipo_entrega: 'ordinaria', fecha_entrega: fmtISO(new Date()), prendas: '', talla: '', entregado_por: '', observaciones: '' })
    }
    setArchivoSoporte(null)
    setMostrarFormDotacion(true)
  }

  const guardarDotacion = async () => {
    if (!nuevaDotacion.prendas) { alert('Indica las prendas entregadas'); return }
    if (!nuevaDotacion.fecha_entrega) { alert('La fecha de entrega es obligatoria'); return }

    setGuardandoDotacion(true)
    let soporte_url = editandoDotacion ? (editandoDotacion.soporte_url || null) : null

    if (archivoSoporte) {
      setSubiendoSoporte(true)
      if (editandoDotacion?.soporte_url) {
        await supabase.storage.from('DocumentosEmpleados').remove([editandoDotacion.soporte_url])
      }
      const extension = archivoSoporte.name.split('.').pop()
      const ruta = `${fichaEmpleado.codigo}/dotacion-${Date.now()}.${extension}`
      const { error: errorSubida } = await supabase.storage
        .from('DocumentosEmpleados')
        .upload(ruta, archivoSoporte, { upsert: true, contentType: archivoSoporte.type })
      setSubiendoSoporte(false)
      if (errorSubida) {
        alert('Error al subir el soporte: ' + errorSubida.message)
        setGuardandoDotacion(false)
        return
      }
      soporte_url = ruta
    }

    const payload = {
      tipo_entrega: nuevaDotacion.tipo_entrega,
      fecha_entrega: nuevaDotacion.fecha_entrega,
      prendas: nuevaDotacion.prendas,
      talla: nuevaDotacion.talla || null,
      entregado_por: nuevaDotacion.entregado_por || null,
      soporte_url,
      observaciones: nuevaDotacion.observaciones || null
    }

    const { error } = editandoDotacion
      ? await supabase.from('dotaciones_empleado').update(payload).eq('id', editandoDotacion.id)
      : await supabase.from('dotaciones_empleado').insert([{ ...payload, empleado_id: fichaEmpleado.id }])

    if (error) { alert('Error: ' + error.message); setGuardandoDotacion(false); return }

    setMostrarFormDotacion(false)
    setEditandoDotacion(null)
    setGuardandoDotacion(false)
    cargarDotaciones(fichaEmpleado.id)
    cargarDotacionesProximas()
  }

  const verSoporteDotacion = async (dot) => {
    if (!dot.soporte_url) { alert('Esta entrega no tiene soporte adjunto.'); return }
    const { data, error } = await supabase.storage.from('DocumentosEmpleados').createSignedUrl(dot.soporte_url, 60)
    if (error) { alert('Error al abrir el archivo: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  const ejecutarEliminarDotacion = async (dot) => {
    if (dot.soporte_url) {
      await supabase.storage.from('DocumentosEmpleados').remove([dot.soporte_url])
    }
    const { error } = await supabase.from('dotaciones_empleado').delete().eq('id', dot.id)
    if (error) { alert('Error al eliminar: ' + error.message); return }
    cargarDotaciones(fichaEmpleado.id)
    cargarDotacionesProximas()
  }

  // ── Asistencia: novedades ──
  const cargarNovedades = async (empleadoId) => {
    setCargandoNovedades(true)
    const { data } = await supabase.from('novedades_asistencia').select('*').eq('empleado_id', empleadoId).order('fecha_inicio', { ascending: false })
    setNovedades(data || [])
    setCargandoNovedades(false)
  }

  // Novedades vigentes hoy (alimentan los indicadores de estado y el dashboard)
  const cargarNovedadesHoy = async () => {
    const hoy = fmtISO(new Date())
    const { data } = await supabase.from('novedades_asistencia').select('*').lte('fecha_inicio', hoy).gte('fecha_fin', hoy)
    setNovedadesHoy(data || [])
  }

  const abrirFormNovedad = (nov = null, tipoInicial = 'permiso') => {
    const hoy = fmtISO(new Date())
    setModoVacaciones('fechas')
    setDiasVacaciones('')
    setRemuneradaNovedad(nov ? (nov.remunerada ?? remuneradaPorDefecto(nov.tipo)) : remuneradaPorDefecto(tipoInicial))
    if (nov) {
      setEditandoNovedad(nov)
      setNuevaNovedad({
        tipo: nov.tipo || 'permiso', fecha_inicio: nov.fecha_inicio || hoy, fecha_fin: nov.fecha_fin || hoy,
        motivo: nov.motivo || '', observaciones: nov.observaciones || ''
      })
    } else {
      setEditandoNovedad(null)
      setNuevaNovedad({ tipo: tipoInicial, fecha_inicio: hoy, fecha_fin: hoy, motivo: '', observaciones: '' })
    }
    setArchivoNovedad(null)
    setMostrarFormNovedad(true)
  }

  const guardarNovedad = async () => {
    const ini = nuevaNovedad.fecha_inicio
    const esVac = nuevaNovedad.tipo === 'vacaciones'
    let fin = nuevaNovedad.fecha_fin
    if (esVac && modoVacaciones === 'dias') {
      fin = finPorDiasHabiles(ini, Number(diasVacaciones))
      if (!ini || !fin) { alert('Indica la fecha de inicio y cuántos días hábiles de vacaciones se programan'); return }
    }
    if (!ini || !fin) { alert('Indica la fecha de inicio y la de fin'); return }
    if (fin < ini) { alert('La fecha de fin no puede ser anterior a la de inicio'); return }
    const cruce = novedades.find(n =>
      (!editandoNovedad || n.id !== editandoNovedad.id) &&
      ini <= n.fecha_fin && fin >= n.fecha_inicio)
    if (cruce) {
      alert(`Estas fechas se cruzan con otra novedad (${novedadInfo(cruce.tipo).label}, del ${cruce.fecha_inicio} al ${cruce.fecha_fin}). Ajusta las fechas.`)
      return
    }

    const dias_habiles = diasHabilesNovedad(nuevaNovedad.tipo, ini, fin)
    if (esVac) {
      if (dias_habiles === 0) { alert('Ese rango no incluye ningún día hábil de vacaciones'); return }
      const s = saldoVacaciones(fichaEmpleado.fecha_ingreso, novedades.filter(n => !editandoNovedad || n.id !== editandoNovedad.id), diasCompensados)
      if (s && dias_habiles > s.disponibles - s.programados) {
        const libres = Math.max(0, s.disponibles - s.programados)
        if (!window.confirm(`Vas a programar ${dias_habiles} días hábiles y solo hay ${libres.toFixed(1)} disponibles sin programar. ¿Programar de todos modos?`)) return
      }
    }

    setGuardandoNovedad(true)
    let soporte_url = editandoNovedad ? (editandoNovedad.soporte_url || null) : null

    if (archivoNovedad) {
      setSubiendoSoporteNovedad(true)
      if (editandoNovedad?.soporte_url) {
        await supabase.storage.from('DocumentosEmpleados').remove([editandoNovedad.soporte_url])
      }
      const extension = archivoNovedad.name.split('.').pop()
      const ruta = `${fichaEmpleado.codigo}/novedad-${Date.now()}.${extension}`
      const { error: errorSubida } = await supabase.storage
        .from('DocumentosEmpleados')
        .upload(ruta, archivoNovedad, { upsert: true, contentType: archivoNovedad.type })
      setSubiendoSoporteNovedad(false)
      if (errorSubida) {
        alert('Error al subir el soporte: ' + errorSubida.message)
        setGuardandoNovedad(false)
        return
      }
      soporte_url = ruta
    }

    const payload = {
      tipo: nuevaNovedad.tipo,
      fecha_inicio: ini,
      fecha_fin: fin,
      dias_habiles,
      fecha_reintegro: fechaReintegro(fin),
      remunerada: ['permiso', 'licencia', 'otro'].includes(nuevaNovedad.tipo) ? remuneradaNovedad : (nuevaNovedad.tipo === 'ausencia' ? false : null),
      motivo: nuevaNovedad.motivo || null,
      soporte_url,
      observaciones: nuevaNovedad.observaciones || null
    }

    const { error } = editandoNovedad
      ? await supabase.from('novedades_asistencia').update(payload).eq('id', editandoNovedad.id)
      : await supabase.from('novedades_asistencia').insert([{ ...payload, empleado_id: fichaEmpleado.id }])

    if (error) { alert('Error: ' + error.message); setGuardandoNovedad(false); return }

    setMostrarFormNovedad(false)
    setEditandoNovedad(null)
    setGuardandoNovedad(false)
    cargarNovedades(fichaEmpleado.id)
    cargarNovedadesHoy()

    // Aviso visible: el empleado queda con su nuevo estado (o con vacaciones programadas)
    const hoy = fmtISO(new Date())
    const nombre = `${fichaEmpleado.nombre} ${fichaEmpleado.apellidos || ''}`.trim()
    if (hoy >= ini && hoy <= fin) {
      setAvisoNovedad(`${nombre} ahora figura: ${novedadInfo(nuevaNovedad.tipo).estado} (hasta el ${fechaLarga(fin)})`)
    } else if (esVac) {
      setAvisoNovedad(`Vacaciones programadas para ${nombre}: del ${fechaLarga(ini)} al ${fechaLarga(fin)} (${dias_habiles} días hábiles)`)
    } else {
      setAvisoNovedad(`Novedad registrada para ${nombre}: ${novedadInfo(nuevaNovedad.tipo).label}, del ${fechaLarga(ini)} al ${fechaLarga(fin)}`)
    }
    setTimeout(() => setAvisoNovedad(null), 7000)
  }

  const verSoporteNovedad = async (nov) => {
    if (!nov.soporte_url) { alert('Esta novedad no tiene soporte adjunto.'); return }
    const { data, error } = await supabase.storage.from('DocumentosEmpleados').createSignedUrl(nov.soporte_url, 60)
    if (error) { alert('Error al abrir el archivo: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  const ejecutarEliminarNovedad = async (nov) => {
    if (nov.soporte_url) {
      await supabase.storage.from('DocumentosEmpleados').remove([nov.soporte_url])
    }
    const { error } = await supabase.from('novedades_asistencia').delete().eq('id', nov.id)
    if (error) { alert('Error al eliminar: ' + error.message); return }
    cargarNovedades(fichaEmpleado.id)
    cargarNovedadesHoy()
  }

  // ── Asistencia: marcaciones (entrada / salida) ──
  const cargarMarcacionesMes = async (empleadoId, { anio, mes }) => {
    const ini = new Date(anio, mes, 1).toISOString()
    const fin = new Date(anio, mes + 1, 1).toISOString()
    const { data } = await supabase.from('marcaciones_empleado').select('*')
      .eq('empleado_id', empleadoId).gte('marcado_en', ini).lt('marcado_en', fin)
      .order('marcado_en', { ascending: true })
    setMarcacionesMes(data || [])
  }

  const cargarMarcacionesHoy = async () => {
    const inicio = new Date(); inicio.setHours(0, 0, 0, 0)
    const { data } = await supabase.from('marcaciones_empleado').select('*')
      .gte('marcado_en', inicio.toISOString()).order('marcado_en', { ascending: true })
    setMarcacionesHoy(data || [])
  }

  const ultimaMarcacionDe = (empleadoId) => {
    const m = marcacionesHoy.filter(x => x.empleado_id === empleadoId)
    return m.length ? m[m.length - 1] : null
  }

  // Registro desde el kiosco: la hora la pone el servidor (marcado_en = now() en la base de datos)
  const registrarMarcacion = async (emp) => {
    const ultima = ultimaMarcacionDe(emp.id)
    if (ultima && Date.now() - new Date(ultima.marcado_en).getTime() < 60000) {
      alert('Ya registraste hace un momento. Espera un minuto si necesitas corregirlo.')
      cerrarModalKiosko()
      return
    }
    const tipo = ultima?.tipo === 'entrada' ? 'salida' : 'entrada'
    setRegistrandoMarcacion(true)
    const { data, error } = await supabase.from('marcaciones_empleado')
      .insert([{ empleado_id: emp.id, tipo, origen: 'kiosco' }]).select().single()
    setRegistrandoMarcacion(false)
    if (error) { alert('No se pudo registrar: ' + error.message); return }
    cerrarModalKiosko()
    setAvisoKiosko({ nombre: emp.nombre, tipo, hora: horaCorta(data.marcado_en) })
    setTimeout(() => setAvisoKiosko(null), 4000)
    cargarMarcacionesHoy()
  }

  // ── PIN personal ──
  const cargarEstadoPin = async (empleadoId) => {
    const { data } = await supabase.rpc('estado_pin', { p_empleado: empleadoId })
    setEstadoPinFicha(data || null)
  }

  const ejecutarRestablecerPin = async (emp) => {
    const { data, error } = await supabase.rpc('restablecer_pin', { p_empleado: emp.id })
    if (error) { alert('Error: ' + error.message); return }
    if (data === 'sin_cedula') {
      alert('Este empleado no tiene la cédula registrada (mínimo 4 dígitos). Regístrala y vuelve a intentar.')
      return
    }
    alert('PIN restablecido a los últimos 4 dígitos de la cédula. Deberá cambiarlo la próxima vez que registre su asistencia.')
    cargarEstadoPin(emp.id)
  }

  const cerrarModalKiosko = () => {
    setEmpleadoKiosko(null)
    setPinKiosko('')
    setPinActualKiosko('')
    setPinNuevoKiosko('')
    setErrorPinKiosko('')
    setPasoKiosko('pin')
  }

  const abrirKioscoEmpleado = (emp) => {
    const nv = novedadHoyDe(emp.id)
    if (nv && NOVEDADES_BLOQUEAN_REGISTRO.includes(nv.tipo)) {
      alert(`Hoy figuras como "${novedadInfo(nv.tipo).estado}" hasta el ${fechaLarga(nv.fecha_fin)}. Si vas a trabajar, avisa a un administrador para corregir la novedad.`)
      return
    }
    cerrarModalKiosko()
    setEmpleadoKiosko(emp)
  }

  const pulsarTecla = (d) => {
    if (verificandoPin || registrandoMarcacion) return
    const nuevo = (pinKiosko + d).slice(0, 4)
    setPinKiosko(nuevo)
    setErrorPinKiosko('')
    if (nuevo.length === 4) procesarPin(nuevo)
  }

  const procesarPin = async (pin) => {
    const emp = empleadoKiosko
    if (pasoKiosko === 'pin') {
      setVerificandoPin(true)
      const { data, error } = await supabase.rpc('verificar_pin', { p_empleado: emp.id, p_pin: pin })
      setVerificandoPin(false)
      setPinKiosko('')
      if (error) { setErrorPinKiosko('No se pudo verificar el PIN: ' + error.message); return }
      if (data === 'ok') registrarMarcacion(emp)
      else if (data === 'debe_cambiar') { setPinActualKiosko(pin); setPasoKiosko('nuevo') }
      else if (data === 'bloqueado') setErrorPinKiosko('Demasiados intentos fallidos. Espera 15 minutos o avisa a un administrador.')
      else if (data === 'sin_pin') setErrorPinKiosko('Tu cédula no está registrada. Avisa a un administrador.')
      else setErrorPinKiosko('PIN incorrecto')
    } else if (pasoKiosko === 'nuevo') {
      setPinNuevoKiosko(pin)
      setPasoKiosko('confirmar_nuevo')
      setPinKiosko('')
    } else if (pasoKiosko === 'confirmar_nuevo') {
      if (pin !== pinNuevoKiosko) {
        setErrorPinKiosko('Los PIN no coinciden. Inténtalo de nuevo.')
        setPasoKiosko('nuevo')
        setPinNuevoKiosko('')
        setPinKiosko('')
        return
      }
      setVerificandoPin(true)
      const { data, error } = await supabase.rpc('cambiar_pin', { p_empleado: emp.id, p_pin_actual: pinActualKiosko, p_pin_nuevo: pin })
      setVerificandoPin(false)
      setPinKiosko('')
      if (error) { setErrorPinKiosko('No se pudo cambiar el PIN: ' + error.message); setPasoKiosko('nuevo'); setPinNuevoKiosko(''); return }
      if (data === 'ok') registrarMarcacion(emp)
      else if (data === 'invalido') {
        setErrorPinKiosko('Ese PIN no sirve: no uses los últimos 4 dígitos de tu cédula, números repetidos (1111) ni seguidos (1234).')
        setPasoKiosko('nuevo')
        setPinNuevoKiosko('')
      } else {
        setErrorPinKiosko('No se pudo cambiar el PIN. Empieza de nuevo.')
        setPasoKiosko('pin')
        setPinActualKiosko('')
        setPinNuevoKiosko('')
      }
    }
  }

  // Marcación manual (corrección hecha por un administrador desde la ficha)
  const guardarMarcacionManual = async () => {
    if (!nuevaMarcacion.fecha_hora) { alert('Indica la fecha y la hora'); return }
    setGuardandoMarcacion(true)
    const { error } = await supabase.from('marcaciones_empleado').insert([{
      empleado_id: fichaEmpleado.id,
      tipo: nuevaMarcacion.tipo,
      marcado_en: new Date(nuevaMarcacion.fecha_hora).toISOString(),
      origen: 'manual',
      observaciones: nuevaMarcacion.observaciones || null
    }])
    setGuardandoMarcacion(false)
    if (error) { alert('Error: ' + error.message); return }
    setMostrarFormMarcacion(false)
    setNuevaMarcacion({ tipo: 'entrada', fecha_hora: '', observaciones: '' })
    cargarMarcacionesMes(fichaEmpleado.id, mesAsistencia)
  }

  const ejecutarEliminarMarcacion = async (m) => {
    const { error } = await supabase.from('marcaciones_empleado').delete().eq('id', m.id)
    if (error) { alert('Error al eliminar: ' + error.message); return }
    cargarMarcacionesMes(fichaEmpleado.id, mesAsistencia)
  }

  // ── Bonos / Pagos ──
  const cargarPagos = async (empleadoId) => {
    setCargandoPagos(true)
    const { data } = await supabase.from('pagos_empleado').select('*').eq('empleado_id', empleadoId)
      .order('periodo', { ascending: false }).order('fecha', { ascending: false })
    setPagos(data || [])
    setCargandoPagos(false)
  }

  // Pagos (devengos) pendientes de todos los empleados: se muestran en el panel de Novedades
  const cargarPagosPendientes = async () => {
    const { data } = await supabase.from('pagos_empleado').select('*')
      .eq('estado', 'pendiente').eq('sentido', 'devengo')
      .order('periodo', { ascending: true }).order('fecha', { ascending: true })
    setPagosPendientes(data || [])
  }

  const pagosDelMes = () => pagos.filter(p => p.periodo === mesPagos)

  const abrirFormPago = (p = null) => {
    if (p) {
      setEditandoPago(p)
      setNuevoPago({
        tipo: p.tipo, naturaleza: p.naturaleza || 'salarial', concepto: p.concepto || '', valor: String(p.valor ?? ''),
        periodo: p.periodo, fecha: p.fecha || fmtISO(new Date()), estado: p.estado || 'pendiente',
        fecha_pago: p.fecha_pago || '', soporte_escrito: !!p.soporte_escrito, observaciones: p.observaciones || ''
      })
    } else {
      setEditandoPago(null)
      setNuevoPago({ tipo: 'bono', naturaleza: 'salarial', concepto: '', valor: '', periodo: mesPagos, fecha: fmtISO(new Date()), estado: 'pendiente', fecha_pago: '', soporte_escrito: false, observaciones: '' })
    }
    setArchivoPago(null)
    setMostrarFormPago(true)
  }

  const guardarPago = async () => {
    const info = tipoPagoInfo(nuevoPago.tipo)
    const esDev = info.sentido === 'devengo'
    const naturaleza = esDev ? (info.salarialObligatorio ? 'salarial' : nuevoPago.naturaleza) : null
    if (!nuevoPago.concepto.trim()) { alert('Escribe el concepto (para qué es este pago o descuento)'); return }
    if (!(Number(nuevoPago.valor) > 0)) { alert('El valor debe ser mayor que cero'); return }
    if (!nuevoPago.periodo) { alert('Indica el mes al que corresponde'); return }
    if (esDev && naturaleza === 'no_salarial' && !nuevoPago.soporte_escrito) {
      alert('Un pago solo es no salarial si se pactó así por escrito (art. 128 del CST). Marca la casilla si existe ese pacto, o regístralo como salarial.')
      return
    }
    if (!esDev && !nuevoPago.soporte_escrito) {
      alert('Un descuento al trabajador exige su autorización escrita (art. 149 del CST). Marca la casilla si la tienes; si no, no se debe descontar.')
      return
    }

    setGuardandoPago(true)
    let soporte_url = editandoPago ? (editandoPago.soporte_url || null) : null

    if (archivoPago) {
      setSubiendoSoportePago(true)
      if (editandoPago?.soporte_url) {
        await supabase.storage.from('DocumentosEmpleados').remove([editandoPago.soporte_url])
      }
      const extension = archivoPago.name.split('.').pop()
      const ruta = `${fichaEmpleado.codigo}/pago-${Date.now()}.${extension}`
      const { error: errorSubida } = await supabase.storage
        .from('DocumentosEmpleados')
        .upload(ruta, archivoPago, { upsert: true, contentType: archivoPago.type })
      setSubiendoSoportePago(false)
      if (errorSubida) {
        alert('Error al subir el soporte: ' + errorSubida.message)
        setGuardandoPago(false)
        return
      }
      soporte_url = ruta
    }

    const payload = {
      sentido: info.sentido,
      tipo: nuevoPago.tipo,
      concepto: nuevoPago.concepto.trim(),
      valor: Number(nuevoPago.valor),
      naturaleza,
      soporte_escrito: (esDev && naturaleza === 'salarial') ? false : nuevoPago.soporte_escrito,
      periodo: nuevoPago.periodo,
      fecha: nuevoPago.fecha || fmtISO(new Date()),
      estado: nuevoPago.estado,
      fecha_pago: nuevoPago.estado === 'pagado' ? (nuevoPago.fecha_pago || fmtISO(new Date())) : null,
      soporte_url,
      observaciones: nuevoPago.observaciones || null
    }

    const { error } = editandoPago
      ? await supabase.from('pagos_empleado').update(payload).eq('id', editandoPago.id)
      : await supabase.from('pagos_empleado').insert([{ ...payload, empleado_id: fichaEmpleado.id }])

    if (error) { alert('Error: ' + error.message); setGuardandoPago(false); return }

    setMostrarFormPago(false)
    setEditandoPago(null)
    setGuardandoPago(false)
    setMesPagos(payload.periodo)
    cargarPagos(fichaEmpleado.id)
    cargarPagosPendientes()
  }

  const verSoportePago = async (p) => {
    if (!p.soporte_url) { alert('Este registro no tiene soporte adjunto.'); return }
    const { data, error } = await supabase.storage.from('DocumentosEmpleados').createSignedUrl(p.soporte_url, 60)
    if (error) { alert('Error al abrir el archivo: ' + error.message); return }
    window.open(data.signedUrl, '_blank')
  }

  const ejecutarMarcarPagado = async (p) => {
    const { error } = await supabase.from('pagos_empleado').update({ estado: 'pagado', fecha_pago: fmtISO(new Date()) }).eq('id', p.id)
    if (error) { alert('Error: ' + error.message); return }
    cargarPagos(fichaEmpleado.id)
    cargarPagosPendientes()
  }

  const ejecutarEliminarPago = async (p) => {
    if (p.soporte_url) {
      await supabase.storage.from('DocumentosEmpleados').remove([p.soporte_url])
    }
    const { error } = await supabase.from('pagos_empleado').delete().eq('id', p.id)
    if (error) { alert('Error al eliminar: ' + error.message); return }
    cargarPagos(fichaEmpleado.id)
    cargarPagosPendientes()
  }

  const ultimoExamenMedico = () => {
    const examenes = documentos.filter(d => d.tipo === 'examen_medico' && d.fecha_emision)
    if (examenes.length === 0) return null
    return examenes.reduce((mas, d) => (d.fecha_emision > mas.fecha_emision ? d : mas))
  }

  const cargar = async () => {
    setLoading(true)
    const { data } = await supabase.from('empleados').select('*').order('creado_en')
    setEmpleados(data || [])
    setLoading(false)
  }

  const siguienteCodigo = async () => {
    const { data } = await supabase.from('empleados').select('codigo').order('codigo', { ascending: false }).limit(1)
    if (!data || data.length === 0 || !data[0].codigo) return 'EMP-0001'
    const numero = parseInt(data[0].codigo.replace('EMP-', '')) + 1
    return `EMP-${String(numero).padStart(4, '0')}`
  }

  const abrirNuevo = () => {
    setEditando(null)
    setNuevo(vacioNuevo())
    setFotoArchivo(null)
    setFotoPreview(null)
    setMostrarForm(true)
  }

  const cargarFormularioDesde = (e) => {
    setNuevo({
      nombre: e.nombre || '', apellidos: e.apellidos || '', cedula: e.cedula || '',
      fecha_nacimiento: e.fecha_nacimiento || '', direccion: e.direccion || '',
      telefono: e.telefono || '', correo_personal: e.correo_personal || '', ciudad: e.ciudad || '',
      cargo: e.cargo || '', area: e.area || '',
      fecha_ingreso: e.fecha_ingreso || fmtISO(new Date()),
      tipo_contrato: e.tipo_contrato || '', salario: e.salario ?? '', periodicidad_pago: e.periodicidad_pago || 'quincenal', fecha_fin_contrato: e.fecha_fin_contrato || '', fecha_retiro: e.fecha_retiro || '', arl_tarifa: e.arl_tarifa ? String(Number((Number(e.arl_tarifa) * 100).toFixed(4))) : '', arl_riesgo: e.arl_riesgo ? String(e.arl_riesgo) : '',
      eps: e.eps || '', arl: e.arl || '', fondo_pensiones: e.fondo_pensiones || '', caja_compensacion: e.caja_compensacion || '',
      estado: e.estado || 'activo', apto_produccion: e.apto_produccion !== false,
      notas_laborales: e.notas_laborales || '', motivo_retiro: e.motivo_retiro || '',
      contacto_emergencia_nombre: e.contacto_emergencia_nombre || '',
      contacto_emergencia_parentesco: e.contacto_emergencia_parentesco || '',
      contacto_emergencia_telefono: e.contacto_emergencia_telefono || '',
      contacto_emergencia_info: e.contacto_emergencia_info || '',
      informacion_adicional: e.informacion_adicional || ''
    })
    setFotoArchivo(null)
    setFotoPreview(e.foto_url || null)
  }

  const seleccionarFoto = (ev) => {
    const archivo = ev.target.files[0]
    if (!archivo) return
    setFotoArchivo(archivo)
    setFotoPreview(URL.createObjectURL(archivo))
  }

  const subirFoto = async (codigo) => {
    if (!fotoArchivo) return editando ? (editando.foto_url || null) : null
    const extension = fotoArchivo.name.split('.').pop()
    const nombreArchivo = `${codigo}.${extension}`
    const { error } = await supabase.storage
      .from('FotosEmpleados')
      .upload(nombreArchivo, fotoArchivo, { upsert: true, contentType: fotoArchivo.type })
    if (error) { alert('No se pudo subir la foto: ' + error.message); return editando ? (editando.foto_url || null) : null }
    const { data } = supabase.storage.from('FotosEmpleados').getPublicUrl(nombreArchivo)
    return data.publicUrl
  }

  const cerrarForm = () => {
    setMostrarForm(false)
    setEditando(null)
  }

  // ── Contraseña de autorización ──
  const solicitarAccion = (objetivo, accion, tipo = 'empleado') => {
    setPidiendoClave({ objetivo, accion, tipo })
    setClaveInput('')
    setClaveError('')
  }

  const confirmarPagoBono = async (pago) => {
    const bono = modalPagoBono
    setModalPagoBono(null)
    const { error } = await pagarBonoSuelto(fichaEmpleado, bono, { fecha: pago.fecha, pago })
    if (error) { alert('Error: ' + error.message); return }
    cargarPagos(fichaEmpleado.id)
    cargarPagosPendientes()
  }

  // Pide la contraseña y ejecuta una acción cualquiera (nómina, parámetros, pagos)
  const solicitarClaveGenerica = (titulo, subtitulo, onOk) => {
    setPidiendoClave({ objetivo: { titulo, nombre: subtitulo, onOk }, accion: 'generico', tipo: 'generico' })
    setClaveInput('')
    setClaveError('')
  }

  const confirmarClave = () => {
    if (claveInput !== CLAVE_EDICION) {
      setClaveError('Contraseña incorrecta')
      return
    }
    const { objetivo, accion, tipo } = pidiendoClave
    setPidiendoClave(null)

    if (tipo === 'generico') {
      objetivo.onOk()
      return
    }

    if (tipo === 'documento') {
      if (accion === 'editar') {
        abrirFormDocumento(objetivo)
      } else if (accion === 'eliminar') {
        ejecutarEliminarDocumento(objetivo)
      }
      return
    }

    if (tipo === 'capacitacion') {
      if (accion === 'editar') {
        abrirFormCapacitacion(objetivo)
      } else if (accion === 'eliminar') {
        ejecutarEliminarCapacitacion(objetivo)
      }
      return
    }

    if (tipo === 'dotacion') {
      if (accion === 'editar') {
        abrirFormDotacion(objetivo)
      } else if (accion === 'eliminar') {
        ejecutarEliminarDotacion(objetivo)
      }
      return
    }

    if (tipo === 'novedad') {
      if (accion === 'editar') {
        abrirFormNovedad(objetivo)
      } else if (accion === 'eliminar') {
        ejecutarEliminarNovedad(objetivo)
      }
      return
    }

    if (tipo === 'marcacion') {
      if (accion === 'eliminar') ejecutarEliminarMarcacion(objetivo)
      return
    }

    if (tipo === 'pago') {
      if (accion === 'editar') abrirFormPago(objetivo)
      else if (accion === 'eliminar') ejecutarEliminarPago(objetivo)
      else if (accion === 'pagar') {
        // un pago real de plata pide la forma de pago y genera su gasto; un descuento solo se marca como aplicado
        if (objetivo.sentido === 'devengo') setModalPagoBono(objetivo)
        else ejecutarMarcarPagado(objetivo)
      }
      return
    }

    if (tipo === 'pin') {
      ejecutarRestablecerPin(objetivo)
      return
    }

    if (tipo === 'kiosco') {
      setMostrarKiosko(false)
      cerrarModalKiosko()
      return
    }

    // tipo === 'empleado'
    const empleado = objetivo
    if (accion === 'editar') {
      setEditando(empleado)
      cargarFormularioDesde(empleado)
      setMostrarForm(true)
      setFichaEmpleado(null)
    } else if (accion === 'eliminar') {
      ejecutarEliminar(empleado)
    } else if (accion === 'acceso') {
      setAccesoForm({ email: empleado.email || '', rol: empleado.rol || 'ventas', activo: empleado.activo !== false })
      setEditandoAcceso(true)
    }
  }

  const guardar = async () => {
    if (!nuevo.nombre) { alert('El nombre es obligatorio'); return }
    if (nuevo.estado === 'retirado' && !nuevo.motivo_retiro) { alert('Indica el motivo del retiro'); return }

    setGuardando(true)
    const payload = {
      nombre: nuevo.nombre, apellidos: nuevo.apellidos, cedula: nuevo.cedula,
      fecha_nacimiento: nuevo.fecha_nacimiento || null, direccion: nuevo.direccion,
      telefono: nuevo.telefono, correo_personal: nuevo.correo_personal, ciudad: nuevo.ciudad,
      cargo: nuevo.cargo, area: nuevo.area,
      fecha_ingreso: nuevo.fecha_ingreso || null,
      tipo_contrato: nuevo.tipo_contrato,
      periodicidad_pago: nuevo.periodicidad_pago,
      fecha_fin_contrato: nuevo.fecha_fin_contrato || null,
      arl_tarifa: nuevo.arl_tarifa !== '' && Number(nuevo.arl_tarifa) > 0 ? Number(nuevo.arl_tarifa) / 100 : null,
      arl_riesgo: nuevo.arl_riesgo ? Number(nuevo.arl_riesgo) : null,
      fecha_retiro: nuevo.estado === 'retirado' ? (nuevo.fecha_retiro || null) : null,
      salario: nuevo.salario ? parseFloat(nuevo.salario) : null,
      eps: nuevo.eps, arl: nuevo.arl, fondo_pensiones: nuevo.fondo_pensiones, caja_compensacion: nuevo.caja_compensacion,
      estado: nuevo.estado, apto_produccion: nuevo.apto_produccion,
      notas_laborales: nuevo.notas_laborales,
      motivo_retiro: nuevo.estado === 'retirado' ? nuevo.motivo_retiro : null,
      contacto_emergencia_nombre: nuevo.contacto_emergencia_nombre,
      contacto_emergencia_parentesco: nuevo.contacto_emergencia_parentesco,
      contacto_emergencia_telefono: nuevo.contacto_emergencia_telefono,
      contacto_emergencia_info: nuevo.contacto_emergencia_info,
      informacion_adicional: nuevo.informacion_adicional
    }

    if (editando) {
      const foto_url = await subirFoto(editando.codigo)
      const { error } = await supabase.from('empleados').update({ ...payload, foto_url }).eq('id', editando.id)
      if (error) { alert('Error: ' + error.message); setGuardando(false); return }
    } else {
      const codigo = await siguienteCodigo()
      const foto_url = await subirFoto(codigo)
      const { error } = await supabase.from('empleados').insert([{ ...payload, codigo, foto_url }])
      if (error) { alert('Error: ' + error.message); setGuardando(false); return }
    }

    cerrarForm()
    setGuardando(false)
    cargar()
    cargarDotacionesProximas() // la fecha de ingreso / estado mueven el ciclo de dotación
  }

  const ejecutarEliminar = async (e) => {
    const { error } = await supabase.from('empleados').delete().eq('id', e.id)
    if (error) { alert('Error al eliminar: ' + error.message); return }
    setFichaEmpleado(null)
    cargar()
    cargarDotacionesProximas()
  }

  // ── Acceso al sistema ──
  const guardarAcceso = async () => {
    setGuardandoAcceso(true)
    const payload = {
      email: accesoForm.email ? accesoForm.email.trim().toLowerCase() : null,
      rol: accesoForm.email ? accesoForm.rol : null,
      activo: accesoForm.activo
    }
    const { error } = await supabase.from('empleados').update(payload).eq('id', fichaEmpleado.id)
    if (error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        alert('Ese correo ya está vinculado a otro empleado.')
      } else {
        alert('Error: ' + error.message)
      }
      setGuardandoAcceso(false)
      return
    }
    setEditandoAcceso(false)
    setGuardandoAcceso(false)
    await cargar()
    // Refresca la ficha abierta con los datos actualizados
    const { data } = await supabase.from('empleados').select('*').eq('id', fichaEmpleado.id).single()
    if (data) setFichaEmpleado(data)
  }

  const quitarAcceso = async () => {
    const confirmar = window.confirm('¿Quitar el acceso al sistema de este empleado? Podrás volver a asignarlo cuando quieras. Esto NO elimina su usuario en Supabase Authentication — si también quieres bloquearlo por completo, hazlo allá.')
    if (!confirmar) return
    setGuardandoAcceso(true)
    const { error } = await supabase.from('empleados').update({ email: null, rol: null, activo: true }).eq('id', fichaEmpleado.id)
    setGuardandoAcceso(false)
    if (error) { alert('Error: ' + error.message); return }
    await cargar()
    setFichaEmpleado({ ...fichaEmpleado, email: null, rol: null })
  }

  // ── Filtros y búsqueda ──
  const empleadosFiltrados = empleados.filter(e => {
    const coincideEstado = filtroEstado === 'todos' || e.estado === filtroEstado
    const texto = busqueda.trim().toLowerCase()
    const coincideBusqueda = !texto ||
      `${e.nombre} ${e.apellidos || ''}`.toLowerCase().includes(texto) ||
      (e.cedula || '').toLowerCase().includes(texto) ||
      (e.cargo || '').toLowerCase().includes(texto)
    return coincideEstado && coincideBusqueda
  })

  const novedadesHoyTotal = novedadesHoy === null ? null : new Set(novedadesHoy.map(n => n.empleado_id)).size
  const pagosPendientesTotal = pagosPendientes === null ? null : pagosPendientes.length
  const totalNovedades = novedadesHoyTotal === null || pagosPendientesTotal === null ? null : novedadesHoyTotal + pagosPendientesTotal
  const novedadHoyDe = (empleadoId) => (novedadesHoy || []).find(n => n.empleado_id === empleadoId)

  const totalActivos = empleados.filter(e => e.estado === 'activo').length

  const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }
  const seccionTitulo = { fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }
  // Encabezado tipo banner: franja roja de lado a lado con letra blanca,
  // para separar visualmente las secciones principales (Datos personales / Datos laborales)
  const tituloDestacado = { background: '#B22222', color: '#fff', fontSize: 12, fontWeight: 700, padding: '9px 14px', marginBottom: 12, marginLeft: -14, marginRight: -14, marginTop: -14, borderRadius: '8px 8px 0 0', textTransform: 'uppercase', letterSpacing: '0.03em' }
  // Misma franja pero para la ficha (sin bordes de tarjeta de los que "salirse")
  const tituloDestacadoFicha = { background: '#B22222', color: '#fff', fontSize: 12, fontWeight: 700, padding: '9px 14px', marginBottom: 12, borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.03em' }
  const seccion = { background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }

  return (
    <div>
      {modalPagoBono && (
        <PagoFormaModal titulo="Pagar bono o comisión" subtitulo={`${modalPagoBono.concepto} · ${fichaEmpleado?.nombre || ''}`} valor={Number(modalPagoBono.valor)} onConfirmar={confirmarPagoBono} onCancelar={() => setModalPagoBono(null)} />
      )}

      {/* ================= NÓMINA ================= */}
      {mostrarNomina && (
        <Nomina empleados={empleados} onCerrar={() => setMostrarNomina(false)} pedirClave={solicitarClaveGenerica} />
      )}

      {/* ================= REGISTRO DE ASISTENCIA (kiosco) ================= */}
      {mostrarKiosko && (
        <div style={{ position: 'fixed', inset: 0, background: '#F4F1ED', zIndex: 1000, overflowY: 'auto', padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>🕐 Registro de asistencia</div>
              <div style={{ fontSize: 13, color: '#5A4F47', marginTop: 4 }}>
                Toca tu foto para registrar tu entrada o tu salida · {new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
            </div>
            <button onClick={() => solicitarAccion({ nombre: 'Se necesita la contraseña para salir de esta pantalla' }, 'cerrar', 'kiosco')} style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 7, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>🔐 Cerrar</button>
          </div>

          {avisoKiosko && (
            <div style={{ background: '#E8F7EF', border: '1px solid #BFE5D0', color: '#1A9156', borderRadius: 9, padding: '12px 16px', fontSize: 15, fontWeight: 600, marginBottom: 18 }}>
              ✅ {avisoKiosko.nombre}: {avisoKiosko.tipo === 'entrada' ? 'entrada' : 'salida'} registrada a las {avisoKiosko.hora}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
            {empleados
              .filter(e => e.estado === 'activo')
              .sort((a, b) => `${a.nombre} ${a.apellidos || ''}`.localeCompare(`${b.nombre} ${b.apellidos || ''}`, 'es'))
              .map(e => {
                const ultima = ultimaMarcacionDe(e.id)
                const dentro = ultima?.tipo === 'entrada'
                const nv = novedadHoyDe(e.id)
                const nvInfo = nv ? novedadInfo(nv.tipo) : null
                return (
                  <div key={e.id} onClick={() => abrirKioscoEmpleado(e)} style={{ background: '#fff', border: `2px solid ${dentro ? '#BFE5D0' : '#DDD8CF'}`, borderRadius: 12, padding: 14, textAlign: 'center', cursor: 'pointer' }}>
                    <div style={{ width: 84, height: 84, borderRadius: '50%', background: '#F4F1ED', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, overflow: 'hidden' }}>
                      {e.foto_url ? <img src={e.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👤'}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{e.nombre}</div>
                    <div style={{ fontSize: 12, color: '#5A4F47', marginBottom: 6 }}>{e.apellidos || ''}</div>
                    {nvInfo ? (
                      <div style={{ fontSize: 11, fontWeight: 600, background: nvInfo.bg, color: nvInfo.color, borderRadius: 20, padding: '3px 8px', display: 'inline-block' }}>
                        {nvInfo.icono} {nvInfo.estado}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, fontWeight: 600, color: dentro ? '#1A9156' : ultima ? '#5A4F47' : '#9A8E85' }}>
                        {dentro ? `Dentro desde ${horaCorta(ultima.marcado_en)}` : ultima ? `Salió a las ${horaCorta(ultima.marcado_en)}` : 'Sin registro hoy'}
                      </div>
                    )}
                  </div>
                )
              })}
          </div>

          {empleadoKiosko && (
            <div onClick={cerrarModalKiosko} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              {(() => {
                const ultima = ultimaMarcacionDe(empleadoKiosko.id)
                const esSalida = ultima?.tipo === 'entrada'
                const titulos = { pin: 'Ingresa tu PIN', nuevo: 'Crea tu PIN personal', confirmar_nuevo: 'Confirma tu nuevo PIN' }
                const tecla = { padding: '14px 0', fontSize: 20, fontWeight: 700, border: '1px solid #DDD8CF', borderRadius: 10, background: '#F4F1ED', cursor: 'pointer' }
                const ocupado = verificandoPin || registrandoMarcacion
                return (
                  <div onClick={ev => ev.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: 340, maxWidth: '95vw', textAlign: 'center', boxShadow: '0 8px 28px rgba(0,0,0,0.2)' }}>
                    <div style={{ width: 90, height: 90, borderRadius: '50%', background: '#F4F1ED', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, overflow: 'hidden' }}>
                      {empleadoKiosko.foto_url ? <img src={empleadoKiosko.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👤'}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{empleadoKiosko.nombre} {empleadoKiosko.apellidos}</div>

                    {KIOSCO_REQUIERE_PIN ? (
                      <>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{titulos[pasoKiosko]}</div>
                        {pasoKiosko === 'nuevo' && (
                          <div style={{ fontSize: 11, color: '#5A4F47', marginTop: 4 }}>
                            Es tu primera vez: cambia el PIN inicial (los últimos 4 dígitos de tu cédula) por uno que solo tú sepas.
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, margin: '14px 0 8px' }}>
                          {[0, 1, 2, 3].map(i => (
                            <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < pinKiosko.length ? '#1A5FA8' : '#DDD8CF' }} />
                          ))}
                        </div>
                        <div style={{ minHeight: 34, fontSize: 12, color: errorPinKiosko ? '#B22222' : '#9A8E85', marginBottom: 8 }}>
                          {ocupado ? 'Verificando...' : errorPinKiosko || `Vas a registrar tu ${esSalida ? 'salida' : 'entrada'}`}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                            <button key={d} onClick={() => pulsarTecla(d)} disabled={ocupado} style={tecla}>{d}</button>
                          ))}
                          <div />
                          <button onClick={() => pulsarTecla('0')} disabled={ocupado} style={tecla}>0</button>
                          <button onClick={() => setPinKiosko(pinKiosko.slice(0, -1))} disabled={ocupado} style={tecla}>⌫</button>
                        </div>
                      </>
                    ) : (
                      <button onClick={() => registrarMarcacion(empleadoKiosko)} disabled={registrandoMarcacion} style={{ width: '100%', padding: '14px 0', border: 'none', borderRadius: 9, background: esSalida ? '#C07D00' : '#1A9156', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
                        {registrandoMarcacion ? 'Registrando...' : esSalida ? '🚪 Registrar mi salida' : '✅ Registrar mi entrada'}
                      </button>
                    )}
                    <button onClick={cerrarModalKiosko} style={{ width: '100%', padding: '10px 0', border: '1px solid #DDD8CF', borderRadius: 9, background: '#fff', fontSize: 13, cursor: 'pointer' }}>No soy yo / Cancelar</button>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* ================= MODAL: pedir contraseña ================= */}
      {pidiendoClave && (
        <div onClick={() => setPidiendoClave(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 26, width: 380, maxWidth: '95vw', boxShadow: '0 8px 28px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 42, height: 42, background: '#E8F0FB', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🔐</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>
                  {pidiendoClave.tipo === 'documento'
                    ? (pidiendoClave.accion === 'eliminar' ? 'Eliminar documento' : 'Editar documento')
                    : pidiendoClave.tipo === 'capacitacion'
                    ? (pidiendoClave.accion === 'eliminar' ? 'Eliminar capacitación' : 'Editar capacitación')
                    : pidiendoClave.tipo === 'dotacion'
                    ? (pidiendoClave.accion === 'eliminar' ? 'Eliminar dotación' : 'Editar dotación')
                    : pidiendoClave.tipo === 'novedad'
                    ? (pidiendoClave.accion === 'eliminar' ? 'Eliminar novedad' : 'Editar novedad')
                    : pidiendoClave.tipo === 'marcacion'
                    ? 'Eliminar marcación'
                    : pidiendoClave.tipo === 'generico'
                    ? pidiendoClave.objetivo.titulo
                    : pidiendoClave.tipo === 'pago'
                    ? (pidiendoClave.accion === 'eliminar' ? 'Eliminar pago o descuento' : pidiendoClave.accion === 'pagar' ? 'Marcar como pagado' : 'Editar pago o descuento')
                    : pidiendoClave.tipo === 'pin'
                    ? 'Restablecer PIN de registro'
                    : pidiendoClave.tipo === 'kiosco'
                    ? 'Cerrar registro de asistencia'
                    : (pidiendoClave.accion === 'eliminar' ? 'Eliminar empleado' : pidiendoClave.accion === 'acceso' ? 'Editar acceso al sistema' : 'Editar empleado')}
                </div>
                <div style={{ fontSize: 12, color: '#9A8E85' }}>
                  {pidiendoClave.tipo === 'documento'
                    ? tipoDocLabel(pidiendoClave.objetivo.tipo)
                    : pidiendoClave.tipo === 'capacitacion'
                    ? pidiendoClave.objetivo.tema
                    : pidiendoClave.tipo === 'dotacion'
                    ? `${pidiendoClave.objetivo.fecha_entrega} · ${pidiendoClave.objetivo.prendas}`
                    : pidiendoClave.tipo === 'novedad'
                    ? `${novedadInfo(pidiendoClave.objetivo.tipo).label} · ${pidiendoClave.objetivo.fecha_inicio}`
                    : pidiendoClave.tipo === 'marcacion'
                    ? `${pidiendoClave.objetivo.tipo === 'entrada' ? 'Entrada' : 'Salida'} · ${new Date(pidiendoClave.objetivo.marcado_en).toLocaleString('es-CO')}`
                    : pidiendoClave.tipo === 'generico'
                    ? pidiendoClave.objetivo.nombre
                    : pidiendoClave.tipo === 'pago'
                    ? `${pidiendoClave.objetivo.concepto} · ${fmtCOP(Number(pidiendoClave.objetivo.valor))}`
                    : pidiendoClave.tipo === 'kiosco'
                    ? pidiendoClave.objetivo.nombre
                    : `${pidiendoClave.objetivo.nombre} ${pidiendoClave.objetivo.apellidos || ''}`}
                </div>
              </div>
            </div>
            <label style={{ fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 5 }}>🔐 CONTRASEÑA DE AUTORIZACIÓN</label>
            <input
              type="password"
              value={claveInput}
              onChange={e => { setClaveInput(e.target.value); setClaveError('') }}
              onKeyDown={e => e.key === 'Enter' && confirmarClave()}
              placeholder="Ingresa la contraseña"
              style={{ width: '100%', padding: '9px 12px', border: `1px solid ${claveError ? '#B22222' : '#DDD8CF'}`, borderRadius: 7, fontSize: 13, background: '#F4F1ED', outline: 'none', boxSizing: 'border-box' }}
            />
            {claveError && <div style={{ fontSize: 12, color: '#B22222', marginTop: 5 }}>⚠️ {claveError}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button onClick={() => setPidiendoClave(null)} style={{ padding: '8px 18px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={confirmarClave} style={{ padding: '8px 18px', background: pidiendoClave.accion === 'eliminar' ? '#B22222' : '#1A5FA8', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Continuar</button>
            </div>
          </div>
        </div>
      )}

      {/* ================= FORMULARIO NUEVO/EDITAR EMPLEADO ================= */}
      {mostrarForm && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
            {editando ? `✏️ Editando: ${editando.nombre} ${editando.apellidos || ''}` : 'Nuevo empleado'}
          </div>

          <div style={seccion}>
            <div style={tituloDestacado}>Datos personales</div>

            <div style={{ display: 'flex', gap: 16, marginBottom: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 84, height: 84, borderRadius: '50%', border: '2px dashed #DDD8CF', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                {fotoPreview
                  ? <img src={fotoPreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 30 }}>👤</span>
                }
              </div>
              <div style={{ flex: 1 }}>
                <label style={lbl}>FOTO DEL EMPLEADO</label>
                <input type="file" accept="image/*" onChange={seleccionarFoto} style={{ ...inp, padding: 6 }} />
                <div style={{ fontSize: 10, color: '#9A8E85', marginTop: 4 }}>
                  {editando ? 'Deja este campo vacío para conservar la foto actual.' : 'Opcional. Formatos: JPG, PNG.'}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>NOMBRES *</label>
                <input value={nuevo.nombre} onChange={e => setNuevo({...nuevo, nombre: e.target.value})} placeholder="Ej. María" style={inp} />
              </div>
              <div>
                <label style={lbl}>APELLIDOS</label>
                <input value={nuevo.apellidos} onChange={e => setNuevo({...nuevo, apellidos: e.target.value})} placeholder="Ej. Gómez" style={inp} />
              </div>
              <div>
                <label style={lbl}>CÉDULA</label>
                <input value={nuevo.cedula} onChange={e => setNuevo({...nuevo, cedula: e.target.value})} placeholder="1234567890" style={inp} />
              </div>
              <div>
                <label style={lbl}>FECHA DE NACIMIENTO</label>
                <input type="date" value={nuevo.fecha_nacimiento} onChange={e => setNuevo({...nuevo, fecha_nacimiento: e.target.value})} style={inp} />
              </div>
              <div>
                <label style={lbl}>TELÉFONO</label>
                <input value={nuevo.telefono} onChange={e => setNuevo({...nuevo, telefono: e.target.value})} placeholder="310 000 0000" style={inp} />
              </div>
              <div>
                <label style={lbl}>CORREO ELECTRÓNICO (personal)</label>
                <input type="email" value={nuevo.correo_personal} onChange={e => setNuevo({...nuevo, correo_personal: e.target.value})} placeholder="correo@ejemplo.com" style={inp} />
              </div>
              <div>
                <label style={lbl}>CIUDAD</label>
                <input value={nuevo.ciudad} onChange={e => setNuevo({...nuevo, ciudad: e.target.value})} placeholder="Ej. Medellín" style={inp} />
              </div>
              <div>
                <label style={lbl}>DIRECCIÓN</label>
                <input value={nuevo.direccion} onChange={e => setNuevo({...nuevo, direccion: e.target.value})} placeholder="Dirección completa" style={inp} />
              </div>
            </div>
          </div>

          <div style={seccion}>
            <div style={tituloDestacado}>Datos laborales</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>CARGO</label>
                <input value={nuevo.cargo} onChange={e => setNuevo({...nuevo, cargo: e.target.value})} placeholder="Ej. Operario de Producción" style={inp} />
              </div>
              <div>
                <label style={lbl}>ÁREA</label>
                <input value={nuevo.area} onChange={e => setNuevo({...nuevo, area: e.target.value})} placeholder="Ej. Producción" style={inp} />
              </div>
              <div>
                <label style={lbl}>FECHA DE INGRESO</label>
                <input type="date" value={nuevo.fecha_ingreso} onChange={e => setNuevo({...nuevo, fecha_ingreso: e.target.value})} style={inp} />
              </div>
              <div>
                <label style={lbl}>TIPO DE CONTRATO</label>
                <input value={nuevo.tipo_contrato} onChange={e => setNuevo({...nuevo, tipo_contrato: e.target.value})} placeholder="Ej. Término indefinido" style={inp} />
              </div>
              <div>
                <label style={lbl}>SALARIO</label>
                <input type="number" value={nuevo.salario} onChange={e => setNuevo({...nuevo, salario: e.target.value})} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={lbl}>PERIODICIDAD DE PAGO</label>
                <select value={nuevo.periodicidad_pago} onChange={e => setNuevo({...nuevo, periodicidad_pago: e.target.value})} style={inp}>
                  <option value="semanal">Semanal</option>
                  <option value="quincenal">Quincenal</option>
                  <option value="mensual">Mensual</option>
                </select>
              </div>
              <div>
                <label style={lbl}>FECHA DE FIN DE CONTRATO <span style={{ fontSize: 9 }}>(solo término fijo)</span></label>
                <input type="date" value={nuevo.fecha_fin_contrato} onChange={e => setNuevo({...nuevo, fecha_fin_contrato: e.target.value})} style={inp} />
              </div>
              <div>
                <label style={lbl}>ESTADO</label>
                <select value={nuevo.estado} onChange={e => setNuevo({...nuevo, estado: e.target.value})} style={inp}>
                  {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>EPS</label>
                <input value={nuevo.eps} onChange={e => setNuevo({...nuevo, eps: e.target.value})} placeholder="Ej. Sura" style={inp} />
              </div>
              <div>
                <label style={lbl}>ARL</label>
                <input value={nuevo.arl} onChange={e => setNuevo({...nuevo, arl: e.target.value})} placeholder="Ej. Sura" style={inp} />
              </div>
              <div>
                <label style={lbl}>RIESGO ARL</label>
                <select value={nuevo.arl_riesgo} onChange={e => setNuevo({...nuevo, arl_riesgo: e.target.value})} style={inp}>
                  <option value="">Sin definir (usa la tarifa de la empresa)</option>
                  <option value="1">Clase I — mínimo (0,522%)</option>
                  <option value="2">Clase II — bajo (1,044%)</option>
                  <option value="3">Clase III — medio (2,436%)</option>
                  <option value="4">Clase IV — alto (4,350%)</option>
                  <option value="5">Clase V — máximo (6,960%)</option>
                </select>
              </div>
              <div>
                <label style={lbl}>TARIFA ARL EXACTA (%) <span style={{ fontSize: 9 }}>(opcional: si tu ARL te cobra otra dentro de la clase)</span></label>
                <input type="number" step="0.001" min="0" value={nuevo.arl_tarifa} onChange={e => setNuevo({...nuevo, arl_tarifa: e.target.value})} placeholder="Ej. 2.436" style={inp} />
              </div>
              <div>
                <label style={lbl}>FONDO DE PENSIONES</label>
                <input value={nuevo.fondo_pensiones} onChange={e => setNuevo({...nuevo, fondo_pensiones: e.target.value})} placeholder="Ej. Porvenir" style={inp} />
              </div>
              <div>
                <label style={lbl}>CAJA DE COMPENSACIÓN</label>
                <input value={nuevo.caja_compensacion} onChange={e => setNuevo({...nuevo, caja_compensacion: e.target.value})} placeholder="Ej. Comfama" style={inp} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 18 }}>
                <input type="checkbox" checked={nuevo.apto_produccion} onChange={e => setNuevo({...nuevo, apto_produccion: e.target.checked})} id="apto" />
                <label htmlFor="apto" style={{ fontSize: 13, cursor: 'pointer' }}>Apto para producción</label>
              </div>
              {nuevo.estado === 'retirado' && (
                <>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>MOTIVO DEL RETIRO *</label>
                  <input value={nuevo.motivo_retiro} onChange={e => setNuevo({...nuevo, motivo_retiro: e.target.value})} placeholder="Ej. Renuncia voluntaria" style={inp} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lbl}>FECHA DE RETIRO (se usa en la liquidación)</label>
                  <input type="date" value={nuevo.fecha_retiro} onChange={e => setNuevo({...nuevo, fecha_retiro: e.target.value})} style={inp} />
                </div>
                </>
              )}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>INFORMACIÓN LABORAL ADICIONAL</label>
                <textarea value={nuevo.notas_laborales} onChange={e => setNuevo({...nuevo, notas_laborales: e.target.value})} placeholder="Notas laborales..." style={{ ...inp, height: 60, resize: 'none' }} />
              </div>
            </div>
          </div>

          <div style={seccion}>
            <div style={seccionTitulo}>CONTACTO DE EMERGENCIA</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={lbl}>NOMBRE</label>
                <input value={nuevo.contacto_emergencia_nombre} onChange={e => setNuevo({...nuevo, contacto_emergencia_nombre: e.target.value})} placeholder="Nombre completo" style={inp} />
              </div>
              <div>
                <label style={lbl}>PARENTESCO</label>
                <input value={nuevo.contacto_emergencia_parentesco} onChange={e => setNuevo({...nuevo, contacto_emergencia_parentesco: e.target.value})} placeholder="Ej. Hermana" style={inp} />
              </div>
              <div>
                <label style={lbl}>TELÉFONO</label>
                <input value={nuevo.contacto_emergencia_telefono} onChange={e => setNuevo({...nuevo, contacto_emergencia_telefono: e.target.value})} placeholder="310 000 0000" style={inp} />
              </div>
              <div>
                <label style={lbl}>INFORMACIÓN ADICIONAL</label>
                <input value={nuevo.contacto_emergencia_info} onChange={e => setNuevo({...nuevo, contacto_emergencia_info: e.target.value})} placeholder="Opcional" style={inp} />
              </div>
            </div>
          </div>

          <div style={seccion}>
            <div style={seccionTitulo}>INFORMACIÓN ADICIONAL</div>
            <textarea value={nuevo.informacion_adicional} onChange={e => setNuevo({...nuevo, informacion_adicional: e.target.value})} placeholder="Notas generales..." style={{ ...inp, height: 60, resize: 'none' }} />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={cerrarForm} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={guardar} disabled={guardando} style={{ padding: '8px 16px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {guardando ? 'Guardando...' : editando ? '💾 Actualizar' : 'Guardar empleado'}
            </button>
          </div>
        </div>
      )}

      {/* ================= FICHA DEL EMPLEADO ================= */}
      {fichaEmpleado && (
        <div onClick={() => { setFichaEmpleado(null); setEditandoAcceso(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 26, width: 720, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 28px rgba(0,0,0,0.15)' }}>

            {/* Encabezado */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ width: 60, height: 60, borderRadius: '50%', background: '#F4F1ED', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, overflow: 'hidden', flexShrink: 0 }}>
                  {fichaEmpleado.foto_url
                    ? <img src={fichaEmpleado.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : '👤'
                  }
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#9A8E85', fontFamily: 'monospace' }}>{fichaEmpleado.codigo}</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{fichaEmpleado.nombre} {fichaEmpleado.apellidos}</div>
                  <span style={{ background: estadoInfo(fichaEmpleado.estado).bg, color: estadoInfo(fichaEmpleado.estado).color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                    {estadoInfo(fichaEmpleado.estado).label}
                  </span>
                  {(() => {
                    const nv = novedadHoyDe(fichaEmpleado.id)
                    if (!nv) return null
                    const ni = novedadInfo(nv.tipo)
                    return <span style={{ background: ni.bg, color: ni.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, marginLeft: 6 }}>{ni.icono} {ni.estado}</span>
                  })()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => solicitarAccion(fichaEmpleado, 'editar')} style={{ background: '#FEF3DC', color: '#C07D00', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>✏️ Editar</button>
                <button onClick={() => solicitarAccion(fichaEmpleado, 'eliminar')} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>🗑️</button>
                <span onClick={() => { setFichaEmpleado(null); setEditandoAcceso(false) }} style={{ cursor: 'pointer', fontSize: 20, color: '#9A8E85', padding: '0 4px' }}>×</span>
              </div>
            </div>

            {fichaEmpleado.estado === 'retirado' && fichaEmpleado.motivo_retiro && (
              <div style={{ background: '#FCEAEA', border: '1px solid #F5C6C6', borderRadius: 7, padding: 10, fontSize: 12, color: '#B22222', marginBottom: 16 }}>
                <b>Motivo del retiro:</b> {fichaEmpleado.motivo_retiro}
              </div>
            )}

            {/* Estado por novedad vigente hoy */}
            {(() => {
              const nv = novedadHoyDe(fichaEmpleado.id)
              if (!nv) return null
              const ni = novedadInfo(nv.tipo)
              return (
                <div style={{ background: ni.bg, border: `1px solid ${ni.color}55`, color: ni.color, borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16, fontWeight: 600 }}>
                  {ni.icono} {ni.estado} · del {fechaLarga(nv.fecha_inicio)} al {fechaLarga(nv.fecha_fin)} · regresa el {fechaLarga(fechaReintegro(nv.fecha_fin))}
                  {nv.motivo ? <span style={{ fontWeight: 400 }}> · {nv.motivo}</span> : null}
                </div>
              )
            })()}

            {/* Datos personales */}
            <div style={{ marginBottom: 18 }}>
              <div style={tituloDestacadoFicha}>Datos personales</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, padding: '0 2px' }}>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>CÉDULA</span><br/>{fichaEmpleado.cedula || '—'}</div>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>FECHA DE NACIMIENTO</span><br/>{fichaEmpleado.fecha_nacimiento || '—'}</div>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>TELÉFONO</span><br/>{fichaEmpleado.telefono || '—'}</div>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>CORREO PERSONAL</span><br/>{fichaEmpleado.correo_personal || '—'}</div>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>CIUDAD</span><br/>{fichaEmpleado.ciudad || '—'}</div>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>DIRECCIÓN</span><br/>{fichaEmpleado.direccion || '—'}</div>
              </div>
            </div>

            {/* Datos laborales */}
            <div style={{ marginBottom: 18 }}>
              <div style={tituloDestacadoFicha}>Datos laborales</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, padding: '0 2px' }}>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>CARGO</span><br/>{fichaEmpleado.cargo || '—'}</div>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>ÁREA</span><br/>{fichaEmpleado.area || '—'}</div>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>FECHA DE INGRESO</span><br/>{fichaEmpleado.fecha_ingreso || '—'}</div>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>TIPO DE CONTRATO</span><br/>{fichaEmpleado.tipo_contrato || '—'}</div>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>SALARIO</span><br/>{fichaEmpleado.salario ? '$' + Number(fichaEmpleado.salario).toLocaleString('es-CO') : '—'}</div>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>PERIODICIDAD DE PAGO</span><br/>{{ semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual' }[fichaEmpleado.periodicidad_pago || 'quincenal']}</div>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>EPS</span><br/>{fichaEmpleado.eps || '—'}</div>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>ARL</span><br/>{fichaEmpleado.arl || '—'}</div>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>RIESGO ARL</span><br/>{fichaEmpleado.arl_tarifa ? `Tarifa exacta ${Number((Number(fichaEmpleado.arl_tarifa) * 100).toFixed(4))}%` : fichaEmpleado.arl_riesgo ? `Clase ${['', 'I', 'II', 'III', 'IV', 'V'][fichaEmpleado.arl_riesgo]}` : <span style={{ color: '#9A8E85', fontStyle: 'italic', fontSize: 12 }}>Sin definir (usa la de la empresa)</span>}</div>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>FONDO DE PENSIONES</span><br/>{fichaEmpleado.fondo_pensiones || '—'}</div>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>CAJA DE COMPENSACIÓN</span><br/>{fichaEmpleado.caja_compensacion || '—'}</div>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>APTO PARA PRODUCCIÓN</span><br/>{fichaEmpleado.apto_produccion !== false ? '✅ Sí' : '❌ No'}</div>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>ÚLTIMO EXAMEN MÉDICO</span><br/>{ultimoExamenMedico() ? new Date(ultimoExamenMedico().fecha_emision + 'T00:00:00').toLocaleDateString('es-CO') : <span style={{ color: '#9A8E85', fontStyle: 'italic', fontSize: 12 }}>Sin registro en Documentos</span>}</div>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>DÍAS DE VACACIONES</span><br/>{cargandoNovedades ? '…' : (() => { const s = saldoVacaciones(fichaEmpleado.fecha_ingreso, novedades, diasCompensados); return s ? `${s.disponibles.toFixed(1)} disponibles` : '—' })()}</div>
                {fichaEmpleado.notas_laborales && (
                  <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#9A8E85', fontSize: 11 }}>NOTAS LABORALES</span><br/>{fichaEmpleado.notas_laborales}</div>
                )}
              </div>
            </div>

            {/* Contacto de emergencia */}
            <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 18 }}>
              <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 10 }}>🚨 CONTACTO DE EMERGENCIA</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: 13 }}>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>NOMBRE</span><br/>{fichaEmpleado.contacto_emergencia_nombre || '—'}</div>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>PARENTESCO</span><br/>{fichaEmpleado.contacto_emergencia_parentesco || '—'}</div>
                <div><span style={{ color: '#9A8E85', fontSize: 11 }}>TELÉFONO</span><br/>{fichaEmpleado.contacto_emergencia_telefono || '—'}</div>
                {fichaEmpleado.contacto_emergencia_info && (
                  <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#9A8E85', fontSize: 11 }}>INFORMACIÓN ADICIONAL</span><br/>{fichaEmpleado.contacto_emergencia_info}</div>
                )}
              </div>
            </div>

            {fichaEmpleado.informacion_adicional && (
              <div style={{ marginBottom: 18, fontSize: 13 }}>
                <span style={{ color: '#9A8E85', fontSize: 11 }}>INFORMACIÓN ADICIONAL</span><br/>{fichaEmpleado.informacion_adicional}
              </div>
            )}

            {/* Acceso al sistema */}
            <div style={{ background: '#E8F0FB', border: '1px solid #C9DCF5', borderRadius: 8, padding: 14, marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: '#1A5FA8', fontWeight: 600 }}>🔑 ACCESO AL SISTEMA</div>
                {!editandoAcceso && (
                  <button onClick={() => solicitarAccion(fichaEmpleado, 'acceso')} style={{ background: '#fff', color: '#1A5FA8', border: '1px solid #C9DCF5', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                    ✏️ {fichaEmpleado.email ? 'Editar acceso' : 'Habilitar acceso'}
                  </button>
                )}
              </div>

              {!editandoAcceso ? (
                fichaEmpleado.email ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: 13 }}>
                    <div><span style={{ color: '#9A8E85', fontSize: 11 }}>CORREO</span><br/>{fichaEmpleado.email}</div>
                    <div><span style={{ color: '#9A8E85', fontSize: 11 }}>ROL</span><br/>{rolLabel(fichaEmpleado.rol)}</div>
                    <div>
                      <span style={{ color: '#9A8E85', fontSize: 11 }}>ESTADO</span><br/>
                      {fichaEmpleado.activo !== false
                        ? <span style={{ color: '#1A9156', fontWeight: 600 }}>✅ Activo</span>
                        : <span style={{ color: '#B22222', fontWeight: 600 }}>⛔ Inactivo</span>
                      }
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#5A4F47' }}>Este empleado no tiene acceso al sistema.</div>
                )
              ) : (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                    <div>
                      <label style={lbl}>CORREO (login)</label>
                      <input type="email" value={accesoForm.email} onChange={e => setAccesoForm({...accesoForm, email: e.target.value})} placeholder="correo@ejemplo.com" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>ROL / PERMISOS</label>
                      <select value={accesoForm.rol} onChange={e => setAccesoForm({...accesoForm, rol: e.target.value})} style={inp}>
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={accesoForm.activo} onChange={e => setAccesoForm({...accesoForm, activo: e.target.checked})} id="accesoActivoFicha" />
                      <label htmlFor="accesoActivoFicha" style={{ fontSize: 13, cursor: 'pointer' }}>Acceso habilitado</label>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#5A4F47', marginBottom: 10 }}>
                    ℹ️ Esto solo vincula el correo con su rol dentro del ERP. El usuario/contraseña real todavía se crea en Supabase → Authentication (por ahora).
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => setEditandoAcceso(false)} style={{ padding: '6px 14px', border: '1px solid #DDD8CF', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
                    {fichaEmpleado.email && (
                      <button onClick={quitarAcceso} style={{ padding: '6px 14px', border: 'none', borderRadius: 6, background: '#FCEAEA', color: '#B22222', cursor: 'pointer', fontSize: 12 }}>Quitar acceso</button>
                    )}
                    <button onClick={guardarAcceso} disabled={guardandoAcceso} style={{ padding: '6px 14px', border: 'none', borderRadius: 6, background: '#1A5FA8', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                      {guardandoAcceso ? 'Guardando...' : '💾 Guardar acceso'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Tabs internas */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {TABS_FICHA.map(t => (
                <button key={t.id} onClick={() => setTabFicha(t.id)} style={{
                  padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                  cursor: 'pointer', border: 'none',
                  background: tabFicha === t.id ? '#B22222' : '#F4F1ED',
                  color: tabFicha === t.id ? '#fff' : '#5A4F47'
                }}>
                  {t.icon} {t.nombre}
                </button>
              ))}
            </div>

            {tabFicha === 'documentos' ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#9A8E85', fontWeight: 600 }}>DOCUMENTOS DEL EMPLEADO</div>
                  <button onClick={() => abrirFormDocumento()} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>＋ Agregar documento</button>
                </div>

                {mostrarFormDocumento && (
                  <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={lbl}>TIPO DE DOCUMENTO *</label>
                        <select value={nuevoDocumento.tipo} onChange={e => setNuevoDocumento({...nuevoDocumento, tipo: e.target.value})} style={inp}>
                          {TIPOS_DOCUMENTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      {nuevoDocumento.tipo === 'otro' && (
                        <div>
                          <label style={lbl}>NOMBRE DEL DOCUMENTO</label>
                          <input value={nuevoDocumento.nombre_documento} onChange={e => setNuevoDocumento({...nuevoDocumento, nombre_documento: e.target.value})} placeholder="Ej. Diploma de bachiller" style={inp} />
                        </div>
                      )}
                      <div>
                        <label style={lbl}>FECHA DE EMISIÓN</label>
                        <input type="date" value={nuevoDocumento.fecha_emision} onChange={e => setNuevoDocumento({...nuevoDocumento, fecha_emision: e.target.value})} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>FECHA DE VENCIMIENTO <span style={{ fontSize: 9 }}>(si aplica)</span></label>
                        <input type="date" value={nuevoDocumento.fecha_vencimiento} onChange={e => setNuevoDocumento({...nuevoDocumento, fecha_vencimiento: e.target.value})} style={inp} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={lbl}>ARCHIVO ADJUNTO</label>
                        <input type="file" onChange={e => setArchivoDocumento(e.target.files[0])} style={{ ...inp, padding: 6 }} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={lbl}>OBSERVACIONES</label>
                        <input value={nuevoDocumento.observaciones} onChange={e => setNuevoDocumento({...nuevoDocumento, observaciones: e.target.value})} placeholder="Notas opcionales" style={inp} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => { setMostrarFormDocumento(false); setEditandoDocumento(null) }} style={{ padding: '6px 14px', border: '1px solid #DDD8CF', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
                      <button onClick={guardarDocumento} disabled={guardandoDocumento} style={{ padding: '6px 14px', border: 'none', borderRadius: 6, background: '#B22222', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        {subiendoArchivo ? 'Subiendo archivo...' : guardandoDocumento ? 'Guardando...' : editandoDocumento ? '💾 Actualizar documento' : '💾 Guardar documento'}
                      </button>
                    </div>
                  </div>
                )}

                {cargandoDocumentos ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#9A8E85', fontSize: 13 }}>Cargando...</div>
                ) : documentos.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#9A8E85', fontSize: 13, background: '#F4F1ED', borderRadius: 8 }}>
                    Sin documentos registrados todavía.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {documentos.map(doc => {
                      const ed = estadoDocumento(doc.fecha_vencimiento)
                      return (
                        <div key={doc.id} style={{ background: '#F4F1ED', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>
                              {doc.tipo === 'otro' && doc.nombre_documento ? doc.nombre_documento : tipoDocLabel(doc.tipo)}
                            </div>
                            <div style={{ fontSize: 11, color: '#9A8E85' }}>
                              {doc.fecha_emision ? `Emitido: ${doc.fecha_emision}` : ''}
                              {doc.fecha_vencimiento ? ` · Vence: ${doc.fecha_vencimiento}` : ''}
                              {doc.observaciones ? ` · ${doc.observaciones}` : ''}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ background: ed.bg, color: ed.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{ed.label}</span>
                            {doc.archivo_url && (
                              <button onClick={() => verDocumento(doc)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>👁️ Ver</button>
                            )}
                            <button onClick={() => solicitarAccion(doc, 'editar', 'documento')} style={{ background: '#FEF3DC', color: '#C07D00', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                            <button onClick={() => solicitarAccion(doc, 'eliminar', 'documento')} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : tabFicha === 'capacitaciones' ? (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#9A8E85', fontWeight: 600 }}>CAPACITACIONES DEL EMPLEADO</div>
                  <button onClick={() => abrirFormCapacitacion()} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>＋ Agregar capacitación</button>
                </div>

                {mostrarFormCapacitacion && (
                  <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={lbl}>TEMA *</label>
                        <input value={nuevaCapacitacion.tema} onChange={e => setNuevaCapacitacion({...nuevaCapacitacion, tema: e.target.value})} placeholder="Ej. Manipulación de alimentos" style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>FECHA REALIZADA <span style={{ fontSize: 9 }}>(vacío = pendiente)</span></label>
                        <input type="date" value={nuevaCapacitacion.fecha} onChange={e => setNuevaCapacitacion({...nuevaCapacitacion, fecha: e.target.value})} style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>RESPONSABLE / ENTIDAD</label>
                        <input value={nuevaCapacitacion.responsable} onChange={e => setNuevaCapacitacion({...nuevaCapacitacion, responsable: e.target.value})} placeholder="Ej. ARL Sura" style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>FECHA DE VENCIMIENTO <span style={{ fontSize: 9 }}>(si aplica)</span></label>
                        <input type="date" value={nuevaCapacitacion.fecha_vencimiento} onChange={e => setNuevaCapacitacion({...nuevaCapacitacion, fecha_vencimiento: e.target.value})} style={inp} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={lbl}>CERTIFICADO (archivo)</label>
                        <input type="file" onChange={e => setArchivoCertificado(e.target.files[0])} style={{ ...inp, padding: 6 }} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={lbl}>OBSERVACIONES</label>
                        <input value={nuevaCapacitacion.observaciones} onChange={e => setNuevaCapacitacion({...nuevaCapacitacion, observaciones: e.target.value})} placeholder="Notas opcionales" style={inp} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => { setMostrarFormCapacitacion(false); setEditandoCapacitacion(null) }} style={{ padding: '6px 14px', border: '1px solid #DDD8CF', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
                      <button onClick={guardarCapacitacion} disabled={guardandoCapacitacion} style={{ padding: '6px 14px', border: 'none', borderRadius: 6, background: '#B22222', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        {subiendoCertificado ? 'Subiendo archivo...' : guardandoCapacitacion ? 'Guardando...' : editandoCapacitacion ? '💾 Actualizar' : '💾 Guardar capacitación'}
                      </button>
                    </div>
                  </div>
                )}

                {cargandoCapacitaciones ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#9A8E85', fontSize: 13 }}>Cargando...</div>
                ) : capacitaciones.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#9A8E85', fontSize: 13, background: '#F4F1ED', borderRadius: 8 }}>
                    Sin capacitaciones registradas todavía.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {capacitaciones.map(cap => {
                      const ec = estadoCapacitacion(cap.fecha, cap.fecha_vencimiento)
                      return (
                        <div key={cap.id} style={{ background: '#F4F1ED', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{cap.tema}</div>
                            <div style={{ fontSize: 11, color: '#9A8E85' }}>
                              {cap.fecha ? `Realizada: ${cap.fecha}` : ''}
                              {cap.responsable ? ` · ${cap.responsable}` : ''}
                              {cap.fecha_vencimiento ? ` · Vence: ${cap.fecha_vencimiento}` : ''}
                              {cap.observaciones ? ` · ${cap.observaciones}` : ''}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ background: ec.bg, color: ec.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{ec.label}</span>
                            {cap.certificado_url && (
                              <button onClick={() => verCertificado(cap)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>👁️ Ver</button>
                            )}
                            <button onClick={() => solicitarAccion(cap, 'editar', 'capacitacion')} style={{ background: '#FEF3DC', color: '#C07D00', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                            <button onClick={() => solicitarAccion(cap, 'eliminar', 'capacitacion')} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : tabFicha === 'dotaciones' ? (
              <div>
                {/* Resumen del ciclo */}
                {(() => {
                  const est = estadoDotacion(fichaEmpleado.fecha_ingreso, ultimaDotacionOrdinaria())
                  return (
                    <div style={{ background: '#F4F1ED', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#9A8E85' }}>PRÓXIMA DOTACIÓN</div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{est.proxima ? new Date(est.proxima + 'T00:00:00').toLocaleDateString('es-CO') : '—'}</div>
                      </div>
                      <span style={{ background: est.bg, color: est.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{est.label}</span>
                    </div>
                  )
                })()}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#9A8E85', fontWeight: 600 }}>DOTACIONES ENTREGADAS</div>
                  <button onClick={() => abrirFormDotacion()} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>＋ Registrar entrega</button>
                </div>

                {mostrarFormDotacion && (
                  <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={lbl}>TIPO DE ENTREGA *</label>
                        <select value={nuevaDotacion.tipo_entrega} onChange={e => setNuevaDotacion({...nuevaDotacion, tipo_entrega: e.target.value})} style={inp}>
                          <option value="ordinaria">Ordinaria (ciclo de 6 meses)</option>
                          <option value="adicional">Adicional (desgaste / higiene)</option>
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>FECHA DE ENTREGA *</label>
                        <input type="date" value={nuevaDotacion.fecha_entrega} onChange={e => setNuevaDotacion({...nuevaDotacion, fecha_entrega: e.target.value})} style={inp} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={lbl}>PRENDAS ENTREGADAS *</label>
                        <input value={nuevaDotacion.prendas} onChange={e => setNuevaDotacion({...nuevaDotacion, prendas: e.target.value})} placeholder="Ej. Camisa, pantalón, botas" style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>TALLA(S)</label>
                        <input value={nuevaDotacion.talla} onChange={e => setNuevaDotacion({...nuevaDotacion, talla: e.target.value})} placeholder="Ej. M / 32 / 40" style={inp} />
                      </div>
                      <div>
                        <label style={lbl}>ENTREGADO POR</label>
                        <input value={nuevaDotacion.entregado_por} onChange={e => setNuevaDotacion({...nuevaDotacion, entregado_por: e.target.value})} placeholder="Nombre de quien entrega" style={inp} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={lbl}>SOPORTE (acta firmada / foto)</label>
                        <input type="file" onChange={e => setArchivoSoporte(e.target.files[0])} style={{ ...inp, padding: 6 }} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={lbl}>OBSERVACIONES</label>
                        <input value={nuevaDotacion.observaciones} onChange={e => setNuevaDotacion({...nuevaDotacion, observaciones: e.target.value})} placeholder="Notas opcionales" style={inp} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => { setMostrarFormDotacion(false); setEditandoDotacion(null) }} style={{ padding: '6px 14px', border: '1px solid #DDD8CF', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
                      <button onClick={guardarDotacion} disabled={guardandoDotacion} style={{ padding: '6px 14px', border: 'none', borderRadius: 6, background: '#B22222', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        {subiendoSoporte ? 'Subiendo archivo...' : guardandoDotacion ? 'Guardando...' : editandoDotacion ? '💾 Actualizar' : '💾 Guardar entrega'}
                      </button>
                    </div>
                  </div>
                )}

                {cargandoDotaciones ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#9A8E85', fontSize: 13 }}>Cargando...</div>
                ) : dotaciones.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#9A8E85', fontSize: 13, background: '#F4F1ED', borderRadius: 8 }}>
                    Sin dotaciones registradas todavía.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {dotaciones.map(dot => (
                      <div key={dot.id} style={{ background: '#F4F1ED', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{dot.prendas}</div>
                          <div style={{ fontSize: 11, color: '#9A8E85' }}>
                            {`Entregada: ${dot.fecha_entrega}`}
                            {dot.talla ? ` · Talla: ${dot.talla}` : ''}
                            {dot.entregado_por ? ` · Por: ${dot.entregado_por}` : ''}
                            {dot.observaciones ? ` · ${dot.observaciones}` : ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            background: dot.tipo_entrega === 'ordinaria' ? '#E8F7EF' : '#FEF3DC',
                            color: dot.tipo_entrega === 'ordinaria' ? '#1A9156' : '#C07D00',
                            padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600
                          }}>{dot.tipo_entrega === 'ordinaria' ? 'Ordinaria' : 'Adicional'}</span>
                          {dot.soporte_url && (
                            <button onClick={() => verSoporteDotacion(dot)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>👁️ Ver</button>
                          )}
                          <button onClick={() => solicitarAccion(dot, 'editar', 'dotacion')} style={{ background: '#FEF3DC', color: '#C07D00', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                          <button onClick={() => solicitarAccion(dot, 'eliminar', 'dotacion')} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : tabFicha === 'asistencia' ? (
              <div>
                {/* PIN de registro */}
                {(() => {
                  const mapa = {
                    personalizado: ['🔒 Personalizado', '#1A9156'],
                    inicial: ['🔑 Inicial (últimos 4 dígitos de la cédula): lo cambia al registrar por primera vez', '#C07D00'],
                    sin_cedula: ['⚠️ Sin cédula registrada: no puede registrar asistencia', '#B22222'],
                    bloqueado: ['⛔ Bloqueado por intentos fallidos (15 minutos)', '#B22222'],
                  }
                  const [texto, color] = mapa[estadoPinFicha] || ['…', '#9A8E85']
                  return (
                    <div style={{ background: '#F4F1ED', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#9A8E85' }}>PIN DE REGISTRO</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color }}>{texto}</div>
                      </div>
                      <button onClick={() => solicitarAccion(fichaEmpleado, 'restablecer', 'pin')} style={{ background: '#fff', color: '#5A4F47', border: '1px solid #DDD8CF', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>↺ Restablecer PIN</button>
                    </div>
                  )
                })()}

                {/* Vacaciones */}
                {(() => {
                  const s = saldoVacaciones(fichaEmpleado.fecha_ingreso, novedades, diasCompensados)
                  const caja = { background: '#F4F1ED', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }
                  return (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10 }}>
                        <div style={caja}><div style={{ fontSize: 11, color: '#9A8E85' }}>CAUSADAS</div><div style={{ fontSize: 18, fontWeight: 700 }}>{s ? s.causados.toFixed(1) : '—'}</div></div>
                        <div style={caja}><div style={{ fontSize: 11, color: '#9A8E85' }}>TOMADAS</div><div style={{ fontSize: 18, fontWeight: 700, color: '#1A5FA8' }}>{s ? s.tomados : '—'}</div></div>
                        <div style={caja}><div style={{ fontSize: 11, color: '#9A8E85' }}>DISPONIBLES</div><div style={{ fontSize: 18, fontWeight: 700, color: '#1A9156' }}>{s ? s.disponibles.toFixed(1) : '—'}</div></div>
                        <div style={caja}><div style={{ fontSize: 11, color: '#9A8E85' }}>PROGRAMADAS</div><div style={{ fontSize: 18, fontWeight: 700, color: '#C07D00' }}>{s ? s.programados : '—'}</div></div>
                      </div>
                      <div style={{ fontSize: 10, color: '#9A8E85', marginTop: 6 }}>
                        Días hábiles de vacaciones: 15 por año de servicio, causados día a día desde la fecha de ingreso.
                        {SABADO_CUENTA_PARA_VACACIONES ? ' El sábado cuenta como hábil.' : ' El sábado no cuenta como hábil.'}
                      </div>
                    </div>
                  )
                })()}

                {/* Modo de control */}
                <div style={{ background: CONTROL_COMPLETO_DESDE ? '#E8F7EF' : '#E8F0FB', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: CONTROL_COMPLETO_DESDE ? '#1A9156' : '#1A5FA8', marginBottom: 14 }}>
                  {CONTROL_COMPLETO_DESDE
                    ? `Control completo activo desde ${CONTROL_COMPLETO_DESDE}: un día laboral sin marcación ni novedad aparece como "Sin registro".`
                    : 'Registro de entrada y salida opcional: un día laboral sin novedad cuenta como asistencia.'}
                </div>

                {/* Calendario del mes */}
                {(() => {
                  const { anio, mes } = mesAsistencia
                  const diasMes = new Date(anio, mes + 1, 0).getDate()
                  const huecos = (new Date(anio, mes, 1).getDay() + 6) % 7 // semana de lunes a domingo
                  const porDia = {}
                  for (const m of marcacionesMes) {
                    const k = fmtISO(new Date(m.marcado_en))
                    if (!porDia[k]) porDia[k] = []
                    porDia[k].push(m)
                  }
                  let asistio = 0, conNovedad = 0, sinRegistro = 0
                  const celdas = []
                  for (let i = 0; i < huecos; i++) celdas.push(<div key={`h${i}`} />)
                  for (let d = 1; d <= diasMes; d++) {
                    const iso = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                    const marcs = porDia[iso] || []
                    const est = estadoDiaAsistencia(iso, fichaEmpleado.fecha_ingreso, novedades, marcs)
                    let bg = '#fff', color = '#C4BDB4', texto = ''
                    if (est.tipo === 'asistio') {
                      bg = '#E8F7EF'; color = '#1A9156'; asistio++
                      texto = marcs.length ? (marcs.length > 1 ? `${horaCorta(marcs[0].marcado_en)}–${horaCorta(marcs[marcs.length - 1].marcado_en)}` : horaCorta(marcs[0].marcado_en)) : '✓'
                    } else if (est.tipo === 'novedad') {
                      const ni = novedadInfo(est.novedad.tipo)
                      bg = ni.bg; color = ni.color; texto = ni.label.split(' ')[0]
                      if (esDiaLaboral(iso)) conNovedad++
                    } else if (est.tipo === 'no_laboral') {
                      bg = est.festivo ? '#EEF1F8' : '#F0ECE5'; color = '#9A8E85'; texto = est.festivo ? 'Festivo' : ''
                    } else if (est.tipo === 'sin_registro') {
                      bg = '#FCEAEA'; color = '#B22222'; texto = 'Sin registro'; sinRegistro++
                    }
                    celdas.push(
                      <div key={iso} title={marcs.map(m => `${m.tipo === 'entrada' ? 'Entrada' : 'Salida'} ${horaCorta(m.marcado_en)}`).join(' · ')} style={{ background: bg, color, borderRadius: 6, padding: '4px 3px', minHeight: 44, textAlign: 'center', border: '1px solid #EDE8DF' }}>
                        <div style={{ fontSize: 11, fontWeight: 700 }}>{d}</div>
                        <div style={{ fontSize: 9, lineHeight: 1.2 }}>{texto}</div>
                      </div>
                    )
                  }
                  const cambiarMes = (delta) => {
                    const f = new Date(anio, mes + delta, 1)
                    setMesAsistencia({ anio: f.getFullYear(), mes: f.getMonth() })
                  }
                  return (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <button onClick={() => cambiarMes(-1)} style={{ background: '#F4F1ED', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>◀</button>
                        <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>{new Date(anio, mes, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}</div>
                        <button onClick={() => cambiarMes(1)} style={{ background: '#F4F1ED', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>▶</button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(n => (
                          <div key={n} style={{ fontSize: 10, color: '#9A8E85', textAlign: 'center', fontWeight: 600 }}>{n}</div>
                        ))}
                        {celdas}
                      </div>
                      <div style={{ fontSize: 11, color: '#5A4F47', marginTop: 8 }}>
                        Este mes: <b>{asistio}</b> días de asistencia · <b>{conNovedad}</b> con novedad{CONTROL_COMPLETO_DESDE ? <> · <b>{sinRegistro}</b> sin registro</> : null}
                      </div>
                    </div>
                  )
                })()}

                {/* Novedades */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#9A8E85', fontWeight: 600 }}>NOVEDADES (ausencias, incapacidades, permisos, vacaciones…)</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => abrirFormNovedad(null, 'vacaciones')} style={{ background: '#1A5FA8', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>🏖️ Programar vacaciones</button>
                    <button onClick={() => abrirFormNovedad()} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>＋ Registrar novedad</button>
                  </div>
                </div>

                {mostrarFormNovedad && (
                  <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={lbl}>TIPO DE NOVEDAD *</label>
                        <select value={nuevaNovedad.tipo} onChange={e => { setNuevaNovedad({...nuevaNovedad, tipo: e.target.value}); setRemuneradaNovedad(remuneradaPorDefecto(e.target.value)) }} style={inp}>
                          {TIPOS_NOVEDAD.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      {nuevaNovedad.tipo === 'vacaciones' && (
                        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: '#9A8E85' }}>PROGRAMAR POR:</span>
                          {[['fechas', 'Fechas (inicio y fin)'], ['dias', 'Días hábiles']].map(([v, t]) => (
                            <button key={v} onClick={() => setModoVacaciones(v)} style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, border: 'none', cursor: 'pointer', background: modoVacaciones === v ? '#1A5FA8' : '#fff', color: modoVacaciones === v ? '#fff' : '#5A4F47' }}>{t}</button>
                          ))}
                        </div>
                      )}
                      <div>
                        <label style={lbl}>DESDE *</label>
                        <input type="date" value={nuevaNovedad.fecha_inicio} onChange={e => setNuevaNovedad({...nuevaNovedad, fecha_inicio: e.target.value, fecha_fin: nuevaNovedad.fecha_fin < e.target.value ? e.target.value : nuevaNovedad.fecha_fin})} style={inp} />
                      </div>
                      {nuevaNovedad.tipo === 'vacaciones' && modoVacaciones === 'dias' ? (
                        <div>
                          <label style={lbl}>DÍAS HÁBILES *</label>
                          <input type="number" min="1" value={diasVacaciones} onChange={e => setDiasVacaciones(e.target.value)} placeholder="Ej. 15" style={inp} />
                        </div>
                      ) : (
                        <div>
                          <label style={lbl}>HASTA *</label>
                          <input type="date" value={nuevaNovedad.fecha_fin} onChange={e => setNuevaNovedad({...nuevaNovedad, fecha_fin: e.target.value})} style={inp} />
                        </div>
                      )}
                      {(() => {
                        const ini = nuevaNovedad.fecha_inicio
                        const fin = nuevaNovedad.tipo === 'vacaciones' && modoVacaciones === 'dias' ? finPorDiasHabiles(ini, Number(diasVacaciones)) : nuevaNovedad.fecha_fin
                        if (!ini || !fin || fin < ini) return null
                        return (
                          <div style={{ gridColumn: '1 / -1', background: '#fff', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#1A5FA8', fontWeight: 600 }}>
                            {diasHabilesNovedad(nuevaNovedad.tipo, ini, fin)} día(s) hábil(es) · del {fechaLarga(ini)} al {fechaLarga(fin)} · regresa el {fechaLarga(fechaReintegro(fin))}
                          </div>
                        )
                      })()}
                      {['permiso', 'licencia', 'otro'].includes(nuevaNovedad.tipo) && (
                        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input type="checkbox" id="novedadRemunerada" checked={remuneradaNovedad} onChange={e => setRemuneradaNovedad(e.target.checked)} />
                          <label htmlFor="novedadRemunerada" style={{ fontSize: 12, color: '#5A4F47', cursor: 'pointer' }}>Tiempo remunerado (se paga normalmente en la nómina)</label>
                        </div>
                      )}
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={lbl}>MOTIVO</label>
                        <input value={nuevaNovedad.motivo} onChange={e => setNuevaNovedad({...nuevaNovedad, motivo: e.target.value})} placeholder="Ej. Cita médica, incapacidad EPS..." style={inp} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={lbl}>SOPORTE (incapacidad, carta, etc.)</label>
                        <input type="file" onChange={e => setArchivoNovedad(e.target.files[0])} style={{ ...inp, padding: 6 }} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={lbl}>OBSERVACIONES</label>
                        <input value={nuevaNovedad.observaciones} onChange={e => setNuevaNovedad({...nuevaNovedad, observaciones: e.target.value})} placeholder="Notas opcionales" style={inp} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => { setMostrarFormNovedad(false); setEditandoNovedad(null) }} style={{ padding: '6px 14px', border: '1px solid #DDD8CF', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
                      <button onClick={guardarNovedad} disabled={guardandoNovedad} style={{ padding: '6px 14px', border: 'none', borderRadius: 6, background: '#B22222', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        {subiendoSoporteNovedad ? 'Subiendo archivo...' : guardandoNovedad ? 'Guardando...' : editandoNovedad ? '💾 Actualizar' : '💾 Guardar novedad'}
                      </button>
                    </div>
                  </div>
                )}

                {cargandoNovedades ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#9A8E85', fontSize: 13 }}>Cargando...</div>
                ) : novedades.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#9A8E85', fontSize: 13, background: '#F4F1ED', borderRadius: 8 }}>
                    Sin novedades registradas. Todos los días laborales cuentan como asistencia.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                    {novedades.map(nov => {
                      const ni = novedadInfo(nov.tipo)
                      const hoyISO = fmtISO(new Date())
                      const momento = hoyISO < nov.fecha_inicio ? 'Programada' : hoyISO > nov.fecha_fin ? 'Finalizada' : 'En curso'
                      return (
                        <div key={nov.id} style={{ background: '#F4F1ED', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>
                              {nov.fecha_inicio === nov.fecha_fin ? nov.fecha_inicio : `${nov.fecha_inicio} → ${nov.fecha_fin}`}
                              <span style={{ fontSize: 10, fontWeight: 600, marginLeft: 8, color: momento === 'En curso' ? '#1A9156' : momento === 'Programada' ? '#C07D00' : '#9A8E85' }}>{momento}</span>
                            </div>
                            <div style={{ fontSize: 11, color: '#9A8E85' }}>
                              {diasHabilesNovedad(nov.tipo, nov.fecha_inicio, nov.fecha_fin)} día(s) hábil(es) · regresa el {fechaLarga(fechaReintegro(nov.fecha_fin))}
                              {nov.motivo ? ` · ${nov.motivo}` : ''}
                              {nov.observaciones ? ` · ${nov.observaciones}` : ''}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ background: ni.bg, color: ni.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{ni.label}</span>
                            {nov.soporte_url && (
                              <button onClick={() => verSoporteNovedad(nov)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>👁️ Ver</button>
                            )}
                            <button onClick={() => solicitarAccion(nov, 'editar', 'novedad')} style={{ background: '#FEF3DC', color: '#C07D00', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                            <button onClick={() => solicitarAccion(nov, 'eliminar', 'novedad')} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Marcaciones del mes */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#9A8E85', fontWeight: 600 }}>MARCACIONES DEL MES (entrada / salida)</div>
                  <button onClick={() => setMostrarFormMarcacion(true)} style={{ background: '#fff', color: '#5A4F47', border: '1px solid #DDD8CF', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>＋ Marcación manual</button>
                </div>

                {mostrarFormMarcacion && (
                  <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                      <div>
                        <label style={lbl}>TIPO *</label>
                        <select value={nuevaMarcacion.tipo} onChange={e => setNuevaMarcacion({...nuevaMarcacion, tipo: e.target.value})} style={inp}>
                          <option value="entrada">Entrada</option>
                          <option value="salida">Salida</option>
                        </select>
                      </div>
                      <div>
                        <label style={lbl}>FECHA Y HORA *</label>
                        <input type="datetime-local" value={nuevaMarcacion.fecha_hora} onChange={e => setNuevaMarcacion({...nuevaMarcacion, fecha_hora: e.target.value})} style={inp} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={lbl}>MOTIVO DE LA CORRECCIÓN</label>
                        <input value={nuevaMarcacion.observaciones} onChange={e => setNuevaMarcacion({...nuevaMarcacion, observaciones: e.target.value})} placeholder="Ej. Olvidó registrar su salida" style={inp} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => setMostrarFormMarcacion(false)} style={{ padding: '6px 14px', border: '1px solid #DDD8CF', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
                      <button onClick={guardarMarcacionManual} disabled={guardandoMarcacion} style={{ padding: '6px 14px', border: 'none', borderRadius: 6, background: '#B22222', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        {guardandoMarcacion ? 'Guardando...' : '💾 Guardar marcación'}
                      </button>
                    </div>
                  </div>
                )}

                {marcacionesMes.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 16, color: '#9A8E85', fontSize: 12, background: '#F4F1ED', borderRadius: 8 }}>
                    Sin marcaciones este mes. Es opcional por ahora.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                    {[...marcacionesMes].reverse().map(m => (
                      <div key={m.id} style={{ background: '#F4F1ED', borderRadius: 8, padding: '7px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <div>
                          <b>{m.tipo === 'entrada' ? 'Entrada' : 'Salida'}</b> · {new Date(m.marcado_en).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          <span style={{ color: '#9A8E85' }}> · {m.origen}{m.observaciones ? ` · ${m.observaciones}` : ''}</span>
                        </div>
                        <button onClick={() => solicitarAccion(m, 'eliminar', 'marcacion')} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : tabFicha === 'bonos' ? (
              <div>
                {/* Mes */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <button onClick={() => setMesPagos(sumarMesesPeriodo(mesPagos, -1))} style={{ background: '#F4F1ED', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>◀</button>
                  <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>{nombreMes(mesPagos)}</div>
                  <button onClick={() => setMesPagos(sumarMesesPeriodo(mesPagos, 1))} style={{ background: '#F4F1ED', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>▶</button>
                </div>

                {/* Resumen referencial del mes */}
                {(() => {
                  const r = resumenPagosMes(fichaEmpleado.salario, pagosDelMes())
                  if (!r.sal) {
                    return (
                      <div style={{ background: '#FEF3DC', color: '#C07D00', borderRadius: 8, padding: '10px 14px', fontSize: 12, marginBottom: 14 }}>
                        Este empleado no tiene salario registrado en su ficha. Regístralo (Editar) para ver el resumen del mes.
                      </div>
                    )
                  }
                  const fila = (texto, valor, o = {}) => (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, fontWeight: o.fuerte ? 700 : 400, color: o.color || '#2B2420', borderTop: o.linea ? '1px solid #DDD8CF' : 'none' }}>
                      <span>{texto}</span><span>{valor}</span>
                    </div>
                  )
                  return (
                    <div style={{ background: '#F4F1ED', borderRadius: 8, padding: '12px 16px', marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 6 }}>RESUMEN ESTIMADO DEL MES</div>
                      {fila('Salario base', fmtCOP(r.sal))}
                      {fila(r.auxilio ? 'Auxilio de transporte' : 'Auxilio de transporte (no aplica: supera 2 salarios mínimos)', fmtCOP(r.auxilio))}
                      {fila('Pagos salariales (bonos, comisiones, extras)', fmtCOP(r.salariales))}
                      {fila('Pagos no salariales', fmtCOP(r.noSalariales))}
                      {fila('Total devengado', fmtCOP(r.devengado), { fuerte: true, linea: true })}
                      {fila(`Salud del trabajador (${APORTE_SALUD_EMPLEADO * 100}%)`, '−' + fmtCOP(r.salud), { color: '#B22222' })}
                      {fila(`Pensión del trabajador (${APORTE_PENSION_EMPLEADO * 100}%)`, '−' + fmtCOP(r.pension), { color: '#B22222' })}
                      {fila('Descuentos registrados', '−' + fmtCOP(r.descuentos), { color: '#B22222' })}
                      {fila('Neto estimado a pagar', fmtCOP(r.neto), { fuerte: true, linea: true, color: '#1A9156' })}
                      <div style={{ fontSize: 10, color: '#9A8E85', marginTop: 8, lineHeight: 1.4 }}>
                        Base de cotización (IBC): {fmtCOP(r.ibc)}.
                        {r.exceso > 0 ? ` Incluye ${fmtCOP(r.exceso)} de pagos no salariales que superan el 40% de la remuneración total (Ley 1393 de 2010).` : ''}
                        {r.ibc >= 4 * SMMLV ? ' Supera 4 salarios mínimos: aplica fondo de solidaridad pensional; confírmalo con tu contador.' : ''}
                        {' '}Estimado referencial de un mes completo: no descuenta ausencias ni incapacidades, ni calcula prestaciones sociales ni aportes del empleador. Valídalo con tu contador.
                      </div>
                    </div>
                  )
                })()}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: '#9A8E85', fontWeight: 600 }}>PAGOS Y DESCUENTOS DEL MES</div>
                  <button onClick={() => abrirFormPago()} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>＋ Registrar pago o descuento</button>
                </div>

                {mostrarFormPago && (() => {
                  const ti = tipoPagoInfo(nuevoPago.tipo)
                  const esDev = ti.sentido === 'devengo'
                  const naturaleza = ti.salarialObligatorio ? 'salarial' : nuevoPago.naturaleza
                  return (
                    <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                        <div>
                          <label style={lbl}>TIPO *</label>
                          <select value={nuevoPago.tipo} onChange={e => setNuevoPago({...nuevoPago, tipo: e.target.value, soporte_escrito: false})} style={inp}>
                            <optgroup label="Pagos (suman)">
                              {TIPOS_PAGO.filter(t => t.sentido === 'devengo').map(t => <option key={t.value} value={t.value}>{t.icono} {t.label}</option>)}
                            </optgroup>
                            <optgroup label="Descuentos (restan)">
                              {TIPOS_PAGO.filter(t => t.sentido === 'deduccion').map(t => <option key={t.value} value={t.value}>{t.icono} {t.label}</option>)}
                            </optgroup>
                          </select>
                        </div>
                        {esDev ? (
                          <div>
                            <label style={lbl}>NATURALEZA *</label>
                            <select value={naturaleza} disabled={!!ti.salarialObligatorio} onChange={e => setNuevoPago({...nuevoPago, naturaleza: e.target.value, soporte_escrito: false})} style={inp}>
                              <option value="salarial">Salarial</option>
                              <option value="no_salarial">No salarial</option>
                            </select>
                          </div>
                        ) : <div />}
                        {ti.salarialObligatorio && (
                          <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#5A4F47' }}>Las horas extras y las comisiones siempre son salario.</div>
                        )}
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={lbl}>CONCEPTO *</label>
                          <input value={nuevoPago.concepto} onChange={e => setNuevoPago({...nuevoPago, concepto: e.target.value})} placeholder={esDev ? 'Ej. Bono por cumplimiento de meta' : 'Ej. Cuota de préstamo octubre'} style={inp} />
                        </div>
                        <div>
                          <label style={lbl}>VALOR (COP) *</label>
                          <input type="number" min="0" value={nuevoPago.valor} onChange={e => setNuevoPago({...nuevoPago, valor: e.target.value})} placeholder="0" style={inp} />
                        </div>
                        <div>
                          <label style={lbl}>MES AL QUE CORRESPONDE *</label>
                          <input type="month" value={nuevoPago.periodo} onChange={e => setNuevoPago({...nuevoPago, periodo: e.target.value})} style={inp} />
                        </div>
                        <div>
                          <label style={lbl}>FECHA DEL REGISTRO</label>
                          <input type="date" value={nuevoPago.fecha} onChange={e => setNuevoPago({...nuevoPago, fecha: e.target.value})} style={inp} />
                        </div>
                        <div>
                          <label style={lbl}>ESTADO</label>
                          <select value={nuevoPago.estado} onChange={e => setNuevoPago({...nuevoPago, estado: e.target.value})} style={inp}>
                            <option value="pendiente">Pendiente</option>
                            <option value="pagado">{esDev ? 'Pagado' : 'Aplicado'}</option>
                          </select>
                        </div>
                        {nuevoPago.estado === 'pagado' && (
                          <div>
                            <label style={lbl}>FECHA DE {esDev ? 'PAGO' : 'APLICACIÓN'}</label>
                            <input type="date" value={nuevoPago.fecha_pago} onChange={e => setNuevoPago({...nuevoPago, fecha_pago: e.target.value})} style={inp} />
                          </div>
                        )}
                        {((esDev && naturaleza === 'no_salarial') || !esDev) && (
                          <div style={{ gridColumn: '1 / -1', background: '#FEF3DC', borderRadius: 7, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <input type="checkbox" id="pagoSoporteEscrito" checked={nuevoPago.soporte_escrito} onChange={e => setNuevoPago({...nuevoPago, soporte_escrito: e.target.checked})} style={{ marginTop: 3 }} />
                            <label htmlFor="pagoSoporteEscrito" style={{ fontSize: 12, color: '#5A4F47', cursor: 'pointer' }}>
                              {esDev
                                ? 'Este pago está pactado por escrito como no salarial (art. 128 del CST). Sin ese pacto se considera salario.'
                                : 'Cuento con la autorización escrita del trabajador para este descuento (art. 149 del CST).'}
                            </label>
                          </div>
                        )}
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={lbl}>SOPORTE (pacto o autorización firmada, comprobante)</label>
                          <input type="file" onChange={e => setArchivoPago(e.target.files[0])} style={{ ...inp, padding: 6 }} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={lbl}>OBSERVACIONES</label>
                          <input value={nuevoPago.observaciones} onChange={e => setNuevoPago({...nuevoPago, observaciones: e.target.value})} placeholder="Notas opcionales" style={inp} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setMostrarFormPago(false); setEditandoPago(null) }} style={{ padding: '6px 14px', border: '1px solid #DDD8CF', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12 }}>Cancelar</button>
                        <button onClick={guardarPago} disabled={guardandoPago} style={{ padding: '6px 14px', border: 'none', borderRadius: 6, background: '#B22222', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                          {subiendoSoportePago ? 'Subiendo archivo...' : guardandoPago ? 'Guardando...' : editandoPago ? '💾 Actualizar' : '💾 Guardar'}
                        </button>
                      </div>
                    </div>
                  )
                })()}

                {cargandoPagos ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#9A8E85', fontSize: 13 }}>Cargando...</div>
                ) : pagosDelMes().length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 20, color: '#9A8E85', fontSize: 13, background: '#F4F1ED', borderRadius: 8 }}>
                    Sin pagos ni descuentos registrados en {nombreMes(mesPagos)}.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {pagosDelMes().map(p => {
                      const ti = tipoPagoInfo(p.tipo)
                      const esDev = p.sentido === 'devengo'
                      const pagado = p.estado === 'pagado'
                      return (
                        <div key={p.id} style={{ background: '#F4F1ED', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{ti.icono} {p.concepto}</div>
                            <div style={{ fontSize: 11, color: '#9A8E85' }}>
                              {ti.label}
                              {esDev ? ` · ${p.naturaleza === 'salarial' ? 'Salarial' : 'No salarial'}` : ''}
                              {` · ${p.fecha}`}
                              {pagado && p.fecha_pago ? ` · ${esDev ? 'Pagado' : 'Aplicado'}: ${p.fecha_pago}` : ''}
                              {p.observaciones ? ` · ${p.observaciones}` : ''}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: esDev ? '#1A9156' : '#B22222' }}>{esDev ? '+' : '−'}{fmtCOP(Number(p.valor))}</span>
                            <span style={{ background: pagado ? '#E8F7EF' : '#FEF3DC', color: pagado ? '#1A9156' : '#C07D00', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                              {pagado ? (esDev ? 'Pagado' : 'Aplicado') : 'Pendiente'}
                            </span>
                            {!pagado && (
                              <button onClick={() => solicitarAccion(p, 'pagar', 'pago')} style={{ background: '#E8F7EF', color: '#1A9156', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>✓ {esDev ? 'Marcar pagado' : 'Marcar aplicado'}</button>
                            )}
                            {p.soporte_url && (
                              <button onClick={() => verSoportePago(p)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>👁️ Ver</button>
                            )}
                            <button onClick={() => solicitarAccion(p, 'editar', 'pago')} style={{ background: '#FEF3DC', color: '#C07D00', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                            <button onClick={() => solicitarAccion(p, 'eliminar', 'pago')} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                <PagosNomina empleado={fichaEmpleado} solicitarClave={solicitarClaveGenerica} onCambio={() => { cargarPagos(fichaEmpleado.id); cargarPagosPendientes() }} />
              </div>
            ) : (
              <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 24, textAlign: 'center', color: '#9A8E85' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🚧</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {TABS_FICHA.find(t => t.id === tabFicha)?.nombre} — próximamente
                </div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Esta sección se construye en el siguiente paso.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= ENCABEZADO Y DASHBOARD ================= */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>👥 Empleados</div>
          <div style={{ fontSize: 13, color: '#5A4F47', marginTop: 4 }}>Administración del personal</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setMostrarNomina(true)} style={{ background: '#fff', color: '#5A4F47', border: '1px solid #DDD8CF', borderRadius: 7, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            💰 Nómina
          </button>
          <button onClick={() => setMostrarKiosko(true)} style={{ background: '#fff', color: '#5A4F47', border: '1px solid #DDD8CF', borderRadius: 7, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            🕐 Registro de asistencia
          </button>
          <button onClick={abrirNuevo} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            ＋ Nuevo empleado
          </button>
        </div>
      </div>

      {avisoNovedad && (
        <div style={{ background: '#E8F0FB', border: '1px solid #C9DCF5', color: '#1A5FA8', borderRadius: 9, padding: '10px 14px', fontSize: 13, fontWeight: 600, marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span>🔔 {avisoNovedad}</span>
          <span onClick={() => setAvisoNovedad(null)} style={{ cursor: 'pointer' }}>×</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 22 }}>
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>👥</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1A9156' }}>{loading ? '—' : totalActivos}</div>
          <div style={{ fontSize: 12, color: '#9A8E85' }}>Activos</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>📄</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#C07D00' }}>{documentosPorVencerTotal ?? '—'}</div>
          <div style={{ fontSize: 12, color: '#9A8E85' }}>Documentos por vencer</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>🎓</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1A5FA8' }}>{capacitacionesPorVencerTotal ?? '—'}</div>
          <div style={{ fontSize: 12, color: '#9A8E85' }}>Capacitaciones por vencer</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>👕</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#6B3FA0' }}>{dotacionesProximasTotal ?? '—'}</div>
          <div style={{ fontSize: 12, color: '#9A8E85' }}>Dotaciones próximas</div>
        </div>
        <div onClick={() => setMostrarNovedadesHoy(v => !v)} title="Ver novedades de hoy y pagos pendientes" style={{ background: '#fff', border: `1px solid ${mostrarNovedadesHoy ? '#B22222' : '#DDD8CF'}`, borderRadius: 9, padding: 16, textAlign: 'center', cursor: 'pointer' }}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>🗓️</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#B22222' }}>{totalNovedades ?? '—'}</div>
          <div style={{ fontSize: 12, color: '#9A8E85' }}>Novedades</div>
          <div style={{ fontSize: 10, color: '#9A8E85' }}>{novedadesHoyTotal ?? '—'} hoy · {pagosPendientesTotal ?? '—'} pagos pend.</div>
          <div style={{ fontSize: 10, color: '#B22222', marginTop: 2 }}>{mostrarNovedadesHoy ? 'Ocultar ▴' : 'Ver detalle ▾'}</div>
        </div>

      </div>

      {mostrarNovedadesHoy && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: '14px 16px', marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>🔔 Novedades</div>
            <span onClick={() => setMostrarNovedadesHoy(false)} style={{ cursor: 'pointer', color: '#9A8E85', fontSize: 18 }}>×</span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#5A4F47', marginBottom: 8 }}>🗓️ Con novedad hoy</div>
          {!novedadesHoy || novedadesHoy.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9A8E85' }}>Hoy nadie tiene novedades registradas.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {novedadesHoy.map(nv => {
                const emp = empleados.find(x => x.id === nv.empleado_id)
                if (!emp) return null
                const ni = novedadInfo(nv.tipo)
                return (
                  <div key={nv.id} onClick={() => { setFichaEmpleado(emp); setTabFicha('asistencia') }} style={{ background: ni.bg, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, overflow: 'hidden', flexShrink: 0 }}>
                        {emp.foto_url ? <img src={emp.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👤'}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{emp.nombre} {emp.apellidos || ''}</div>
                        <div style={{ fontSize: 11, color: '#5A4F47' }}>
                          Hasta el {fechaLarga(nv.fecha_fin)} · regresa el {fechaLarga(fechaReintegro(nv.fecha_fin))}{nv.motivo ? ` · ${nv.motivo}` : ''}
                        </div>
                      </div>
                    </div>
                    <span style={{ color: ni.color, fontWeight: 700, fontSize: 12 }}>{ni.icono} {ni.estado}</span>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 600, color: '#5A4F47', margin: '18px 0 8px' }}>💵 Pagos pendientes (bonos, comisiones, extras...)</div>
          {!pagosPendientes || pagosPendientes.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9A8E85' }}>No hay pagos pendientes.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pagosPendientes.map(p => {
                const emp = empleados.find(x => x.id === p.empleado_id)
                if (!emp) return null
                const ti = tipoPagoInfo(p.tipo)
                return (
                  <div key={p.id} onClick={() => { periodoPagoDestino.current = p.periodo; setFichaEmpleado(emp); setTabFicha('bonos') }} style={{ background: '#F4F1ED', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, overflow: 'hidden', flexShrink: 0 }}>
                        {emp.foto_url ? <img src={emp.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👤'}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{emp.nombre} {emp.apellidos || ''}</div>
                        <div style={{ fontSize: 11, color: '#5A4F47' }}>{ti.icono} {p.concepto} · {ti.label} · {nombreMes(p.periodo)}</div>
                      </div>
                    </div>
                    <span style={{ color: '#1A9156', fontWeight: 700, fontSize: 13 }}>+{fmtCOP(Number(p.valor))}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Buscador y filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="🔎 Buscar por nombre, cédula o cargo"
          style={{ flex: 1, minWidth: 220, padding: '9px 14px', border: '1px solid #DDD8CF', borderRadius: 20, fontSize: 13, background: '#fff' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <button onClick={() => setFiltroEstado('todos')} style={{
          padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none',
          background: filtroEstado === 'todos' ? '#B22222' : '#fff', color: filtroEstado === 'todos' ? '#fff' : '#5A4F47',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
        }}>Todos</button>
        {ESTADOS.map(es => (
          <button key={es.value} onClick={() => setFiltroEstado(es.value)} style={{
            padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer', border: 'none',
            background: filtroEstado === es.value ? '#B22222' : '#fff', color: filtroEstado === es.value ? '#fff' : '#5A4F47',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
          }}>{es.label}</button>
        ))}
      </div>

      {/* Lista de empleados */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85' }}>Cargando...</div>
      ) : empleadosFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No hay empleados que coincidan</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {empleadosFiltrados.map(e => {
            const ei = estadoInfo(e.estado)
            return (
              <div key={e.id} onClick={() => { setFichaEmpleado(e); setTabFicha('documentos'); setEditandoAcceso(false) }} style={{
                background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: '14px 18px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#F4F1ED', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, overflow: 'hidden' }}>
                    {e.foto_url ? <img src={e.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '👤'}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      {e.nombre} {e.apellidos}
                      <span style={{ fontSize: 11, color: '#9A8E85', fontWeight: 400, fontFamily: 'monospace', marginLeft: 8 }}>{e.codigo}</span>
                      {e.email && <span style={{ fontSize: 10, color: '#1A5FA8', marginLeft: 8, background: '#E8F0FB', padding: '1px 6px', borderRadius: 10 }}>🔑 acceso</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#9A8E85' }}>{e.cargo || 'Sin cargo'}{e.area ? ` · ${e.area}` : ''}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ background: ei.bg, color: ei.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{ei.label}</span>
                  {(() => {
                    const nv = novedadHoyDe(e.id)
                    if (!nv) return null
                    const ni = novedadInfo(nv.tipo)
                    return <span title={`Hasta el ${nv.fecha_fin}`} style={{ background: ni.bg, color: ni.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{ni.icono} {ni.estado}</span>
                  })()}
                  <button onClick={(ev) => { ev.stopPropagation(); solicitarAccion(e, 'editar') }} style={{ background: '#FEF3DC', color: '#C07D00', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                  <button onClick={(ev) => { ev.stopPropagation(); solicitarAccion(e, 'eliminar') }} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}