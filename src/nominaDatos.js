// Acceso a datos de nómina (Supabase). La lógica de cálculo está en nominaMotor.js.
import { supabase } from './supabase'

// Mismo listado de cuentas que Finanzas.jsx (si agregas una cuenta allá, agrégala aquí)
export const CUENTAS = { '1': 'Bancolombia Yohe', '2': 'Bancolombia Manu', '3': 'Nequi Yohe' }
export const nombreCuenta = (c) => (c === 'efectivo' ? 'Efectivo' : CUENTAS[c] || c)

const hoyISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function cargarParametros() {
  const { data, error } = await supabase.from('nomina_parametros').select('*').order('clave').order('vigente_desde')
  if (error) { console.error('Parámetros de nómina:', error.message); return [] }
  return data || []
}

// ---------------- Forma de pago (efectivo / transferencia / ambas) ----------------
// pago = { forma: 'efectivo' | 'transferencia' | 'ambos', efectivo: monto en efectivo (solo "ambos"), cuenta: código de cuenta }
export function validarFormaPago(valor, pago) {
  const v = Number(valor)
  if (!(v > 0)) return 'El valor a pagar debe ser mayor que cero.'
  if (!pago || !['efectivo', 'transferencia', 'ambos'].includes(pago.forma)) return 'Elige la forma de pago.'
  if (pago.forma !== 'efectivo' && !pago.cuenta) return 'Elige la cuenta desde la que se hace la transferencia.'
  if (pago.forma === 'ambos') {
    const ef = Number(pago.efectivo)
    if (!(ef > 0) || ef >= v) return 'En "Ambas", el efectivo debe ser mayor que cero y menor que el total; el resto sale por transferencia.'
  }
  return null
}

export function normalizarPago(valor, pago) {
  const v = Number(valor)
  const efectivo = pago.forma === 'efectivo' ? v : pago.forma === 'ambos' ? Number(pago.efectivo) : 0
  return {
    forma: pago.forma,
    monto_efectivo: efectivo,
    monto_transferencia: v - efectivo,
    cuenta: pago.forma === 'efectivo' ? null : pago.cuenta,
  }
}

const CATEGORIA_POR_TIPO = {
  nomina: 'Nómina', manual: 'Nómina',
  prima: 'Prestaciones sociales', cesantias: 'Prestaciones sociales', intereses_cesantias: 'Prestaciones sociales', vacaciones: 'Prestaciones sociales',
  liquidacion: 'Liquidaciones laborales',
}

async function categoriaFinanzas(nombre) {
  const { data } = await supabase.from('categorias_finanzas').select('*').ilike('nombre', nombre).limit(1)
  if (data && data.length) return data[0]
  const { data: nueva } = await supabase.from('categorias_finanzas').insert([{ nombre }]).select()
  return nueva?.[0] || null
}

// Registra un pago a un empleado y genera el gasto en Finanzas (Egresos y Gastos → Balance por cuenta).
// Sirve para nómina, pagos manuales y —cuando se construyan— prestaciones y liquidaciones (parámetro tipo).
export async function registrarPagoEmpleado({ empleado, tipo, concepto, valor, fecha, pago, liquidacionId, liquidacionFinalId, referencia, observaciones, soporteUrl }) {
  const errorPago = validarFormaPago(valor, pago)
  if (errorPago) return { error: { message: errorPago } }
  const n = normalizarPago(valor, pago)
  const fechaPago = fecha || hoyISO()

  const { data: reg, error } = await supabase.from('nomina_pagos').insert([{
    empleado_id: empleado.id, liquidacion_id: liquidacionId || null, liquidacion_final_id: liquidacionFinalId || null, tipo, valor: Number(valor),
    fecha_pago: fechaPago, medio: n.forma, forma_pago: n.forma,
    monto_efectivo: n.monto_efectivo, monto_transferencia: n.monto_transferencia, cuenta: n.cuenta,
    referencia: referencia || null, concepto, soporte_url: soporteUrl || null, observaciones: observaciones || null
  }]).select().single()
  if (error) return { error }

  const categoriaNombre = CATEGORIA_POR_TIPO[tipo] || 'Nómina'
  const cat = await categoriaFinanzas(categoriaNombre)
  const { data: egreso, error: errEgreso } = await supabase.from('egresos').insert([{
    compra_id: null, tipo_registro: 'gasto', concepto, detalle: concepto,
    recibe: `${empleado.nombre} ${empleado.apellidos || ''}`.trim(),
    categoria_id: cat?.id || null, categoria_nombre: cat?.nombre || categoriaNombre, estado: 'contado',
    metodo_pago: n.forma, valor_total: Number(valor), monto: Number(valor),
    monto_efectivo: n.monto_efectivo, monto_transferencia_1: n.monto_transferencia, tipo_cuenta_1: n.cuenta,
    monto_transferencia_2: 0, tipo_cuenta_2: null, tipo_cuenta: n.cuenta,
    factura_soporte: referencia || null, fecha: fechaPago, nomina_pago_id: reg.id
  }]).select().single()
  if (errEgreso) {
    await supabase.from('nomina_pagos').delete().eq('id', reg.id) // sin gasto no se deja el pago a medias
    return { error: { message: 'No se pudo registrar el gasto en Finanzas: ' + errEgreso.message } }
  }
  await supabase.from('nomina_pagos').update({ egreso_id: egreso.id }).eq('id', reg.id)
  return { error: null, pagoId: reg.id, egresoId: egreso.id }
}

