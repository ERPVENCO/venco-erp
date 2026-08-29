import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import ModalEliminar from './ModalEliminar'
import DocumentoVenta from './DocumentoVenta'

const CLAVE_EDICION = '1234'

export default function Ventas() {
  const [ventas, setVentas] = useState([])
  const [clientes, setClientes] = useState([])
  const [productos, setProductos] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [ventaDetalle, setVentaDetalle] = useState(null)
  const [detalleItems, setDetalleItems] = useState([])
  const [ventaImprimir, setVentaImprimir] = useState(null)
  const [ventaAEliminar, setVentaAEliminar] = useState(null)
  const [ventaAFacturar, setVentaAFacturar] = useState(null)
  const [datosFactura, setDatosFactura] = useState({ estado: 'contado', metodo_pago: 'efectivo', tipo_cuenta: '' })
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [items, setItems] = useState([])
  const [guardando, setGuardando] = useState(false)

  // Edición
  const [editandoId, setEditandoId] = useState(null)
  const [ventaOriginal, setVentaOriginal] = useState(null)
  const [pidiendoClave, setPidiendoClave] = useState(null) // venta que se quiere editar, pendiente de clave
  const [claveInput, setClaveInput] = useState('')
  const [claveError, setClaveError] = useState('')

  // Trazabilidad de despacho y transporte (uso interno, no va en la factura)
  const [ventaTrazabilidad, setVentaTrazabilidad] = useState(null)
  const [guardandoTraz, setGuardandoTraz] = useState(false)
  const [editandoTrazId, setEditandoTrazId] = useState(null)
  const [trazOriginal, setTrazOriginal] = useState(null)
  const [pidiendoClaveTraz, setPidiendoClaveTraz] = useState(false) // true cuando se pide clave para GUARDAR una edición
  const [claveTrazInput, setClaveTrazInput] = useState('')
  const [claveTrazError, setClaveTrazError] = useState('')
  const [trazForm, setTrazForm] = useState({
    fecha_hora_salida: '', temperatura_producto: '', temperatura_vehiculo: '',
    transportador: '', placa_vehiculo: '', destino_direccion: '', destino_ciudad: '',
    observaciones: '', responsable_despacho: '', firma_transportador: ''
  })

  const [venta, setVenta] = useState({
    tipo: 'venta',
    estado: 'contado',
    cliente_id: '',
    vendedor_id: '',
    metodo_pago: 'efectivo',
    tipo_cuenta: '',
    descuento: 0,
    iva: false,
    observaciones: '',
    fecha_vencimiento: ''
  })

  useEffect(() => { cargar(); cargarClientes(); cargarProductos(); cargarVendedores() }, [])

  const cargar = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('ventas')
      .select('*')
      .order('creado_en', { ascending: false })
    setVentas(data || [])
    setLoading(false)
  }

  const cargarClientes = async () => {
    const { data } = await supabase.from('clientes').select('*').eq('activo', true).order('empresa')
    setClientes(data || [])
  }

  const cargarProductos = async () => {
    const { data } = await supabase
      .from('productos')
      .select('*')
      .eq('tipo_inventario', 'producto_terminado')
      .order('nombre')
    setProductos(data || [])
  }

  const cargarVendedores = async () => {
    const { data } = await supabase.from('vendedores').select('*').eq('activo', true).order('nombre')
    setVendedores(data || [])
  }

  const siguienteFolio = async (tipo) => {
    const prefijo = tipo === 'remision' ? 'REM' : 'FAC'
    const { data } = await supabase.from('ventas').select('folio').like('folio', `${prefijo}%`).order('folio', { ascending: false }).limit(1)
    if (!data || data.length === 0) return `${prefijo}-0001`
    const numero = parseInt(data[0].folio.replace(`${prefijo}-`, '')) + 1
    return `${prefijo}-${String(numero).padStart(4, '0')}`
  }

  const siguienteFolioGuia = async () => {
    const { data } = await supabase.from('trazabilidad_despacho').select('folio').not('folio', 'is', null).order('folio', { ascending: false }).limit(1)
    if (!data || data.length === 0) return 'GUI-0001'
    const numero = parseInt(data[0].folio.replace('GUI-', '')) + 1
    return `GUI-${String(numero).padStart(4, '0')}`
  }

  // ── Lotes por item (FIFO automático, editable) ──
  const calcularLotesFIFO = async (producto_id, cantidad) => {
    const cant = parseFloat(cantidad) || 0
    if (!producto_id || cant <= 0) return { lotes_disponibles: [], lotes_usados: [] }

    const { data: lotes } = await supabase
      .from('lotes')
      .select('*')
      .eq('producto_id', producto_id)
      .gt('cantidad_actual', 0)
      .order('fecha_ingreso', { ascending: true })

    const lotes_usados = []
    let restante = cant
    for (const lote of (lotes || [])) {
      if (restante <= 0) break
      const usar = Math.min(lote.cantidad_actual, restante)
      lotes_usados.push({
        lote_id: lote.id, codigo_lote: lote.codigo_lote,
        cantidad_usada: parseFloat(usar.toFixed(4)), disponible: lote.cantidad_actual
      })
      restante -= usar
    }

    return { lotes_disponibles: lotes || [], lotes_usados }
  }

  // ── Items ──
  const agregarItem = () => {
    setItems([...items, {
      producto_id: '', nombre_producto: '', codigo_producto: '',
      cantidad: '', unidad: 'kg', precio_lista: 1, precio_unitario: 0, subtotal: 0,
      lotes_disponibles: [], lotes_usados: []
    }])
  }

  const actualizarItem = async (index, campo, valor) => {
    const updated = [...items]
    updated[index][campo] = valor

    if (campo === 'producto_id') {
      const prod = productos.find(p => p.id === valor)
      if (prod) {
        updated[index].nombre_producto = prod.nombre
        updated[index].codigo_producto = prod.codigo
        updated[index].unidad = prod.unidad || 'kg'
        updated[index].precio_unitario = prod.precio_kg || 0
      }
      const { lotes_disponibles, lotes_usados } = await calcularLotesFIFO(valor, updated[index].cantidad)
      updated[index].lotes_disponibles = lotes_disponibles
      updated[index].lotes_usados = lotes_usados
    }

    if (campo === 'precio_lista') {
      const prod = productos.find(p => p.id === updated[index].producto_id)
      if (prod) {
        const precios = { 1: prod.precio_kg, 2: prod.precio2, 3: prod.precio3, 4: prod.precio4, 5: prod.precio5 }
        updated[index].precio_unitario = precios[valor] || prod.precio_kg || 0
      }
    }

    if (campo === 'cantidad') {
      const { lotes_disponibles, lotes_usados } = await calcularLotesFIFO(updated[index].producto_id, valor)
      updated[index].lotes_disponibles = lotes_disponibles
      updated[index].lotes_usados = lotes_usados
    }

    if (campo === 'cantidad' || campo === 'precio_unitario' || campo === 'precio_lista') {
      updated[index].subtotal = (parseFloat(updated[index].cantidad) || 0) * (parseFloat(updated[index].precio_unitario) || 0)
    }

    setItems(updated)
  }

  const actualizarLoteItem = (index, loteIdx, campo, valor) => {
    const updated = [...items]
    const it = updated[index]
    it.lotes_usados[loteIdx][campo] = valor
    if (campo === 'lote_id') {
      const lote = it.lotes_disponibles.find(l => l.id === valor)
      if (lote) { it.lotes_usados[loteIdx].codigo_lote = lote.codigo_lote; it.lotes_usados[loteIdx].disponible = lote.cantidad_actual }
    }
    setItems(updated)
  }

  const agregarLoteItem = (index) => {
    const updated = [...items]
    updated[index].lotes_usados.push({ lote_id: '', codigo_lote: '', cantidad_usada: '', disponible: 0 })
    setItems(updated)
  }

  const eliminarLoteItem = (index, loteIdx) => {
    const updated = [...items]
    updated[index].lotes_usados = updated[index].lotes_usados.filter((_, i) => i !== loteIdx)
    setItems(updated)
  }

  const eliminarItem = (index) => setItems(items.filter((_, i) => i !== index))

  // ── Cálculos ──
  const calcularVendedor = () => {
    if (!venta.vendedor_id) return { comision_valor: 0, vendedor_nombre: '', comision_porcentaje: 0, comision_tipo: '' }
    const v = vendedores.find(v => v.id === venta.vendedor_id)
    if (!v) return { comision_valor: 0, vendedor_nombre: '', comision_porcentaje: 0, comision_tipo: '' }
    const subtotal = items.reduce((s, i) => s + (i.subtotal || 0), 0)
    const totalKg = items.reduce((s, i) => s + (parseFloat(i.cantidad) || 0), 0)
    let comision_valor = 0
    if (v.comision_tipo === 'porcentaje') comision_valor = subtotal * v.comision_porcentaje / 100
    else comision_valor = v.comision_valor_fijo * totalKg
    return { comision_valor: Math.round(comision_valor), vendedor_nombre: v.nombre, comision_porcentaje: v.comision_porcentaje, comision_tipo: v.comision_tipo }
  }

  const calcularTotales = () => {
    const subtotal = items.reduce((s, i) => s + (i.subtotal || 0), 0)
    const descuento = parseFloat(venta.descuento) || 0
    const baseIva = subtotal - descuento
    const iva = venta.iva ? baseIva * 0.19 : 0
    const total = baseIva + iva
    return { subtotal, descuento, iva, total }
  }

  // ── Abrir formulario para nueva venta ──
  const abrirNuevaVenta = () => {
    setEditandoId(null)
    setVentaOriginal(null)
    setItems([])
    setVenta({ tipo: 'venta', estado: 'contado', cliente_id: '', vendedor_id: '', metodo_pago: 'efectivo', tipo_cuenta: '', descuento: 0, iva: false, observaciones: '', fecha_vencimiento: '' })
    setMostrarForm(true)
  }

  // ── Pedir clave para editar ──
  const solicitarEdicion = (v) => {
    setPidiendoClave(v)
    setClaveInput('')
    setClaveError('')
  }

  const confirmarClaveYEditar = async () => {
    if (claveInput !== CLAVE_EDICION) {
      setClaveError('Contraseña incorrecta')
      return
    }
    const v = pidiendoClave
    setPidiendoClave(null)

    // Cargar items de esa venta
    const { data: itemsVenta } = await supabase.from('venta_items').select('*').eq('venta_id', v.id)

    const vendedorEncontrado = vendedores.find(ve => ve.nombre === v.vendedor)

    setEditandoId(v.id)
    setVentaOriginal({ venta: v, items: itemsVenta || [] })
    setVenta({
      tipo: v.tipo,
      estado: v.estado,
      cliente_id: v.cliente_id || '',
      vendedor_id: vendedorEncontrado?.id || '',
      metodo_pago: v.metodo_pago || 'efectivo',
      tipo_cuenta: v.tipo_cuenta || '',
      descuento: v.descuento || 0,
      iva: v.iva > 0,
      observaciones: v.observaciones || '',
      fecha_vencimiento: v.fecha_vencimiento || ''
    })

    const itemsConLotes = await Promise.all((itemsVenta || []).map(async (i) => {
      const { data: lotesGuardados } = await supabase.from('venta_item_lotes').select('*').eq('venta_item_id', i.id)
      const { data: lotesDisponibles } = await supabase
        .from('lotes').select('*').eq('producto_id', i.producto_id).gt('cantidad_actual', 0).order('fecha_ingreso', { ascending: true })
      return {
        producto_id: i.producto_id,
        nombre_producto: i.nombre_producto,
        codigo_producto: i.codigo_producto,
        cantidad: i.cantidad,
        unidad: i.unidad,
        precio_lista: 1,
        precio_unitario: i.precio_unitario,
        subtotal: i.subtotal,
        lotes_disponibles: lotesDisponibles || [],
        lotes_usados: (lotesGuardados || []).map(l => ({ lote_id: l.lote_id, codigo_lote: l.codigo_lote, cantidad_usada: l.cantidad_usada, disponible: l.cantidad_usada }))
      }
    }))
    setItems(itemsConLotes)
    setMostrarForm(true)
  }

  // ── Revertir efectos de una venta (stock, lotes, saldo cliente, ingreso) ──
  const revertirVenta = async (v, itemsVenta) => {
    for (const item of itemsVenta) {
      const { data: prod } = await supabase.from('productos').select('stock_actual').eq('id', item.producto_id).single()
      if (prod) {
        await supabase.from('productos').update({ stock_actual: (prod.stock_actual || 0) + item.cantidad }).eq('id', item.producto_id)
      }
      const { data: lotesItem } = await supabase.from('venta_item_lotes').select('*').eq('venta_item_id', item.id)
      for (const li of lotesItem || []) {
        const { data: loteAct } = await supabase.from('lotes').select('cantidad_actual').eq('id', li.lote_id).single()
        if (loteAct) await supabase.from('lotes').update({ cantidad_actual: loteAct.cantidad_actual + li.cantidad_usada }).eq('id', li.lote_id)
      }
    }
    if (v.estado === 'credito') {
      const { data: cliente } = await supabase.from('clientes').select('saldo_pendiente').eq('id', v.cliente_id).single()
      if (cliente) {
        await supabase.from('clientes').update({ saldo_pendiente: Math.max(0, (cliente.saldo_pendiente || 0) - v.total) }).eq('id', v.cliente_id)
      }
    }
    await supabase.from('ingresos').delete().eq('venta_id', v.id)
    await supabase.from('venta_items').delete().eq('venta_id', v.id) // cascade elimina venta_item_lotes
  }

  // ── Guardar (crea o actualiza) ──
  const guardar = async () => {
    if (!venta.cliente_id) { alert('Selecciona un cliente'); return }
    if (items.length === 0) { alert('Agrega al menos un producto'); return }
    if (items.some(i => !i.producto_id || !i.cantidad)) { alert('Completa todos los productos'); return }

    for (const item of items) {
      const totalLotes = item.lotes_usados.reduce((s, l) => s + (parseFloat(l.cantidad_usada) || 0), 0)
      if (Math.abs(totalLotes - (parseFloat(item.cantidad) || 0)) > 0.001) {
        alert(`${item.nombre_producto}: la suma de lotes (${totalLotes}) debe ser igual a la cantidad vendida (${item.cantidad})`)
        return
      }
      for (const lu of item.lotes_usados) {
        if (!lu.lote_id || !lu.cantidad_usada) { alert(`Completa todos los lotes de ${item.nombre_producto}`); return }
        if (parseFloat(lu.cantidad_usada) > lu.disponible) { alert(`${item.nombre_producto}: el lote ${lu.codigo_lote} supera el disponible (${lu.disponible})`); return }
      }
    }

    setGuardando(true)
    const { subtotal, descuento, iva, total } = calcularTotales()
    const { comision_valor, vendedor_nombre, comision_porcentaje } = calcularVendedor()
    const cliente = clientes.find(c => c.id === venta.cliente_id)
    const estado = venta.tipo === 'remision' ? 'pendiente' : venta.estado
    const metodo_pago = (estado === 'credito' || venta.tipo === 'remision') ? null : venta.metodo_pago
    const { data: { user } } = await supabase.auth.getUser()

    let ventaId
    let folio

    if (editandoId) {
      // Revertir lo anterior primero
      await revertirVenta(ventaOriginal.venta, ventaOriginal.items)
      folio = ventaOriginal.venta.folio
      ventaId = editandoId

      const { error } = await supabase.from('ventas').update({
        tipo: venta.tipo,
        estado,
        cliente_id: venta.cliente_id,
        cliente_nombre: cliente?.empresa || '',
        metodo_pago,
        tipo_cuenta: venta.tipo_cuenta || null,
        vendedor: vendedor_nombre,
        comision_porcentaje: comision_porcentaje || 0,
        comision_valor,
        subtotal, descuento, iva, total,
        observaciones: venta.observaciones,
        fecha_vencimiento: venta.fecha_vencimiento || null
      }).eq('id', ventaId)

      if (error) { alert('Error: ' + error.message); setGuardando(false); return }

      await supabase.from('auditoria').insert([{
        tabla: 'ventas',
        accion: 'EDICIÓN',
        descripcion: `${folio} — ${cliente?.empresa} — Total nuevo: $${total.toLocaleString()} (Total anterior: $${ventaOriginal.venta.total?.toLocaleString()})`,
        datos_anteriores: ventaOriginal.venta,
        usuario_email: user?.email || 'desconocido',
        fecha: new Date().toISOString()
      }])
    } else {
      folio = await siguienteFolio(venta.tipo)
      const { data, error } = await supabase.from('ventas').insert([{
        folio, tipo: venta.tipo, estado,
        cliente_id: venta.cliente_id, cliente_nombre: cliente?.empresa || '',
        metodo_pago, tipo_cuenta: venta.tipo_cuenta || null,
        vendedor: vendedor_nombre, comision_porcentaje: comision_porcentaje || 0, comision_valor,
        subtotal, descuento, iva, total,
        observaciones: venta.observaciones, fecha_vencimiento: venta.fecha_vencimiento || null,
        usuario_email: user?.email
      }]).select()

      if (error) { alert('Error: ' + error.message); setGuardando(false); return }
      ventaId = data[0].id
    }

    // Guardar items, sus lotes, y descontar stock/lotes (aplica para crear y para editar)
    for (const item of items) {
      const { data: itemData, error: errItem } = await supabase.from('venta_items').insert([{
        venta_id: ventaId,
        producto_id: item.producto_id,
        nombre_producto: item.nombre_producto,
        codigo_producto: item.codigo_producto,
        cantidad: parseFloat(item.cantidad),
        unidad: item.unidad,
        precio_unitario: parseFloat(item.precio_unitario),
        subtotal: item.subtotal
      }]).select()

      if (errItem) { alert('Error al guardar item: ' + errItem.message); setGuardando(false); return }
      const itemId = itemData[0].id

      for (const lu of item.lotes_usados) {
        const cantUsada = parseFloat(lu.cantidad_usada)

        await supabase.from('venta_item_lotes').insert([{
          venta_item_id: itemId, lote_id: lu.lote_id, codigo_lote: lu.codigo_lote,
          cantidad_usada: cantUsada, unidad: item.unidad
        }])

        const { data: loteActual } = await supabase.from('lotes').select('cantidad_actual').eq('id', lu.lote_id).single()
        if (loteActual) {
          await supabase.from('lotes').update({ cantidad_actual: Math.max(0, loteActual.cantidad_actual - cantUsada) }).eq('id', lu.lote_id)
        }
      }

      const prod = productos.find(p => p.id === item.producto_id)
      if (prod) {
        const { data: prodActual } = await supabase.from('productos').select('stock_actual').eq('id', item.producto_id).single()
        await supabase.from('productos').update({
          stock_actual: (prodActual?.stock_actual || 0) - parseFloat(item.cantidad)
        }).eq('id', item.producto_id)
      }
    }

    if (venta.tipo === 'venta' && estado === 'contado') {
      await supabase.from('ingresos').insert([{
        venta_id: ventaId,
        concepto: `Venta ${folio} — ${cliente?.empresa}`,
        metodo_pago: venta.metodo_pago,
        monto: total
      }])
    }

    if (estado === 'credito') {
      const { data: clienteActual } = await supabase.from('clientes').select('saldo_pendiente').eq('id', venta.cliente_id).single()
      await supabase.from('clientes').update({
        saldo_pendiente: (clienteActual?.saldo_pendiente || 0) + total
      }).eq('id', venta.cliente_id)
    }

    setMostrarForm(false)
    setItems([])
    setEditandoId(null)
    setVentaOriginal(null)
    setVenta({ tipo: 'venta', estado: 'contado', cliente_id: '', vendedor_id: '', metodo_pago: 'efectivo', tipo_cuenta: '', descuento: 0, iva: false, observaciones: '', fecha_vencimiento: '' })
    setGuardando(false)
    cargar()
    cargarProductos()
  }
  const facturarRemision = async () => {
  const v = ventaAFacturar
  const nuevoFolio = await siguienteFolio('venta')
  const estado = datosFactura.estado
  const metodo_pago = estado === 'credito' ? null : datosFactura.metodo_pago
  const { data: { user } } = await supabase.auth.getUser()
  const cliente = clientes.find(c => c.id === v.cliente_id)

  const { error } = await supabase.from('ventas').update({
    folio: nuevoFolio,
    tipo: 'venta',
    estado,
    metodo_pago,
    tipo_cuenta: datosFactura.tipo_cuenta || null,
    remision_origen: v.folio
  }).eq('id', v.id)

  if (error) { alert('Error: ' + error.message); return }

  if (estado === 'contado') {
    await supabase.from('ingresos').insert([{
      venta_id: v.id,
      concepto: `Factura ${nuevoFolio} (Remisión ${v.folio}) — ${v.cliente_nombre}`,
      metodo_pago,
      monto: v.total
    }])
  }

  if (estado === 'credito') {
    const { data: clienteActual } = await supabase.from('clientes').select('saldo_pendiente').eq('id', v.cliente_id).single()
    await supabase.from('clientes').update({
      saldo_pendiente: (clienteActual?.saldo_pendiente || 0) + v.total
    }).eq('id', v.cliente_id)
  }

  await supabase.from('auditoria').insert([{
    tabla: 'ventas',
    accion: 'FACTURACIÓN',
    descripcion: `Remisión ${v.folio} convertida a Factura ${nuevoFolio} — ${v.cliente_nombre}`,
    datos_anteriores: v,
    usuario_email: user?.email || 'desconocido',
    fecha: new Date().toISOString()
  }])

  setVentaAFacturar(null)
  setDatosFactura({ estado: 'contado', metodo_pago: 'efectivo', tipo_cuenta: '' })
  cargar()
}
  // ── Eliminar con reversión ── 
  const eliminarVenta = async () => {
    const v = ventaAEliminar
    const { data: itemsVenta } = await supabase.from('venta_items').select('*').eq('venta_id', v.id)
    await revertirVenta(v, itemsVenta || [])
    await supabase.from('ventas').delete().eq('id', v.id)

    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('auditoria').insert([{
      tabla: 'ventas',
      accion: 'ELIMINACIÓN',
      descripcion: `${v.folio} — ${v.cliente_nombre} — Total: $${v.total?.toLocaleString()} (Stock y saldo revertidos)`,
      datos_anteriores: v,
      usuario_email: user?.email || 'desconocido',
      fecha: new Date().toISOString()
    }])

    setVentaAEliminar(null)
    cargar()
    cargarProductos()
  }

  // ── Trazabilidad de despacho y transporte (uso interno, no va en la factura) ──
  const verDetalleVenta = async (v) => {
    const { data: itemsVenta } = await supabase.from('venta_items').select('*').eq('venta_id', v.id)
    const itemsConLotes = await Promise.all((itemsVenta || []).map(async (i) => {
      const { data: lotes } = await supabase.from('venta_item_lotes').select('*').eq('venta_item_id', i.id)
      return { ...i, lotes: lotes || [] }
    }))
    setDetalleItems(itemsConLotes)
    setVentaDetalle(v)
  }

  const abrirTrazabilidad = async (v) => {
    const { data: existentes } = await supabase.from('trazabilidad_despacho').select('*').eq('venta_id', v.id).order('creado_en', { ascending: false }).limit(1)
    const registro = existentes && existentes.length > 0 ? existentes[0] : null
    abrirFormTrazabilidad(v, registro)
  }

  const abrirFormTrazabilidad = (v, registro) => {
    const cliente = clientes.find(c => c.id === v.cliente_id)
    setVentaTrazabilidad(v)
    setEditandoTrazId(registro?.id || null)
    setTrazOriginal(registro)

    if (registro) {
      const localFechaHora = (iso) => {
        if (!iso) return ''
        const d = new Date(iso)
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      }
      setTrazForm({
        fecha_hora_salida: localFechaHora(registro.fecha_hora_salida),
        temperatura_producto: registro.temperatura_producto ?? '',
        temperatura_vehiculo: registro.temperatura_vehiculo ?? '',
        transportador: registro.transportador || '',
        placa_vehiculo: registro.placa_vehiculo || '',
        destino_direccion: registro.destino_direccion || '',
        destino_ciudad: registro.destino_ciudad || '',
        observaciones: registro.observaciones || '',
        responsable_despacho: registro.responsable_despacho || '',
        firma_transportador: registro.firma_transportador || ''
      })
    } else {
      setTrazForm({
        fecha_hora_salida: new Date().toISOString().slice(0, 16),
        temperatura_producto: '', temperatura_vehiculo: '',
        transportador: '', placa_vehiculo: '',
        destino_direccion: cliente?.direccion || '', destino_ciudad: cliente?.ciudad || '',
        observaciones: '', responsable_despacho: '', firma_transportador: ''
      })
    }
  }

  const confirmarClaveYEditarTraz = () => {
    if (claveTrazInput !== CLAVE_EDICION) {
      setClaveTrazError('Contraseña incorrecta')
      return
    }
    setPidiendoClaveTraz(false)
    ejecutarGuardarTrazabilidad()
  }

  const solicitarGuardarTrazabilidad = () => {
    if (!trazForm.transportador || !trazForm.placa_vehiculo) { alert('Ingresa el transportador y la placa del vehículo'); return }
    if (editandoTrazId) {
      setClaveTrazInput('')
      setClaveTrazError('')
      setPidiendoClaveTraz(true)
      return
    }
    ejecutarGuardarTrazabilidad()
  }

  const ejecutarGuardarTrazabilidad = async () => {
    setGuardandoTraz(true)
    const { data: { user } } = await supabase.auth.getUser()

    const payload = {
      fecha_hora_salida: trazForm.fecha_hora_salida ? new Date(trazForm.fecha_hora_salida).toISOString() : null,
      temperatura_producto: trazForm.temperatura_producto ? parseFloat(trazForm.temperatura_producto) : null,
      temperatura_vehiculo: trazForm.temperatura_vehiculo ? parseFloat(trazForm.temperatura_vehiculo) : null,
      transportador: trazForm.transportador,
      placa_vehiculo: trazForm.placa_vehiculo,
      destino_direccion: trazForm.destino_direccion || null,
      destino_ciudad: trazForm.destino_ciudad || null,
      observaciones: trazForm.observaciones || null,
      responsable_despacho: trazForm.responsable_despacho || null,
      firma_transportador: trazForm.firma_transportador || null
    }

    if (editandoTrazId) {
      const { error } = await supabase.from('trazabilidad_despacho').update(payload).eq('id', editandoTrazId)
      if (error) { alert('Error: ' + error.message); setGuardandoTraz(false); return }

      await supabase.from('auditoria').insert([{
        tabla: 'trazabilidad_despacho',
        accion: 'EDICIÓN',
        descripcion: `Guía ${trazOriginal?.folio || ''} — Venta ${ventaTrazabilidad.folio} — ${ventaTrazabilidad.cliente_nombre}`,
        datos_anteriores: trazOriginal,
        usuario_email: user?.email || 'desconocido',
        fecha: new Date().toISOString()
      }])
    } else {
      const folioGuia = await siguienteFolioGuia()
      const { error } = await supabase.from('trazabilidad_despacho').insert([{
        venta_id: ventaTrazabilidad.id,
        folio: folioGuia,
        ...payload
      }])
      if (error) { alert('Error: ' + error.message); setGuardandoTraz(false); return }
    }

    setVentaTrazabilidad(null)
    setEditandoTrazId(null)
    setTrazOriginal(null)
    setGuardandoTraz(false)
  }

  const { subtotal, descuento, iva, total } = calcularTotales()
  const { comision_valor } = calcularVendedor()
  const ventasFiltradas = filtroTipo === 'todos' ? ventas : ventas.filter(v => v.tipo === filtroTipo)

  const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }
  const cuentas = { '1': 'Bancolombia Yohe', '2': 'Bancolombia Manu', '3': 'Nequi Yohe' }

  const estadoColor = (estado) => {
    const c = { pendiente: { bg: '#FEF3DC', color: '#C07D00' }, contado: { bg: '#E8F7EF', color: '#1A9156' }, credito: { bg: '#E8F0FB', color: '#1A5FA8' }, anulado: { bg: '#FCEAEA', color: '#B22222' } }
    return c[estado] || { bg: '#F4F1ED', color: '#9A8E85' }
  }

  // Badge combinado: Contado / Remisión pendiente / Crédito (Pendiente / Parcial) / Pagada (fue a crédito)
  const badgeEstado = (v) => {
    if (v.estado === 'credito') {
      if (v.estado_pago === 'Pagada') {
        return <span style={{ background: '#E8F7EF', color: '#1A9156', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>PAGADA (fue a crédito)</span>
      }
      if (v.estado_pago === 'Parcial') {
        return <span style={{ background: '#FEF3DC', color: '#C07D00', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>CRÉDITO — PARCIAL</span>
      }
      return <span style={{ background: '#E8F0FB', color: '#1A5FA8', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>CRÉDITO — PENDIENTE</span>
    }
    const ec = estadoColor(v.estado)
    return <span style={{ background: ec.bg, color: ec.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{v.estado}</span>
  }

  return (
    <div>
      {/* Modal: pedir clave para editar */}
      {pidiendoClave && (
        <div onClick={() => setPidiendoClave(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 26, width: 380, maxWidth: '95vw', boxShadow: '0 8px 28px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 42, height: 42, background: '#E8F0FB', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>✏️</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Editar documento</div>
                <div style={{ fontSize: 12, color: '#9A8E85' }}>{pidiendoClave.folio} — {pidiendoClave.cliente_nombre}</div>
              </div>
            </div>
            <label style={{ fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 5 }}>🔐 CONTRASEÑA DE AUTORIZACIÓN</label>
            <input
              type="password"
              value={claveInput}
              onChange={e => { setClaveInput(e.target.value); setClaveError('') }}
              onKeyDown={e => e.key === 'Enter' && confirmarClaveYEditar()}
              placeholder="Ingresa la contraseña"
              style={{ width: '100%', padding: '9px 12px', border: `1px solid ${claveError ? '#B22222' : '#DDD8CF'}`, borderRadius: 7, fontSize: 13, background: '#F4F1ED', outline: 'none', boxSizing: 'border-box' }}
            />
            {claveError && <div style={{ fontSize: 12, color: '#B22222', marginTop: 5 }}>⚠️ {claveError}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button onClick={() => setPidiendoClave(null)} style={{ padding: '8px 18px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={confirmarClaveYEditar} style={{ padding: '8px 18px', background: '#1A5FA8', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Continuar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: pedir clave para GUARDAR una edición de trazabilidad de despacho */}
      {pidiendoClaveTraz && (
        <div onClick={() => setPidiendoClaveTraz(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1002 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 26, width: 380, maxWidth: '95vw', boxShadow: '0 8px 28px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 42, height: 42, background: '#FEF3DC', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🚚</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Confirmar cambios en la trazabilidad</div>
                <div style={{ fontSize: 12, color: '#9A8E85' }}>{trazOriginal?.folio} — {ventaTrazabilidad?.folio}</div>
              </div>
            </div>
            <label style={{ fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 5 }}>🔐 CONTRASEÑA DE AUTORIZACIÓN</label>
            <input
              type="password"
              value={claveTrazInput}
              onChange={e => { setClaveTrazInput(e.target.value); setClaveTrazError('') }}
              onKeyDown={e => e.key === 'Enter' && confirmarClaveYEditarTraz()}
              placeholder="Ingresa la contraseña"
              style={{ width: '100%', padding: '9px 12px', border: `1px solid ${claveTrazError ? '#B22222' : '#DDD8CF'}`, borderRadius: 7, fontSize: 13, background: '#F4F1ED', outline: 'none', boxSizing: 'border-box' }}
            />
            {claveTrazError && <div style={{ fontSize: 12, color: '#B22222', marginTop: 5 }}>⚠️ {claveTrazError}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button onClick={() => setPidiendoClaveTraz(false)} style={{ padding: '8px 18px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={confirmarClaveYEditarTraz} style={{ padding: '8px 18px', background: '#1A5FA8', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {ventaAFacturar && (
  <div onClick={() => setVentaAFacturar(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
    <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 26, width: 420, maxWidth: '95vw', boxShadow: '0 8px 28px rgba(0,0,0,0.15)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ width: 42, height: 42, background: '#E8F7EF', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🧾</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Convertir a Factura</div>
          <div style={{ fontSize: 12, color: '#9A8E85' }}>{ventaAFacturar.folio} — {ventaAFacturar.cliente_nombre}</div>
          <div style={{ fontSize: 12, color: '#1A9156', fontWeight: 600 }}>Total: ${ventaAFacturar.total?.toLocaleString()}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }}>ESTADO</label>
          <select value={datosFactura.estado} onChange={e => setDatosFactura({...datosFactura, estado: e.target.value})} style={{ width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, background: '#F4F1ED' }}>
            <option value="contado">Contado</option>
            <option value="credito">Crédito</option>
          </select>
        </div>

        {datosFactura.estado === 'contado' && (
          <div>
            <label style={{ fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }}>FORMA DE PAGO</label>
            <select value={datosFactura.metodo_pago} onChange={e => setDatosFactura({...datosFactura, metodo_pago: e.target.value})} style={{ width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, background: '#F4F1ED' }}>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </div>
        )}

        {datosFactura.estado === 'contado' && datosFactura.metodo_pago === 'transferencia' && (
          <div>
            <label style={{ fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }}>TIPO DE CUENTA</label>
            <select value={datosFactura.tipo_cuenta} onChange={e => setDatosFactura({...datosFactura, tipo_cuenta: e.target.value})} style={{ width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, background: '#F4F1ED' }}>
              <option value="">Selecciona...</option>
              <option value="1">1 — BANCOLOMBIA YOHE</option>
              <option value="2">2 — BANCOLOMBIA MANU</option>
              <option value="3">3 — NEQUI YOHE</option>
            </select>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
        <button onClick={() => setVentaAFacturar(null)} style={{ padding: '8px 18px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
        <button onClick={facturarRemision} style={{ padding: '8px 18px', background: '#1A9156', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>✅ Facturar</button>
      </div>
    </div>
  </div>
)}

      {/* Modal: trazabilidad de despacho y transporte (uso interno, no aparece en la factura) */}
      {ventaTrazabilidad && (
        <div onClick={() => { setVentaTrazabilidad(null); setEditandoTrazId(null); setTrazOriginal(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 26, width: 480, maxWidth: '95vw', boxShadow: '0 8px 28px rgba(0,0,0,0.15)', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <div style={{ width: 42, height: 42, background: '#FEF3DC', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🚚</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{editandoTrazId ? '✏️ Editar trazabilidad de despacho' : 'Trazabilidad de despacho y transporte'}</div>
                <div style={{ fontSize: 12, color: '#9A8E85' }}>{ventaTrazabilidad.folio} — {ventaTrazabilidad.cliente_nombre} (uso interno, no va en la factura)</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>FECHA Y HORA DE SALIDA</label>
                <input type="datetime-local" value={trazForm.fecha_hora_salida} onChange={e => setTrazForm({...trazForm, fecha_hora_salida: e.target.value})} style={inp} />
              </div>
              <div>
                <label style={lbl}>TEMPERATURA DEL PRODUCTO (°C)</label>
                <input type="number" value={trazForm.temperatura_producto} onChange={e => setTrazForm({...trazForm, temperatura_producto: e.target.value})} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={lbl}>TEMPERATURA DEL VEHÍCULO (°C)</label>
                <input type="number" value={trazForm.temperatura_vehiculo} onChange={e => setTrazForm({...trazForm, temperatura_vehiculo: e.target.value})} placeholder="0" style={inp} />
              </div>
              <div>
                <label style={lbl}>TRANSPORTADOR *</label>
                <input value={trazForm.transportador} onChange={e => setTrazForm({...trazForm, transportador: e.target.value})} placeholder="Nombre" style={inp} />
              </div>
              <div>
                <label style={lbl}>PLACA DEL VEHÍCULO *</label>
                <input value={trazForm.placa_vehiculo} onChange={e => setTrazForm({...trazForm, placa_vehiculo: e.target.value})} placeholder="ABC-123" style={inp} />
              </div>
              <div>
                <label style={lbl}>DESTINO — DIRECCIÓN</label>
                <input value={trazForm.destino_direccion} onChange={e => setTrazForm({...trazForm, destino_direccion: e.target.value})} placeholder="Dirección" style={inp} />
              </div>
              <div>
                <label style={lbl}>DESTINO — CIUDAD</label>
                <input value={trazForm.destino_ciudad} onChange={e => setTrazForm({...trazForm, destino_ciudad: e.target.value})} placeholder="Ciudad" style={inp} />
              </div>
              <div>
                <label style={lbl}>RESPONSABLE DE DESPACHO</label>
                <input value={trazForm.responsable_despacho} onChange={e => setTrazForm({...trazForm, responsable_despacho: e.target.value})} placeholder="Nombre" style={inp} />
              </div>
              <div>
                <label style={lbl}>FIRMA DEL TRANSPORTADOR <span style={{ fontSize: 9 }}>(nombre)</span></label>
                <input value={trazForm.firma_transportador} onChange={e => setTrazForm({...trazForm, firma_transportador: e.target.value})} placeholder="Nombre de quien recibe/transporta" style={inp} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>OBSERVACIONES</label>
                <input value={trazForm.observaciones} onChange={e => setTrazForm({...trazForm, observaciones: e.target.value})} placeholder="Notas adicionales" style={inp} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button onClick={() => { setVentaTrazabilidad(null); setEditandoTrazId(null); setTrazOriginal(null) }} style={{ padding: '8px 18px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={solicitarGuardarTrazabilidad} disabled={guardandoTraz} style={{ padding: '8px 18px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                {guardandoTraz ? 'Guardando...' : editandoTrazId ? '💾 Guardar cambios' : '🚚 Registrar despacho'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal eliminar */}
      {ventaAEliminar && (
        <ModalEliminar
          item={ventaAEliminar}
          tabla="ventas"
          descripcion={`${ventaAEliminar.folio} — ${ventaAEliminar.cliente_nombre} — $${ventaAEliminar.total?.toLocaleString()}`}
          onConfirm={eliminarVenta}
          onCancel={() => setVentaAEliminar(null)}
        />
      )}

      {/* Modal detalle */}
      {ventaDetalle && (
        <div onClick={() => setVentaDetalle(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 26, width: 500, maxWidth: '95vw', boxShadow: '0 8px 28px rgba(0,0,0,0.15)', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{ventaDetalle.folio}</div>
              <span onClick={() => setVentaDetalle(null)} style={{ cursor: 'pointer', fontSize: 20, color: '#9A8E85' }}>×</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, marginBottom: 16 }}>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>CLIENTE</span><br/><b>{ventaDetalle.cliente_nombre}</b></div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>TIPO</span><br/>{ventaDetalle.tipo === 'remision' ? 'Remisión' : 'Venta'}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>ESTADO</span><br/>{badgeEstado(ventaDetalle)}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>FORMA DE PAGO</span><br/>{ventaDetalle.metodo_pago || '—'}</div>
              {ventaDetalle.tipo_cuenta && <div><span style={{ color: '#9A8E85', fontSize: 11 }}>CUENTA</span><br/>{cuentas[ventaDetalle.tipo_cuenta]}</div>}
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>VENDEDOR</span><br/>{ventaDetalle.vendedor || '—'}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>COMISIÓN</span><br/>${ventaDetalle.comision_valor?.toLocaleString() || '0'}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>SUBTOTAL</span><br/>${ventaDetalle.subtotal?.toLocaleString()}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>DESCUENTO</span><br/>${ventaDetalle.descuento?.toLocaleString()}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>IVA</span><br/>${ventaDetalle.iva?.toLocaleString()}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>TOTAL</span><br/><b style={{ fontSize: 16, color: '#B22222' }}>${ventaDetalle.total?.toLocaleString()}</b></div>
            </div>
            {detalleItems.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 8 }}>PRODUCTOS Y LOTES</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#F4F1ED' }}>
                      {['Producto', 'Cantidad', 'Lote(s)'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detalleItems.map((it, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #DDD8CF' }}>
                        <td style={{ padding: '6px 8px', fontWeight: 500 }}>{it.nombre_producto}</td>
                        <td style={{ padding: '6px 8px' }}>{it.cantidad} {it.unidad}</td>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#1A5FA8', fontWeight: 600 }}>
                          {it.lotes.length > 0 ? it.lotes.map(l => `${l.codigo_lote} (${l.cantidad_usada})`).join(', ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {ventaDetalle.observaciones && (
              <div style={{ fontSize: 13, color: '#9A8E85' }}>
                <span style={{ fontSize: 11 }}>OBSERVACIONES</span><br/>{ventaDetalle.observaciones}
              </div>
            )}
          </div>
        </div>
      )}

      {ventaImprimir && (
        <DocumentoVenta venta={ventaImprimir} onCerrar={() => setVentaImprimir(null)} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>🛒 Ventas</div>
          <div style={{ fontSize: 13, color: '#5A4F47', marginTop: 4 }}>
            {loading ? '...' : `${ventas.length} registros`}
          </div>
        </div>
        <button onClick={abrirNuevaVenta} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ＋ Nueva venta
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {['todos', 'venta', 'remision'].map(t => (
          <button key={t} onClick={() => setFiltroTipo(t)} style={{
            padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 500,
            cursor: 'pointer', border: 'none',
            background: filtroTipo === t ? '#B22222' : '#fff',
            color: filtroTipo === t ? '#fff' : '#5A4F47',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
          }}>
            {t === 'todos' ? 'Todos' : t === 'venta' ? 'Ventas' : 'Remisiones'}
          </button>
        ))}
      </div>

      {mostrarForm && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
            {editandoId ? `✏️ Editando: ${ventaOriginal?.venta.folio}` : 'Nueva venta / remisión'}
          </div>

          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>TIPO DE DOCUMENTO</div>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" checked={venta.tipo === 'venta'} onChange={() => setVenta({...venta, tipo: 'venta'})} />
                🧾 Venta directa
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" checked={venta.tipo === 'remision'} onChange={() => setVenta({...venta, tipo: 'remision'})} />
                📦 Remisión
              </label>
            </div>
            {venta.tipo === 'remision' && (
              <div style={{ marginTop: 10, padding: 8, background: '#FEF3DC', borderRadius: 7, fontSize: 12, color: '#C07D00' }}>
                ⚠️ La remisión descuenta stock pero queda pendiente de facturar.
              </div>
            )}
          </div>

          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>DATOS GENERALES</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>CLIENTE *</label>
                <select value={venta.cliente_id} onChange={e => setVenta({...venta, cliente_id: e.target.value})} style={inp}>
                  <option value="">Selecciona un cliente...</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{c.empresa}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>VENDEDOR</label>
                <select value={venta.vendedor_id} onChange={e => setVenta({...venta, vendedor_id: e.target.value})} style={inp}>
                  <option value="">Sin vendedor</option>
                  {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </select>
              </div>
              {venta.tipo === 'venta' && (
                <div>
                  <label style={lbl}>ESTADO</label>
                  <select value={venta.estado} onChange={e => setVenta({...venta, estado: e.target.value})} style={inp}>
                    <option value="contado">Contado</option>
                    <option value="credito">Crédito</option>
                  </select>
                </div>
              )}
              {venta.tipo === 'venta' && venta.estado === 'contado' && (
                <>
                  <div>
                    <label style={lbl}>FORMA DE PAGO</label>
                    <select value={venta.metodo_pago} onChange={e => setVenta({...venta, metodo_pago: e.target.value})} style={inp}>
                      <option value="efectivo">Efectivo</option>
                      <option value="transferencia">Transferencia</option>
                    </select>
                  </div>
                  {venta.metodo_pago === 'transferencia' && (
                    <div>
                      <label style={lbl}>TIPO DE CUENTA</label>
                      <select value={venta.tipo_cuenta || ''} onChange={e => setVenta({...venta, tipo_cuenta: e.target.value})} style={inp}>
                        <option value="">Selecciona...</option>
                        <option value="1">1 — BANCOLOMBIA YOHE</option>
                        <option value="2">2 — BANCOLOMBIA MANU</option>
                        <option value="3">3 — NEQUI YOHE</option>
                      </select>
                      <div style={{ marginTop: 8, background: '#E8F0FB', borderRadius: 7, padding: 10, fontSize: 12, color: '#1A5FA8' }}>
                        ℹ️ <b>Instrucciones de pago:</b><br/>
                        <b>1.</b> Bancolombia Yohe — Ahorros 123-456789-00<br/>
                        <b>2.</b> Bancolombia Manu — Ahorros 123-456789-01<br/>
                        <b>3.</b> Nequi Yohe — 300 629 3875
                      </div>
                    </div>
                  )}
                </>
              )}
              {venta.estado === 'credito' && (
                <div>
                  <label style={lbl}>FECHA VENCIMIENTO</label>
                  <input type="date" value={venta.fecha_vencimiento} onChange={e => setVenta({...venta, fecha_vencimiento: e.target.value})} style={inp} />
                </div>
              )}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>OBSERVACIONES</label>
                <input value={venta.observaciones} onChange={e => setVenta({...venta, observaciones: e.target.value})} placeholder="Notas adicionales" style={inp} />
              </div>
            </div>
          </div>

          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600 }}>PRODUCTOS</div>
              <button onClick={agregarItem} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>＋ Agregar</button>
            </div>

            {items.length === 0 && (
              <div style={{ padding: 12, background: '#fff', borderRadius: 7, fontSize: 12, color: '#9A8E85', textAlign: 'center' }}>
                Haz clic en "＋ Agregar" para añadir productos
              </div>
            )}

            {items.map((item, index) => {
              const totalLotes = item.lotes_usados.reduce((s, l) => s + (parseFloat(l.cantidad_usada) || 0), 0)
              const loteOk = Math.abs(totalLotes - (parseFloat(item.cantidad) || 0)) < 0.001
              return (
              <div key={index} style={{ background: '#fff', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                  <div>
                    <label style={lbl}>PRODUCTO</label>
                    <select value={item.producto_id} onChange={e => actualizarItem(index, 'producto_id', e.target.value)} style={inp}>
                      <option value="">Selecciona...</option>
                      {productos.map(p => (
                        <option key={p.id} value={p.id}>{p.codigo} — {p.nombre} (Stock: {p.stock_actual} {p.unidad})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>LISTA PRECIO</label>
                    <select value={item.precio_lista} onChange={e => actualizarItem(index, 'precio_lista', parseInt(e.target.value))} style={inp}>
                      <option value={1}>Precio 1</option>
                      <option value={2}>Precio 2</option>
                      <option value={3}>Precio 3</option>
                      <option value={4}>Precio 4</option>
                      <option value={5}>Precio 5</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>CANTIDAD</label>
                    <input type="number" value={item.cantidad} onChange={e => actualizarItem(index, 'cantidad', e.target.value)} placeholder="0" style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>UNIDAD</label>
                    <select value={item.unidad} onChange={e => actualizarItem(index, 'unidad', e.target.value)} style={inp}>
                      <option value="kg">kg</option>
                      <option value="und">und</option>
                      <option value="lb">lb</option>
                      <option value="g">g</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>SUBTOTAL</label>
                    <div style={{ ...inp, background: '#E8F7EF', color: '#1A9156', fontWeight: 600 }}>
                      ${(item.subtotal || 0).toLocaleString()}
                    </div>
                  </div>
                  <button onClick={() => eliminarItem(index)} style={{ padding: '8px 10px', background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 14, marginBottom: 1 }}>✕</button>
                </div>
                {item.precio_unitario > 0 && (
                  <div style={{ fontSize: 11, color: '#9A8E85', marginTop: 6 }}>
                    Precio unitario: ${item.precio_unitario.toLocaleString()} / {item.unidad}
                  </div>
                )}

                {/* Lote(s) — para trazabilidad interna, no aparece en la factura */}
                {item.producto_id && item.cantidad && (
                  <div style={{ background: '#F4F1ED', borderRadius: 7, padding: 10, marginTop: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: '#9A8E85', fontWeight: 600 }}>📦 LOTE(S) — trazabilidad interna</div>
                      <button onClick={() => agregarLoteItem(index)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>＋ Lote</button>
                    </div>
                    {item.lotes_disponibles.length === 0 && (
                      <div style={{ fontSize: 11, color: '#B22222' }}>⚠️ No hay lotes con stock disponible para este producto</div>
                    )}
                    {item.lotes_usados.map((lu, loteIdx) => (
                      <div key={loteIdx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'end', marginBottom: 6 }}>
                        <div>
                          <select value={lu.lote_id} onChange={e => actualizarLoteItem(index, loteIdx, 'lote_id', e.target.value)} style={inp}>
                            <option value="">Selecciona lote...</option>
                            {item.lotes_disponibles.map(l => (
                              <option key={l.id} value={l.id}>{l.codigo_lote} — Disp: {l.cantidad_actual} {item.unidad}{l.fecha_vencimiento ? ` | Vence: ${l.fecha_vencimiento}` : ''}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <input type="number" value={lu.cantidad_usada} onChange={e => actualizarLoteItem(index, loteIdx, 'cantidad_usada', e.target.value)} placeholder="0" style={inp} />
                        </div>
                        <button onClick={() => eliminarLoteItem(index, loteIdx)} style={{ padding: '8px 9px', background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, marginBottom: 1 }}>✕</button>
                      </div>
                    ))}
                    <div style={{ fontSize: 11, color: loteOk ? '#1A9156' : '#B22222' }}>
                      Total asignado: {totalLotes.toLocaleString('es-CO', { maximumFractionDigits: 2 })} / {(parseFloat(item.cantidad) || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 })} {item.unidad} {loteOk && '✓'}
                    </div>
                  </div>
                )}
              </div>
              )
            })}
          </div>

          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>TOTALES</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={lbl}>DESCUENTO $</label>
                <input type="number" value={venta.descuento} onChange={e => setVenta({...venta, descuento: e.target.value})} placeholder="0" style={inp} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 18 }}>
                <input type="checkbox" checked={venta.iva} onChange={e => setVenta({...venta, iva: e.target.checked})} id="iva" />
                <label htmlFor="iva" style={{ fontSize: 13, cursor: 'pointer' }}>Aplicar IVA 19%</label>
              </div>
              {venta.vendedor_id && (
                <div style={{ padding: 10, background: '#E8F0FB', borderRadius: 7, fontSize: 12 }}>
                  <span style={{ color: '#9A8E85' }}>Comisión vendedor:</span><br/>
                  <b style={{ color: '#1A5FA8' }}>${comision_valor.toLocaleString()}</b>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5A4F47' }}>
                <span>Subtotal</span><span style={{ fontFamily: 'monospace' }}>${subtotal.toLocaleString()}</span>
              </div>
              {descuento > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#B22222' }}>
                  <span>Descuento</span><span style={{ fontFamily: 'monospace' }}>−${descuento.toLocaleString()}</span>
                </div>
              )}
              {iva > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5A4F47' }}>
                  <span>IVA 19%</span><span style={{ fontFamily: 'monospace' }}>${iva.toLocaleString()}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, borderTop: '1px solid #DDD8CF', paddingTop: 8, marginTop: 4 }}>
                <span>TOTAL</span><span style={{ fontFamily: 'monospace', color: '#B22222' }}>${total.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => { setMostrarForm(false); setItems([]); setEditandoId(null); setVentaOriginal(null) }} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={guardar} disabled={guardando} style={{ padding: '8px 16px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {guardando ? 'Guardando...' : editandoId ? '💾 Actualizar' : venta.tipo === 'remision' ? '📦 Crear Remisión' : '🧾 Crear Venta'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85' }}>Cargando...</div>
      ) : ventasFiltradas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🛒</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No hay ventas registradas</div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F4F1ED' }}>
                {['Folio','Cliente','Tipo','Estado','Pago','Vendedor','Total','Fecha','Acciones'].map(h => (
                  <th key={h} style={{ padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ventasFiltradas.map(v => {
                return (
                  <tr key={v.id} style={{ borderBottom: '1px solid #DDD8CF' }}>
                    <td style={{ padding: '11px 16px', fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: '#B22222' }}>{v.folio}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600 }}>{v.cliente_nombre}</td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ background: v.tipo === 'venta' ? '#E8F7EF' : '#FEF3DC', color: v.tipo === 'venta' ? '#1A9156' : '#C07D00', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500 }}>
                        {v.tipo === 'venta' ? 'Venta' : 'Remisión'}
                      </span>
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      {badgeEstado(v)}
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 13 }}>{v.metodo_pago || '—'}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13 }}>{v.vendedor || '—'}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: '#1A9156' }}>${v.total?.toLocaleString()}</td>
                    <td style={{ padding: '11px 16px', fontSize: 11, color: '#9A8E85', fontFamily: 'monospace' }}>
                      {new Date(v.creado_en).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}
                    </td>
                    <td style={{ padding: '8px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => verDetalleVenta(v)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                          👁️
                        </button>
                        <button onClick={() => setVentaImprimir(v)} style={{ background: '#E8F7EF', color: '#1A9156', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                          🖨️
                        </button>
                        <button onClick={() => abrirTrazabilidad(v)} style={{ background: '#FEF3DC', color: '#C07D00', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                          🚚
                        </button>
                        <button onClick={() => solicitarEdicion(v)} style={{ background: '#FEF3DC', color: '#C07D00', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                          ✏️
                        </button>
                        <button onClick={() => setVentaAEliminar(v)} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                          🗑️
                        </button>
                        {v.tipo === 'remision' && v.estado === 'pendiente' && (
  <button onClick={() => setVentaAFacturar(v)} style={{ background: '#E8F7EF', color: '#1A9156', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
    🧾
  </button>
)}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}