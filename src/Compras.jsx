import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import ModalEliminar from './ModalEliminar'

const hoyISO = () => new Date().toISOString().split('T')[0]

export default function Compras() {
  const [compras, setCompras] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [materiasPrimas, setMateriasPrimas] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [compraDetalle, setCompraDetalle] = useState(null)
  const [compraItems, setCompraItems] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [errorMontos, setErrorMontos] = useState('')
  const [items, setItems] = useState([])
  const [trazabilidad, setTrazabilidad] = useState([])
  const [compraAEliminar, setCompraAEliminar] = useState(null)
  const [editandoId, setEditandoId] = useState(null)
  const [compraOriginal, setCompraOriginal] = useState(null)
  const [pidiendoClave, setPidiendoClave] = useState(null)
  const [claveInput, setClaveInput] = useState('')
  const [claveError, setClaveError] = useState('')

  const [compra, setCompra] = useState({
    proveedor_id: '', factura_proveedor: '',
    fecha_compra: hoyISO(),
    estado: 'contado', metodo_pago: 'efectivo',
    tipo_cuenta1: '', monto1: '', tipo_cuenta2: '', monto2: '',
    descuento: 0, observaciones: ''
  })

  useEffect(() => { cargar(); cargarProveedores(); cargarMaterias() }, [])

  const cargar = async () => {
    setLoading(true)
    const { data } = await supabase.from('compras').select('*').order('creado_en', { ascending: false })
    setCompras(data || [])
    setLoading(false)
  }

  const cargarProveedores = async () => {
    const { data } = await supabase.from('proveedores').select('*').eq('activo', true).order('empresa')
    setProveedores(data || [])
  }

  const cargarMaterias = async () => {
    const { data } = await supabase.from('productos').select('*').eq('tipo_inventario', 'materia_prima').order('categoria_mp')
    setMateriasPrimas(data || [])
  }

  const siguienteFolio = async () => {
    const { data } = await supabase.from('compras').select('folio').order('folio', { ascending: false }).limit(1)
    if (!data || data.length === 0) return 'COM-0001'
    const numero = parseInt(data[0].folio.replace('COM-', '')) + 1
    return `COM-${String(numero).padStart(4, '0')}`
  }

  const generarCodigoLote = async (producto) => {
    const prefijoCodigo = producto.codigo.split('-').slice(0, 2).join('-')
    const { data } = await supabase.from('compra_items').select('codigo_lote').like('codigo_lote', `${prefijoCodigo}-L%`)
    const siguiente = (data?.length || 0) + 1
    return `${prefijoCodigo}-L${String(siguiente).padStart(4, '0')}`
  }

  const trazVacio = () => ({
    fecha_vencimiento: '', hora_recepcion: '',
    temperatura_recepcion: '', responsable: '',
    estado_empaque: '', cumple_especificaciones: '', observaciones: '',
    vehiculo_limpio: '', libre_plagas: '', temperatura_transporte: '', numero_placa: '',
    numero_unidades: '', lote_proveedor: ''
  })

  const cerrarForm = () => {
    setMostrarForm(false); setItems([]); setTrazabilidad([])
    setErrorMontos(''); setEditandoId(null); setCompraOriginal(null)
    setCompra({ proveedor_id: '', factura_proveedor: '', fecha_compra: hoyISO(), estado: 'contado', metodo_pago: 'efectivo', tipo_cuenta1: '', monto1: '', tipo_cuenta2: '', monto2: '', descuento: 0, observaciones: '' })
  }

  const agregarItem = () => {
    setItems([...items, { producto_id: '', nombre_producto: '', codigo_producto: '', cantidad: '', unidad: 'kg', costo_unitario: '', subtotal: 0 }])
    setTrazabilidad([...trazabilidad, trazVacio()])
  }

  const actualizarItem = (index, campo, valor) => {
    const updated = [...items]
    updated[index][campo] = valor
    if (campo === 'producto_id') {
      const prod = materiasPrimas.find(p => p.id === valor)
      if (prod) {
        updated[index].nombre_producto = prod.nombre
        updated[index].codigo_producto = prod.codigo
        updated[index].unidad = prod.unidad || 'kg'
        updated[index].costo_unitario = prod.ultimo_costo || prod.precio_kg || 0
      }
    }
    if (campo === 'cantidad' || campo === 'costo_unitario') {
      updated[index].subtotal = (parseFloat(updated[index].cantidad) || 0) * (parseFloat(updated[index].costo_unitario) || 0)
    }
    setItems(updated)
  }

  const actualizarTrazabilidad = (index, campo, valor) => {
    const updated = [...trazabilidad]
    updated[index][campo] = valor
    setTrazabilidad(updated)
  }

  const eliminarItem = (index) => {
    setItems(items.filter((_, i) => i !== index))
    setTrazabilidad(trazabilidad.filter((_, i) => i !== index))
  }

  const calcularTotales = () => {
    const subtotal = items.reduce((s, i) => s + (i.subtotal || 0), 0)
    const descuento = parseFloat(compra.descuento) || 0
    return { subtotal, descuento, total: subtotal - descuento }
  }

  const validarMontos = (total) => {
    if (compra.estado !== 'contado') return true
    if (compra.metodo_pago === 'efectivo' || compra.metodo_pago === 'transferencia') return true
    const m1 = parseFloat(compra.monto1) || 0
    const m2 = parseFloat(compra.monto2) || 0
    if (Math.abs((m1 + m2) - total) > 1) {
      setErrorMontos(`Los montos suman $${(m1+m2).toLocaleString()} pero el total es $${total.toLocaleString()}.`)
      return false
    }
    setErrorMontos(''); return true
  }

  const revertirCompra = async (c, itemsCompra) => {
    for (const item of itemsCompra) {
      const { data: prod } = await supabase.from('productos').select('stock_actual, costo_promedio').eq('id', item.producto_id).single()
      if (prod) {
        const nuevoStock = Math.max(0, (prod.stock_actual || 0) - item.cantidad)
        await supabase.from('productos').update({ stock_actual: nuevoStock }).eq('id', item.producto_id)
      }
      await supabase.from('lotes').delete().eq('codigo_lote', item.codigo_lote)
    }
    if (c.estado === 'credito') {
      const { data: prov } = await supabase.from('proveedores').select('saldo_pendiente').eq('id', c.proveedor_id).single()
      if (prov) await supabase.from('proveedores').update({ saldo_pendiente: Math.max(0, (prov.saldo_pendiente || 0) - c.total) }).eq('id', c.proveedor_id)
    }
    await supabase.from('egresos').delete().eq('compra_id', c.id)
    await supabase.from('compra_items').delete().eq('compra_id', c.id)
    await supabase.from('trazabilidad_recepcion').delete().eq('compra_id', c.id)
  }

  const solicitarEdicion = (c) => { setPidiendoClave(c); setClaveInput(''); setClaveError('') }

  const confirmarClaveYEditar = async () => {
    if (claveInput !== '1234') { setClaveError('Contraseña incorrecta'); return }
    const c = pidiendoClave
    setPidiendoClave(null)
    const { data: itemsC } = await supabase.from('compra_items').select('*').eq('compra_id', c.id)

    // Cargar trazabilidad existente para precargar el formulario
    const { data: trazC } = await supabase.from('trazabilidad_recepcion').select('*').eq('compra_id', c.id)
    const trazMap = {}
    ;(trazC || []).forEach(t => { trazMap[t.compra_item_id] = t })

    setEditandoId(c.id)
    setCompraOriginal({ compra: c, items: itemsC || [] })
    setCompra({
      proveedor_id: c.proveedor_id || '', factura_proveedor: c.factura_proveedor || '',
      fecha_compra: c.fecha_compra || c.creado_en?.split('T')[0] || hoyISO(),
      estado: c.estado || 'contado', metodo_pago: c.metodo_pago || 'efectivo',
      tipo_cuenta1: c.tipo_cuenta1 || '', monto1: c.monto1 || '',
      tipo_cuenta2: c.tipo_cuenta2 || '', monto2: c.monto2 || '',
      descuento: c.descuento || 0, observaciones: c.observaciones || ''
    })
    setItems((itemsC || []).map(i => ({
      producto_id: i.producto_id, nombre_producto: i.nombre_producto,
      codigo_producto: i.codigo_producto, cantidad: i.cantidad,
      unidad: i.unidad, costo_unitario: i.costo_unitario, subtotal: i.subtotal
    })))
    // Precargar trazabilidad con datos existentes
    setTrazabilidad((itemsC || []).map(i => {
      const t = trazMap[i.id]
      if (!t) return trazVacio()
      return {
        fecha_vencimiento: t.fecha_vencimiento || '',
        hora_recepcion: t.hora_recepcion || '',
        temperatura_recepcion: t.temperatura_recepcion ?? '',
        responsable: t.responsable || '',
        estado_empaque: t.estado_empaque || '',
        cumple_especificaciones: t.cumple_especificaciones === true ? 'si' : t.cumple_especificaciones === false ? 'no' : '',
        observaciones: t.observaciones || '',
        vehiculo_limpio: t.vehiculo_limpio || '',
        libre_plagas: t.libre_plagas || '',
        temperatura_transporte: t.temperatura_transporte ?? '',
        numero_placa: t.numero_placa || '',
        numero_unidades: t.numero_unidades || '',
        lote_proveedor: t.lote_proveedor || ''
      }
    }))
    setMostrarForm(true)
  }

  const guardar = async () => {
    if (!compra.proveedor_id) { alert('Selecciona un proveedor'); return }
    if (items.length === 0) { alert('Agrega al menos un producto'); return }
    if (items.some(i => !i.producto_id || !i.cantidad || !i.costo_unitario)) { alert('Completa todos los campos'); return }

    const { subtotal, descuento, total } = calcularTotales()
    if (!validarMontos(total)) return

    setGuardando(true)
    const proveedor = proveedores.find(p => p.id === compra.proveedor_id)
    const { data: { user } } = await supabase.auth.getUser()
    let compraId, folio

    if (editandoId) {
      await revertirCompra(compraOriginal.compra, compraOriginal.items)
      folio = compraOriginal.compra.folio
      compraId = editandoId
      await supabase.from('compras').update({
        proveedor_id: compra.proveedor_id, proveedor_nombre: proveedor?.empresa || '',
        factura_proveedor: compra.factura_proveedor || null,
        fecha_compra: compra.fecha_compra || hoyISO(),
        estado: compra.estado, metodo_pago: compra.estado === 'credito' ? null : compra.metodo_pago,
        tipo_cuenta1: compra.tipo_cuenta1 || null, monto1: parseFloat(compra.monto1) || 0,
        tipo_cuenta2: compra.tipo_cuenta2 || null, monto2: parseFloat(compra.monto2) || 0,
        subtotal, descuento, total, observaciones: compra.observaciones
      }).eq('id', compraId)
      await supabase.from('auditoria').insert([{
        tabla: 'compras', accion: 'EDICIÓN',
        descripcion: `${folio} — ${proveedor?.empresa} — Total nuevo: $${total.toLocaleString()}`,
        datos_anteriores: compraOriginal.compra, usuario_email: user?.email || 'desconocido', fecha: new Date().toISOString()
      }])
    } else {
      folio = await siguienteFolio()
      const { data, error } = await supabase.from('compras').insert([{
        folio, proveedor_id: compra.proveedor_id, proveedor_nombre: proveedor?.empresa || '',
        factura_proveedor: compra.factura_proveedor || null,
        fecha_compra: compra.fecha_compra || hoyISO(),
        estado: compra.estado, metodo_pago: compra.estado === 'credito' ? null : compra.metodo_pago,
        tipo_cuenta1: compra.tipo_cuenta1 || null, monto1: parseFloat(compra.monto1) || 0,
        tipo_cuenta2: compra.tipo_cuenta2 || null, monto2: parseFloat(compra.monto2) || 0,
        subtotal, descuento, total, observaciones: compra.observaciones, usuario_email: user?.email
      }]).select()
      if (error) { alert('Error: ' + error.message); setGuardando(false); return }
      compraId = data[0].id
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const traz = trazabilidad[i]
      const prod = materiasPrimas.find(p => p.id === item.producto_id)
      const codigo_lote = await generarCodigoLote(prod)
      const cantidadNueva = parseFloat(item.cantidad)
      const costoNuevo = parseFloat(item.costo_unitario)

      const { data: itemData } = await supabase.from('compra_items').insert([{
        compra_id: compraId, producto_id: item.producto_id,
        nombre_producto: item.nombre_producto, codigo_producto: item.codigo_producto,
        cantidad: cantidadNueva, unidad: item.unidad,
        costo_unitario: costoNuevo, subtotal: item.subtotal, codigo_lote
      }]).select()

      const { data: prodActual } = await supabase.from('productos').select('stock_actual, costo_promedio, ultimo_costo').eq('id', item.producto_id).single()
      const stockActual = parseFloat(prodActual?.stock_actual) || 0
      const costoActual = parseFloat(prodActual?.costo_promedio) || parseFloat(prodActual?.ultimo_costo) || costoNuevo
      const nuevoStock = stockActual + cantidadNueva
      const costoPromedio = nuevoStock > 0 ? Math.round(((stockActual * costoActual) + (cantidadNueva * costoNuevo)) / nuevoStock) : costoNuevo

      await supabase.from('productos').update({ stock_actual: nuevoStock, ultimo_costo: costoNuevo, costo_promedio: costoPromedio }).eq('id', item.producto_id)

      await supabase.from('lotes').insert([{
        producto_id: item.producto_id, codigo_lote,
        cantidad_inicial: cantidadNueva, cantidad_actual: cantidadNueva,
        fecha_ingreso: compra.fecha_compra || hoyISO(),
        fecha_vencimiento: traz.fecha_vencimiento || null
      }])

      if (prod?.categoria_mp !== 'empaques' && itemData?.[0]) {
        const { error: trazError } = await supabase.from('trazabilidad_recepcion').insert([{
          compra_id: compraId,
          compra_item_id: itemData[0].id,
          producto_id: item.producto_id,
          nombre_producto: item.nombre_producto,
          fecha_vencimiento: traz.fecha_vencimiento || null,
          hora_recepcion: traz.hora_recepcion || null,
          temperatura_recepcion: traz.temperatura_recepcion !== '' ? parseFloat(traz.temperatura_recepcion) : null,
          responsable: traz.responsable || null,
          estado_empaque: traz.estado_empaque || null,
          cumple_especificaciones: traz.cumple_especificaciones === 'si' ? true : traz.cumple_especificaciones === 'no' ? false : null,
          observaciones: traz.observaciones || null,
          vehiculo_limpio: traz.vehiculo_limpio || null,
          libre_plagas: traz.libre_plagas || null,
          temperatura_transporte: traz.temperatura_transporte !== '' ? parseFloat(traz.temperatura_transporte) : null,
          numero_placa: traz.numero_placa || null,
          numero_unidades: traz.numero_unidades ? parseInt(traz.numero_unidades) : null,
          lote_proveedor: traz.lote_proveedor || null
        }])
        if (trazError) console.log('TRAZ ERROR:', trazError)
      }
    }

    if (compra.estado === 'contado') {
      if (compra.metodo_pago === 'efectivo') {
        await supabase.from('egresos').insert([{ compra_id: compraId, concepto: `Compra ${folio} — ${proveedor?.empresa}`, metodo_pago: 'efectivo', monto: total }])
      } else if (compra.metodo_pago === 'transferencia') {
        await supabase.from('egresos').insert([{ compra_id: compraId, concepto: `Compra ${folio} — ${proveedor?.empresa}`, metodo_pago: `transferencia cuenta ${compra.tipo_cuenta1}`, monto: total }])
      } else if (compra.metodo_pago === 'efectivo_transferencia') {
        await supabase.from('egresos').insert([
          { compra_id: compraId, concepto: `Compra ${folio} (efectivo)`, metodo_pago: 'efectivo', monto: parseFloat(compra.monto1) || 0 },
          { compra_id: compraId, concepto: `Compra ${folio} (transferencia)`, metodo_pago: `transferencia cuenta ${compra.tipo_cuenta2}`, monto: parseFloat(compra.monto2) || 0 }
        ])
      } else if (compra.metodo_pago === 'transferencia_transferencia') {
        await supabase.from('egresos').insert([
          { compra_id: compraId, concepto: `Compra ${folio} (transf. 1)`, metodo_pago: `transferencia cuenta ${compra.tipo_cuenta1}`, monto: parseFloat(compra.monto1) || 0 },
          { compra_id: compraId, concepto: `Compra ${folio} (transf. 2)`, metodo_pago: `transferencia cuenta ${compra.tipo_cuenta2}`, monto: parseFloat(compra.monto2) || 0 }
        ])
      }
    }

    if (compra.estado === 'credito') {
      const { data: provActual } = await supabase.from('proveedores').select('saldo_pendiente').eq('id', compra.proveedor_id).single()
      await supabase.from('proveedores').update({ saldo_pendiente: (provActual?.saldo_pendiente || 0) + total }).eq('id', compra.proveedor_id)
    }

    cerrarForm(); setGuardando(false); cargar(); cargarMaterias()
  }

  const eliminarCompra = async () => {
    const c = compraAEliminar
    const { data: itemsC } = await supabase.from('compra_items').select('*').eq('compra_id', c.id)
    await revertirCompra(c, itemsC || [])
    await supabase.from('compras').delete().eq('id', c.id)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('auditoria').insert([{
      tabla: 'compras', accion: 'ELIMINACIÓN',
      descripcion: `${c.folio} — ${c.proveedor_nombre} — $${c.total?.toLocaleString()} (Stock y saldo revertidos)`,
      datos_anteriores: c, usuario_email: user?.email || 'desconocido', fecha: new Date().toISOString()
    }])
    setCompraAEliminar(null); cargar(); cargarMaterias()
  }

  const verDetalle = async (c) => {
    const { data } = await supabase.from('compra_items').select('*').eq('compra_id', c.id)
    setCompraItems(data || []); setCompraDetalle(c)
  }

  const { subtotal, descuento, total } = calcularTotales()
  const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }
  const opcionesInsp = [{ value: '', label: 'Selecciona...' }, { value: 'cumple', label: '✓ Cumple' }, { value: 'no_cumple', label: '✗ No cumple' }, { value: 'na', label: 'N/A' }]

  // Badge de Estado: Contado / Crédito (pendiente o parcial) / Pagada (fue a crédito)
  const badgeEstado = (c) => {
    if (c.estado === 'contado') {
      return <span style={{ background: '#E8F7EF', color: '#1A9156', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>CONTADO</span>
    }
    // estado === 'credito'
    if (c.estado_pago === 'Pagada') {
      return <span style={{ background: '#E8F7EF', color: '#1A9156', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>PAGADA (fue a crédito)</span>
    }
    if (c.estado_pago === 'Parcial') {
      return <span style={{ background: '#FEF3DC', color: '#C07D00', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>CRÉDITO — PARCIAL</span>
    }
    return <span style={{ background: '#E8F0FB', color: '#1A5FA8', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>CRÉDITO — PENDIENTE</span>
  }

  return (
    <div>
      {/* Modal clave */}
      {pidiendoClave && (
        <div onClick={() => setPidiendoClave(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 26, width: 380, maxWidth: '95vw', boxShadow: '0 8px 28px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 42, height: 42, background: '#FEF3DC', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>✏️</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Editar compra</div>
                <div style={{ fontSize: 12, color: '#9A8E85' }}>{pidiendoClave.folio} — {pidiendoClave.proveedor_nombre}</div>
              </div>
            </div>
            <label style={{ fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 5 }}>🔐 CONTRASEÑA DE AUTORIZACIÓN</label>
            <input type="password" value={claveInput} onChange={e => { setClaveInput(e.target.value); setClaveError('') }} onKeyDown={e => e.key === 'Enter' && confirmarClaveYEditar()} placeholder="Ingresa la contraseña" style={{ width: '100%', padding: '9px 12px', border: `1px solid ${claveError ? '#B22222' : '#DDD8CF'}`, borderRadius: 7, fontSize: 13, background: '#F4F1ED', outline: 'none', boxSizing: 'border-box' }} />
            {claveError && <div style={{ fontSize: 12, color: '#B22222', marginTop: 5 }}>⚠️ {claveError}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button onClick={() => setPidiendoClave(null)} style={{ padding: '8px 18px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
              <button onClick={confirmarClaveYEditar} style={{ padding: '8px 18px', background: '#C07D00', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Continuar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal eliminar */}
      {compraAEliminar && (
        <ModalEliminar item={compraAEliminar} tabla="compras"
          descripcion={`${compraAEliminar.folio} — ${compraAEliminar.proveedor_nombre} — $${compraAEliminar.total?.toLocaleString()}`}
          onConfirm={eliminarCompra} onCancel={() => setCompraAEliminar(null)} />
      )}

      {/* Modal detalle */}
      {compraDetalle && (
        <div onClick={() => setCompraDetalle(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 26, width: 560, maxWidth: '95vw', boxShadow: '0 8px 28px rgba(0,0,0,0.15)', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{compraDetalle.folio}</div>
              <span onClick={() => setCompraDetalle(null)} style={{ cursor: 'pointer', fontSize: 20, color: '#9A8E85' }}>×</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, marginBottom: 16 }}>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>PROVEEDOR</span><br/><b>{compraDetalle.proveedor_nombre}</b></div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>ESTADO</span><br/>{badgeEstado(compraDetalle)}</div>
              {compraDetalle.factura_proveedor && <div><span style={{ color: '#9A8E85', fontSize: 11 }}>FACTURA PROVEEDOR</span><br/>{compraDetalle.factura_proveedor}</div>}
              {compraDetalle.fecha_compra && <div><span style={{ color: '#9A8E85', fontSize: 11 }}>FECHA COMPRA</span><br/>{compraDetalle.fecha_compra}</div>}
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>FORMA DE PAGO</span><br/>{compraDetalle.metodo_pago || '—'}</div>
              {compraDetalle.monto1 > 0 && <div><span style={{ color: '#9A8E85', fontSize: 11 }}>MONTO 1</span><br/>${compraDetalle.monto1?.toLocaleString()}{compraDetalle.tipo_cuenta1 ? ` (Cta ${compraDetalle.tipo_cuenta1})` : ''}</div>}
              {compraDetalle.monto2 > 0 && <div><span style={{ color: '#9A8E85', fontSize: 11 }}>MONTO 2</span><br/>${compraDetalle.monto2?.toLocaleString()}{compraDetalle.tipo_cuenta2 ? ` (Cta ${compraDetalle.tipo_cuenta2})` : ''}</div>}
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>SUBTOTAL</span><br/>${compraDetalle.subtotal?.toLocaleString()}</div>
              {compraDetalle.descuento > 0 && <div><span style={{ color: '#9A8E85', fontSize: 11 }}>DESCUENTO</span><br/>-${compraDetalle.descuento?.toLocaleString()}</div>}
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>TOTAL</span><br/><b style={{ fontSize: 16, color: '#B22222' }}>${compraDetalle.total?.toLocaleString()}</b></div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#B22222', marginBottom: 8 }}>PRODUCTOS COMPRADOS</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 16 }}>
              <thead>
                <tr style={{ background: '#F4F1ED' }}>
                  {['Producto','Lote generado','Cantidad','Costo unit.','Subtotal'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compraItems.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 12, textAlign: 'center', color: '#9A8E85' }}>Sin productos</td></tr>
                ) : compraItems.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #DDD8CF' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 500 }}>{item.nombre_producto}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: '#1A5FA8', fontWeight: 600 }}>{item.codigo_lote}</td>
                    <td style={{ padding: '8px 10px' }}>{item.cantidad} {item.unidad}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>${item.costo_unitario?.toLocaleString()}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 600 }}>${item.subtotal?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {compraDetalle.observaciones && <div style={{ fontSize: 12, color: '#9A8E85' }}><b>Observaciones:</b> {compraDetalle.observaciones}</div>}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>🛒 Compras</div>
          <div style={{ fontSize: 13, color: '#5A4F47', marginTop: 4 }}>{loading ? '...' : `${compras.length} compras registradas`}</div>
        </div>
        <button onClick={() => setMostrarForm(true)} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ＋ Nueva compra
        </button>
      </div>

      {mostrarForm && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 24, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
            {editandoId ? `✏️ Editando: ${compraOriginal?.compra.folio}` : 'Nueva compra'}
          </div>

          {/* DATOS GENERALES */}
          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>DATOS GENERALES</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>PROVEEDOR *</label>
                <select value={compra.proveedor_id} onChange={e => setCompra({...compra, proveedor_id: e.target.value})} style={inp}>
                  <option value="">Selecciona un proveedor...</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.empresa}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>FECHA DE COMPRA</label>
                <input type="date" value={compra.fecha_compra} onChange={e => setCompra({...compra, fecha_compra: e.target.value})} style={inp} />
              </div>
              <div>
                <label style={lbl}>FACTURA PROVEEDOR (opcional)</label>
                <input value={compra.factura_proveedor} onChange={e => setCompra({...compra, factura_proveedor: e.target.value})} placeholder="Número de factura" style={inp} />
              </div>
              <div>
                <label style={lbl}>ESTADO</label>
                <select value={compra.estado} onChange={e => setCompra({...compra, estado: e.target.value})} style={inp}>
                  <option value="contado">Contado</option>
                  <option value="credito">Crédito</option>
                </select>
              </div>
              {compra.estado === 'contado' && (
                <div>
                  <label style={lbl}>FORMA DE PAGO</label>
                  <select value={compra.metodo_pago} onChange={e => setCompra({...compra, metodo_pago: e.target.value, monto1: '', monto2: '', tipo_cuenta1: '', tipo_cuenta2: ''})} style={inp}>
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="efectivo_transferencia">Efectivo + Transferencia</option>
                    <option value="transferencia_transferencia">Transferencia + Transferencia</option>
                  </select>
                </div>
              )}
            </div>
            {compra.estado === 'contado' && compra.metodo_pago === 'transferencia' && (
              <div style={{ marginTop: 12 }}>
                <label style={lbl}>CUENTA DE TRANSFERENCIA</label>
                <select value={compra.tipo_cuenta1} onChange={e => setCompra({...compra, tipo_cuenta1: e.target.value})} style={inp}>
                  <option value="">Selecciona...</option>
                  <option value="1">1 — Bancolombia Yohe</option>
                  <option value="2">2 — Bancolombia Manu</option>
                  <option value="3">3 — Nequi Yohe</option>
                </select>
              </div>
            )}
            {compra.estado === 'contado' && compra.metodo_pago === 'efectivo_transferencia' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
                <div><label style={lbl}>MONTO EFECTIVO</label><input type="number" value={compra.monto1} onChange={e => { setCompra({...compra, monto1: e.target.value}); setErrorMontos('') }} placeholder="0" style={inp} /></div>
                <div><label style={lbl}>MONTO TRANSFERENCIA</label><input type="number" value={compra.monto2} onChange={e => { setCompra({...compra, monto2: e.target.value}); setErrorMontos('') }} placeholder="0" style={inp} /></div>
                <div><label style={lbl}>CUENTA TRANSFERENCIA</label>
                  <select value={compra.tipo_cuenta2} onChange={e => setCompra({...compra, tipo_cuenta2: e.target.value})} style={inp}>
                    <option value="">Selecciona...</option><option value="1">1 — Bancolombia Yohe</option><option value="2">2 — Bancolombia Manu</option><option value="3">3 — Nequi Yohe</option>
                  </select>
                </div>
              </div>
            )}
            {compra.estado === 'contado' && compra.metodo_pago === 'transferencia_transferencia' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
                <div><label style={lbl}>CUENTA TRANSF. 1</label>
                  <select value={compra.tipo_cuenta1} onChange={e => setCompra({...compra, tipo_cuenta1: e.target.value})} style={inp}>
                    <option value="">Selecciona...</option><option value="1">1 — Bancolombia Yohe</option><option value="2">2 — Bancolombia Manu</option><option value="3">3 — Nequi Yohe</option>
                  </select>
                </div>
                <div><label style={lbl}>MONTO TRANSF. 1</label><input type="number" value={compra.monto1} onChange={e => { setCompra({...compra, monto1: e.target.value}); setErrorMontos('') }} placeholder="0" style={inp} /></div>
                <div><label style={lbl}>CUENTA TRANSF. 2</label>
                  <select value={compra.tipo_cuenta2} onChange={e => setCompra({...compra, tipo_cuenta2: e.target.value})} style={inp}>
                    <option value="">Selecciona...</option><option value="1">1 — Bancolombia Yohe</option><option value="2">2 — Bancolombia Manu</option><option value="3">3 — Nequi Yohe</option>
                  </select>
                </div>
                <div><label style={lbl}>MONTO TRANSF. 2</label><input type="number" value={compra.monto2} onChange={e => { setCompra({...compra, monto2: e.target.value}); setErrorMontos('') }} placeholder="0" style={inp} /></div>
              </div>
            )}
            {errorMontos && <div style={{ marginTop: 10, background: '#FCEAEA', borderRadius: 7, padding: 10, fontSize: 12, color: '#B22222' }}>⚠️ {errorMontos}</div>}
            <div style={{ marginTop: 12 }}>
              <label style={lbl}>OBSERVACIONES</label>
              <input value={compra.observaciones} onChange={e => setCompra({...compra, observaciones: e.target.value})} placeholder="Notas adicionales" style={inp} />
            </div>
          </div>

          {/* ITEMS */}
          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600 }}>MATERIA PRIMA / INSUMOS</div>
              <button onClick={agregarItem} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>＋ Agregar</button>
            </div>
            {items.length === 0 && <div style={{ padding: 12, background: '#fff', borderRadius: 7, fontSize: 12, color: '#9A8E85', textAlign: 'center' }}>Haz clic en "＋ Agregar" para añadir productos</div>}

            {items.map((item, index) => {
              const prod = materiasPrimas.find(p => p.id === item.producto_id)
              const esEmpaque = prod?.categoria_mp === 'empaques'
              const traz = trazabilidad[index] || {}
              return (
                <div key={index} style={{ background: '#fff', borderRadius: 8, padding: 14, marginBottom: 12, border: '1px solid #DDD8CF' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end', marginBottom: 10 }}>
                    <div>
                      <label style={lbl}>PRODUCTO</label>
                      <select value={item.producto_id} onChange={e => actualizarItem(index, 'producto_id', e.target.value)} style={inp}>
                        <option value="">Selecciona...</option>
                        {materiasPrimas.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.nombre} (Stock: {p.stock_actual} {p.unidad})</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>CANTIDAD</label>
                      <input type="number" value={item.cantidad} onChange={e => actualizarItem(index, 'cantidad', e.target.value)} placeholder="0" style={inp} />
                    </div>
                    <div>
                      <label style={lbl}>UNIDAD</label>
                      <select value={item.unidad} onChange={e => actualizarItem(index, 'unidad', e.target.value)} style={inp}>
                        <option value="kg">kg</option><option value="g">g</option><option value="lt">lt</option><option value="und">und</option><option value="lb">lb</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>COSTO UNIT.{' '}{prod?.ultimo_costo > 0 && <span style={{ color: '#1A5FA8', fontSize: 10 }}>(Último: ${Number(prod.ultimo_costo).toLocaleString('es-CO')})</span>}</label>
                      <input type="number" value={item.costo_unitario} onChange={e => actualizarItem(index, 'costo_unitario', e.target.value)} placeholder="0" style={inp} />
                    </div>
                    <button onClick={() => eliminarItem(index)} style={{ padding: '8px 10px', background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 14, marginBottom: 1 }}>✕</button>
                  </div>

                  {item.subtotal > 0 && <div style={{ fontSize: 11, color: '#1A9156', fontWeight: 600, marginBottom: 10 }}>Subtotal: ${item.subtotal.toLocaleString('es-CO')}</div>}

                  {!esEmpaque && item.producto_id && (
                    <div style={{ background: '#F4F1ED', borderRadius: 7, padding: 12 }}>
                      <div style={{ fontSize: 10, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>🔬 TRAZABILIDAD DE RECEPCIÓN (opcional)</div>

                      {/* Características de calidad */}
                      <div style={{ fontSize: 10, color: '#1A5FA8', fontWeight: 600, marginBottom: 8 }}>CARACTERÍSTICAS DE CALIDAD</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                        <div>
                          <label style={lbl}>HORA RECEPCIÓN</label>
                          <input type="time" value={traz.hora_recepcion || ''} onChange={e => actualizarTrazabilidad(index, 'hora_recepcion', e.target.value)} style={inp} />
                        </div>
                        <div>
                          <label style={lbl}>FECHA VENCIMIENTO</label>
                          <input type="date" value={traz.fecha_vencimiento || ''} onChange={e => actualizarTrazabilidad(index, 'fecha_vencimiento', e.target.value)} style={inp} />
                        </div>
                        <div>
                          <label style={lbl}>TEMPERATURA PRODUCTO (°C)</label>
                          <input type="number" value={traz.temperatura_recepcion || ''} onChange={e => actualizarTrazabilidad(index, 'temperatura_recepcion', e.target.value)} placeholder="Ej. -2" style={inp} />
                        </div>
                        <div>
                          <label style={lbl}>ESTADO EMPAQUE</label>
                          <select value={traz.estado_empaque || ''} onChange={e => actualizarTrazabilidad(index, 'estado_empaque', e.target.value)} style={inp}>
                            <option value="">Selecciona...</option>
                            <option value="bueno">Bueno</option>
                            <option value="regular">Regular</option>
                            <option value="malo">Malo</option>
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>CUMPLE ESPECIFICACIONES</label>
                          <select value={traz.cumple_especificaciones || ''} onChange={e => actualizarTrazabilidad(index, 'cumple_especificaciones', e.target.value)} style={inp}>
                            <option value="">Selecciona...</option>
                            <option value="si">✅ Sí</option>
                            <option value="no">❌ No</option>
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>RESPONSABLE</label>
                          <input value={traz.responsable || ''} onChange={e => actualizarTrazabilidad(index, 'responsable', e.target.value)} placeholder="Nombre" style={inp} />
                        </div>
                        <div>
                          <label style={lbl}>LOTE PROVEEDOR</label>
                          <input value={traz.lote_proveedor || ''} onChange={e => actualizarTrazabilidad(index, 'lote_proveedor', e.target.value)} placeholder="Lote del proveedor" style={inp} />
                        </div>
                        <div>
                          <label style={lbl}>N° UNIDADES</label>
                          <input type="number" value={traz.numero_unidades || ''} onChange={e => actualizarTrazabilidad(index, 'numero_unidades', e.target.value)} placeholder="Ej. 10" style={inp} />
                        </div>
                      </div>

                      {/* Inspección transporte */}
                      <div style={{ fontSize: 10, color: '#1A5FA8', fontWeight: 600, marginBottom: 8 }}>🚛 INSPECCIÓN TRANSPORTE</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                        <div>
                          <label style={lbl}>VEHÍCULO LIMPIO</label>
                          <select value={traz.vehiculo_limpio || ''} onChange={e => actualizarTrazabilidad(index, 'vehiculo_limpio', e.target.value)} style={inp}>
                            {opcionesInsp.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>LIBRE DE PLAGAS</label>
                          <select value={traz.libre_plagas || ''} onChange={e => actualizarTrazabilidad(index, 'libre_plagas', e.target.value)} style={inp}>
                            {opcionesInsp.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>TEMPERATURA TRANSPORTE (°C)</label>
                          <input type="number" value={traz.temperatura_transporte || ''} onChange={e => actualizarTrazabilidad(index, 'temperatura_transporte', e.target.value)} placeholder="Ej. 4" style={inp} />
                        </div>
                        <div>
                          <label style={lbl}>N° PLACA</label>
                          <input value={traz.numero_placa || ''} onChange={e => actualizarTrazabilidad(index, 'numero_placa', e.target.value)} placeholder="Ej. ABC123" style={inp} />
                        </div>
                      </div>

                      <div>
                        <label style={lbl}>OBSERVACIONES</label>
                        <input value={traz.observaciones || ''} onChange={e => actualizarTrazabilidad(index, 'observaciones', e.target.value)} placeholder="Notas" style={inp} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* TOTALES */}
          <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>TOTALES</div>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>DESCUENTO $</label>
              <input type="number" value={compra.descuento} onChange={e => setCompra({...compra, descuento: e.target.value})} placeholder="0" style={{ ...inp, maxWidth: 200 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5A4F47' }}><span>Subtotal</span><span style={{ fontFamily: 'monospace' }}>${subtotal.toLocaleString()}</span></div>
              {descuento > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#B22222' }}><span>Descuento</span><span style={{ fontFamily: 'monospace' }}>−${descuento.toLocaleString()}</span></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, borderTop: '1px solid #DDD8CF', paddingTop: 8, marginTop: 4 }}>
                <span>TOTAL</span><span style={{ fontFamily: 'monospace', color: '#B22222' }}>${total.toLocaleString('es-CO')}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={cerrarForm} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={guardar} disabled={guardando} style={{ padding: '8px 16px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {guardando ? 'Guardando...' : editandoId ? '💾 Actualizar compra' : '🛒 Registrar compra'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85' }}>Cargando...</div>
      ) : compras.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🛒</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No hay compras registradas</div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F4F1ED' }}>
                {['Folio','Proveedor','Estado','Forma Pago','Total','Fecha','Acciones'].map(h => (
                  <th key={h} style={{ padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compras.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #DDD8CF' }}>
                  <td style={{ padding: '11px 16px', fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: '#B22222' }}>{c.folio}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600 }}>{c.proveedor_nombre}</td>
                  <td style={{ padding: '11px 16px' }}>
                    {badgeEstado(c)}
                  </td>
                  <td style={{ padding: '11px 16px', fontSize: 12 }}>{c.metodo_pago || '—'}</td>
                  <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: '#B22222' }}>${c.total?.toLocaleString('es-CO')}</td>
                  <td style={{ padding: '11px 16px', fontSize: 11, color: '#9A8E85', fontFamily: 'monospace' }}>
                    {c.fecha_compra || new Date(c.creado_en).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => verDetalle(c)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>👁️</button>
                      <button onClick={() => solicitarEdicion(c)} style={{ background: '#FEF3DC', color: '#C07D00', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>✏️</button>
                      <button onClick={() => setCompraAEliminar(c)} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}