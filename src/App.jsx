import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import PanelGeneral from './PanelGeneral'
import MateriaPrima from './MateriaPrima'
import Clientes from './Clientes'
import Vendedores from './Vendedores'
import Proveedores from './Proveedores'
import ProductoTerminado from './ProductoTerminado'
import Ventas from './Ventas'
import Compras from './Compras'
import Manufactura from './Manufactura'
import Finanzas from './Finanzas'
import Calidad from './Calidad'
import ReportesHome from './reportes/ReportesHome'
import Login from './Login'
import InstalarApp from './InstalarApp'
import Empleados from './Empleados'
import VozAsistente from './VozAsistente'
import { publicarRecepcionVoz, emitirComandoVoz, solicitarAperturaRecepcion } from './vozBus'

const SIDEBAR_WIDTH = 220

// =========================================================
// PERMISOS POR ROL
// =========================================================
// Cada rol solo ve los módulos listados aquí. 'dashboard' se
// deja disponible para todos. 'admin' ve todo el sistema.
const MODULOS_POR_ROL = {
  admin: null, // null = ve todos los módulos, sin filtrar
  ventas: ['dashboard', 'ventas', 'clientes', 'vendedores', 'reportes'],
  produccion: ['dashboard', 'manufactura', 'materia_prima', 'calidad', 'reportes'],
  bodega: ['dashboard', 'materia_prima', 'producto_terminado', 'reportes'],
  compras: ['dashboard', 'compras', 'proveedores', 'reportes'],
}

// =========================================================
// ASISTENTE DE VOZ
// =========================================================
// Otras formas de nombrar cada módulo al pedirlo por voz
// ("Hey Veya, abre calidad"). El nombre del módulo ya cuenta
// solo; aquí van los sinónimos. No repitas un alias en dos módulos.
// La voz solo puede ir a los módulos que el menú de ese rol ya muestra.
const ALIAS_VOZ = {
  dashboard: ['panel', 'inicio'],
  materia_prima: ['inventario', 'existencias'],
  producto_terminado: ['terminado', 'productos terminados'],
  ventas: ['pedidos'],
  manufactura: ['producción', 'fabricación', 'planta'],
  compras: ['facturas de compra'],
  finanzas: ['dinero', 'caja'],
  empleados: ['personal'],
  reportes: ['informes'],
  calidad: ['recepción', 'recibir', 'recibo'],
}