// Paga una liquidación de nómina aprobada con el neto que calculó el sistema
export async function pagarLiquidacion(liq, { empleado, fecha, pago, referencia, observaciones, concepto }) {
  if (liq.estado !== 'aprobada') return { error: { message: 'Solo se puede pagar una nómina aprobada que no esté pagada.' } }
  if (!(Number(liq.neto) > 0)) return { error: { message: 'El neto de esta nómina es cero o negativo: no hay nada que pagar.' } }
  const r = await registrarPagoEmpleado({
    empleado, tipo: 'nomina', concepto: concepto || 'Pago de nómina', valor: Number(liq.neto),
    fecha, pago, liquidacionId: liq.id, referencia, observaciones
  })
  if (r.error) return r
  const fechaPago = fecha || hoyISO()
  const { error: e2 } = await supabase.from('nomina_liquidaciones')
    .update({ estado: 'pagada', actualizado_en: new Date().toISOString() }).eq('id', liq.id)
  if (e2) return { error: e2 }
  // Los bonos y descuentos incluidos en esta nómina pasan a pagados / aplicados
  await supabase.from('pagos_empleado').update({ estado: 'pagado', fecha_pago: fechaPago }).eq('liquidacion_id', liq.id)
  return { error: null }
}

// Pago manual: la persona escribe el monto. Si es un adelanto, queda como descuento para la próxima nómina.
export async function registrarPagoManual(empleado, datos, archivo) {
  let soporte_url = null
  if (archivo) {
    const extension = archivo.name.split('.').pop()
    const ruta = `${empleado.codigo}/pagonomina-${Date.now()}.${extension}`
    const { error: errorSubida } = await supabase.storage
      .from('DocumentosEmpleados').upload(ruta, archivo, { upsert: true, contentType: archivo.type })
    if (errorSubida) return { error: errorSubida }
    soporte_url = ruta
  }
  const r = await registrarPagoEmpleado({
    empleado, tipo: 'manual', concepto: datos.concepto.trim(), valor: Number(datos.valor),
    fecha: datos.fecha, pago: datos.pago, referencia: datos.referencia, observaciones: datos.observaciones, soporteUrl: soporte_url
  })
  if (r.error) return r
  if (datos.esAdelanto) {
    const fecha = datos.fecha || hoyISO()
    await supabase.from('pagos_empleado').insert([{
      empleado_id: empleado.id, sentido: 'deduccion', tipo: 'anticipo', concepto: `Descuento del adelanto: ${datos.concepto.trim()}`,
      valor: Number(datos.valor), naturaleza: null, soporte_escrito: true, periodo: fecha.slice(0, 7), fecha,
      estado: 'pendiente', nomina_pago_id: r.pagoId
    }])
  }
  return r
}

// Paga un bono o comisión suelto (fuera de nómina) y genera su gasto
export async function pagarBonoSuelto(empleado, bono, { fecha, pago }) {
  const r = await registrarPagoEmpleado({
    empleado, tipo: 'manual', concepto: `Pago de ${bono.concepto}`, valor: Number(bono.valor), fecha, pago
  })
  if (r.error) return r
  const { error } = await supabase.from('pagos_empleado')
    .update({ estado: 'pagado', fecha_pago: fecha || hoyISO(), nomina_pago_id: r.pagoId }).eq('id', bono.id)
  return { error }
}

