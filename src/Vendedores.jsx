import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const COLOR = "#B22222";
const FONDO = "#F4F1ED";

export default function Empleados() {
  const [empleados, setEmpleados] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [empleado, setEmpleado] = useState(null);
  const [seccion, setSeccion] = useState("info");

  const [kpi, setKpi] = useState({
    activos: 0,
    documentos: 0,
    capacitaciones: 0,
  });

  useEffect(() => {
    cargarTodo();
  }, []);

  async function cargarTodo() {
    await Promise.all([
      cargarEmpleados(),
      cargarIndicadores()
    ]);
  }

  async function cargarEmpleados() {
    const { data } = await supabase
      .from("empleados")
      .select("*")
      .order("codigo");

    setEmpleados(data || []);
  }

  async function cargarIndicadores() {

    const hoy = new Date();
    const limite = new Date();
    limite.setDate(hoy.getDate() + 30);

    const { count: activos } = await supabase
      .from("empleados")
      .select("*", { head: true, count: "exact" })
      .eq("estado", "ACTIVO");

    const { count: documentos } = await supabase
      .from("empleado_documentos")
      .select("*", { head: true, count: "exact" })
      .gte("fecha_vencimiento", hoy.toISOString())
      .lte("fecha_vencimiento", limite.toISOString());

    const { count: capacitaciones } = await supabase
      .from("empleado_capacitaciones")
      .select("*", { head: true, count: "exact" })
      .gte("fecha_vencimiento", hoy.toISOString())
      .lte("fecha_vencimiento", limite.toISOString());

    setKpi({
      activos: activos || 0,
      documentos: documentos || 0,
      capacitaciones: capacitaciones || 0
    });
  }

  if (empleado) {
    return (
      <FichaEmpleado
        empleado={empleado}
        volver={() => setEmpleado(null)}
        seccion={seccion}
        setSeccion={setSeccion}
      />
    );
  }

  const filtrados = empleados.filter((e) =>
    `${e.codigo} ${e.nombres} ${e.apellidos} ${e.cedula}`
      .toLowerCase()
      .includes(busqueda.toLowerCase())
  );

  return (
    <div style={{ background: FONDO, minHeight: "100vh", padding: 20 }}>

      <h2 style={{ color: COLOR, marginBottom: 20 }}>👥 Empleados</h2>

      {/* KPIs */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          gap: 15,
          marginBottom: 20,
        }}
      >
        <KPI icon="👥" valor={kpi.activos} titulo="Empleados activos" />
        <KPI icon="📄" valor={kpi.documentos} titulo="Documentos por vencer" />
        <KPI icon="🎓" valor={kpi.capacitaciones} titulo="Capacitación por vencer" />
      </div>

      {/* Tareas */}

      <Tarjeta>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <h3 style={{ color: COLOR, margin: 0 }}>📋 Tareas pendientes</h3>

          <button style={boton}>
            ➕ Nuevo empleado
          </button>
        </div>

        <ul style={{ lineHeight: 2 }}>
          <li>Renovar documentos próximos a vencer.</li>
          <li>Registrar capacitaciones.</li>
          <li>Entregar dotaciones pendientes.</li>
          <li>Actualizar expedientes incompletos.</li>
        </ul>

      </Tarjeta>

      {/* Buscador */}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          background: "#fff",
          borderRadius: 10,
          padding: "10px 15px",
          marginBottom: 20,
        }}
      >
        <span style={{ fontSize: 18 }}>🔍</span>

        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por código, nombre o cédula"
          style={{
            border: "none",
            outline: "none",
            background: "transparent",
            marginLeft: 10,
            width: "100%",
            fontSize: 15,
          }}
        />
      </div>

      {/* Tabla */}

      <Tarjeta>

        <table width="100%" cellPadding={12}>

          <thead style={{ background: COLOR, color: "#fff" }}>
            <tr>
              <th align="left">Código</th>
              <th align="left">Empleado</th>
              <th align="left">Cargo</th>
              <th align="center">Estado</th>
            </tr>
          </thead>

          <tbody>

            {filtrados.map((emp) => (

              <tr
                key={emp.id}
                onClick={() => setEmpleado(emp)}
                style={{
                  cursor: "pointer",
                  borderBottom: "1px solid #eee",
                }}
              >
                <td>{emp.codigo}</td>

                <td>
                  {emp.nombres} {emp.apellidos}
                </td>

                <td>{emp.cargo}</td>

                <td align="center">
                  <Badge estado={emp.estado} />
                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </Tarjeta>

    </div>
  );
}

function FichaEmpleado({ empleado, volver, seccion, setSeccion }) {

  const menu = [
    { id: "info", texto: "👤 Información" },
    { id: "laboral", texto: "💼 Laboral" },
    { id: "documentos", texto: "📂 Documentos" },
    { id: "dotacion", texto: "👕 Dotación" },
    { id: "capacitaciones", texto: "🎓 Capacitaciones" },
    { id: "historial", texto: "🕒 Historial" },
  ];

  return (

    <div
      style={{
        display: "flex",
        background: FONDO,
        minHeight: "100vh",
      }}
    >

      {/* Menú lateral */}

      <div
        style={{
          width: 250,
          background: "#fff",
          padding: 20,
          borderRight: "1px solid #ddd",
        }}
      >

        <button onClick={volver} style={botonSecundario}>
          ⬅ Volver
        </button>

        <div style={{ textAlign: "center", marginTop: 20 }}>

          <div
            style={{
              width: 90,
              height: 90,
              borderRadius: "50%",
              background: "#ddd",
              margin: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
            }}
          >
            👤
          </div>

          <h3>{empleado.codigo}</h3>

          <strong>
            {empleado.nombres} {empleado.apellidos}
          </strong>

          <p>{empleado.cargo}</p>

          <Badge estado={empleado.estado} />

        </div>

        <div style={{ marginTop: 25 }}>

          {menu.map((item) => (

            <div
              key={item.id}
              onClick={() => setSeccion(item.id)}
              style={{
                padding: 12,
                borderRadius: 10,
                cursor: "pointer",
                marginBottom: 8,
                background: seccion === item.id ? COLOR : "transparent",
                color: seccion === item.id ? "#fff" : "#444",
                fontWeight: seccion === item.id ? "bold" : "normal",
              }}
            >
              {item.texto}
            </div>

          ))}

        </div>

      </div>

      {/* Contenido */}

      <div style={{ flex: 1, padding: 30 }}>

        {seccion === "info" && (
          <>
            <h2 style={{ color: COLOR }}>Información Personal</h2>

            <Tarjeta>
              <Campo label="Cédula" valor={empleado.cedula} />
              <Campo label="Teléfono" valor={empleado.telefono} />
              <Campo label="Dirección" valor={empleado.direccion} />
              <Campo label="Correo" valor={empleado.correo} />
            </Tarjeta>

            <Tarjeta>

              <h3 style={{ color: COLOR }}>Contacto de emergencia</h3>

              <Campo label="Nombre" valor={empleado.contacto_nombre} />
              <Campo label="Parentesco" valor={empleado.contacto_parentesco} />
              <Campo label="Teléfono" valor={empleado.contacto_telefono} />

            </Tarjeta>
          </>
        )}

        {seccion === "laboral" && (

          <>
            <h2 style={{ color: COLOR }}>Información Laboral</h2>

            <Tarjeta>

              <Campo label="Cargo" valor={empleado.cargo} />
              <Campo label="Área" valor={empleado.area} />
              <Campo label="Contrato" valor={empleado.tipo_contrato} />
              <Campo
                label="Salario"
                valor={`$${Number(empleado.salario || 0).toLocaleString("es-CO")}`}
              />
              <Campo label="Ingreso" valor={empleado.fecha_ingreso} />

            </Tarjeta>
          </>
        )}

        {seccion === "documentos" && (
          <>
            <h2 style={{ color: COLOR }}>Documentos</h2>

            <Tarjeta>
              Aquí aparecerán los documentos con su semáforo de vencimiento.
            </Tarjeta>
          </>
        )}

        {seccion === "dotacion" && (
          <>
            <h2 style={{ color: COLOR }}>Dotación</h2>

            <Tarjeta>

              <Campo label="Talla camisa" valor={empleado.talla_camisa} />
              <Campo label="Talla pantalón" valor={empleado.talla_pantalon} />
              <Campo label="Talla botas" valor={empleado.talla_botas} />

            </Tarjeta>
          </>
        )}

        {seccion === "capacitaciones" && (
          <>
            <h2 style={{ color: COLOR }}>Capacitaciones</h2>

            <Tarjeta>
              Aquí aparecerán las capacitaciones registradas.
            </Tarjeta>
          </>
        )}

        {seccion === "historial" && (
          <>
            <h2 style={{ color: COLOR }}>Historial</h2>

            <Tarjeta>
              Línea de tiempo automática del empleado.
            </Tarjeta>
          </>
        )}

      </div>

    </div>

  );
}

function Tarjeta({ children }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 15,
        padding: 20,
        marginBottom: 20,
        boxShadow: "0 2px 8px rgba(0,0,0,.05)",
      }}
    >
      {children}
    </div>
  );
}

