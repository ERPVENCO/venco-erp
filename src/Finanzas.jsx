import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import ModalEliminar from './ModalEliminar'
import CuentasPorPagar from './CuentasPorPagar'
import CuentasPorCobrar from './CuentasPorCobrar'

const CUENTAS = { '1': 'Bancolombia Yohe', '2': 'Bancolombia Manu', '3': 'Nequi Yohe' }
const hoyISO = () => new Date().toISOString().split('T')[0]
const primerDiaMes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0] }

export default function Finanzas() {
  const [seccion, setSeccion] = useState('menu')

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>💰 Finanzas</div>

      {seccion === 'menu' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div onClick={() => setSeccion('caja')}
            style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 10, padding: 24, cursor: 'pointer', borderLeft: '4px solid #B22222' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>🧾</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Caja</div>
            <div style={{ fontSize: 12, color: '#9A8E85' }}>Ingresos, egresos, gastos y balance</div>
          </div>
          <div onClick={() => setSeccion('cxc')}
            style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 10, padding: 24, cursor: 'pointer', borderLeft: '4px solid #B22222' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📥</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Cuentas por Cobrar</div>
            <div style={{ fontSize: 12, color: '#9A8E85' }}>Saldos pendientes de clientes</div>
          </div>
          <div onClick={() => setSeccion('cxp')}
            style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 10, padding: 24, cursor: 'pointer', borderLeft: '4px solid #B22222' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📤</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Cuentas por Pagar</div>
            <div style={{ fontSize: 12, color: '#9A8E85' }}>Saldos pendientes a proveedores</div>
          </div>
        </div>
      )}

      {seccion === 'caja' && <Caja onVolver={() => setSeccion('menu')} />}
      {seccion === 'cxc' && <CuentasPorCobrar onVolver={() => setSeccion('menu')} />}
      {seccion === 'cxp' && <CuentasPorPagar onVolver={() => setSeccion('menu')} />}
    </div>
  )
}

