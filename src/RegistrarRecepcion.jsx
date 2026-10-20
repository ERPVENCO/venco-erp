import { useState, useEffect, useRef } from 'react'
import { supabase } from './supabase'
import { hoyISO, horaActual, siguienteFolio, trazVacio, registrarItemRecepcion } from './recepcionUtils'
import { tomarRecepcionesVoz, registrarManejadorVoz } from './vozBus'
import { interpretarFormulario } from './vozFormulario'

const opcionesInsp = [
  { value: '', label: 'Selecciona...' },
  { value: 'cumple', label: '✓ Cumple' },
  { value: 'no_cumple', label: '✗ No cumple' },
  { value: 'na', label: 'N/A' }
]

const inp = { width: '100%', padding: '8px 11px', border: '1px solid #DDD8CF', borderRadius: 7, fontSize: 13, boxSizing: 'border-box', background: '#F4F1ED' }
const lbl = { fontSize: 11, color: '#9A8E85', display: 'block', marginBottom: 4 }
const grid = (min) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 10 })

const ESPERA_GUARDAR_VOZ_MS = 4000

const formVacio = () => ({ proveedor_id: '', fecha_compra: hoyISO(), factura_proveedor: '', observaciones: '' })

// Este componente NO consulta ni muestra costos: el operario solo ve producto, stock y unidad.
// Todo el formulario se puede llenar con la voz ("Hey Veya, proveedor …"): ver vozFormulario.js
export default function RegistrarRecepcion({ onVolver, onGuardado }) {
  const [proveedores, setProveedores] = useState([])
  const [materias, setMaterias] = useState([])
  const [form, setForm] = useState(formVacio())
  const [items, setItems] = useState([])
  const [traz, setTraz] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [folioCreado, setFolioCreado] = useState(null)

  // Estado para la voz
  const [flash, setFlash] = useState(null)          // campo recién llenado (se resalta en verde)
  const [activa, setActiva] = useState(null)        // línea activa para los datos de calidad (null = la última)
  const [guardandoVoz, setGuardandoVoz] = useState(false)
  const [avisoVoz, setAvisoVoz] = useState(null)    // { texto, error } lo último que hizo la voz con las líneas
  const avisoTimerRef = useRef(null)

  // Refs: el manejador de voz se registra una sola vez y lee siempre lo último desde aquí
  const formRef = useRef(form); formRef.current = form
  const itemsRef = useRef(items); itemsRef.current = items
  const trazRef = useRef(traz); trazRef.current = traz
  const proveedoresRef = useRef(proveedores); proveedoresRef.current = proveedores
  const folioCreadoRef = useRef(folioCreado); folioCreadoRef.current = folioCreado
  const activaRef = useRef(null)
  const guardandoVozRef = useRef(false)
  const timerVozRef = useRef(null)
  const flashTimerRef = useRef(null)
  const guardarRef = useRef(null)
  const manejarVozRef = useRef(null)

  useEffect(() => {
    supabase.from('proveedores').select('id, empresa').eq('activo', true).order('empresa')
      .then(({ data }) => setProveedores(data || []))
    supabase.from('productos').select('id, codigo, nombre, unidad, categoria_mp, stock_actual')
      .eq('tipo_inventario', 'materia_prima').order('categoria_mp')
      .then(({ data }) => setMaterias(data || []))
  }, [])

  // =========================================================
  // VOZ
  // =========================================================
  const destacar = (clave) => {
    setFlash(clave)
    clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlash(null), 3000)
  }
  // Cuando la voz llena un campo que no se ve (queda arriba o abajo de la pantalla), baja o sube hasta él
  useEffect(() => {
    if (!flash) return
    const el = document.querySelector(`[data-vk="${flash}"]`)
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.top < 90 || r.bottom > window.innerHeight - 160) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [flash])

  const ci = (clave) => clave === flash
    ? { ...inp, border: '2px solid #1A9156', background: '#E8F7EF' }
    : inp

  const cancelarGuardadoVoz = () => {
    clearTimeout(timerVozRef.current)
    guardandoVozRef.current = false
    setGuardandoVoz(false)
  }

  const faltantes = () => {
    const f = formRef.current, its = itemsRef.current, out = []
    if (!f.proveedor_id) out.push('proveedor')
    if (!f.factura_proveedor.trim()) out.push('factura')
    if (its.length === 0) out.push('productos')
    else if (its.some(it => !it.producto_id || !(parseFloat(it.cantidad) > 0))) out.push('cantidades')
    return out
  }

  const iniciarGuardadoVoz = () => {
    clearTimeout(timerVozRef.current)
    guardandoVozRef.current = true
    setGuardandoVoz(true)
    timerVozRef.current = setTimeout(() => {
      guardandoVozRef.current = false
      setGuardandoVoz(false)
      guardarRef.current && guardarRef.current()
    }, ESPERA_GUARDAR_VOZ_MS)
  }

  // Recibe cada frase del asistente. Devuelve null si no era una orden de formulario.
  const manejarVoz = (norm, orig) => {
    if (guardandoVozRef.current) {
      if (/\b(cancela|cancelar|deten|detener|espera|no guardes)\b/.test(norm)) {
        cancelarGuardadoVoz()
        return { mensaje: 'Guardado cancelado' }
      }
      return { mensaje: '' } // durante la cuenta regresiva no se atiende nada más
    }
    if (folioCreadoRef.current) return null

    const r = interpretarFormulario(norm, orig, { proveedores: proveedoresRef.current, hoy: new Date() })
    if (!r) return null

    const dichos = []
    const errores = [...r.errores]
    const idx = () => activaRef.current ?? (itemsRef.current.length - 1)

    for (const a of r.acciones) {
      switch (a.tipo) {
        case 'proveedor':
          setForm(f => ({ ...f, proveedor_id: a.id }))
          destacar('proveedor'); dichos.push(`Proveedor ${a.nombre}`)
          break
        case 'factura':
          setForm(f => ({ ...f, factura_proveedor: a.valor }))
          destacar('factura'); dichos.push(`Factura ${a.valor}`)
          break
        case 'fecha':
          setForm(f => ({ ...f, fecha_compra: a.valor }))
          destacar('fecha'); dichos.push(`Fecha ${a.valor}`)
          break
        case 'obs':
          setForm(f => ({ ...f, observaciones: a.valor }))
          destacar('obs'); dichos.push('Observaciones anotadas')
          break
        case 'traz': {
          const k = idx()
          if (k < 0) { errores.push('Primero dicta un producto, por ejemplo papada nacional sumar 10'); break }
          setTraz(prev => prev.map((t, j) => j === k ? { ...t, [a.campo]: a.valor } : t))
          destacar(`${k}:${a.campo}`)
          dichos.push(`${a.etiqueta} ${a.mostrar ?? a.valor}`)
          break
        }
        case 'cantidad': {
          const k = idx()
          if (k < 0) { errores.push('Primero dicta un producto'); break }
          setItems(prev => prev.map((it, j) => j === k ? { ...it, cantidad: a.valor } : it))
          destacar(`${k}:cantidad`); dichos.push(`Cantidad ${a.valor}`)
          break
        }
        case 'linea_sel': {
          const its = itemsRef.current
          if (a.n > its.length) { errores.push(`No hay línea ${a.n}`); break }
          activaRef.current = a.n - 1
          setActiva(a.n - 1)
          dichos.push(`Línea ${a.n}, ${its[a.n - 1].nombre_producto || 'sin producto'}`)
          break
        }
        case 'linea_borrar': {
          const its = itemsRef.current
          if (a.n > its.length) { errores.push(`No hay línea ${a.n}`); break }
          const k = a.n - 1
          setItems(prev => prev.filter((_, j) => j !== k))
          setTraz(prev => prev.filter((_, j) => j !== k))
          dichos.push(`Línea ${a.n} eliminada`)
          break
        }
        case 'guardar': {
          const falta = faltantes()
          if (falta.length) { errores.push(`No puedo guardar, falta ${falta.join(', ')}`); break }
          iniciarGuardadoVoz()
          dichos.push('Guardando en 4 segundos, di cancela para detener')
          break
        }
        default: break
      }
    }

    if (errores.length) return { mensaje: [...dichos, ...errores].join('. '), error: true }
    return { mensaje: dichos.join('. ') }
  }
  manejarVozRef.current = manejarVoz

  // Mientras el formulario está abierto, el asistente le pasa las frases
  useEffect(() => {
    const quitar = registrarManejadorVoz((norm, orig) => manejarVozRef.current(norm, orig))
    return () => {
      quitar()
      clearTimeout(timerVozRef.current)
      clearTimeout(flashTimerRef.current)
      clearTimeout(avisoTimerRef.current)
    }
  }, [])

  // "Nueva recepción" por voz estando en la pantalla de éxito: vuelve a empezar
  useEffect(() => {
    const alAbrir = () => { if (folioCreadoRef.current) reiniciar() }
    window.addEventListener('voz:abrir-recepcion', alAbrir)
    return () => window.removeEventListener('voz:abrir-recepcion', alAbrir)
  }, [])

  // Líneas dictadas ("papada nacional sumar 22.7 más 10" + "listo"):
  //  - producto que YA está en el formulario → se SUMA a esa línea (no se crea otra)
  //  - "línea 2 sumar 5"                    → se suma a la línea 2
  //  - "nueva línea papada … sumar 5"        → fuerza una línea aparte
  // Si el formulario aún no estaba abierto, esperan en la cola hasta que cargue.
  useEffect(() => {
    const mostrarAvisoVoz = (texto, error) => {
      setAvisoVoz({ texto, error })
      clearTimeout(avisoTimerRef.current)
      avisoTimerRef.current = setTimeout(() => setAvisoVoz(null), 8000)
    }

    const aplicarVoz = () => {
      if (folioCreado || materias.length === 0) return
      const cola = tomarRecepcionesVoz()
      if (cola.length === 0) return

      const its = [...itemsRef.current]
      const trz = [...trazRef.current]
      const mensajes = []
      const errores = []
      let ultimo = -1
      const redondear = (n) => Math.round(n * 1000) / 1000

      for (const d of cola) {
        const cant = Number(d.cantidad) || 0
        let k = -1

        if (d.lineaDestino) {
          k = d.lineaDestino - 1
          if (!its[k]) { errores.push(`No hay línea ${d.lineaDestino} en el formulario`); continue }
        } else {
          const p = materias.find(m => String(m.id) === String(d.producto?.id))
          if (!p) continue
          k = d.nueva ? -1 : its.findIndex(it => String(it.producto_id) === String(p.id))
          if (k < 0) {
            its.push({ producto_id: p.id, nombre_producto: p.nombre, codigo_producto: p.codigo, cantidad: redondear(cant), unidad: p.unidad || 'kg' })
            trz.push({ ...trazVacio(), hora_recepcion: horaActual() })
            ultimo = its.length - 1
            mensajes.push(`Línea ${its.length} nueva: ${p.nombre} ${redondear(cant)}`)
            continue
          }
        }

        its[k] = { ...its[k], cantidad: redondear((parseFloat(its[k].cantidad) || 0) + cant) }
        ultimo = k
        mensajes.push(`Línea ${k + 1} ${its[k].nombre_producto || ''}: +${redondear(cant)} = ${its[k].cantidad}`)
      }

      if (mensajes.length) {
        setItems(its)
        setTraz(trz)
        destacar(`${ultimo}:cantidad`)
      }
      if (errores.length) mostrarAvisoVoz([...mensajes, ...errores].join(' · '), true)
      else if (mensajes.length) mostrarAvisoVoz(mensajes.join(' · '), false)
    }

    aplicarVoz() // por si había líneas esperando
    window.addEventListener('voz:recepcion', aplicarVoz)
    return () => window.removeEventListener('voz:recepcion', aplicarVoz)
  }, [materias, folioCreado])

  // Al agregar o quitar líneas, la línea activa vuelve a ser la última
  useEffect(() => { activaRef.current = null; setActiva(null) }, [items.length])

  // =========================================================
  // FORMULARIO
  // =========================================================
  const agregarItem = () => {
    setItems([...items, { producto_id: '', nombre_producto: '', codigo_producto: '', cantidad: '', unidad: 'kg' }])
    setTraz([...traz, { ...trazVacio(), hora_recepcion: horaActual() }])
  }

  const actualizarItem = (i, campo, valor) => {
    const upd = [...items]
    upd[i] = { ...upd[i], [campo]: valor }
    if (campo === 'producto_id') {
      const p = materias.find(m => m.id === valor)
      if (p) { upd[i].nombre_producto = p.nombre; upd[i].codigo_producto = p.codigo; upd[i].unidad = p.unidad || 'kg' }
    }
    setItems(upd)
  }

  const actualizarTraz = (i, campo, valor) => {
    const upd = [...traz]
    upd[i] = { ...upd[i], [campo]: valor }
    setTraz(upd)
  }

  const eliminarItem = (i) => {
    setItems(items.filter((_, k) => k !== i))
    setTraz(traz.filter((_, k) => k !== i))
  }

  const reiniciar = () => {
    cancelarGuardadoVoz()
    setForm(formVacio()); setItems([]); setTraz([]); setError(''); setFolioCreado(null)
  }

  const guardar = async () => {
    setError('')
    if (!form.proveedor_id) return setError('Selecciona un proveedor.')
    if (!form.factura_proveedor.trim()) return setError('Escribe el N° de factura del proveedor.')
    if (items.length === 0) return setError('Agrega al menos un producto.')
    if (items.some(it => !it.producto_id || !(parseFloat(it.cantidad) > 0)))
      return setError('Cada producto necesita seleccionar el material y una cantidad mayor a 0.')

    // Aviso si esa factura del proveedor ya se registró
    const { data: dup } = await supabase.from('compras').select('folio')
      .eq('proveedor_id', form.proveedor_id).eq('factura_proveedor', form.factura_proveedor.trim())
    if (dup && dup.length > 0 &&
        !window.confirm(`La factura ${form.factura_proveedor} de este proveedor ya existe en ${dup[0].folio}. ¿Registrar de todos modos?`)) return

    setGuardando(true)
    let folio = null
    try {
      const proveedor = proveedores.find(p => p.id === form.proveedor_id)
      const { data: { user } } = await supabase.auth.getUser()
      folio = await siguienteFolio()

      const { data, error: errCompra } = await supabase.from('compras').insert([{
        folio, proveedor_id: form.proveedor_id, proveedor_nombre: proveedor?.empresa || '',
        factura_proveedor: form.factura_proveedor.trim(), fecha_compra: form.fecha_compra || hoyISO(),
        estado: null, metodo_pago: null, subtotal: 0, descuento: 0, total: 0,
        observaciones: form.observaciones || null, usuario_email: user?.email,
        estado_registro: 'pendiente'
      }]).select()
      if (errCompra) throw new Error(errCompra.message)
      const compraId = data[0].id

      for (let i = 0; i < items.length; i++) {
        const producto = materias.find(m => m.id === items[i].producto_id)
        await registrarItemRecepcion({
          compraId, item: items[i], traz: traz[i], producto, fechaIngreso: form.fecha_compra
        })
      }

      await supabase.from('auditoria').insert([{
        tabla: 'compras', accion: 'RECEPCIÓN',
        descripcion: `${folio} — ${proveedor?.empresa} — Factura prov. ${form.factura_proveedor} (pendiente de completar)`,
        usuario_email: user?.email || 'desconocido', fecha: new Date().toISOString()
      }])

      setFolioCreado(folio)
      onGuardado && onGuardado()
    } catch (e) {
      setError(folio
        ? `La recepción ${folio} quedó incompleta (${e.message}). Avisa al administrativo para anularla desde Compras → Pendientes y vuelve a registrarla.`
        : e.message)
    }
    setGuardando(false)
  }
  guardarRef.current = guardar

  if (folioCreado) {
    return (
      <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 28, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Recepción registrada</div>
        <div style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 700, color: '#B22222', marginBottom: 6 }}>{folioCreado}</div>
        <div style={{ fontSize: 12, color: '#9A8E85', marginBottom: 20 }}>
          Ya aparece en el formato de recepción. El administrativo completará los datos de pago en Compras → Pendientes.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={reiniciar} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>➕ Registrar otra</button>
          <button onClick={onVolver} style={{ background: '#F4F1ED', border: '1px solid #DDD8CF', borderRadius: 7, padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}>Volver al formato</button>
        </div>
        <div style={{ fontSize: 11, color: '#9A8E85', marginTop: 14 }}>🎙️ Por voz: «Hey Veya, nueva recepción»</div>
      </div>
    )
  }

  const idxActivo = activa ?? (items.length - 1)

  return (
    <div style={{ background: '#fff', border: '1px solid #DDD8CF', borderRadius: 9, padding: 20 }}>
      <style>{`@keyframes llenarVoz { from { width: 0 } to { width: 100% } }`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>➕ Registrar recepción de materia prima</div>
        <button onClick={onVolver} style={{ background: '#F4F1ED', border: '1px solid #DDD8CF', borderRadius: 7, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>← Volver</button>
      </div>

      {/* AYUDA DE VOZ */}
      <details style={{ background: '#F4F1ED', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: '#5A4F47' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>🎙️ Qué puedes decir con «Hey Veya»</summary>
        <div style={{ marginTop: 8, lineHeight: 1.7 }}>
          <div><b>Datos:</b> «proveedor Cárnicos del Valle» · «factura 4587» · «fecha ayer» / «fecha 15 de octubre» · «observaciones llegó tarde»</div>
          <div><b>Productos:</b> «papada nacional sumar 22.7 más 10 más 8» y luego «listo» (si el producto ya está, se suma a su línea) · «línea dos sumar 5 más 3» · «nueva línea papada nacional sumar 4» · «cantidad 25» (cambia el total) · «quita la línea dos»</div>
          <div><b>Mientras sumas:</b> «borra» o «quita el último» (solo el último número) · «quita el número dos» · «cancela» o «borra todo» (toda la suma)</div>
          <div><b>Calidad de la línea:</b> «temperatura menos dos» · «empaque bueno» · «cumple especificaciones sí» · «responsable Juan Pérez» · «lote proveedor ABC 123» · «unidades diez» · «vence en tres meses» · «hora ocho y media»</div>
          <div><b>Transporte:</b> «vehículo limpio cumple» · «libre de plagas cumple» · «temperatura del transporte cuatro» · «placa ABC 123»</div>
          <div><b>Al final:</b> «guardar recepción» (tienes 4 segundos para decir «cancela»). Puedes encadenar varios campos en una sola frase.</div>
        </div>
      </details>

      {/* DATOS DE LA RECEPCIÓN */}
      <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>DATOS DE LA RECEPCIÓN</div>
        <div style={grid(200)}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>PROVEEDOR *</label>
            <select value={form.proveedor_id} onChange={e => setForm({ ...form, proveedor_id: e.target.value })} style={ci('proveedor')} data-vk={'proveedor'}>
              <option value="">Selecciona un proveedor...</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.empresa}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>N° FOLIO</label>
            <input value="Se asigna al guardar" disabled style={{ ...inp, color: '#9A8E85' }} />
          </div>
          <div>
            <label style={lbl}>N° FACTURA PROV. *</label>
            <input value={form.factura_proveedor} onChange={e => setForm({ ...form, factura_proveedor: e.target.value })} placeholder="Número que trae la factura del proveedor" style={ci('factura')} data-vk={'factura'} />
          </div>
          <div>
            <label style={lbl}>FECHA</label>
            <input type="date" value={form.fecha_compra} onChange={e => setForm({ ...form, fecha_compra: e.target.value })} style={ci('fecha')} data-vk={'fecha'} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={lbl}>OBSERVACIONES</label>
            <input value={form.observaciones} onChange={e => setForm({ ...form, observaciones: e.target.value })} placeholder="Notas de la entrega" style={ci('obs')} data-vk={'obs'} />
          </div>
        </div>
      </div>

      {/* PRODUCTOS */}
      <div style={{ background: '#F4F1ED', borderRadius: 8, padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#9A8E85', fontWeight: 600 }}>MATERIA PRIMA / INSUMOS RECIBIDOS</div>
          <button onClick={agregarItem} style={{ background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>＋ Agregar</button>
        </div>
        {avisoVoz && (
          <div style={{ background: avisoVoz.error ? '#FCEAEA' : '#E8F7EF', color: avisoVoz.error ? '#B22222' : '#1A7F45', borderRadius: 7, padding: '8px 10px', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>
            🎙️ {avisoVoz.texto}
          </div>
        )}
        {items.length === 0 && (
          <div style={{ padding: 12, background: '#fff', borderRadius: 7, fontSize: 12, color: '#9A8E85', textAlign: 'center' }}>Haz clic en "＋ Agregar" o dicta con «Hey Veya, papada nacional sumar 10» para añadir los productos recibidos</div>
        )}

        {items.map((item, i) => {
          const prod = materias.find(m => m.id === item.producto_id)
          const esEmpaque = prod?.categoria_mp === 'empaques'
          const t = traz[i] || {}
          const esActiva = items.length > 1 && i === idxActivo
          return (
            <div key={i} style={{ background: '#fff', borderRadius: 8, padding: 14, marginBottom: 12, border: esActiva ? '2px solid #B22222' : '1px solid #DDD8CF' }}>
              {items.length > 1 && (
                <div style={{ fontSize: 10, fontWeight: 700, color: esActiva ? '#B22222' : '#9A8E85', marginBottom: 8 }}>
                  LÍNEA {i + 1}{esActiva ? ' · recibe los datos dictados' : ''}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, alignItems: 'end', marginBottom: 10 }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={lbl}>PRODUCTO</label>
                  <select value={item.producto_id} onChange={e => actualizarItem(i, 'producto_id', e.target.value)} style={inp}>
                    <option value="">Selecciona...</option>
                    {materias.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>CANTIDAD</label>
                  <input type="number" value={item.cantidad} onChange={e => actualizarItem(i, 'cantidad', e.target.value)} placeholder="0" style={ci(`${i}:cantidad`)} data-vk={`${i}:cantidad`} />
                </div>
                <div>
                  <label style={lbl}>UNIDAD</label>
                  <select value={item.unidad} onChange={e => actualizarItem(i, 'unidad', e.target.value)} style={inp}>
                    <option value="kg">kg</option><option value="g">g</option><option value="lt">lt</option><option value="und">und</option><option value="lb">lb</option>
                  </select>
                </div>
                <button onClick={() => eliminarItem(i)} style={{ padding: '8px 10px', background: '#FCEAEA', color: '#B22222', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>

              {!esEmpaque && item.producto_id && (
                <div style={{ background: '#F4F1ED', borderRadius: 7, padding: 12 }}>
                  <div style={{ fontSize: 10, color: '#9A8E85', fontWeight: 600, marginBottom: 12 }}>🔬 TRAZABILIDAD DE RECEPCIÓN</div>

                  <div style={{ fontSize: 10, color: '#1A5FA8', fontWeight: 600, marginBottom: 8 }}>CARACTERÍSTICAS DE CALIDAD</div>
                  <div style={{ ...grid(150), marginBottom: 14 }}>
                    <div><label style={lbl}>HORA RECEPCIÓN</label><input type="time" value={t.hora_recepcion ?? ''} onChange={e => actualizarTraz(i, 'hora_recepcion', e.target.value)} style={ci(`${i}:hora_recepcion`)} data-vk={`${i}:hora_recepcion`} /></div>
                    <div><label style={lbl}>FECHA VENCIMIENTO</label><input type="date" value={t.fecha_vencimiento ?? ''} onChange={e => actualizarTraz(i, 'fecha_vencimiento', e.target.value)} style={ci(`${i}:fecha_vencimiento`)} data-vk={`${i}:fecha_vencimiento`} /></div>
                    <div><label style={lbl}>TEMPERATURA PRODUCTO (°C)</label><input type="number" value={t.temperatura_recepcion ?? ''} onChange={e => actualizarTraz(i, 'temperatura_recepcion', e.target.value)} placeholder="Ej. -2" style={ci(`${i}:temperatura_recepcion`)} data-vk={`${i}:temperatura_recepcion`} /></div>
                    <div>
                      <label style={lbl}>ESTADO EMPAQUE</label>
                      <select value={t.estado_empaque ?? ''} onChange={e => actualizarTraz(i, 'estado_empaque', e.target.value)} style={ci(`${i}:estado_empaque`)} data-vk={`${i}:estado_empaque`}>
                        <option value="">Selecciona...</option><option value="bueno">Bueno</option><option value="regular">Regular</option><option value="malo">Malo</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>CUMPLE ESPECIFICACIONES</label>
                      <select value={t.cumple_especificaciones ?? ''} onChange={e => actualizarTraz(i, 'cumple_especificaciones', e.target.value)} style={ci(`${i}:cumple_especificaciones`)} data-vk={`${i}:cumple_especificaciones`}>
                        <option value="">Selecciona...</option><option value="si">✅ Sí</option><option value="no">❌ No</option>
                      </select>
                    </div>
                    <div><label style={lbl}>RESPONSABLE</label><input value={t.responsable ?? ''} onChange={e => actualizarTraz(i, 'responsable', e.target.value)} placeholder="Nombre" style={ci(`${i}:responsable`)} data-vk={`${i}:responsable`} /></div>
                    <div><label style={lbl}>LOTE PROVEEDOR</label><input value={t.lote_proveedor ?? ''} onChange={e => actualizarTraz(i, 'lote_proveedor', e.target.value)} placeholder="Lote del proveedor" style={ci(`${i}:lote_proveedor`)} data-vk={`${i}:lote_proveedor`} /></div>
                    <div><label style={lbl}>N° UNIDADES</label><input type="number" value={t.numero_unidades ?? ''} onChange={e => actualizarTraz(i, 'numero_unidades', e.target.value)} placeholder="Ej. 10" style={ci(`${i}:numero_unidades`)} data-vk={`${i}:numero_unidades`} /></div>
                  </div>

                  <div style={{ fontSize: 10, color: '#1A5FA8', fontWeight: 600, marginBottom: 8 }}>🚛 INSPECCIÓN TRANSPORTE</div>
                  <div style={{ ...grid(150), marginBottom: 10 }}>
                    <div>
                      <label style={lbl}>VEHÍCULO LIMPIO</label>
                      <select value={t.vehiculo_limpio ?? ''} onChange={e => actualizarTraz(i, 'vehiculo_limpio', e.target.value)} style={ci(`${i}:vehiculo_limpio`)} data-vk={`${i}:vehiculo_limpio`}>
                        {opcionesInsp.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>LIBRE DE PLAGAS</label>
                      <select value={t.libre_plagas ?? ''} onChange={e => actualizarTraz(i, 'libre_plagas', e.target.value)} style={ci(`${i}:libre_plagas`)} data-vk={`${i}:libre_plagas`}>
                        {opcionesInsp.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>TEMPERATURA TRANSPORTE (°C)</label><input type="number" value={t.temperatura_transporte ?? ''} onChange={e => actualizarTraz(i, 'temperatura_transporte', e.target.value)} placeholder="Ej. 4" style={ci(`${i}:temperatura_transporte`)} data-vk={`${i}:temperatura_transporte`} /></div>
                    <div><label style={lbl}>N° PLACA</label><input value={t.numero_placa ?? ''} onChange={e => actualizarTraz(i, 'numero_placa', e.target.value)} placeholder="Ej. ABC123" style={ci(`${i}:numero_placa`)} data-vk={`${i}:numero_placa`} /></div>
                  </div>

                  <div>
                    <label style={lbl}>OBSERVACIONES</label>
                    <input value={t.observaciones ?? ''} onChange={e => actualizarTraz(i, 'observaciones', e.target.value)} placeholder="Notas" style={ci(`${i}:observaciones`)} data-vk={`${i}:observaciones`} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {error && <div style={{ background: '#FCEAEA', borderRadius: 7, padding: 10, fontSize: 12, color: '#B22222', marginBottom: 12 }}>⚠️ {error}</div>}

      {guardandoVoz && (
        <div style={{ background: '#E8F7EF', borderRadius: 7, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1A7F45', marginBottom: 8 }}>🎙️ Guardando la recepción… di «cancela» para detenerla</div>
          <div style={{ height: 10, background: '#cfe9da', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#2e7d32', animation: `llenarVoz ${ESPERA_GUARDAR_VOZ_MS}ms linear forwards` }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onVolver} style={{ padding: '8px 16px', border: '1px solid #DDD8CF', borderRadius: 7, background: 'none', cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
        <button onClick={guardar} disabled={guardando} style={{ padding: '8px 16px', background: '#B22222', color: '#fff', border: 'none', borderRadius: 7, cursor: guardando ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, opacity: guardando ? 0.7 : 1 }}>
          {guardando ? 'Guardando...' : '📥 Guardar recepción'}
        </button>
      </div>
    </div>
  )
}