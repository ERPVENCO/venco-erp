import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

// ------------------------------------------------------------------
// Ahumados M&Y — Cuentas por Pagar
// Lee de la vista `vista_cuentas_por_pagar` (compras a crédito con saldo en vivo)
// Los abonos se registran como filas en `egresos` con compra_id.
// ------------------------------------------------------------------

const COLOR_ROJO = "#B22222";
const COLOR_FONDO = "#F4F1ED";
const PASSWORD_CONFIRMACION = "1234";
const METODOS_PAGO = ["Efectivo", "Transferencia", "Tarjeta", "Cheque"];

const hoyBogota = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

// Devuelve "YYYY-MM-DDTHH:mm" en hora de Bogotá, listo para <input type="datetime-local">
const ahoraBogotaDatetimeLocal = () => {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const obtener = (tipo) => partes.find((p) => p.type === tipo)?.value;
  return `${obtener("year")}-${obtener("month")}-${obtener("day")}T${obtener("hour")}:${obtener("minute")}`;
};

const formatoFechaHora = (valor) => {
  if (!valor) return "—";
  const fecha = new Date(valor);
  if (isNaN(fecha)) return valor;
  return fecha.toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatoCOP = (valor) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(
    Number(valor) || 0
  );

const colorEstado = {
  Pendiente: COLOR_ROJO,
  Parcial: "#b8860b",
  Pagada: "#1e7e34",
};

export default function CuentasPorPagar({ onVolver }) {
  const [cuentas, setCuentas] = useState([]);
  const [abonos, setAbonos] = useState({}); // { compra_id: [egresos...] }
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [filtroEstado, setFiltroEstado] = useState("Todas"); // Todas | Pendiente | Parcial | Pagada
  const [filtroProveedor, setFiltroProveedor] = useState("");
  const [busquedaFolio, setBusquedaFolio] = useState("");

  const [modalAbono, setModalAbono] = useState(null); // cuenta seleccionada
  const [formAbono, setFormAbono] = useState({ monto: "", metodo_pago: "Efectivo", fecha: hoyBogota(), concepto: "" });

  const [modalHistorial, setModalHistorial] = useState(null); // cuenta seleccionada

  const [confirmEliminarAbono, setConfirmEliminarAbono] = useState(null); // egreso a eliminar
  const [passwordInput, setPasswordInput] = useState("");
  const [errorPassword, setErrorPassword] = useState("");

  useEffect(() => {
    cargarCuentas();
  }, []);

  async function cargarCuentas() {
    setCargando(true);
    setError("");
    const { data, error: err } = await supabase
      .from("vista_cuentas_por_pagar")
      .select("*")
      .order("fecha_compra", { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setCuentas(data || []);
    }
    setCargando(false);
  }

  async function cargarHistorial(compraId) {
    const { data, error: err } = await supabase
      .from("egresos")
      .select("*")
      .eq("compra_id", compraId)
      .order("fecha", { ascending: false });
    if (err) {
      setError(err.message);
      return;
    }
    setAbonos((prev) => ({ ...prev, [compraId]: data || [] }));
  }

  const proveedores = useMemo(
    () => [...new Set(cuentas.map((c) => c.proveedor_nombre).filter(Boolean))].sort(),
    [cuentas]
  );

  const cuentasFiltradas = useMemo(() => {
    return cuentas.filter((c) => {
      if (filtroEstado !== "Todas" && c.estado_pago !== filtroEstado) return false;
      if (filtroProveedor && c.proveedor_nombre !== filtroProveedor) return false;
      if (busquedaFolio && !String(c.folio || "").toLowerCase().includes(busquedaFolio.toLowerCase())) return false;
      return true;
    });
  }, [cuentas, filtroEstado, filtroProveedor, busquedaFolio]);

  const totalPorPagar = cuentas.filter((c) => c.estado_pago !== "Pagada").reduce((a, c) => a + Number(c.saldo), 0);
  const facturasPendientes = cuentas.filter((c) => c.estado_pago !== "Pagada").length;
  const proveedorMayorDeuda = useMemo(() => {
    const deudaPorProveedor = {};
    cuentas.forEach((c) => {
      if (c.estado_pago === "Pagada") return;
      deudaPorProveedor[c.proveedor_nombre] = (deudaPorProveedor[c.proveedor_nombre] || 0) + Number(c.saldo);
    });
    const entradas = Object.entries(deudaPorProveedor).sort((a, b) => b[1] - a[1]);
    return entradas.length ? entradas[0] : null;
  }, [cuentas]);

  function abrirAbono(cuenta) {
    setModalAbono(cuenta);
    setFormAbono({
      monto: "",
      metodo_pago: "Efectivo",
      fecha: ahoraBogotaDatetimeLocal(),
      concepto: `Abono factura ${cuenta.folio || cuenta.compra_id.slice(0, 8)}`,
    });
  }

  async function guardarAbono(e) {
    e.preventDefault();
    const monto = Number(formAbono.monto);
    if (!monto || monto <= 0) {
      setError("Ingresa un monto válido.");
      return;
    }
    if (monto > Number(modalAbono.saldo)) {
      const continuar = window.confirm(
        `El abono (${formatoCOP(monto)}) es mayor al saldo pendiente (${formatoCOP(modalAbono.saldo)}). ¿Continuar de todas formas?`
      );
      if (!continuar) return;
    }
    const { error: errInsert } = await supabase.from("egresos").insert({
      compra_id: modalAbono.compra_id,
      tipo_registro: "abono_cxp",
      concepto: formAbono.concepto,
      metodo_pago: formAbono.metodo_pago,
      monto,
      valor_total: monto,
      fecha: formAbono.fecha,
    });
    if (errInsert) {
      setError(errInsert.message);
      return;
    }
    setModalAbono(null);
    cargarCuentas();
  }

  function pedirEliminarAbono(egreso) {
    setConfirmEliminarAbono(egreso);
    setPasswordInput("");
    setErrorPassword("");
  }

  function confirmarPassword() {
    if (passwordInput !== PASSWORD_CONFIRMACION) {
      setErrorPassword("Contraseña incorrecta.");
      return;
    }
    eliminarAbono();
  }

  async function eliminarAbono() {
    const egreso = confirmEliminarAbono;
    const { error: errDelete } = await supabase.from("egresos").delete().eq("id", egreso.id);
    if (errDelete) {
      setError(errDelete.message);
    } else {
      cargarCuentas();
      if (egreso.compra_id) cargarHistorial(egreso.compra_id);
    }
    setConfirmEliminarAbono(null);
  }

  return (
    <div>
      {onVolver && (
        <button
          onClick={onVolver}
          style={{ background: "#F4F1ED", border: "1px solid #DDD8CF", borderRadius: 7, padding: "7px 14px", fontSize: 12, cursor: "pointer", marginBottom: 18 }}
        >
          ← Volver
        </button>
      )}

      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>📤 Cuentas por Pagar</div>
      <p style={{ color: "#9A8E85", fontSize: 12, margin: "0 0 18px" }}>Compras a crédito pendientes de pago a proveedores</p>

      {error && (
        <div style={{ background: "#fdecea", color: COLOR_ROJO, padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        <TarjetaResumen titulo="Total por pagar" valor={formatoCOP(totalPorPagar)} color={COLOR_ROJO} />
        <TarjetaResumen titulo="Facturas pendientes" valor={facturasPendientes} color="#b8860b" />
        <TarjetaResumen
          titulo="Mayor deuda"
          valor={proveedorMayorDeuda ? `${proveedorMayorDeuda[0]} — ${formatoCOP(proveedorMayorDeuda[1])}` : "—"}
          color="#333"
          pequeno
        />
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={inputStyle}>
          {["Todas", "Pendiente", "Parcial", "Pagada"].map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <select value={filtroProveedor} onChange={(e) => setFiltroProveedor(e.target.value)} style={inputStyle}>
          <option value="">Todos los proveedores</option>
          {proveedores.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Buscar por folio..."
          value={busquedaFolio}
          onChange={(e) => setBusquedaFolio(e.target.value)}
          style={inputStyle}
        />
      </div>

      {cargando ? (
        <p>Cargando cuentas por pagar...</p>
      ) : cuentasFiltradas.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#9A8E85", background: "#fff", borderRadius: 9, border: "1px solid #DDD8CF" }}>
          No hay cuentas por pagar con estos filtros.
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #DDD8CF", borderRadius: 9, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: COLOR_FONDO, textAlign: "left" }}>
                <th style={thStyle}>Proveedor</th>
                <th style={thStyle}>Folio</th>
                <th style={thStyle}>Fecha compra</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Pagado</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Saldo</th>
                <th style={thStyle}>Estado</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {cuentasFiltradas.map((c) => (
                <tr key={c.compra_id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={tdStyle}>{c.proveedor_nombre}</td>
                  <td style={tdStyle}>{c.folio}</td>
                  <td style={tdStyle}>{c.fecha_compra}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{formatoCOP(c.total)}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{formatoCOP(c.total_pagado)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{formatoCOP(c.saldo)}</td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        color: colorEstado[c.estado_pago] || "#555",
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      {c.estado_pago}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    {c.estado_pago !== "Pagada" && (
                      <button style={btnMini} onClick={() => abrirAbono(c)}>
                        Abonar
                      </button>
                    )}
                    <button
                      style={btnMini}
                      onClick={() => {
                        setModalHistorial(c);
                        cargarHistorial(c.compra_id);
                      }}
                    >
                      Historial
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: registrar abono */}
      {modalAbono && (
        <ModalFondo onClose={() => setModalAbono(null)}>
          <form onSubmit={guardarAbono} style={modalStyle}>
            <h2 style={{ color: COLOR_ROJO, marginTop: 0 }}>Registrar abono</h2>
            <p style={{ color: "#555", fontSize: 14 }}>
              {modalAbono.proveedor_nombre} — Folio {modalAbono.folio}
              <br />
              Saldo pendiente: <strong>{formatoCOP(modalAbono.saldo)}</strong>
            </p>

            <CampoForm label="Monto del abono">
              <input
                type="number"
                required
                min="1"
                step="1"
                autoFocus
                value={formAbono.monto}
                onChange={(e) => setFormAbono((f) => ({ ...f, monto: e.target.value }))}
                style={inputStyle}
              />
            </CampoForm>

            <CampoForm label="Fecha y hora">
              <input
                type="datetime-local"
                required
                value={formAbono.fecha}
                onChange={(e) => setFormAbono((f) => ({ ...f, fecha: e.target.value }))}
                style={inputStyle}
              />
            </CampoForm>

            <CampoForm label="Método de pago">
              <select
                value={formAbono.metodo_pago}
                onChange={(e) => setFormAbono((f) => ({ ...f, metodo_pago: e.target.value }))}
                style={inputStyle}
              >
                {METODOS_PAGO.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </CampoForm>

            <CampoForm label="Concepto">
              <input
                type="text"
                value={formAbono.concepto}
                onChange={(e) => setFormAbono((f) => ({ ...f, concepto: e.target.value }))}
                style={inputStyle}
              />
            </CampoForm>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button type="button" style={btnSecundario} onClick={() => setModalAbono(null)}>
                Cancelar
              </button>
              <button type="submit" style={btnRojo}>
                Guardar abono
              </button>
            </div>
          </form>
        </ModalFondo>
      )}

      {/* Modal: historial de abonos */}
      {modalHistorial && (
        <ModalFondo onClose={() => setModalHistorial(null)}>
          <div style={modalStyle}>
            <h2 style={{ color: COLOR_ROJO, marginTop: 0 }}>
              Historial — {modalHistorial.proveedor_nombre} (Folio {modalHistorial.folio})
            </h2>
            {(abonos[modalHistorial.compra_id] || []).length === 0 ? (
              <p style={{ color: "#777" }}>Sin abonos registrados todavía.</p>
            ) : (
              (abonos[modalHistorial.compra_id] || []).map((g) => (
                <div
                  key={g.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 0",
                    borderBottom: "1px solid #f0f0f0",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{formatoCOP(g.monto)}</div>
                    <div style={{ fontSize: 12, color: "#777" }}>
                      {formatoFechaHora(g.fecha)} · {g.metodo_pago} · {g.concepto}
                    </div>
                  </div>
                  <button style={{ ...btnMini, color: COLOR_ROJO }} onClick={() => pedirEliminarAbono(g)}>
                    Eliminar
                  </button>
                </div>
              ))
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button style={btnSecundario} onClick={() => setModalHistorial(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </ModalFondo>
      )}

      {/* Confirmación con contraseña para eliminar abono */}
      {confirmEliminarAbono && (
        <ModalFondo onClose={() => setConfirmEliminarAbono(null)}>
          <div style={modalStyle}>
            <h2 style={{ color: COLOR_ROJO, marginTop: 0 }}>Eliminar abono</h2>
            <p>Esta acción no se puede deshacer. Ingresa la contraseña para confirmar:</p>
            <input
              type="password"
              autoFocus
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              style={inputStyle}
              onKeyDown={(e) => e.key === "Enter" && confirmarPassword()}
            />
            {errorPassword && <p style={{ color: COLOR_ROJO, fontSize: 14 }}>{errorPassword}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button style={btnSecundario} onClick={() => setConfirmEliminarAbono(null)}>
                Cancelar
              </button>
              <button style={btnRojo} onClick={confirmarPassword}>
                Confirmar
              </button>
            </div>
          </div>
        </ModalFondo>
      )}
    </div>
  );
}

// ------------------------------------------------------------------
function TarjetaResumen({ titulo, valor, color, pequeno }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #DDD8CF", borderRadius: 9, padding: "18px 20px" }}>
      <p style={{ margin: 0, color: "#9A8E85", fontSize: 11 }}>{titulo}</p>
      <p style={{ margin: "6px 0 0", color, fontSize: pequeno ? 15 : 22, fontWeight: 700 }}>{valor}</p>
    </div>
  );
}

function ModalFondo({ children, onClose }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {children}
    </div>
  );
}

function CampoForm({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 13, color: "#555", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------
const btnRojo = {
  background: COLOR_ROJO,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 16px",
  cursor: "pointer",
  fontWeight: 600,
};

const btnSecundario = {
  background: "#fff",
  color: "#333",
  border: "1px solid #ccc",
  borderRadius: 8,
  padding: "10px 16px",
  cursor: "pointer",
  fontWeight: 600,
};

const btnMini = {
  background: "transparent",
  border: "none",
  color: "#555",
  cursor: "pointer",
  fontSize: 13,
  marginRight: 10,
  textDecoration: "underline",
};

const inputStyle = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #ccc",
  fontSize: 14,
  boxSizing: "border-box",
};

const thStyle = { padding: "9px 16px", fontSize: 10, color: "#9A8E85", fontWeight: 500 };
const tdStyle = { padding: "10px 16px", fontSize: 13 };

const modalStyle = {
  background: COLOR_FONDO,
  borderRadius: 14,
  padding: 24,
  width: 440,
  maxWidth: "90vw",
  maxHeight: "85vh",
  overflowY: "auto",
};