// Filtra el menú según el rol, y quita separadores que se
// quedarían sin ningún módulo debajo.
function filtrarMenuPorRol(menu, rol) {
  const permitidos = MODULOS_POR_ROL[rol]
  if (!permitidos) return menu // admin o rol desconocido: sin filtrar

  const filtrado = []
  let ultimoEsSeparador = false

  for (const item of menu) {
    if (item.separador) {
      ultimoEsSeparador = true
      continue
    }
    if (permitidos.includes(item.id)) {
      if (ultimoEsSeparador) {
        // Vuelve a insertar el separador correspondiente antes de este item
        const idxOriginal = menu.indexOf(item)
        for (let i = idxOriginal - 1; i >= 0; i--) {
          if (menu[i].separador) { filtrado.push(menu[i]); break }
          if (!menu[i].separador) break
        }
      }
      filtrado.push(item)
      ultimoEsSeparador = false
    }
  }
  return filtrado
}

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modulo, setModulo] = useState('dashboard')

  // =========================================================
  // ROL DEL EMPLEADO
  // =========================================================
  const [rol, setRol] = useState(null)
  const [rolCargado, setRolCargado] = useState(false)

  const cargarRol = async (email) => {
    setRolCargado(false)
    const { data } = await supabase
      .from('empleados')
      .select('rol, activo')
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (data && data.activo !== false) {
      setRol(data.rol)
    } else {
      setRol(null) // sin registro o desactivado → sin acceso a módulos
    }
    setRolCargado(true)
  }

  // =========================================================
  // DETECCIÓN DE DISPOSITIVO TÁCTIL
  // =========================================================
  const [isMobile, setIsMobile] = useState(() =>
    window.matchMedia('(pointer: coarse)').matches
  )

  const [sidebarAbierto, setSidebarAbierto] = useState(false)

  // =========================================================
  // AUTENTICACIÓN
  // =========================================================
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      setLoading(false)
      if (u?.email) cargarRol(u.email)
    })

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u?.email) cargarRol(u.email)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // =========================================================
  // MATERIAS PRIMAS PARA EL ASISTENTE DE VOZ
  // =========================================================
  // Solo id y nombre: es lo que la voz necesita para reconocer
  // "papada nacional", etc. Se carga cuando ya hay un rol asignado.
  const [materias, setMaterias] = useState([])

  useEffect(() => {
    if (!rol) return
    supabase
      .from('productos')
      .select('id, nombre')
      .eq('tipo_inventario', 'materia_prima')
      .order('nombre')
      .then(({ data }) => setMaterias(data || []))
  }, [rol])

  // =========================================================
  // DETECTAR CAMBIO ENTRE PC Y MÓVIL
  // =========================================================
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')

    const handleChange = () => {
      setIsMobile(mq.matches)
      if (!mq.matches) {
        setSidebarAbierto(false)
      }
    }

    if (mq.addEventListener) {
      mq.addEventListener('change', handleChange)
    } else {
      mq.addListener(handleChange)
    }

    return () => {
      if (mq.removeEventListener) {
        mq.removeEventListener('change', handleChange)
      } else {
        mq.removeListener(handleChange)
      }
    }
  }, [])

  // =========================================================
  // SELECCIONAR MÓDULO
  // =========================================================
  const seleccionarModulo = (id) => {
    setModulo(id)
    if (isMobile) {
      setSidebarAbierto(false)
    }
  }

  // =========================================================
  // CARGANDO
  // =========================================================
  if (loading || (user && !rolCargado)) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          background: '#F4F1ED'
        }}
      >
        <div style={{ fontSize: 14, color: '#9A8E85' }}>Cargando...</div>
      </div>
    )
  }

  // =========================================================
  // LOGIN
  // =========================================================
  if (!user) {
    return <Login onLogin={setUser} />
  }

  // =========================================================
  // SIN ROL ASIGNADO
  // =========================================================
  if (!rol) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          background: '#F4F1ED',
          padding: 24,
          textAlign: 'center'
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Sin acceso asignado</div>
        <div style={{ fontSize: 13, color: '#9A8E85', maxWidth: 360, marginBottom: 20 }}>
          Tu cuenta ({user.email}) no tiene un rol asignado en el sistema, o está desactivada.
          Contacta al administrador para que te asigne acceso desde el módulo de Empleados.
        </div>
        <div
          onClick={() => supabase.auth.signOut()}
          style={{ color: '#B22222', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
        >
          Cerrar sesión
        </div>
      </div>
    )
  }

  // =========================================================
  // MENÚ (filtrado según el rol)
  // =========================================================
  const menuCompleto = [
    { id: 'dashboard', nombre: 'Panel General', icon: '▦' },

    { separador: 'INVENTARIO' },
    { id: 'materia_prima', nombre: 'Materia Prima', icon: '🧂' },
    { id: 'producto_terminado', nombre: 'Producto Terminado', icon: '🌭' },

    { separador: 'VENTAS' },
    { id: 'ventas', nombre: 'Ventas', icon: '🛒' },
    { id: 'clientes', nombre: 'Clientes', icon: '👥' },

    { separador: 'OPERACIONES' },
    { id: 'manufactura', nombre: 'Manufactura', icon: '🏭' },
    { id: 'proveedores', nombre: 'Proveedores', icon: '🚛' },
    { id: 'compras', nombre: 'Compras', icon: '🛒' },

    { separador: 'FINANZAS' },
    { id: 'finanzas', nombre: 'Finanzas', icon: '💰' },
    { id: 'empleados', nombre: 'Empleados', icon: '👤' },
    { id: 'vendedores', nombre: 'Vendedores', icon: '🧑‍💼' },

    { separador: 'REPORTES' },
    { id: 'reportes', nombre: 'Reportes', icon: '📊' },

    { separador: 'CALIDAD' },
    { id: 'calidad', nombre: 'Calidad', icon: '🔬' }
  ]

  const menu = filtrarMenuPorRol(menuCompleto, rol)

  // Si el módulo actualmente seleccionado ya no está permitido
  // (por ejemplo, cambió de rol), lo mandamos de vuelta al panel.
  const moduloPermitido = menu.some(m => m.id === modulo)
  const moduloActivo = moduloPermitido ? modulo : 'dashboard'

  // =========================================================
  // ASISTENTE DE VOZ ("Hey Veya")
  // =========================================================
  // Los módulos que puede abrir por voz salen del menú YA filtrado por rol:
  // admin los ve todos; producción solo los suyos, etc.
  const modulosVoz = menu
    .filter(m => !m.separador)
    .map(m => ({ id: m.id, nombre: m.nombre, alias: ALIAS_VOZ[m.id] || [] }))

  // "Hey Veya, nueva recepción": abre Calidad y le avisa que abra el formulario de recepción
  const abrirRecepcionPorVoz = () => {
    solicitarAperturaRecepcion()
    seleccionarModulo('calidad')
  }

  // El asistente se dibuja solo: icono redondo pequeño que se abre al tocarlo (ver VozAsistente.jsx)
  const vozAsistente = (
    <VozAsistente
      productos={materias}
      modulos={modulosVoz}
      moduloActual={moduloActivo}
      onCambiarModulo={seleccionarModulo}
      idRecepcion="calidad"
      onConfirmar={publicarRecepcionVoz}
      onComando={emitirComandoVoz}
      onNuevaRecepcion={abrirRecepcionPorVoz}
    />
  )

  const renderContenido = () => (
    <>
      {moduloActivo === 'dashboard' && <PanelGeneral />}
      {moduloActivo === 'materia_prima' && <MateriaPrima />}
      {moduloActivo === 'producto_terminado' && <ProductoTerminado />}
      {moduloActivo === 'ventas' && <Ventas />}
      {moduloActivo === 'clientes' && <Clientes />}
      {moduloActivo === 'manufactura' && <Manufactura />}
      {moduloActivo === 'proveedores' && <Proveedores />}
      {moduloActivo === 'compras' && <Compras />}
      {moduloActivo === 'finanzas' && <Finanzas />}
      {moduloActivo === 'empleados' && <Empleados />}
      {moduloActivo === 'vendedores' && <Vendedores />}
      {moduloActivo === 'reportes' && <ReportesHome />}
      {moduloActivo === 'calidad' && <Calidad />}
    </>
  )
  if (moduloActivo === 'reportes') {
  return (
    <div style={{ minHeight: '100vh', background: '#F4F1ED' }}>
      <ReportesHome onSalir={() => setModulo('dashboard')} />
      {vozAsistente}
    </div>
  )
}

  // =========================================================
  // PC
  // =========================================================
  if (!isMobile) {
    return (
      <div
        style={{
          display: 'flex',
          minHeight: '100vh',
          fontFamily: 'sans-serif',
          background: '#F4F1ED'
        }}
      >

        {/* SIDEBAR PC */}
        <div
          style={{
            width: 220,
            background: '#130D09',
            display: 'flex',
            flexDirection: 'column',
            position: 'fixed',
            height: '100vh',
            overflowY: 'auto'
          }}
        >
          <div style={{ padding: '22px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <img src="/logo.jpg" alt="logo" style={{ width: 60, objectFit: 'contain', marginBottom: 10 }} />
            <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>Ahumados M&Y</div>
            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>Sistema ERP</div>
          </div>

          <nav style={{ padding: '12px 10px', flex: 1 }}>
            {menu.map((item, i) =>
              item.separador ? (
                <div key={i} style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9.5, letterSpacing: '0.12em', padding: '14px 10px 5px', fontWeight: 500 }}>
                  {item.separador}
                </div>
              ) : (
                <div
                  key={item.id}
                  onClick={() => setModulo(item.id)}
                  style={{
                    padding: '9px 12px', borderRadius: 7,
                    color: moduloActivo === item.id ? '#fff' : 'rgba(255,255,255,0.5)',
                    background: moduloActivo === item.id ? '#B22222' : 'none',
                    fontSize: 13, cursor: 'pointer', marginBottom: 2,
                    display: 'flex', alignItems: 'center', gap: 8,
                    transition: 'all 0.15s'
                  }}
                >
                  <span>{item.icon}</span>
                  {item.nombre}
                </div>
              )
            )}
          </nav>

          <InstalarApp />

          <div style={{ padding: '12px 10px 18px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: 7 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#B22222', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                {user.email[0].toUpperCase()}
              </div>
              <div>
                <div style={{ color: '#fff', fontSize: 11 }}>{user.email}</div>
                <div onClick={() => supabase.auth.signOut()} style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, cursor: 'pointer' }}>
                  Cerrar sesión
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CONTENIDO PC */}
        <div style={{ marginLeft: 220, flex: 1, padding: '20px 16px' }}>
          {renderContenido()}
        </div>

        {/* ASISTENTE DE VOZ */}
        {vozAsistente}
      </div>
    )
  }

  // =========================================================
  // MÓVIL
  // =========================================================
  return (
    <div style={{ minHeight: '100vh', fontFamily: 'sans-serif', background: '#F4F1ED', overflowX: 'hidden' }}>

      {sidebarAbierto && (
        <div
          onClick={() => setSidebarAbierto(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 20 }}
        />
      )}

      <div style={{ position: 'sticky', top: 0, zIndex: 15, display: 'flex', alignItems: 'center', gap: 10, background: '#130D09', padding: '12px 16px' }}>
        <div onClick={() => setSidebarAbierto(true)} style={{ color: '#fff', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>☰</div>
        <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>Ahumados M&Y</div>
      </div>

      {sidebarAbierto && (
        <div style={{ width: SIDEBAR_WIDTH, background: '#130D09', display: 'flex', flexDirection: 'column', position: 'fixed', height: '100vh', overflowY: 'auto', zIndex: 25, left: 0, top: 0 }}>
          <div style={{ padding: '22px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <img src="/logo.jpg" alt="logo" style={{ width: 60, objectFit: 'contain', marginBottom: 10 }} />
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>Ahumados M&Y</div>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>Sistema ERP</div>
            </div>
            <div onClick={() => setSidebarAbierto(false)} style={{ color: 'rgba(255,255,255,0.4)', fontSize: 20, cursor: 'pointer' }}>✕</div>
          </div>

          <nav style={{ padding: '12px 10px', flex: 1 }}>
            {menu.map((item, i) =>
              item.separador ? (
                <div key={i} style={{ color: 'rgba(255,255,255,0.25)', fontSize: 9.5, letterSpacing: '0.12em', padding: '14px 10px 5px', fontWeight: 500 }}>
                  {item.separador}
                </div>
              ) : (
                <div
                  key={item.id}
                  onClick={() => seleccionarModulo(item.id)}
                  style={{
                    padding: '9px 12px', borderRadius: 7,
                    color: moduloActivo === item.id ? '#fff' : 'rgba(255,255,255,0.5)',
                    background: moduloActivo === item.id ? '#B22222' : 'none',
                    fontSize: 13, cursor: 'pointer', marginBottom: 2,
                    display: 'flex', alignItems: 'center', gap: 8,
                    transition: 'all 0.15s'
                  }}
                >
                  <span>{item.icon}</span>
                  {item.nombre}
                </div>
              )
            )}
          </nav>

          <InstalarApp />

          <div style={{ padding: '12px 10px 18px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: 7 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#B22222', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                {user.email[0].toUpperCase()}
              </div>
              <div>
                <div style={{ color: '#fff', fontSize: 11 }}>{user.email}</div>
                <div onClick={() => supabase.auth.signOut()} style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, cursor: 'pointer' }}>
                  Cerrar sesión
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: 14, paddingBottom: 90, boxSizing: 'border-box', width: '100%', maxWidth: '100vw', overflowX: 'auto' }}>
        {renderContenido()}
      </div>

      {/* ASISTENTE DE VOZ */}
      {vozAsistente}
    </div>
  )
}