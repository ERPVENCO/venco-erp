import { useState } from 'react'
import { supabase } from './supabase'
import ModalEliminar from './ModalEliminar'

const CUENTAS = [['1', '1 — Bancolombia Yohe'], ['2', '2 — Bancolombia Manu'], ['3', '3 — Nequi Yohe']]

const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
const inpRO = { ...inp, background: '#EDEAE4', color: '#5A4F47' }
const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }

const finVacio = (c) => ({
  factura_proveedor: c?.factura_proveedor || '',
  estado: 'contado', metodo_pago: 'efectivo',
  tipo_cuenta1: '', monto1: '', tipo_cuenta2: '', monto2: '',
  descuento: 0, observaciones: c?.observaciones || ''
})

function SelectCuenta({ value, onChange }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={inp}>
      <option value="">Selecciona...</option>
      {CUENTAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

const resumenTraz = (t) => {
  if (!t) return 'Sin formato de trazabilidad (empaque u otro).'
  return [
    t.hora_recepcion && `Hora ${t.hora_recepcion.slice(0, 5)}`,
    t.fecha_vencimiento && `Vence ${t.fecha_vencimiento}`,
    t.temperatura_recepcion != null && `Temp. ${t.temperatura_recepcion}°C`,
    t.estado_empaque && `Empaque ${t.estado_empaque}`,
    t.lote_proveedor && `Lote prov. ${t.lote_proveedor}`,
    t.responsable && `Recibió: ${t.responsable}`
  ].filter(Boolean).join(' · ') || 'Trazabilidad sin datos.'
}

export default function ComprasPendientes({ pendientes, loading, isMobile, onRefrescar }) {
  const [completando, setCompletando] = useState(null)
  const [items, setItems] = useState([])
  const [trazMap, setTrazMap] = useState({})
  const [fin, setFin] = useState(finVacio())
  const [errorMontos, setErrorMontos] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [aAnular, setAAnular] = useState(null)

  const abrir = async (c) => {
    const [{ data: its }, { data: trz }] = await Promise.all([
      supabase.from('compra_items').select('*').eq('compra_id', c.id).order('codigo_lote'),
      supabase.from('trazabilidad_recepcion').select('*').eq('compra_id', c.id)
    ])
    const ids = (its || []).map(i => i.producto_id).filter(Boolean)
    const { data: prods } = ids.length
      ? await supabase.from('productos').select('id, ultimo_costo').in('id', ids)
      : { data: [] }
    const ultimo = {}
    ;(prods || []).forEach(p => { ultimo[p.id] = p.ultimo_costo })
    const tm = {}
    ;(trz || []).forEach(t => { tm[t.compra_item_id] = t })

    setItems((its || []).map(i => ({ ...i, costo_unitario: '', subtotal: 0, ultimo_costo: ultimo[i.producto_id] || 0 })))
    setTrazMap(tm)
    setFin(finVacio(c))
    setErrorMontos('')
    setCompletando(c)
  }

  const cerrar = () => { setCompletando(null); setItems([]); setTrazMap({}); setErrorMontos('') }

  const actualizarCosto = (i, valor) => {
    const upd = [...items]
    const costo = parseFloat(valor) || 0
    upd[i] = { ...upd[i], costo_unitario: valor, subtotal: (parseFloat(upd[i].cantidad) || 0) * costo }
    setItems(upd)
  }

  const subtotal = items.reduce((s, i) => s + (i.subtotal || 0), 0)
  const descuento = parseFloat(fin.descuento) || 0
  const total = subtotal - descuento

  const validarMontos = () => {
    if (fin.estado !== 'contado') return true
    const m = fin.metodo_pago
    if (m === 'efectivo') return true
    const falla = (msg) => { setErrorMontos(msg); return false }
    if (m === 'transferencia') return fin.tipo_cuenta1 ? true : falla('Selecciona la cuenta de transferencia.')
    if (m === 'efectivo_transferencia' && !fin.tipo_cuenta2) return falla('Selecciona la cuenta de transferencia.')
    if (m === 'transferencia_transferencia' && (!fin.tipo_cuenta1 || !fin.tipo_cuenta2)) return falla('Selecciona las dos cuentas.')
    const m1 = parseFloat(fin.monto1) || 0
    const m2 = parseFloat(fin.monto2) || 0
    if (Math.abs((m1 + m2) - total) > 1)
      return falla(`Los montos suman $${(m1 + m2).toLocaleString('es-CO')} pero el total es $${total.toLocaleString('es-CO')}.`)
    setErrorMontos('')
    return true
  }

  const completar = async () => {
    const c = completando
    if (items.some(i => !(parseFloat(i.costo_unitario) > 0))) { alert('Ingresa el costo unitario de todos los productos.'); return }
    if (total < 0) { alert('El descuento no puede ser mayor que el subtotal.'); return }
    if (!validarMontos()) return

    setGuardando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const credito = fin.estado === 'credito'

      // 1. Reclamar la compra: solo pasa si sigue pendiente (evita completarla dos veces)
      const { data: reclamada, error: errC } = await supabase.from('compras').update({
        factura_proveedor: fin.factura_proveedor || null,
        estado: fin.estado, metodo_pago: credito ? null : fin.metodo_pago,
        tipo_cuenta1: credito ? null : (fin.tipo_cuenta1 || null), monto1: credito ? 0 : (parseFloat(fin.monto1) || 0),
        tipo_cuenta2: credito ? null : (fin.tipo_cuenta2 || null), monto2: credito ? 0 : (parseFloat(fin.monto2) || 0),
        subtotal, descuento, total, observaciones: fin.observaciones || null,
        estado_registro: 'completa'
      }).eq('id', c.id).eq('estado_registro', 'pendiente').select()
      if (errC) throw new Error(errC.message)
      if (!reclamada || reclamada.length === 0) {
        alert('Esta compra ya fue completada por otra persona.')
        cerrar(); onRefrescar(); return
      }

      // 2. Costos por item y costo promedio (el stock ya incluye lo recibido)
      for (const it of items) {
        const costo = parseFloat(it.costo_unitario)
        const cantidad = parseFloat(it.cantidad)
        await supabase.from('compra_items').update({ costo_unitario: costo, subtotal: it.subtotal }).eq('id', it.id)

        const { data: p } = await supabase.from('productos')
          .select('stock_actual, costo_promedio, ultimo_costo').eq('id', it.producto_id).single()
        const stockPrevio = Math.max(0, (parseFloat(p?.stock_actual) || 0) - cantidad)
        const costoActual = parseFloat(p?.costo_promedio) || parseFloat(p?.ultimo_costo) || costo
        const costoProm = Math.round(((stockPrevio * costoActual) + (cantidad * costo)) / (stockPrevio + cantidad))
        await supabase.from('productos').update({ ultimo_costo: costo, costo_promedio: costoProm }).eq('id', it.producto_id)
      }

      // 3. Egresos (contado) o saldo del proveedor (crédito)
      const concepto = `Compra ${c.folio} — ${c.proveedor_nombre}`
      if (!credito) {
        const m1 = parseFloat(fin.monto1) || 0
        const m2 = parseFloat(fin.monto2) || 0
        if (fin.metodo_pago === 'efectivo') {
          await supabase.from('egresos').insert([{ compra_id: c.id, concepto, metodo_pago: 'efectivo', monto: total }])
        } else if (fin.metodo_pago === 'transferencia') {
          await supabase.from('egresos').insert([{ compra_id: c.id, concepto, metodo_pago: `transferencia cuenta ${fin.tipo_cuenta1}`, monto: total }])
        } else if (fin.metodo_pago === 'efectivo_transferencia') {
          await supabase.from('egresos').insert([
            { compra_id: c.id, concepto: `Compra ${c.folio} (efectivo)`, metodo_pago: 'efectivo', monto: m1 },
            { compra_id: c.id, concepto: `Compra ${c.folio} (transferencia)`, metodo_pago: `transferencia cuenta ${fin.tipo_cuenta2}`, monto: m2 }
          ])
        } else if (fin.metodo_pago === 'transferencia_transferencia') {
          await supabase.from('egresos').insert([
            { compra_id: c.id, concepto: `Compra ${c.folio} (transf. 1)`, metodo_pago: `transferencia cuenta ${fin.tipo_cuenta1}`, monto: m1 },
            { compra_id: c.id, concepto: `Compra ${c.folio} (transf. 2)`, metodo_pago: `transferencia cuenta ${fin.tipo_cuenta2}`, monto: m2 }
          ])
        }
      } else {
        const { data: prov } = await supabase.from('proveedores').select('saldo_pendiente').eq('id', c.proveedor_id).single()
        await supabase.from('proveedores').update({ saldo_pendiente: (parseFloat(prov?.saldo_pendiente) || 0) + total }).eq('id', c.proveedor_id)
      }

      await supabase.from('auditoria').insert([{
        tabla: 'compras', accion: 'COMPLETADA',
        descripcion: `${c.folio} — ${c.proveedor_nombre} — Total: $${total.toLocaleString('es-CO')}`,
        usuario_email: user?.email || 'desconocido', fecha: new Date().toISOString()
      }])

      cerrar(); onRefrescar()
    } catch (e) {
      alert('Error al completar la compra: ' + e.message + '\nRevisa el estado de ' + c.folio + ' antes de reintentar.')
    }
    setGuardando(false)
  }

  // Anular una recepción pendiente: revierte stock y lotes (solo si el lote no se ha usado)
  const anular = async () => {
    const c = aAnular
    const { data: its } = await supabase.from('compra_items').select('*').eq('compra_id', c.id)

    for (const it of its || []) {
      const { data: lote } = await supabase.from('lotes').select('cantidad_inicial, cantidad_actual').eq('codigo_lote', it.codigo_lote).maybeSingle()
      if (lote && parseFloat(lote.cantidad_actual) < parseFloat(lote.cantidad_inicial)) {
        alert(`No se puede anular: el lote ${it.codigo_lote} ya fue usado. Complétala o ajusta el inventario manualmente.`)
        setAAnular(null); return
      }
    }
    for (const it of its || []) {
      const { data: p } = await supabase.from('productos').select('stock_actual').eq('id', it.producto_id).single()
      if (p) await supabase.from('productos').update({ stock_actual: Math.max(0, (parseFloat(p.stock_actual) || 0) - it.cantidad) }).eq('id', it.producto_id)
      await supabase.from('lotes').delete().eq('codigo_lote', it.codigo_lote)
    }
    await supabase.from('trazabilidad_recepcion').delete().eq('compra_id', c.id)
    await supabase.from('compra_items').delete().eq('compra_id', c.id)
    await supabase.from('compras').delete().eq('id', c.id)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('auditoria').insert([{
      tabla: 'compras', accion: 'ANULACIÓN PENDIENTE',
      descripcion: `${c.folio} — ${c.proveedor_nombre} — Factura prov. ${c.factura_proveedor || '—'} (stock y lotes revertidos)`,
      datos_anteriores: c, usuario_email: user?.email || 'desconocido', fecha: new Date().toISOString()
    }])
    setAAnular(null); onRefrescar()
  }

  // ───────── FORMULARIO COMPLETAR ─────────
  if (completando) {
    const c = completando
    return (
      <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>📝 Completar compra: <span style={{ fontFamily: 'monospace', color: '#B22222' }}>{c.folio}</span></div>
          <button onClick={cerrar} style={{ background: '#F4F1ED', border: '1px solid #DDD8CF', borderRadius: 7, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>← Volver a pendientes</button>
        </div>

        {/* DATOS + FINANCIERO */}
        <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>DATOS DE LA COMPRA</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div><label style={lbl}>PROVEEDOR</label><input value={c.proveedor_nombre || ''} disabled style={inpRO} /></div>
            <div><label style={lbl}>FECHA</label><input value={c.fecha_compra || ''} disabled style={inpRO} /></div>
            <div><label style={lbl}>N° FACTURA PROV.</label><input value={fin.factura_proveedor} onChange={e => setFin({ ...fin, factura_proveedor: e.target.value })} style={inp} /></div>
            <div>
              <label style={lbl}>ESTADO</label>
              <select value={fin.estado} onChange={e => setFin({ ...fin, estado: e.target.value })} style={inp}>
                <option value="contado">Contado</option><option value="credito">Crédito</option>
              </select>
            </div>
            {fin.estado === 'contado' && (
              <div>
                <label style={lbl}>FORMA DE PAGO</label>
                <select value={fin.metodo_pago} onChange={e => { setFin({ ...fin, metodo_pago: e.target.value, monto1: '', monto2: '', tipo_cuenta1: '', tipo_cuenta2: '' }); setErrorMontos('') }} style={inp}>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo_transferencia">Efectivo + Transferencia</option>
                  <option value="transferencia_transferencia">Transferencia + Transferencia</option>
                </select>
              </div>
            )}
          </div>

          {fin.estado === 'contado' && fin.metodo_pago === 'transferencia' && (
            <div style={{ marginTop: 12, maxWidth: 320 }}>
              <label style={lbl}>CUENTA DE TRANSFERENCIA</label>
              <SelectCuenta value={fin.tipo_cuenta1} onChange={v => setFin({ ...fin, tipo_cuenta1: v })} />
            </div>
          )}
          {fin.estado === 'contado' && fin.metodo_pago === 'efectivo_transferencia' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 12 }}>
              <div><label style={lbl}>MONTO EFECTIVO</label><input type="number" value={fin.monto1} onChange={e => { setFin({ ...fin, monto1: e.target.value }); setErrorMontos('') }} placeholder="0" style={inp} /></div>
              <div><label style={lbl}>MONTO TRANSFERENCIA</label><input type="number" value={fin.monto2} onChange={e => { setFin({ ...fin, monto2: e.target.value }); setErrorMontos('') }} placeholder="0" style={inp} /></div>
              <div><label style={lbl}>CUENTA TRANSFERENCIA</label><SelectCuenta value={fin.tipo_cuenta2} onChange={v => setFin({ ...fin, tipo_cuenta2: v })} /></div>
            </div>
          )}
          {fin.estado === 'contado' && fin.metodo_pago === 'transferencia_transferencia' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 12 }}>
              <div><label style={lbl}>CUENTA TRANSF. 1</label><SelectCuenta value={fin.tipo_cuenta1} onChange={v => setFin({ ...fin, tipo_cuenta1: v })} /></div>
              <div><label style={lbl}>MONTO TRANSF. 1</label><input type="number" value={fin.monto1} onChange={e => { setFin({ ...fin, monto1: e.target.value }); setErrorMontos('') }} placeholder="0" style={inp} /></div>
              <div><label style={lbl}>CUENTA TRANSF. 2</label><SelectCuenta value={fin.tipo_cuenta2} onChange={v => setFin({ ...fin, tipo_cuenta2: v })} /></div>
              <div><label style={lbl}>MONTO TRANSF. 2</label><input type="number" value={fin.monto2} onChange={e => { setFin({ ...fin, monto2: e.target.value }); setErrorMontos('') }} placeholder="0" style={inp} /></div>
            </div>
          )}
          {errorMontos && <div style={{ marginTop: 10, background: '#FCEAEA', borderRadius: 7, padding: 10, fontSize: 12, color: '#B22222' }}>⚠️ {errorMontos}</div>}

          <div style={{ marginTop: 12 }}>
            <label style={lbl}>OBSERVACIONES</label>
            <input value={fin.observaciones} onChange={e => setFin({ ...fin, observaciones: e.target.value })} placeholder="Notas adicionales" style={inp} />
          </div>
        </div>

        {/* PRODUCTOS RECIBIDOS: solo se editan los costos */}
        <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>PRODUCTOS RECIBIDOS — ingresa el costo según la factura</div>
          {items.length === 0 && <div style={{ padding: 12, background: '#fff', borderRadius: 7, fontSize: 12, color: '#9A8E85', textAlign: 'center' }}>Esta compra no tiene productos.</div>}

          {items.map((it, i) => {
            const t = trazMap[it.id]
            return (
              <div key={it.id} style={{ background: '#fff', borderRadius: 8, padding: 14, marginBottom: 12, border: '1px solid #DDD8CF' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, alignItems: 'end' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={lbl}>PRODUCTO</label>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{it.nombre_producto}</div>
                    <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#1A5FA8', fontWeight: 600 }}>{it.codigo_lote}</div>
                  </div>
                  <div><label style={lbl}>CANTIDAD RECIBIDA</label><input value={`${it.cantidad} ${it.unidad || ''}`} disabled style={inpRO} /></div>
                  <div>
                    <label style={lbl}>COSTO UNIT. *{it.ultimo_costo > 0 && <span style={{ color: '#1A5FA8', fontSize: 10 }}> (Último: ${Number(it.ultimo_costo).toLocaleString('es-CO')})</span>}</label>
                    <input type="number" value={it.costo_unitario} onChange={e => actualizarCosto(i, e.target.value)} placeholder="0" style={inp} />
                  </div>
                  <div><label style={lbl}>SUBTOTAL</label><div style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13, color: '#1A9156', padding: '8px 0' }}>${(it.subtotal || 0).toLocaleString('es-CO')}</div></div>
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: '#5A4F47', background: '#F4F1ED', borderRadius: 6, padding: '6px 10px' }}>
                  🔬 {resumenTraz(t)}
                </div>
                {t?.cumple_especificaciones === false && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#B22222', background: '#FCEAEA', borderRadius: 6, padding: '6px 10px' }}>
                    ⚠️ El operario marcó que NO cumple especificaciones{t.observaciones ? `: ${t.observaciones}` : '.'} Revisa antes de pagar.
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
            <input type="number" value={fin.descuento} onChange={e => { setFin({ ...fin, descuento: e.target.value }); setErrorMontos('') }} placeholder="0" style={{ ...inp, maxWidth: 200 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5A4F47' }}><span>Subtotal</span><span style={{ fontFamily: 'monospace' }}>${subtotal.toLocaleString('es-CO')}</span></div>
            {descuento > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#B22222' }}><span>Descuento</span><span style={{ fontFamily: 'monospace' }}>−${descuento.toLocaleString('es-CO')}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, borderTop: '1px solid #DDD8CF', paddingTop: 8, marginTop: 4 }}>
              <span>TOTAL</span><span style={{ fontFamily: 'monospace', color: '#B22222' }}>${total.toLocaleString('es-CO')}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={cerrar} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
          <button onClick={completar} disabled={guardando} style={{ padding: '8px 16px', background: '#1A9156', color: '#fff', border: 'none', borderRadius: 7, cursor: guardando ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, opacity: guardando ? 0.7 : 1 }}>
            {guardando ? 'Guardando...' : '✅ Guardar y completar compra'}
          </button>
        </div>
      </div>
    )
  }

  // ───────── LISTA DE PENDIENTES ─────────
  return (
    <div>
      {aAnular && (
        <ModalEliminar item={aAnular} tabla="compras"
          descripcion={`${aAnular.folio} — ${aAnular.proveedor_nombre} — Factura prov. ${aAnular.factura_proveedor || '—'} (se revertirá el stock y los lotes)`}
          onConfirm={anular} onCancel={() => setAAnular(null)} />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85' }}>Cargando...</div>
      ) : pendientes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>No hay compras pendientes</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Las recepciones que registre el operario en Calidad aparecerán aquí.</div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', ...(isMobile ? { minWidth: 700 } : {}), borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F4F1ED' }}>
                  {['Folio', 'Proveedor', 'N° Factura Prov.', 'Fecha', 'Registrada por', 'Acciones'].map(h => (
                    <th key={h} style={{ padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pendientes.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #DDD8CF' }}>
                    <td style={{ padding: '11px 16px', fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: '#B22222', whiteSpace: 'nowrap' }}>{c.folio}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{c.proveedor_nombre}</td>
                    <td style={{ padding: '11px 16px', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{c.factura_proveedor || '—'}</td>
                    <td style={{ padding: '11px 16px', fontSize: 11, color: '#9A8E85', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{c.fecha_compra || '—'}</td>
                    <td style={{ padding: '11px 16px', fontSize: 11, color: '#9A8E85', whiteSpace: 'nowrap' }}>{c.usuario_email || '—'}</td>
                    <td style={{ padding: '8px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => abrir(c)} style={{ background: '#E8F7EF', color: '#1A9156', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>📝 Completar</button>
                        <button onClick={() => setAAnular(c)} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