// Elimina un pago y su gasto en Finanzas; la nómina vuelve a "aprobada" y los bonos a pendientes
export async function eliminarPagoNomina(pago) {
  if (pago.soporte_url) await supabase.storage.from('DocumentosEmpleados').remove([pago.soporte_url])
  await supabase.from('egresos').delete().eq('nomina_pago_id', pago.id)
  const { error } = await supabase.from('nomina_pagos').delete().eq('id', pago.id)
  if (error) return { error }
  if (pago.liquidacion_id) {
    await supabase.from('nomina_liquidaciones')
      .update({ estado: 'aprobada', actualizado_en: new Date().toISOString() }).eq('id', pago.liquidacion_id)
    await supabase.from('pagos_empleado').update({ estado: 'pendiente', fecha_pago: null }).eq('liquidacion_id', pago.liquidacion_id)
  }
  if (pago.liquidacion_final_id) {
    const { data: lf } = await supabase.from('nomina_liquidaciones_finales').select('*').eq('id', pago.liquidacion_final_id).maybeSingle()
    await supabase.from('nomina_liquidaciones_finales').update({ estado: 'aprobada', pago_id: null, actualizado_en: new Date().toISOString() }).eq('id', pago.liquidacion_final_id)
    const ids = lf?.resultado?.pagosIncluidos || []
    if (ids.length) await supabase.from('pagos_empleado').update({ estado: 'pendiente', fecha_pago: null }).in('id', ids)
  }
  // bono suelto pagado con este pago → vuelve a pendiente; adelanto que generó un descuento → se quita
  await supabase.from('pagos_empleado').update({ estado: 'pendiente', fecha_pago: null, nomina_pago_id: null }).eq('nomina_pago_id', pago.id).eq('sentido', 'devengo')
  await supabase.from('pagos_empleado').delete().eq('nomina_pago_id', pago.id).eq('sentido', 'deduccion').eq('estado', 'pendiente')
  // provisiones que se habían pagado con este pago vuelven a su estado anterior
  await supabase.from('nomina_provisiones').update({ estado: 'calculada', pago_id: null }).eq('pago_id', pago.id).is('apartado_id', null)
  await supabase.from('nomina_provisiones').update({ estado: 'apartada', pago_id: null }).eq('pago_id', pago.id).not('apartado_id', 'is', null)
  return { error: null }
}

export async function urlSoporte(ruta) {
  const { data, error } = await supabase.storage.from('DocumentosEmpleados').createSignedUrl(ruta, 60)
  return { url: data?.signedUrl || null, error }
}

// ---------------- Provisiones ----------------
export async function cargarProvisiones() {
  const { data, error } = await supabase.from('nomina_provisiones').select('*').order('periodo_fin', { ascending: true })
  if (error) { console.error('Provisiones:', error.message); return [] }
  return data || []
}

export async function cargarApartados() {
  const { data } = await supabase.from('nomina_apartados').select('*').order('fecha', { ascending: false })
  return data || []
}

// Al aprobar una nómina: guarda las provisiones de cada empleado (quedan "calculadas", sin apartar)
export async function crearProvisionesDeLiquidaciones(liquidaciones, periodo) {
  const filas = []
  for (const l of liquidaciones) {
    for (const p of l.resultado?.costoEmpresa?.provisiones || []) {
      filas.push({ empleado_id: l.empleado_id, liquidacion_id: l.id, concepto: p.codigo, valor: p.valor, periodo_inicio: periodo.inicio, periodo_fin: periodo.fin, estado: 'calculada' })
    }
  }
  if (!filas.length) return { error: null }
  const { error } = await supabase.from('nomina_provisiones').upsert(filas, { onConflict: 'liquidacion_id,concepto', ignoreDuplicates: true })
  return { error }
}

// Al reabrir una nómina: se quitan sus provisiones, salvo que ya estén apartadas o pagadas
export async function borrarProvisionesDeLiquidaciones(liqIds) {
  if (!liqIds.length) return { error: null }
  const { data } = await supabase.from('nomina_provisiones').select('id, estado').in('liquidacion_id', liqIds)
  if ((data || []).some(p => p.estado !== 'calculada')) {
    return { error: { message: 'Algunas provisiones de esta nómina ya están apartadas o pagadas. Deshaz el apartado antes de reabrir.' } }
  }
  const { error } = await supabase.from('nomina_provisiones').delete().in('liquidacion_id', liqIds)
  return { error }
}

// Provisionar = apartar dinero: reserva saldo en una cuenta (o en efectivo). No es gasto ni sale plata.
export async function apartarProvisiones(lineas, { fecha, cuenta, observaciones }) {
  const ids = lineas.map(l => l.id)
  const valor = lineas.reduce((a, l) => a + Number(l.valor), 0)
  if (!ids.length || !(valor > 0)) return { error: { message: 'No hay provisiones por apartar.' } }
  if (!cuenta) return { error: { message: 'Elige en qué cuenta se aparta el dinero.' } }
  const { data: ap, error } = await supabase.from('nomina_apartados')
    .insert([{ fecha: fecha || hoyISO(), cuenta, valor, observaciones: observaciones || null }]).select().single()
  if (error) return { error }
  const { error: e2 } = await supabase.from('nomina_provisiones').update({ estado: 'apartada', apartado_id: ap.id }).in('id', ids)
  return { error: e2 || null }
}