function Proximamente({ titulo, onVolver }) {
  return (
    <div>
      <button onClick={onVolver} style={{ background: '#F4F1ED', border: '1px solid #DDD8CF', borderRadius: 7, padding: '7px 14px', fontSize: 12, cursor: 'pointer', marginBottom: 18 }}>← Volver</button>
      <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🚧</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{titulo} — próximamente</div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// CAJA (Ingresos / Egresos / Balance)
// ─────────────────────────────────────────────
function Caja({ onVolver }) {
  const [vista, setVista] = useState('ingresos')
  const [desde, setDesde] = useState(primerDiaMes())
  const [hasta, setHasta] = useState(hoyISO())

  const inp = { padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, background: '#F4F1ED' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <button onClick={onVolver} style={{ background: '#F4F1ED', border: '1px solid #DDD8CF', borderRadius: 7, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}>← Volver</button>
        <div style={{ fontSize: 16, fontWeight: 700 }}>🧾 Caja</div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {[
          { id: 'ingresos', label: '📥 Ingresos' },
          { id: 'egresos', label: '📤 Egresos y Gastos' },
          { id: 'balance', label: '⚖️ Balance' },
        ].map(t => (
          <button key={t.id} onClick={() => setVista(t.id)} style={{
            padding: '8px 18px', borderRadius: 20, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', border: 'none',
            background: vista === t.id ? '#B22222' : '#fff',
            color: vista === t.id ? '#fff' : '#5A4F47',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
          }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 18, display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
        <div><label style={lbl}>DESDE</label><input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inp} /></div>
        <div><label style={lbl}>HASTA</label><input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={inp} /></div>
      </div>

      {vista === 'ingresos' && <Ingresos desde={desde} hasta={hasta} />}
      {vista === 'egresos' && <Egresos desde={desde} hasta={hasta} />}
      {vista === 'balance' && <Balance desde={desde} hasta={hasta} />}
    </div>
  )
}

// ─────────────────────────────────────────────
// INGRESOS (autopoblado desde Ventas)
// ─────────────────────────────────────────────
function Ingresos({ desde, hasta }) {
  const [ingresos, setIngresos] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroPago, setFiltroPago] = useState('')

  useEffect(() => { cargar(); cargarClientes() }, [desde, hasta])

  const cargar = async () => {
    setLoading(true)
    const { data: ing, error } = await supabase
      .from('ingresos').select('*')
      .gte('fecha', desde).lte('fecha', hasta + 'T23:59:59')
      .order('fecha', { ascending: false })

    if (error) { console.error(error); setIngresos([]); setLoading(false); return }

    const ventaIds = [...new Set((ing || []).map(i => i.venta_id).filter(Boolean))]
    let ventasMap = {}
    if (ventaIds.length > 0) {
      const { data: ventas } = await supabase.from('ventas').select('id, folio, cliente_nombre, tipo_cuenta').in('id', ventaIds)
      ventasMap = Object.fromEntries((ventas || []).map(v => [v.id, v]))
    }

    setIngresos((ing || []).map(i => ({ ...i, venta: ventasMap[i.venta_id] })))
    setLoading(false)
  }

  const cargarClientes = async () => {
    const { data } = await supabase.from('clientes').select('id, empresa').order('empresa')
    setClientes(data || [])
  }

  const filtrados = ingresos.filter(i => {
    if (filtroCliente && i.venta?.cliente_nombre !== filtroCliente) return false
    if (filtroPago && i.metodo_pago !== filtroPago) return false
    return true
  })

  const total = filtrados.reduce((s, i) => s + (i.monto || 0), 0)

  const inp = { padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, background: '#F4F1ED' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <label style={lbl}>CLIENTE</label>
          <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} style={inp}>
            <option value="">Todos</option>
            {clientes.map(c => <option key={c.id} value={c.empresa}>{c.empresa}</option>)}
          </select>
        </div>
        <div>
          <label style={lbl}>FORMA DE PAGO</label>
          <select value={filtroPago} onChange={e => setFiltroPago(e.target.value)} style={inp}>
            <option value="">Todas</option>
            <option value="efectivo">Efectivo</option>
            <option value="transferencia">Transferencia</option>
          </select>
        </div>
      </div>

      <div style={{ background: '#E8F7EF', borderRadius: 9, padding: 16, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: '#1A9156', fontWeight: 600 }}>{loading ? '...' : `${filtrados.length} ingresos`}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1A9156' }}>${total.toLocaleString('es-CO')}</div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85' }}>Cargando...</div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF' }}>
          No hay ingresos en este rango de fechas
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F4F1ED' }}>
                {['N°', 'Fecha', 'Detalle', 'Cliente', 'Forma de pago', 'Tipo de cuenta', 'N° Factura', 'Valor'].map(h => (
                  <th key={h} style={{ padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((i, idx) => (
                <tr key={i.id} style={{ borderBottom: '1px solid #DDD8CF' }}>
                  <td style={{ padding: '10px 16px', fontSize: 12, color: '#9A8E85' }}>{idx + 1}</td>
                  <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: 'monospace', color: '#9A8E85' }}>{new Date(i.fecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13 }}>{i.concepto || 'Venta'}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600 }}>{i.venta?.cliente_nombre || '—'}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13 }}>{i.metodo_pago || '—'}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13 }}>{i.venta?.tipo_cuenta ? CUENTAS[i.venta.tipo_cuenta] : '—'}</td>
                  <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: '#B22222' }}>{i.venta?.folio || '—'}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: '#1A9156' }}>${(i.monto || 0).toLocaleString('es-CO')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Bloque reutilizable: forma de pago con división efectivo + 2 transferencias
// ─────────────────────────────────────────────
function CamposPago({ form, setForm, inp, lbl }) {
  return (
    <>
      <div>
        <label style={lbl}>FORMA DE PAGO</label>
        <select value={form.forma_pago} onChange={e => setForm({ ...form, forma_pago: e.target.value })} style={inp}>
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="ambos">Ambos</option>
        </select>
      </div>
      <div>
        <label style={lbl}>VALOR TOTAL</label>
        <input type="number" value={form.valor_total} onChange={e => setForm({ ...form, valor_total: e.target.value })} placeholder="0" style={inp} />
      </div>

      {form.forma_pago === 'ambos' && (
        <div>
          <label style={lbl}>MONTO EN EFECTIVO</label>
          <input type="number" value={form.monto_efectivo} onChange={e => setForm({ ...form, monto_efectivo: e.target.value })} placeholder="0" style={inp} />
        </div>
      )}

      {(form.forma_pago === 'transferencia' || form.forma_pago === 'ambos') && (
        <>
          <div>
            <label style={lbl}>MONTO TRANSFERENCIA 1</label>
            <input type="number" value={form.monto_transferencia_1} onChange={e => setForm({ ...form, monto_transferencia_1: e.target.value })} placeholder="0" style={inp} />
          </div>
          <div>
            <label style={lbl}>TIPO DE CUENTA 1</label>
            <select value={form.tipo_cuenta_1} onChange={e => setForm({ ...form, tipo_cuenta_1: e.target.value })} style={inp}>
              <option value="">Selecciona...</option>
              {Object.entries(CUENTAS).map(([k, v]) => <option key={k} value={k}>{k} — {v.toUpperCase()}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>MONTO TRANSFERENCIA 2</label>
            <input type="number" value={form.monto_transferencia_2} onChange={e => setForm({ ...form, monto_transferencia_2: e.target.value })} placeholder="0 (opcional)" style={inp} />
          </div>
          <div>
            <label style={lbl}>TIPO DE CUENTA 2</label>
            <select value={form.tipo_cuenta_2} onChange={e => setForm({ ...form, tipo_cuenta_2: e.target.value })} style={inp}>
              <option value="">Selecciona...</option>
              {Object.entries(CUENTAS).map(([k, v]) => <option key={k} value={k}>{k} — {v.toUpperCase()}</option>)}
            </select>
          </div>
        </>
      )}
    </>
  )
}

const sumaPago = (form) => (parseFloat(form.monto_efectivo) || 0) + (parseFloat(form.monto_transferencia_1) || 0) + (parseFloat(form.monto_transferencia_2) || 0)

// ─────────────────────────────────────────────
// Selector de categoría (a nivel de módulo — si se define dentro de Egresos,
// React lo vuelve a montar en cada tecla y el input pierde el foco)
// ─────────────────────────────────────────────
function CategoriaSelector({ categorias, value, onChange, onCategoriaCreada, inp, lbl }) {
  const [mostrarNueva, setMostrarNueva] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [guardando, setGuardando] = useState(false)

  const crearCategoria = async () => {
    if (!nuevoNombre.trim()) return
    setGuardando(true)
    const { data, error } = await supabase
      .from('categorias_finanzas')
      .insert([{ nombre: nuevoNombre.trim() }])
      .select()
    setGuardando(false)
    if (error) { alert('Error: ' + error.message); return }
    onCategoriaCreada(data[0])
    onChange(data[0].id)
    setNuevoNombre('')
    setMostrarNueva(false)
  }

  return (
    <div>
      <label style={lbl}>CATEGORÍA</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={inp}>
        <option value="">Selecciona...</option>
        {categorias.map(c => (
          <option key={c.id} value={c.id}>{c.nombre}</option>
        ))}
      </select>
      {!mostrarNueva ? (
        <button type="button" onClick={() => setMostrarNueva(true)} style={{ marginTop: 4, background: 'none', border: 'none', color: '#1A5FA8', fontSize: 11, cursor: 'pointer', padding: 0 }}>＋ Nueva categoría</button>
      ) : (
        <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
          <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} placeholder="Nombre de categoría" style={{ ...inp, fontSize: 12, padding: '6px 9px' }} />
          <button type="button" onClick={crearCategoria} disabled={guardando} style={{ background: '#1A9156', color: '#fff', border: 'none', borderRadius: 6, padding: '0 10px', fontSize: 12, cursor: 'pointer' }}>
            {guardando ? '...' : 'OK'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// EGRESOS Y GASTOS (autopoblado desde Compras + registro manual de Egresos y Gastos)
// ─────────────────────────────────────────────
function Egresos({ desde, hasta }) {
  const [egresos, setEgresos] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroProveedor, setFiltroProveedor] = useState('')
  const [filtroPago, setFiltroPago] = useState('')
  const [mostrarFormEgreso, setMostrarFormEgreso] = useState(false)
  const [mostrarFormGasto, setMostrarFormGasto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [egresoAEliminar, setEgresoAEliminar] = useState(null)

  const egresoVacio = { fecha: hoyISO(), recibe: '', categoria_id: '', forma_pago: 'efectivo', valor_total: '', monto_efectivo: '', monto_transferencia_1: '', tipo_cuenta_1: '', monto_transferencia_2: '', tipo_cuenta_2: '', factura_proveedor: '', compra_id: '' }
  const [facturasPendientes, setFacturasPendientes] = useState([])
  const gastoVacio = { fecha: hoyISO(), detalle: '', categoria_id: '', estado: 'contado', forma_pago: 'efectivo', valor_total: '', monto_efectivo: '', monto_transferencia_1: '', tipo_cuenta_1: '', monto_transferencia_2: '', tipo_cuenta_2: '', factura_soporte: '' }

  const [formEgreso, setFormEgreso] = useState(egresoVacio)
  const [formGasto, setFormGasto] = useState(gastoVacio)

  const mantenimientoVacio = { equipo: '', tipo_mantenimiento: 'Preventivo', realizado_por: '', observaciones: '', proxima_fecha_programada: '', completado: false }
  const [mantenimiento, setMantenimiento] = useState(mantenimientoVacio)
  const [mostrarModalMantenimiento, setMostrarModalMantenimiento] = useState(false)

  useEffect(() => { cargar(); cargarProveedores(); cargarCategorias(); cargarFacturasPendientes() }, [desde, hasta])

  const cargarFacturasPendientes = async () => {
    const { data } = await supabase
      .from('vista_cuentas_por_pagar')
      .select('*')
      .neq('estado_pago', 'Pagada')
      .order('fecha_compra', { ascending: false })
    setFacturasPendientes(data || [])
  }

  const seleccionarFacturaEgreso = (compraId) => {
    const factura = facturasPendientes.find(f => f.compra_id === compraId)
    if (!factura) {
      setFormEgreso(f => ({ ...f, compra_id: '' }))
      return
    }
    setFormEgreso(f => ({
      ...f,
      compra_id: compraId,
      recibe: f.recibe || factura.proveedor_nombre,
      factura_proveedor: f.factura_proveedor || factura.folio,
      valor_total: f.valor_total || String(factura.saldo),
    }))
  }

  const cargar = async () => {
    setLoading(true)
    const { data: egr, error } = await supabase
      .from('egresos').select('*')
      .gte('fecha', desde).lte('fecha', hasta + 'T23:59:59')
      .order('fecha', { ascending: false })

    if (error) { console.error(error); setEgresos([]); setLoading(false); return }

    const compraIds = [...new Set((egr || []).map(e => e.compra_id).filter(Boolean))]
    let comprasMap = {}
    if (compraIds.length > 0) {
      const { data: compras } = await supabase.from('compras').select('id, folio, proveedor_nombre').in('id', compraIds)
      comprasMap = Object.fromEntries((compras || []).map(c => [c.id, c]))
    }

    setEgresos((egr || []).map(e => ({ ...e, compra: comprasMap[e.compra_id] })))
    setLoading(false)
  }

  const cargarProveedores = async () => {
    const { data } = await supabase.from('proveedores').select('id, nombre').order('nombre')
    setProveedores(data || [])
  }

  const cargarCategorias = async () => {
    const { data } = await supabase.from('categorias_finanzas').select('*').order('nombre')
    setCategorias(data || [])
  }

  const validarPago = (form) => {
    const total = parseFloat(form.valor_total) || 0
    if (total <= 0) { alert('Ingresa el valor total'); return false }
    if (form.forma_pago === 'efectivo') return true // todo el valor total es efectivo, no hay nada que sumar
    const suma = sumaPago(form)
    if (Math.abs(suma - total) > 0.01) {
      alert(`La suma de efectivo + transferencias (${suma.toLocaleString('es-CO')}) debe ser igual al valor total (${total.toLocaleString('es-CO')})`)
      return false
    }
    return true
  }

  const guardarEgreso = async () => {
    if (!formEgreso.recibe) { alert('Ingresa quién recibe el pago'); return }
    if (!validarPago(formEgreso)) return
    setGuardando(true)
    const categoria = categorias.find(c => c.id === formEgreso.categoria_id)
    const montoEfectivo = formEgreso.forma_pago === 'efectivo'
      ? parseFloat(formEgreso.valor_total) || 0
      : (formEgreso.monto_efectivo ? parseFloat(formEgreso.monto_efectivo) : 0)
    const { error } = await supabase.from('egresos').insert([{
      compra_id: formEgreso.compra_id || null,
      tipo_registro: 'egreso',
      concepto: `Egreso a ${formEgreso.recibe}`,
      recibe: formEgreso.recibe,
      categoria_id: formEgreso.categoria_id || null,
      categoria_nombre: categoria?.nombre || null,
      metodo_pago: formEgreso.forma_pago,
      valor_total: parseFloat(formEgreso.valor_total),
      monto: parseFloat(formEgreso.valor_total),
      monto_efectivo: montoEfectivo,
      monto_transferencia_1: formEgreso.monto_transferencia_1 ? parseFloat(formEgreso.monto_transferencia_1) : 0,
      tipo_cuenta_1: formEgreso.tipo_cuenta_1 || null,
      monto_transferencia_2: formEgreso.monto_transferencia_2 ? parseFloat(formEgreso.monto_transferencia_2) : 0,
      tipo_cuenta_2: formEgreso.tipo_cuenta_2 || null,
      tipo_cuenta: formEgreso.tipo_cuenta_1 || null,
      factura_proveedor: formEgreso.factura_proveedor || null,
      fecha: formEgreso.fecha
    }])
    if (error) { alert('Error: ' + error.message); setGuardando(false); return }
    setMostrarFormEgreso(false)
    setFormEgreso(egresoVacio)
    setGuardando(false)
    cargar()
    cargarFacturasPendientes()
  }

  const esCategoriaMantenimiento = (id) => {
    const cat = categorias.find(c => c.id === id)
    return !!cat && cat.nombre.trim().toLowerCase() === 'mantenimiento'
  }

  const seleccionarCategoriaGasto = (id) => {
    setFormGasto(f => ({ ...f, categoria_id: id }))
    if (esCategoriaMantenimiento(id)) {
      setMantenimiento(mantenimientoVacio)
      setMostrarModalMantenimiento(true)
    }
  }

  const guardarGasto = async () => {
    if (!formGasto.detalle) { alert('Ingresa el detalle del gasto'); return }
    if (!validarPago(formGasto)) return
    if (esCategoriaMantenimiento(formGasto.categoria_id) && !mantenimiento.completado) {
      alert('Completa los datos de mantenimiento (equipo, tipo, realizado por) antes de guardar')
      setMostrarModalMantenimiento(true)
      return
    }
    setGuardando(true)
    const categoria = categorias.find(c => c.id === formGasto.categoria_id)
    const montoEfectivoGasto = formGasto.forma_pago === 'efectivo'
      ? parseFloat(formGasto.valor_total) || 0
      : (formGasto.monto_efectivo ? parseFloat(formGasto.monto_efectivo) : 0)
    const { data, error } = await supabase.from('egresos').insert([{
      compra_id: null,
      tipo_registro: 'gasto',
      concepto: formGasto.detalle,
      detalle: formGasto.detalle,
      categoria_id: formGasto.categoria_id || null,
      categoria_nombre: categoria?.nombre || null,
      estado: formGasto.estado,
      metodo_pago: formGasto.forma_pago,
      valor_total: parseFloat(formGasto.valor_total),
      monto: parseFloat(formGasto.valor_total),
      monto_efectivo: montoEfectivoGasto,
      monto_transferencia_1: formGasto.monto_transferencia_1 ? parseFloat(formGasto.monto_transferencia_1) : 0,
      tipo_cuenta_1: formGasto.tipo_cuenta_1 || null,
      monto_transferencia_2: formGasto.monto_transferencia_2 ? parseFloat(formGasto.monto_transferencia_2) : 0,
      tipo_cuenta_2: formGasto.tipo_cuenta_2 || null,
      tipo_cuenta: formGasto.tipo_cuenta_1 || null,
      factura_soporte: formGasto.factura_soporte || null,
      fecha: formGasto.fecha
    }]).select()
    if (error) { alert('Error: ' + error.message); setGuardando(false); return }

    if (esCategoriaMantenimiento(formGasto.categoria_id)) {
      const { error: errMant } = await supabase.from('mantenimientos').insert([{
        egreso_id: data?.[0]?.id || null,
        fecha: formGasto.fecha,
        equipo: mantenimiento.equipo,
        tipo_mantenimiento: mantenimiento.tipo_mantenimiento,
        costo: parseFloat(formGasto.valor_total) || 0,
        realizado_por: mantenimiento.realizado_por || null,
        observaciones: mantenimiento.observaciones || null,
        proxima_fecha_programada: mantenimiento.proxima_fecha_programada || null
      }])
      if (errMant) { alert('El gasto se guardó, pero hubo un error registrando el mantenimiento: ' + errMant.message) }
    }

    setMostrarFormGasto(false)
    setFormGasto(gastoVacio)
    setMantenimiento(mantenimientoVacio)
    setGuardando(false)
    cargar()
  }

  const eliminarEgreso = async () => {
    await supabase.from('egresos').delete().eq('id', egresoAEliminar.id)
    setEgresoAEliminar(null)
    cargar()
  }

  const filtrados = egresos.filter(e => {
    const proveedor = e.compra?.proveedor_nombre
    if (filtroProveedor && proveedor !== filtroProveedor) return false
    if (filtroPago && e.metodo_pago !== filtroPago) return false
    return true
  })

  const total = filtrados.reduce((s, e) => s + (e.monto || 0), 0)

  const inp = { padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, background: '#F4F1ED', width: '100%', boxSizing: 'border-box' }
  const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }

  const badgeTipo = (t) => {
    if (t === 'gasto') return { bg: '#FEF3DC', color: '#C07D00', label: 'Gasto' }
    if (t === 'egreso') return { bg: '#E8F0FB', color: '#1A5FA8', label: 'Egreso' }
    if (t === 'abono_cxp') return { bg: '#F3E8FB', color: '#7A1FA2', label: 'Abono CxP' }
    return { bg: '#F4F1ED', color: '#5A4F47', label: 'Compra' }
  }

  const onCategoriaCreada = (nueva) => {
    setCategorias(prev => [...prev, nueva].sort((a, b) => a.nombre.localeCompare(b.nombre)))
  }

  return (
    <div>
      {egresoAEliminar && (
        <ModalEliminar item={egresoAEliminar} tabla="egresos"
          descripcion={`${egresoAEliminar.concepto} — $${egresoAEliminar.monto?.toLocaleString('es-CO')}`}
          onConfirm={eliminarEgreso} onCancel={() => setEgresoAEliminar(null)} />
      )}

      {mostrarModalMantenimiento && (
        <div onClick={() => setMostrarModalMantenimiento(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1002 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 26, width: 460, maxWidth: '95vw', boxShadow: '0 8px 28px rgba(0,0,0,0.15)', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 42, height: 42, background: '#FEF3DC', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🔧</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Datos de mantenimiento</div>
                <div style={{ fontSize: 12, color: '#9A8E85' }}>Plantilla exigida por INVIMA — alimenta el módulo de Calidad</div>
              </div>
            </div>

            <div style={{ background: '#F4F1ED', borderRadius: 7, padding: 10, marginBottom: 14, fontSize: 12, color: '#5A4F47' }}>
              Fecha: <b>{formGasto.fecha || '—'}</b> &nbsp;·&nbsp; Costo: <b>${(parseFloat(formGasto.valor_total) || 0).toLocaleString('es-CO')}</b>
              <div style={{ fontSize: 11, color: '#9A8E85', marginTop: 2 }}>(vienen del formulario de Gasto — no se repiten aquí)</div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>EQUIPO</label>
              <input value={mantenimiento.equipo} onChange={e => setMantenimiento({...mantenimiento, equipo: e.target.value, completado: false})} placeholder="Ej. Cuarto frío 1, Horno ahumador..." style={inp} autoFocus />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>TIPO DE MANTENIMIENTO</label>
              <select value={mantenimiento.tipo_mantenimiento} onChange={e => setMantenimiento({...mantenimiento, tipo_mantenimiento: e.target.value, completado: false})} style={inp}>
                <option value="Preventivo">Preventivo</option>
                <option value="Correctivo">Correctivo</option>
                <option value="Predictivo">Predictivo</option>
                <option value="Calibración">Calibración</option>
                <option value="Otro">Otro</option>
              </select>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>REALIZADO POR</label>
              <input value={mantenimiento.realizado_por} onChange={e => setMantenimiento({...mantenimiento, realizado_por: e.target.value, completado: false})} placeholder="Nombre del técnico o proveedor" style={inp} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>OBSERVACIONES</label>
              <input value={mantenimiento.observaciones} onChange={e => setMantenimiento({...mantenimiento, observaciones: e.target.value, completado: false})} placeholder="Detalle de lo realizado, repuestos, hallazgos..." style={inp} />
            </div>

            <div style={{ marginBottom: 4 }}>
              <label style={lbl}>PRÓXIMA FECHA PROGRAMADA</label>
              <input type="date" value={mantenimiento.proxima_fecha_programada} onChange={e => setMantenimiento({...mantenimiento, proxima_fecha_programada: e.target.value, completado: false})} style={inp} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
              <button onClick={() => setMostrarModalMantenimiento(false)} style={{ padding: '8px 18px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cerrar</button>
              <button
                onClick={() => {
                  if (!mantenimiento.equipo.trim() || !mantenimiento.realizado_por.trim()) {
                    alert('Completa al menos Equipo y Realizado por')
                    return
                  }
                  setMantenimiento(m => ({ ...m, completado: true }))
                  setMostrarModalMantenimiento(false)
                }}
                style={{ padding: '8px 18px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                Guardar datos
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <label style={lbl}>PROVEEDOR</label>
            <select value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)} style={inp}>
              <option value="">Todos</option>
              {proveedores.map(p => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>FORMA DE PAGO</label>
            <select value={filtroPago} onChange={e => setFiltroPago(e.target.value)} style={inp}>
              <option value="">Todas</option>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="ambos">Ambos</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setMostrarFormEgreso(true)} style={{ background: '#1A5FA8', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            ＋ Nuevo Egreso
          </button>
          <button onClick={() => setMostrarFormGasto(true)} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            ＋ Nuevo Gasto
          </button>
        </div>
      </div>

      {/* Formulario de Egreso (pago a proveedor) */}
      {mostrarFormEgreso && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Nuevo Egreso (pago a proveedor)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>FACTURA A PAGAR (opcional — si la eliges, marca la compra como pagada al saldar el total)</label>
              <select value={formEgreso.compra_id} onChange={e => seleccionarFacturaEgreso(e.target.value)} style={inp}>
                <option value="">Ninguna (egreso general, no ligado a una compra)</option>
                {facturasPendientes.map(f => (
                  <option key={f.compra_id} value={f.compra_id}>
                    {f.folio} — {f.proveedor_nombre} — saldo ${Number(f.saldo).toLocaleString('es-CO')}
                  </option>
                ))}
              </select>
            </div>
            <div><label style={lbl}>FECHA</label><input type="date" value={formEgreso.fecha} onChange={e => setFormEgreso({...formEgreso, fecha: e.target.value})} style={inp} /></div>
            <div><label style={lbl}>RECIBE</label><input value={formEgreso.recibe} onChange={e => setFormEgreso({...formEgreso, recibe: e.target.value})} placeholder="Nombre de quien recibe" style={inp} /></div>
            <CategoriaSelector categorias={categorias} value={formEgreso.categoria_id} onChange={v => setFormEgreso({...formEgreso, categoria_id: v})} onCategoriaCreada={onCategoriaCreada} inp={inp} lbl={lbl} />
            <div><label style={lbl}>FACTURA N° DEL PROVEEDOR</label><input value={formEgreso.factura_proveedor} onChange={e => setFormEgreso({...formEgreso, factura_proveedor: e.target.value})} placeholder="N° de factura" style={inp} /></div>
            <CamposPago form={formEgreso} setForm={setFormEgreso} inp={inp} lbl={lbl} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => { setMostrarFormEgreso(false); setFormEgreso(egresoVacio) }} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={guardarEgreso} disabled={guardando} style={{ padding: '8px 16px', background: '#1A5FA8', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {guardando ? 'Guardando...' : 'Guardar egreso'}
            </button>
          </div>
        </div>
      )}

      {/* Formulario de Gasto (operativo) */}
      {mostrarFormGasto && (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Nuevo Gasto (operativo: nómina, arriendo, servicios, etc.)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div><label style={lbl}>FECHA</label><input type="date" value={formGasto.fecha} onChange={e => setFormGasto({...formGasto, fecha: e.target.value})} style={inp} /></div>
            <div><label style={lbl}>DETALLE</label><input value={formGasto.detalle} onChange={e => setFormGasto({...formGasto, detalle: e.target.value})} placeholder="Ej. Pago nómina quincena julio" style={inp} /></div>
            <CategoriaSelector categorias={categorias} value={formGasto.categoria_id} onChange={seleccionarCategoriaGasto} onCategoriaCreada={onCategoriaCreada} inp={inp} lbl={lbl} />
            <div><label style={lbl}>ESTADO</label>
              <select value={formGasto.estado} onChange={e => setFormGasto({...formGasto, estado: e.target.value})} style={inp}>
                <option value="contado">Contado</option>
                <option value="credito">Crédito</option>
              </select>
            </div>
            {esCategoriaMantenimiento(formGasto.categoria_id) && (
              <div style={{ gridColumn: '1 / -1', background: mantenimiento.completado ? '#E8F7EF' : '#FEF3DC', borderRadius: 7, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: mantenimiento.completado ? '#1A9156' : '#C07D00', fontWeight: 600 }}>
                  {mantenimiento.completado ? `🔧 Mantenimiento: ${mantenimiento.equipo} (${mantenimiento.tipo_mantenimiento})${mantenimiento.proxima_fecha_programada ? ` — próximo: ${mantenimiento.proxima_fecha_programada}` : ''}` : '🔧 Faltan los datos de mantenimiento (plantilla INVIMA)'}
                </span>
                <button type="button" onClick={() => setMostrarModalMantenimiento(true)} style={{ background: 'none', border: '1px solid currentColor', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: 'inherit' }}>
                  {mantenimiento.completado ? 'Editar datos' : 'Completar datos'}
                </button>
              </div>
            )}
            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>FACTURA SOPORTE DE PAGO</label><input value={formGasto.factura_soporte} onChange={e => setFormGasto({...formGasto, factura_soporte: e.target.value})} placeholder="N° de factura o soporte" style={inp} /></div>
            <CamposPago form={formGasto} setForm={setFormGasto} inp={inp} lbl={lbl} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => { setMostrarFormGasto(false); setFormGasto(gastoVacio); setMantenimiento(mantenimientoVacio) }} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            <button onClick={guardarGasto} disabled={guardando} style={{ padding: '8px 16px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {guardando ? 'Guardando...' : 'Guardar gasto'}
            </button>
          </div>
        </div>
      )}

      <div style={{ background: '#FCEAEA', borderRadius: 9, padding: 16, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: '#B22222', fontWeight: 600 }}>{loading ? '...' : `${filtrados.length} egresos`}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#B22222' }}>${total.toLocaleString('es-CO')}</div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85' }}>Cargando...</div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85', background: '#fff', borderRadius: 9, border: '1px solid #DDD8CF' }}>
          No hay egresos en este rango de fechas
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F4F1ED' }}>
                {['N°', 'Fecha', 'Tipo', 'Detalle / Recibe', 'Categoría', 'Forma de pago', 'N° Compra/Factura', 'Valor', ''].map(h => (
                  <th key={h} style={{ padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((e, idx) => {
                const badge = badgeTipo(e.tipo_registro)
                return (
                  <tr key={e.id} style={{ borderBottom: '1px solid #DDD8CF' }}>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: '#9A8E85' }}>{idx + 1}</td>
                    <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: 'monospace', color: '#9A8E85' }}>{new Date(e.fecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ background: badge.bg, color: badge.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{badge.label}</span>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600 }}>{e.recibe || e.detalle || e.compra?.proveedor_nombre || e.concepto}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13 }}>{e.categoria_nombre || '—'}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13 }}>{e.metodo_pago || '—'}</td>
                    <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: 'monospace', fontWeight: 600, color: '#B22222' }}>{e.compra?.folio || e.factura_proveedor || e.factura_soporte || '—'}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, fontFamily: 'monospace', fontWeight: 600, color: '#B22222' }}>${(e.monto || 0).toLocaleString('es-CO')}</td>
                    <td style={{ padding: '8px 16px' }}>
                      {!e.compra_id && (
                        <button onClick={() => setEgresoAEliminar(e)} style={{ background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>🗑️</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 11, color: '#9A8E85', marginTop: 8 }}>
        Nota: los egresos con etiqueta "Compra" vienen automáticos de Compras y solo se pueden eliminar revirtiendo la compra allá, para no descuadrar el inventario. Los "Abono CxP" vienen del módulo Cuentas por Pagar.
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────
// BALANCE (consultas separadas, sin depender de relaciones embebidas)
// ─────────────────────────────────────────────
function Balance({ desde, hasta }) {
  const [totalIngresos, setTotalIngresos] = useState(0)
  const [totalEgresos, setTotalEgresos] = useState(0)
  const [porCuenta, setPorCuenta] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { cargar() }, [desde, hasta])

  const cargar = async () => {
    setLoading(true)
    setError('')

    const { data: ingresos, error: errIng } = await supabase
      .from('ingresos').select('monto, venta_id')
      .gte('fecha', desde).lte('fecha', hasta + 'T23:59:59')

    const { data: egresos, error: errEgr } = await supabase
      .from('egresos').select('monto, tipo_cuenta, monto_efectivo, monto_transferencia_1, tipo_cuenta_1, monto_transferencia_2, tipo_cuenta_2')
      .gte('fecha', desde).lte('fecha', hasta + 'T23:59:59')

    if (errIng || errEgr) {
      setError((errIng || errEgr).message)
      setLoading(false)
      return
    }

    const ventaIds = [...new Set((ingresos || []).map(i => i.venta_id).filter(Boolean))]
    let ventasMap = {}
    if (ventaIds.length > 0) {
      const { data: ventas } = await supabase.from('ventas').select('id, tipo_cuenta').in('id', ventaIds)
      ventasMap = Object.fromEntries((ventas || []).map(v => [v.id, v]))
    }

    const sumIngresos = (ingresos || []).reduce((s, i) => s + (i.monto || 0), 0)
    const sumEgresos = (egresos || []).reduce((s, e) => s + (e.monto || 0), 0)

    const cuentasResumen = {}
    for (const key of Object.keys(CUENTAS)) cuentasResumen[key] = { ingresos: 0, egresos: 0 }
    cuentasResumen['efectivo'] = { ingresos: 0, egresos: 0 }

    for (const i of ingresos || []) {
      const cuenta = ventasMap[i.venta_id]?.tipo_cuenta || 'efectivo'
      if (!cuentasResumen[cuenta]) cuentasResumen[cuenta] = { ingresos: 0, egresos: 0 }
      cuentasResumen[cuenta].ingresos += i.monto || 0
    }
    for (const e of egresos || []) {
      // Si el egreso tiene el pago dividido, se reparte por cuenta; si no, va todo a tipo_cuenta o efectivo
      if ((e.monto_efectivo || e.monto_transferencia_1 || e.monto_transferencia_2)) {
        if (e.monto_efectivo) cuentasResumen['efectivo'].egresos += e.monto_efectivo
        if (e.monto_transferencia_1 && e.tipo_cuenta_1) {
          if (!cuentasResumen[e.tipo_cuenta_1]) cuentasResumen[e.tipo_cuenta_1] = { ingresos: 0, egresos: 0 }
          cuentasResumen[e.tipo_cuenta_1].egresos += e.monto_transferencia_1
        }
        if (e.monto_transferencia_2 && e.tipo_cuenta_2) {
          if (!cuentasResumen[e.tipo_cuenta_2]) cuentasResumen[e.tipo_cuenta_2] = { ingresos: 0, egresos: 0 }
          cuentasResumen[e.tipo_cuenta_2].egresos += e.monto_transferencia_2
        }
      } else {
        const cuenta = e.tipo_cuenta || 'efectivo'
        if (!cuentasResumen[cuenta]) cuentasResumen[cuenta] = { ingresos: 0, egresos: 0 }
        cuentasResumen[cuenta].egresos += e.monto || 0
      }
    }

    setTotalIngresos(sumIngresos)
    setTotalEgresos(sumEgresos)
    setPorCuenta(cuentasResumen)
    setLoading(false)
  }

  const balance = totalIngresos - totalEgresos

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#9A8E85' }}>Cargando...</div>
  if (error) return <div style={{ textAlign: 'center', padding: 40, color: '#B22222' }}>Error cargando el balance: {error}</div>

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 20 }}>
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 18, borderLeft: '3px solid #1A9156' }}>
          <div style={{ fontSize: 11, color: '#9A8E85', marginBottom: 6 }}>Total ingresos</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1A9156' }}>${totalIngresos.toLocaleString('es-CO')}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 18, borderLeft: '3px solid #B22222' }}>
          <div style={{ fontSize: 11, color: '#9A8E85', marginBottom: 6 }}>Total egresos</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#B22222' }}>${totalEgresos.toLocaleString('es-CO')}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 18, borderLeft: `3px solid ${balance >= 0 ? '#1A5FA8' : '#B22222'}` }}>
          <div style={{ fontSize: 11, color: '#9A8E85', marginBottom: 6 }}>Balance del periodo</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: balance >= 0 ? '#1A5FA8' : '#B22222' }}>${balance.toLocaleString('es-CO')}</div>
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Balance por cuenta</div>
      <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F4F1ED' }}>
              {['Cuenta', 'Ingresos', 'Egresos', 'Balance'].map(h => (
                <th key={h} style={{ padding: '9px 16px', fontSize: 10, color: '#9A8E85', textAlign: 'left', borderBottom: '1px solid #DDD8CF', fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(porCuenta).map(([key, v]) => {
              const nombre = key === 'efectivo' ? 'Efectivo' : (CUENTAS[key] || key)
              const bal = v.ingresos - v.egresos
              if (v.ingresos === 0 && v.egresos === 0) return null
              return (
                <tr key={key} style={{ borderBottom: '1px solid #DDD8CF' }}>
                  <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600 }}>{nombre}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: '#1A9156', fontFamily: 'monospace' }}>${v.ingresos.toLocaleString('es-CO')}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, color: '#B22222', fontFamily: 'monospace' }}>${v.egresos.toLocaleString('es-CO')}</td>
                  <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: bal >= 0 ? '#1A5FA8' : '#B22222' }}>${bal.toLocaleString('es-CO')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}