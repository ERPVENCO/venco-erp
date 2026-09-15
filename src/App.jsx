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

const SIDEBAR_WIDTH = 220

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [modulo, setModulo] = useState('dashboard')

  // =========================================================
  // DETECCIÓN DE DISPOSITIVO TÁCTIL
  // =========================================================
  // No usamos el ancho de la pantalla.
  // De esta manera una ventana pequeña en un PC sigue siendo PC.
  const [isMobile, setIsMobile] = useState(() =>
    window.matchMedia('(pointer: coarse)').matches
  )

  const [sidebarAbierto, setSidebarAbierto] = useState(false)

  // =========================================================
  // AUTENTICACIÓN
  // =========================================================
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // =========================================================
  // DETECTAR CAMBIO ENTRE PC Y MÓVIL
  // =========================================================
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')

    const handleChange = () => {
      setIsMobile(mq.matches)

      // Si volvemos a PC, dejamos el sidebar abierto
      // porque en PC siempre debe estar visible.
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

    // En móvil cerramos el menú después de seleccionar.
    if (isMobile) {
      setSidebarAbierto(false)
    }
  }

  // =========================================================
  // CARGANDO
  // =========================================================
  if (loading) {
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
        <div
          style={{
            fontSize: 14,
            color: '#9A8E85'
          }}
        >
          Cargando...
        </div>
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
  // MENÚ
  // =========================================================
  const menu = [
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

  // =========================================================
  // PC
  // =========================================================
  // En PC el sidebar siempre existe.
  //
  // IMPORTANTE:
  // Esta estructura conserva la misma estructura visual
  // del App original.
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

        {/* =================================================
            SIDEBAR PC
            ================================================= */}
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

          <div
            style={{
              padding: '22px 18px',
              borderBottom: '1px solid rgba(255,255,255,0.07)'
            }}
          >
            <img
              src="/logo.jpg"
              alt="logo"
              style={{
                width: 60,
                objectFit: 'contain',
                marginBottom: 10
              }}
            />

            <div
              style={{
                color: '#fff',
                fontSize: 13,
                fontWeight: 700
              }}
            >
              Ahumados M&Y
            </div>

            <div
              style={{
                color: 'rgba(255,255,255,0.3)',
                fontSize: 10
              }}
            >
              Sistema ERP
            </div>
          </div>

          <nav
            style={{
              padding: '12px 10px',
              flex: 1
            }}
          >
            {menu.map((item, i) =>
              item.separador ? (
                <div
                  key={i}
                  style={{
                    color: 'rgba(255,255,255,0.25)',
                    fontSize: 9.5,
                    letterSpacing: '0.12em',
                    padding: '14px 10px 5px',
                    fontWeight: 500
                  }}
                >
                  {item.separador}
                </div>
              ) : (
                <div
                  key={item.id}
                  onClick={() => setModulo(item.id)}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 7,
                    color:
                      modulo === item.id
                        ? '#fff'
                        : 'rgba(255,255,255,0.5)',
                    background:
                      modulo === item.id
                        ? '#B22222'
                        : 'none',
                    fontSize: 13,
                    cursor: 'pointer',
                    marginBottom: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'all 0.15s'
                  }}
                >
                  <span>{item.icon}</span>
                  {item.nombre}
                </div>
              )
            )}
          </nav>

          {/* Botón instalar app */}
          <InstalarApp />

          {/* Usuario */}
          <div
            style={{
              padding: '12px 10px 18px',
              borderTop: '1px solid rgba(255,255,255,0.07)'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '9px 10px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 7
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: '#B22222',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                {user.email[0].toUpperCase()}
              </div>

              <div>
                <div
                  style={{
                    color: '#fff',
                    fontSize: 11
                  }}
                >
                  {user.email}
                </div>

                <div
                  onClick={() => supabase.auth.signOut()}
                  style={{
                    color: 'rgba(255,255,255,0.3)',
                    fontSize: 10,
                    cursor: 'pointer'
                  }}
                >
                  Cerrar sesión
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* =================================================
            CONTENIDO PC
            ================================================= */}
        <div
          style={{
            marginLeft: 220,
            flex: 1,
            padding: 28
          }}
        >

          {modulo === 'dashboard' && <PanelGeneral />}
          {modulo === 'materia_prima' && <MateriaPrima />}
          {modulo === 'producto_terminado' && <ProductoTerminado />}
          {modulo === 'ventas' && <Ventas />}
          {modulo === 'clientes' && <Clientes />}
          {modulo === 'manufactura' && <Manufactura />}
          {modulo === 'proveedores' && <Proveedores />}
          {modulo === 'compras' && <Compras />}
          {modulo === 'finanzas' && <Finanzas />}

          {modulo === 'empleados' && (
            <div
              style={{
                fontSize: 20,
                fontWeight: 700
              }}
            >
              👤 Empleados — próximamente
            </div>
          )}

          {modulo === 'vendedores' && <Vendedores />}
          {modulo === 'reportes' && <ReportesHome />}
          {modulo === 'calidad' && <Calidad />}

        </div>
      </div>
    )
  }

  // =========================================================
  // MÓVIL
  // =========================================================

  return (
    <div
      style={{
        minHeight: '100vh',
        fontFamily: 'sans-serif',
        background: '#F4F1ED',
        overflowX: 'hidden'
      }}
    >

      {/* =================================================
          OVERLAY
          ================================================= */}
      {sidebarAbierto && (
        <div
          onClick={() => setSidebarAbierto(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 20
          }}
        />
      )}

      {/* =================================================
          BARRA SUPERIOR MÓVIL
          ================================================= */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 15,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: '#130D09',
          padding: '12px 16px'
        }}
      >
        <div
          onClick={() => setSidebarAbierto(true)}
          style={{
            color: '#fff',
            fontSize: 22,
            cursor: 'pointer',
            lineHeight: 1
          }}
        >
          ☰
        </div>

        <div
          style={{
            color: '#fff',
            fontSize: 13,
            fontWeight: 700
          }}
        >
          Ahumados M&Y
        </div>
      </div>

      {/* =================================================
          SIDEBAR MÓVIL
          ================================================= */}
      {sidebarAbierto && (
        <div
          style={{
            width: SIDEBAR_WIDTH,
            background: '#130D09',
            display: 'flex',
            flexDirection: 'column',
            position: 'fixed',
            height: '100vh',
            overflowY: 'auto',
            zIndex: 25,
            left: 0,
            top: 0
          }}
        >

          <div
            style={{
              padding: '22px 18px',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div>
              <img
                src="/logo.jpg"
                alt="logo"
                style={{
                  width: 60,
                  objectFit: 'contain',
                  marginBottom: 10
                }}
              />

              <div
                style={{
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700
                }}
              >
                Ahumados M&Y
              </div>

              <div
                style={{
                  color: 'rgba(255,255,255,0.3)',
                  fontSize: 10
                }}
              >
                Sistema ERP
              </div>
            </div>

            <div
              onClick={() => setSidebarAbierto(false)}
              style={{
                color: 'rgba(255,255,255,0.4)',
                fontSize: 20,
                cursor: 'pointer'
              }}
            >
              ✕
            </div>
          </div>

          <nav
            style={{
              padding: '12px 10px',
              flex: 1
            }}
          >
            {menu.map((item, i) =>
              item.separador ? (
                <div
                  key={i}
                  style={{
                    color: 'rgba(255,255,255,0.25)',
                    fontSize: 9.5,
                    letterSpacing: '0.12em',
                    padding: '14px 10px 5px',
                    fontWeight: 500
                  }}
                >
                  {item.separador}
                </div>
              ) : (
                <div
                  key={item.id}
                  onClick={() => seleccionarModulo(item.id)}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 7,
                    color:
                      modulo === item.id
                        ? '#fff'
                        : 'rgba(255,255,255,0.5)',
                    background:
                      modulo === item.id
                        ? '#B22222'
                        : 'none',
                    fontSize: 13,
                    cursor: 'pointer',
                    marginBottom: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
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

          <div
            style={{
              padding: '12px 10px 18px',
              borderTop: '1px solid rgba(255,255,255,0.07)'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '9px 10px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 7
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: '#B22222',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                {user.email[0].toUpperCase()}
              </div>

              <div>
                <div
                  style={{
                    color: '#fff',
                    fontSize: 11
                  }}
                >
                  {user.email}
                </div>

                <div
                  onClick={() => supabase.auth.signOut()}
                  style={{
                    color: 'rgba(255,255,255,0.3)',
                    fontSize: 10,
                    cursor: 'pointer'
                  }}
                >
                  Cerrar sesión
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================
          CONTENIDO MÓVIL
          ================================================= */}
      <div
        style={{
          padding: 14,
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: '100vw',
          overflowX: 'auto'
        }}
      >

        {modulo === 'dashboard' && <PanelGeneral />}
        {modulo === 'materia_prima' && <MateriaPrima />}
        {modulo === 'producto_terminado' && <ProductoTerminado />}
        {modulo === 'ventas' && <Ventas />}
        {modulo === 'clientes' && <Clientes />}
        {modulo === 'manufactura' && <Manufactura />}
        {modulo === 'proveedores' && <Proveedores />}
        {modulo === 'compras' && <Compras />}
        {modulo === 'finanzas' && <Finanzas />}

        {modulo === 'empleados' && (
          <div
            style={{
              fontSize: 20,
              fontWeight: 700
            }}
          >
            👤 Empleados — próximamente
          </div>
        )}

        {modulo === 'vendedores' && <Vendedores />}
        {modulo === 'reportes' && <ReportesHome />}
        {modulo === 'calidad' && <Calidad />}

      </div>
    </div>
  )
}