export async function deshacerApartado(apartado) {
  const { data } = await supabase.from('nomina_provisiones').select('id, estado').eq('apartado_id', apartado.id)
  if ((data || []).some(p => p.estado === 'pagada')) return { error: { message: 'Parte de este apartado ya se pagó; no se puede deshacer.' } }
  await supabase.from('nomina_provisiones').update({ estado: 'calculada', apartado_id: null }).eq('apartado_id', apartado.id)
  const { error } = await supabase.from('nomina_apartados').delete().eq('id', apartado.id)
  return { error }
}


// ---------------- Liquidaciones finales (retiro, terminación, vacaciones compensadas) ----------------
export const ETIQUETA_ESTADO_EMPLEADO_RETIRO = {
  renuncia: 'Retiro voluntario (renuncia)', mutuo_acuerdo: 'Terminación por mutuo acuerdo', vencimiento_contrato: 'Vencimiento del contrato a término fijo',
  justa_causa: 'Despido con justa causa', sin_justa_causa: 'Despido sin justa causa',
}

// Lee de la base todo lo que necesita el cálculo de la liquidación de un empleado
export async function cargarDatosLiquidacion(empleadoId) {
  const [nov, pend, prest, prov, comp, per] = await Promise.all([
    supabase.from('novedades_asistencia').select('*').eq('empleado_id', empleadoId),
    supabase.from('pagos_empleado').select('*').eq('empleado_id', empleadoId).eq('estado', 'pendiente').is('liquidacion_id', null),
    supabase.from('nomina_pagos').select('tipo, valor, fecha_pago').eq('empleado_id', empleadoId).in('tipo', ['prima', 'cesantias', 'intereses_cesantias', 'vacaciones']),
    supabase.from('nomina_provisiones').select('concepto, valor, estado').eq('empleado_id', empleadoId).neq('estado', 'pagada'),
    supabase.from('nomina_liquidaciones_finales').select('resultado').eq('empleado_id', empleadoId).eq('motivo', 'vacaciones').in('estado', ['aprobada', 'pagada']),
    supabase.from('nomina_liquidaciones').select('estado, nomina_periodos(fecha_fin)').eq('empleado_id', empleadoId).in('estado', ['aprobada', 'pagada']),
  ])
  const provisionado = {}
  for (const p of prov.data || []) provisionado[p.concepto] = (provisionado[p.concepto] || 0) + Number(p.valor)
  const diasCompensados = (comp.data || []).reduce((a, x) => a + (Number(x.resultado?.diasCompensados) || 0), 0)
  const fines = (per.data || []).map(x => x.nomina_periodos?.fecha_fin).filter(Boolean).sort()
  return {
    novedades: nov.data || [],
    pagosPendientes: pend.data || [],
    prestacionesPagadas: prest.data || [],
    provisionado, diasCompensados,
    ultimoPeriodoPagadoFin: fines.length ? fines[fines.length - 1] : null,
  }
}

// Días de vacaciones ya compensados en dinero (para el saldo de vacaciones de la ficha)
export async function cargarDiasCompensados(empleadoId) {
  const { data } = await supabase.from('nomina_liquidaciones_finales').select('resultado')
    .eq('empleado_id', empleadoId).eq('motivo', 'vacaciones').in('estado', ['aprobada', 'pagada'])
  return (data || []).reduce((a, x) => a + (Number(x.resultado?.diasCompensados) || 0), 0)
}

export async function cargarLiquidacionesFinales() {
  const { data, error } = await supabase.from('nomina_liquidaciones_finales').select('*').order('creado_en', { ascending: false })
  if (error) { console.error('Liquidaciones finales:', error.message); return [] }
  return data || []
}

// Guarda (o actualiza) el borrador de una liquidación
export async function guardarLiquidacionFinal({ id, empleado, motivo, fechaRetiro, entradas, resultado }) {
  const fila = {
    empleado_id: empleado.id, motivo, fecha_retiro: fechaRetiro, entradas, resultado, parametros: resultado.parametrosUsados || {},
    devengado: resultado.devengado, deducciones: resultado.deducciones, neto: resultado.neto, estado: 'borrador',
    actualizado_en: new Date().toISOString(),
  }
  if (id) {
    const { data, error } = await supabase.from('nomina_liquidaciones_finales').update(fila).eq('id', id).select().single()
    return { error, data }
  }
  const { data, error } = await supabase.from('nomina_liquidaciones_finales').insert([fila]).select().single()
  return { error, data }
}