function Campo({ label, valor }) {
  return (
    <div style={{ marginBottom: 15 }}>
      <strong>{label}</strong>
      <div>{valor || "-"}</div>
    </div>
  );
}

function KPI({ icon, valor, titulo }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 15,
        padding: 20,
        display: "flex",
        gap: 15,
        alignItems: "center",
        boxShadow: "0 2px 8px rgba(0,0,0,.05)",
      }}
    >
      <div style={{ fontSize: 30 }}>{icon}</div>

      <div>
        <div style={{ fontSize: 28, fontWeight: "bold" }}>{valor}</div>
        <div>{titulo}</div>
      </div>
    </div>
  );
}

function Badge({ estado }) {
  const colores = {
    ACTIVO: "#16a34a",
    RETIRADO: "#6b7280",
    VACACIONES: "#2563eb",
  };

  return (
    <span
      style={{
        background: colores[estado] || "#888",
        color: "#fff",
        padding: "5px 12px",
        borderRadius: 20,
        fontSize: 12,
      }}
    >
      {estado}
    </span>
  );
}

const boton = {
  background: COLOR,
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "10px 16px",
  cursor: "pointer",
};

const botonSecundario = {
  background: "#eee",
  border: "none",
  borderRadius: 10,
  padding: "8px 14px",
  cursor: "pointer",
};