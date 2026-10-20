import { supabase } from './supabase'

// Fecha y hora en zona Colombia (toISOString usa UTC y después de las 7 pm daría el día siguiente)
export const hoyISO = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
export const horaActual = () =>
  new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' })

// Folio único desde la secuencia de la base de datos (Compras y Calidad usan esta misma función)
export const siguienteFolio = async () => {
  const { data, error } = await supabase.rpc('siguiente_folio_compra')
  if (error) throw new Error('No se pudo generar el folio: ' + error.message)
  return data
}

// Código de lote: toma el mayor consecutivo existente del producto y suma 1
export const generarCodigoLote = async (producto) => {
  const prefijo = producto.codigo.split('-').slice(0, 2).join('-')
  const { data } = await supabase
    .from('compra_items').select('codigo_lote').like('codigo_lote', `${prefijo}-L%`)
  const max = (data || []).reduce((m, r) => {
    const match = /-L(\d+)$/.exec(r.codigo_lote || '')
    return match ? Math.max(m, parseInt(match[1], 10)) : m
  }, 0)
  return `${prefijo}-L${String(max + 1).padStart(4, '0')}`
}

export const trazVacio = () => ({
  fecha_vencimiento: '', hora_recepcion: '',
  temperatura_recepcion: '', responsable: '',
  estado_empaque: '', cumple_especificaciones: '', observaciones: '',
  vehiculo_limpio: '', libre_plagas: '', temperatura_transporte: '', numero_placa: '',
  numero_unidades: '', lote_proveedor: ''
})

// Convierte el estado del formulario a columnas de trazabilidad_recepcion
export const trazAFila = (t) => ({
  fecha_vencimiento: t.fecha_vencimiento || null,
  hora_recepcion: t.hora_recepcion || null,
  temperatura_recepcion: t.temperatura_recepcion !== '' ? parseFloat(t.temperatura_recepcion) : null,
  responsable: t.responsable || null,
  estado_empaque: t.estado_empaque || null,
  cumple_especificaciones: t.cumple_especificaciones === 'si' ? true : t.cumple_especificaciones === 'no' ? false : null,
  observaciones: t.observaciones || null,
  vehiculo_limpio: t.vehiculo_limpio || null,
  libre_plagas: t.libre_plagas || null,
  temperatura_transporte: t.temperatura_transporte !== '' ? parseFloat(t.temperatura_transporte) : null,
  numero_placa: t.numero_placa || null,
  numero_unidades: t.numero_unidades ? parseInt(t.numero_unidades, 10) : null,
  lote_proveedor: t.lote_proveedor || null
})

const chk = ({ error }) => { if (error) throw new Error(error.message) }

// Registra UN producto recibido: compra_item (sin costo), lote, stock y trazabilidad.
// NO toca ultimo_costo ni costo_promedio (eso lo hace el administrativo al completar la compra).
export const registrarItemRecepcion = async ({ compraId, item, traz, producto, fechaIngreso }) => {
  const codigo_lote = await generarCodigoLote(producto)
  const cantidad = parseFloat(item.cantidad)

  const ins = await supabase.from('compra_items').insert([{
    compra_id: compraId, producto_id: item.producto_id,
    nombre_producto: item.nombre_producto, codigo_producto: item.codigo_producto,
    cantidad, unidad: item.unidad, costo_unitario: null, subtotal: null, codigo_lote
  }]).select()
  chk(ins)
  const itemId = ins.data[0].id

  const { data: p } = await supabase.from('productos').select('stock_actual').eq('id', item.producto_id).single()
  const nuevoStock = (parseFloat(p?.stock_actual) || 0) + cantidad
  chk(await supabase.from('productos').update({ stock_actual: nuevoStock }).eq('id', item.producto_id))

  chk(await supabase.from('lotes').insert([{
    producto_id: item.producto_id, codigo_lote,
    cantidad_inicial: cantidad, cantidad_actual: cantidad,
    fecha_ingreso: fechaIngreso || hoyISO(),
    fecha_vencimiento: traz?.fecha_vencimiento || null
  }]))

  if (producto.categoria_mp !== 'empaques') {
    chk(await supabase.from('trazabilidad_recepcion').insert([{
      compra_id: compraId, compra_item_id: itemId,
      producto_id: item.producto_id, nombre_producto: item.nombre_producto,
      ...trazAFila(traz || trazVacio())
    }]))
  }
  return codigo_lote
}