// Aprobar congela el cálculo. Si es un retiro, el empleado pasa a "Retirado".
export async function aprobarLiquidacionFinal(liq, empleado, motivoRetiro) {
  const esRetiro = liq.motivo !== 'vacaciones'
  const { error } = await supabase.from('nomina_liquidaciones_finales')
    .update({ estado: 'aprobada', estado_empleado_anterior: esRetiro ? (empleado.estado || 'activo') : null, actualizado_en: new Date().toISOString() }).eq('id', liq.id)
  if (error) return { error }
  if (esRetiro) {
    const { error: e2 } = await supabase.from('empleados')
      .update({ estado: 'retirado', fecha_retiro: liq.fecha_retiro, motivo_retiro: motivoRetiro || ETIQUETA_ESTADO_EMPLEADO_RETIRO[liq.motivo] || 'Retiro' }).eq('id', empleado.id)
    if (e2) return { error: e2 }
  }
  return { error: null }
}

export async function reabrirLiquidacionFinal(liq) {
  if (liq.estado === 'pagada') return { error: { message: 'Ya está pagada. Elimina primero el pago (en Bonos / Pagos del empleado).' } }
  const { error } = await supabase.from('nomina_liquidaciones_finales').update({ estado: 'borrador', actualizado_en: new Date().toISOString() }).eq('id', liq.id)
  if (error) return { error }
  if (liq.motivo !== 'vacaciones') {
    await supabase.from('empleados').update({ estado: liq.estado_empleado_anterior || 'activo', fecha_retiro: null, motivo_retiro: null }).eq('id', liq.empleado_id)
  }
  return { error: null }
}

export async function eliminarLiquidacionFinal(liq) {
  if (liq.estado !== 'borrador') return { error: { message: 'Solo se pueden eliminar borradores. Reabre la liquidación primero.' } }
  const { error } = await supabase.from('nomina_liquidaciones_finales').delete().eq('id', liq.id)
  return { error }
}

// Marca como pagadas las provisiones que cubre un pago (se libera también lo que estaba apartado)
async function consumirProvisiones(empleadoId, pagoId, { conceptos, hastaValor }) {
  const { data } = await supabase.from('nomina_provisiones').select('*').eq('empleado_id', empleadoId).in('concepto', conceptos).neq('estado', 'pagada').order('periodo_fin', { ascending: true })
  let restante = hastaValor == null ? Infinity : Number(hastaValor)
  const ids = []
  for (const l of data || []) {
    if (Number(l.valor) <= restante + 0.01) { ids.push(l.id); restante -= Number(l.valor) }
  }
  if (ids.length) await supabase.from('nomina_provisiones').update({ estado: 'pagada', pago_id: pagoId }).in('id', ids)
}

// Paga la liquidación: crea el pago, el gasto en Finanzas, y cierra las provisiones que cubre
export async function pagarLiquidacionFinal(liq, { empleado, fecha, pago, concepto }) {
  if (liq.estado !== 'aprobada') return { error: { message: 'Solo se puede pagar una liquidación aprobada.' } }
  if (!(Number(liq.neto) > 0)) return { error: { message: 'El neto de esta liquidación es cero o negativo: no hay nada que pagar.' } }
  const esVac = liq.motivo === 'vacaciones'
  const r = await registrarPagoEmpleado({
    empleado, tipo: esVac ? 'vacaciones' : 'liquidacion', concepto, valor: Number(liq.neto), fecha, pago, liquidacionFinalId: liq.id
  })
  if (r.error) return r
  const { error } = await supabase.from('nomina_liquidaciones_finales')
    .update({ estado: 'pagada', pago_id: r.pagoId, actualizado_en: new Date().toISOString() }).eq('id', liq.id)
  if (error) return { error }
  const ids = liq.resultado?.pagosIncluidos || []
  if (ids.length) await supabase.from('pagos_empleado').update({ estado: 'pagado', fecha_pago: fecha || hoyISO() }).in('id', ids)
  if (esVac) await consumirProvisiones(empleado.id, r.pagoId, { conceptos: ['vacaciones'], hastaValor: Number(liq.neto) })
  else await consumirProvisiones(empleado.id, r.pagoId, { conceptos: ['prima', 'cesantias', 'intereses_cesantias', 'vacaciones'] })
  return { error: null, pagoId: r.pagoId }
}