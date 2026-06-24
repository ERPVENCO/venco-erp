import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export default function Ventas() {
  const [ventas, setVentas] = useState([])
  const [clientes, setClientes] = useState([])
  const [productos, setProductos] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [ventaDetalle, setVentaDetalle] = useState(null)
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [items, setItems] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [venta, setVenta] = useState({
    tipo: 'venta',
    estado: 'contado',
    cliente_id: '',
    vendedor_id: '',
    metodo_pago: 'efectivo',
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
      .select('*, clientes(empresa)')
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
    const { data } = await supabase.from('ventas').select('folio').like('folio', `${prefijo}%`)
    const siguiente = (data?.length || 0) + 1
    return `${prefijo}-${String(siguiente).padStart(4, '0')}`
  }

  const agregarItem = () => {
    setItems([...items, {
      producto_id: '',
      nombre_producto: '',
      codigo_producto: '',
      cantidad: '',
      unidad: 'kg',
      precio_lista: 1,
      precio_unitario: 0,
      subtotal: 0
    }])
  }

  const actualizarItem = (index, campo, valor) => {
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
    }

    if (campo === 'precio_lista') {
      const prod = productos.find(p => p.id === updated[index].producto_id)
      if (prod) {
        const precios = {
          1: prod.precio_kg,
          2: prod.precio2,
          3: prod.precio3,
          4: prod.precio4,
          5: prod.precio5
        }
        updated[index].precio_unitario = precios[valor] || prod.precio_kg || 0
      }
    }

    if (campo === 'cantidad' || campo === 'precio_unitario' || campo === 'precio_lista') {
      updated[index].subtotal = (parseFloat(updated[index].cantidad) || 0) * (parseFloat(updated[index].precio_unitario) || 0)
    }

    setItems(updated)
  }

  const eliminarItem = (index) => {
    setItems(items.filter((_, i) => i !== index))
  }

const calcularVendedor = () => {
  if (!venta.vendedor_id) return { comision_valor: 0, vendedor_nombre: '', comision_porcentaje: 0, comision_tipo: '' }
  const v = vendedores.find(v => v.id === venta.vendedor_id)
  if (!v) return { comision_valor: 0, vendedor_nombre: '', comision_porcentaje: 0, comision_tipo: '' }
  
  const subtotal = items.reduce((s, i) => s + (i.subtotal || 0), 0)
  const totalKg = items.reduce((s, i) => s + (parseFloat(i.cantidad) || 0), 0)
  
  let comision_valor = 0
  if (v.comision_tipo === 'porcentaje') {
    comision_valor = subtotal * v.comision_porcentaje / 100
  } else {
    // Valor fijo por kg/unidad → multiplica por cantidad total
    comision_valor = v.comision_valor_fijo * totalKg
  }
  
  return { 
    comision_valor: Math.round(comision_valor), 
    vendedor_nombre: v.nombre, 
    comision_porcentaje: v.comision_porcentaje, 
    comision_tipo: v.comision_tipo 
  }
}

  const calcularTotales = () => {
    const subtotal = items.reduce((s, i) => s + (i.subtotal || 0), 0)
    const descuento = parseFloat(venta.descuento) || 0
    const baseIva = subtotal - descuento
    const iva = venta.iva ? baseIva * 0.19 : 0
    const total = baseIva + iva
    return { subtotal, descuento, iva, total }
  }

  const guardar = async () => {
    if (!venta.cliente_id) { alert('Selecciona un cliente'); return }
    if (items.length === 0) { alert('Agrega al menos un producto'); return }
    if (items.some(i => !i.producto_id || !i.cantidad)) { alert('Completa todos los productos'); return }

    setGuardando(true)
    const folio = await siguienteFolio(venta.tipo)
    const { subtotal, descuento, iva, total } = calcularTotales()
    const { comision_valor, vendedor_nombre, comision_porcentaje, comision_tipo } = calcularVendedor()
    const cliente = clientes.find(c => c.id === venta.cliente_id)

    const estado = venta.tipo === 'remision' ? 'pendiente' : venta.estado
    const metodo_pago = (estado === 'credito' || venta.tipo === 'remision') ? null : venta.metodo_pago

    const { data, error } = await supabase.from('ventas').insert([{
      folio,
      tipo: venta.tipo,
      estado,
      cliente_id: venta.cliente_id,
      cliente_nombre: cliente?.empresa || '',
      metodo_pago,
      tipo_cuenta: venta.tipo_cuenta || null,
      vendedor: vendedor_nombre,
      comision_porcentaje: comision_porcentaje || 0,
      comision_valor,
      subtotal,
      descuento,
      iva,
      total,
      observaciones: venta.observaciones,
      fecha_vencimiento: venta.fecha_vencimiento || null,
      usuario_email: (await supabase.auth.getUser()).data.user?.email
    }]).select()

    if (error) { alert('Error: ' + error.message); setGuardando(false); return }

    const ventaId = data[0].id

    // Guardar items y descontar stock
    for (const item of items) {
      await supabase.from('venta_items').insert([{
        venta_id: ventaId,
        producto_id: item.producto_id,
        nombre_producto: item.nombre_producto,
        codigo_producto: item.codigo_producto,
        cantidad: parseFloat(item.cantidad),
        unidad: item.unidad,
        precio_unitario: parseFloat(item.precio_unitario),
        subtotal: item.subtotal
      }])

      // Descontar del stock
      const prod = productos.find(p => p.id === item.producto_id)
      if (prod) {
        await supabase.from('productos').update({
          stock_actual: (prod.stock_actual || 0) - parseFloat(item.cantidad)
        }).eq('id', item.producto_id)
      }
    }

    // Si es venta de contado → registrar en ingresos
    if (venta.tipo === 'venta' && estado === 'contado') {
      await supabase.from('ingresos').insert([{
        venta_id: ventaId,
        concepto: `Venta ${folio} — ${cliente?.empresa}`,
        metodo_pago: venta.metodo_pago,
        monto: total
      }])
    }

    // Si es crédito → actualizar saldo del cliente
    if (estado === 'credito') {
      await supabase.from('clientes').update({
        saldo_pendiente: (cliente?.saldo_pendiente || 0) + total
      }).eq('id', venta.cliente_id)
    }

    setMostrarForm(false)
    setItems([])
    setVenta({ tipo: 'venta', estado: 'contado', cliente_id: '', vendedor_id: '', metodo_pago: 'efectivo', descuento: 0, iva: false, observaciones: '', fecha_vencimiento: '' })
    setGuardando(false)
    cargar()
    cargarProductos()
  }

  const { subtotal, descuento, iva, total } = calcularTotales()
  const { comision_valor } = calcularVendedor()

  const ventasFiltradas = filtroTipo === 'todos'
    ? ventas
    : ventas.filter(v => v.tipo === filtroTipo)

  const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }

  const estadoColor = (estado) => {
    const c = { pendiente: { bg: '#FEF3DC', color: '#C07D00' }, contado: { bg: '#E8F7EF', color: '#1A9156' }, credito: { bg: '#E8F0FB', color: '#1A5FA8' }, anulado: { bg: '#FCEAEA', color: '#B22222' } }
    return c[estado] || { bg: '#F4F1ED', color: '#9A8E85' }
  }

  return (
    <div>
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
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>ESTADO</span><br/>
                <span style={{ background: estadoColor(ventaDetalle.estado).bg, color: estadoColor(ventaDetalle.estado).color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                  {ventaDetalle.estado}
                </span>
              </div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>FORMA DE PAGO</span><br/>{ventaDetalle.metodo_pago || '—'}</div>
              {ventaDetalle.tipo_cuenta && (
<div><span style={{ color: '#9A8E85', fontSize: 11 }}>CUENTA</span><br/>{ventaDetalle.tipo_cuenta === '1' ? 'Bancolombia Yohe' : ventaDetalle.tipo_cuenta === '2' ? 'Bancolombia Manu' : 'Nequi Yohe'}
  </div>
)}
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>VENDEDOR</span><br/>{ventaDetalle.vendedor || '—'}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>COMISIÓN</span><br/>${ventaDetalle.comision_valor?.toLocaleString() || '0'}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>SUBTOTAL</span><br/>${ventaDetalle.subtotal?.toLocaleString()}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>DESCUENTO</span><br/>${ventaDetalle.descuento?.toLocaleString()}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>IVA</span><br/>${ventaDetalle.iva?.toLocaleString()}</div>
              <div><span style={{ color: '#9A8E85', fontSize: 11 }}>TOTAL</span><br/><b style={{ fontSize: 16, color: '#B22222' }}>${ventaDetalle.total?.toLocaleString()}</b></div>
            </div>
            {ventaDetalle.observaciones && (
              <div style={{ fontSize: 13, color: '#9A8E85', marginBottom: 12 }}>
                <span style={{ fontSize: 11 }}>OBSERVACIONES</span><br/>{ventaDetalle.observaciones}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>🛒 Ventas</div>
          <div style={{ fontSize: 13, color: '#5A4F47', marginTop: 4 }}>
            {loading ? '...' : `${ventas.length} registros`}
          </div>
        </div>
        <button onClick={() => setMostrarForm(true)} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
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
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Nueva venta / remisión</div>

          {/* Tipo */}
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

          {/* Datos generales */}
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
          <b>3.</b> Nequi Yohe — 3022130107
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

          {/* Productos */}
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

            {items.map((item, index) => (
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
              </div>
            ))}
          </div>

          {/* Totales */}
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
            <button onClick={() => { setMostrarForm(false); setItems([]) }} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={guardar} disabled={guardando} style={{ padding: '8px 16px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {guardando ? 'Guardando...' : venta.tipo === 'remision' ? '📦 Crear Remisión' : '🧾 Crear Venta'}
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
                const ec = estadoColor(v.estado)
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
                      <span style={{ background: ec.bg, color: ec.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                        {v.estado}
                      </span>
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 13 }}>{v.metodo_pago || '—'}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13 }}>{v.vendedor || '—'}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: '#1A9156' }}>${v.total?.toLocaleString()}</td>
                    <td style={{ padding: '11px 16px', fontSize: 11, color: '#9A8E85', fontFamily: 'monospace' }}>
                      {new Date(v.creado_en).toLocaleDateString('es-CO')}
                    </td>
                    <td style={{ padding: '8px 16px' }}>
                      <button onClick={() => setVentaDetalle(v)} style={{ background: '#E8F0FB', color: '#1A5FA8', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                        👁️ Ver
                      </button>
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
