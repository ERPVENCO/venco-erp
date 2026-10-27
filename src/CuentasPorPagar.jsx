import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

// ------------------------------------------------------------------
// Ahumados M&Y — Cuentas por Pagar
// Lee de la vista `vista_cuentas_por_pagar` (compras a crédito con saldo en vivo)
// Los abonos se registran como filas en `egresos` con compra_id.
//
// NUEVO:
//  - Botón "＋ Saldo anterior": registra deudas con proveedores que ya existían antes del sistema.
//    Crea una compra a crédito sin productos (folio ANT-0001...). No mueve inventario ni egresos.
//  - Los abonos ahora piden la cuenta de donde salió la plata y la guardan en las columnas que
//    ya usa Egresos (monto_efectivo / monto_transferencia_1 / tipo_cuenta_1), para que los saldos
//    por cuenta cuadren. El método de pago se guarda en minúscula, como en el resto del sistema.
// ------------------------------------------------------------------

const COLOR_ROJO = "#B22222";
const COLOR_FONDO = "#F4F1ED";
const PASSWORD_CONFIRMACION = "1234";
const METODOS_PAGO = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "cheque", label: "Cheque" },
];
// Mismas cuentas que Finanzas.jsx
const CUENTAS = { "1": "Bancolombia Yohe", "2": "Bancolombia Manu", "3": "Nequi Yohe" };

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

const esSaldoAnterior = (folio) => String(folio || "").startsWith("ANT-");

// NUEVO: registra en la tabla auditoria, igual que Ventas y Compras. Si falla, no interrumpe la operación.
const auditar = async (accion, tabla, descripcion, datosAnteriores = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("auditoria").insert([{
      tabla, accion, descripcion, datos_anteriores: datosAnteriores,
      usuario_email: user?.email || "desconocido", fecha: new Date().toISOString(),
    }]);
  } catch (e) {
    console.error("Auditoría:", e);
  }
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
  const [formAbono, setFormAbono] = useState({ monto: "", metodo_pago: "efectivo", cuenta: "", fecha: hoyBogota(), concepto: "" });

  const [modalHistorial, setModalHistorial] = useState(null); // cuenta seleccionada

  const [confirmEliminarAbono, setConfirmEliminarAbono] = useState(null); // egreso a eliminar
  const [passwordInput, setPasswordInput] = useState("");
  const [errorPassword, setErrorPassword] = useState("");

  // NUEVO: saldo anterior
  const [proveedoresLista, setProveedoresLista] = useState([]);
  const [modalSaldo, setModalSaldo] = useState(false);
  const [guardandoSaldo, setGuardandoSaldo] = useState(false);
  const saldoVacio = { proveedor_id: "", referencia: "", monto: "", fecha: hoyBogota() };
  const [formSaldo, setFormSaldo] = useState(saldoVacio);

  useEffect(() => {
    cargarCuentas();
    cargarProveedoresLista();
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

  async function cargarProveedoresLista() {
    const { data } = await supabase.from("proveedores").select("id, empresa").eq("activo", true).order("empresa");
    setProveedoresLista(data || []);
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
      metodo_pago: "efectivo",
      cuenta: "",
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
    // NUEVO: si no es efectivo, hay que decir de qué cuenta salió la plata
    if (formAbono.metodo_pago !== "efectivo" && !formAbono.cuenta) {
      setError("Elige de qué cuenta salió el pago.");
      return;
    }
    if (monto > Number(modalAbono.saldo)) {
      const continuar = window.confirm(
        `El abono (${formatoCOP(monto)}) es mayor al saldo pendiente (${formatoCOP(modalAbono.saldo)}). ¿Continuar de todas formas?`
      );
      if (!continuar) return;
    }
    setError("");
    const esEfectivo = formAbono.metodo_pago === "efectivo";
    const { error: errInsert } = await supabase.from("egresos").insert({
      compra_id: modalAbono.compra_id,
      tipo_registro: "abono_cxp",
      concepto: formAbono.concepto,
      metodo_pago: formAbono.metodo_pago,
      monto,
      valor_total: monto,
      monto_efectivo: esEfectivo ? monto : 0,
      monto_transferencia_1: esEfectivo ? 0 : monto,
      tipo_cuenta_1: esEfectivo ? null : formAbono.cuenta,
      tipo_cuenta: esEfectivo ? null : formAbono.cuenta,
      fecha: formAbono.fecha,
    });
    if (errInsert) {
      setError(errInsert.message);
      return;
    }
    setModalAbono(null);
    cargarCuentas();
  }

  // NUEVO: registrar una deuda con un proveedor anterior al sistema
  async function guardarSaldoAnterior(e) {
    e.preventDefault();
    const monto = Number(formSaldo.monto);
    if (!formSaldo.proveedor_id) {
      setError("Elige el proveedor.");
      return;
    }
    if (!monto || monto <= 0) {
      setError("Ingresa un valor pendiente válido.");
      return;
    }
    setError("");
    setGuardandoSaldo(true);
    try {
      const proveedor = proveedoresLista.find((p) => p.id === formSaldo.proveedor_id);

      // Siguiente folio ANT-0001, ANT-0002... (queda antes de COM- en el orden alfabético,
      // así no interfiere con el folio de las compras nuevas)
      const { data: ultimo } = await supabase
        .from("compras")
        .select("folio")
        .like("folio", "ANT-%")
        .order("folio", { ascending: false })
        .limit(1);
      const numero = ultimo && ultimo.length ? (parseInt(ultimo[0].folio.replace("ANT-", ""), 10) || 0) + 1 : 1;
      const folio = `ANT-${String(numero).padStart(4, "0")}`;

      const { data: { user } } = await supabase.auth.getUser();

      const { error: errCompra } = await supabase.from("compras").insert({
        folio,
        proveedor_id: formSaldo.proveedor_id,
        proveedor_nombre: proveedor?.empresa || "",
        factura_proveedor: formSaldo.referencia || null,
        fecha_compra: formSaldo.fecha,
        estado: "credito",
        metodo_pago: null,
        subtotal: monto,
        descuento: 0,
        total: monto,
        observaciones: "Saldo anterior",
        usuario_email: user?.email || null,
      });
      if (errCompra) throw new Error(errCompra.message);

      // Igual que hace Compras al crear una compra a crédito: suma al saldo del proveedor
      const { data: provActual } = await supabase.from("proveedores").select("saldo_pendiente").eq("id", formSaldo.proveedor_id).single();
      const { error: errProv } = await supabase
        .from("proveedores")
        .update({ saldo_pendiente: (Number(provActual?.saldo_pendiente) || 0) + monto })
        .eq("id", formSaldo.proveedor_id);
      if (errProv) {
        setError(`La deuda ${folio} se guardó, pero no se pudo actualizar el saldo del proveedor: ${errProv.message}`);
      }

      await auditar("SALDO ANTERIOR", "compras", `${folio} — ${proveedor?.empresa} — ${formatoCOP(monto)}${formSaldo.referencia ? " — " + formSaldo.referencia : ""}`);

      setModalSaldo(false);
      setFormSaldo(saldoVacio);
      cargarCuentas();
    } catch (err) {
      setError(err.message);
    }
    setGuardandoSaldo(false);
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
      await auditar("ELIMINACIÓN", "egresos", `Abono ${formatoCOP(egreso.monto)} — ${egreso.concepto || ""}`, egreso);
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>📤 Cuentas por Pagar</div>
          <p style={{ color: "#9A8E85", fontSize: 12, margin: 0 }}>Compras a crédito pendientes de pago a proveedores</p>
        </div>
        <button
          onClick={() => { setFormSaldo({ ...saldoVacio, fecha: hoyBogota() }); setModalSaldo(true); }}
          style={{ background: "#1A5FA8", color: "#fff", border: "none", borderRadius: 7, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          ＋ Saldo anterior
        </button>
      </div>

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
                  <td style={tdStyle}>
                    {c.folio}
                    {esSaldoAnterior(c.folio) && (
                      <span style={{ marginLeft: 6, background: "#E8F0FB", color: "#1A5FA8", padding: "1px 6px", borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                        Anterior
                      </span>
                    )}
                  </td>
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

      {/* NUEVO — Modal: registrar saldo anterior */}
      {modalSaldo && (
        <ModalFondo onClose={() => setModalSaldo(false)}>
          <form onSubmit={guardarSaldoAnterior} style={modalStyle}>
            <h2 style={{ color: COLOR_ROJO, marginTop: 0 }}>Registrar saldo anterior</h2>
            <p style={{ color: "#555", fontSize: 13, marginTop: 0 }}>
              Para lo que le debías a un proveedor antes de usar el sistema. Solo crea la cuenta por pagar para que puedas abonarla: no mueve inventario ni egresos.
            </p>

            <CampoForm label="Proveedor">
              <select
                required
                value={formSaldo.proveedor_id}
                onChange={(e) => setFormSaldo((f) => ({ ...f, proveedor_id: e.target.value }))}
                style={{ ...inputStyle, width: "100%" }}
              >
                <option value="">Selecciona un proveedor...</option>
                {proveedoresLista.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.empresa}
                  </option>
                ))}
              </select>
            </CampoForm>

            <CampoForm label="Factura del proveedor (opcional)">
              <input
                type="text"
                value={formSaldo.referencia}
                onChange={(e) => setFormSaldo((f) => ({ ...f, referencia: e.target.value }))}
                placeholder="Ej. N° de factura vieja"
                style={{ ...inputStyle, width: "100%" }}
              />
            </CampoForm>

            <CampoForm label="Valor pendiente hoy">
              <input
                type="number"
                required
                min="1"
                step="1"
                value={formSaldo.monto}
                onChange={(e) => setFormSaldo((f) => ({ ...f, monto: e.target.value }))}
                style={{ ...inputStyle, width: "100%" }}
              />
            </CampoForm>

            <CampoForm label="Fecha de la deuda">
              <input
                type="date"
                required
                value={formSaldo.fecha}
                onChange={(e) => setFormSaldo((f) => ({ ...f, fecha: e.target.value }))}
                style={{ ...inputStyle, width: "100%" }}
              />
            </CampoForm>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button type="button" style={btnSecundario} onClick={() => setModalSaldo(false)}>
                Cancelar
              </button>
              <button type="submit" style={btnRojo} disabled={guardandoSaldo}>
                {guardandoSaldo ? "Guardando..." : "Guardar saldo anterior"}
              </button>
            </div>
          </form>
        </ModalFondo>
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
                onChange={(e) => setFormAbono((f) => ({ ...f, metodo_pago: e.target.value, cuenta: "" }))}
                style={inputStyle}
              >
                {METODOS_PAGO.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </CampoForm>

            {formAbono.metodo_pago !== "efectivo" && (
              <CampoForm label="Salió de la cuenta">
                <select
                  value={formAbono.cuenta}
                  onChange={(e) => setFormAbono((f) => ({ ...f, cuenta: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">Selecciona...</option>
                  {Object.entries(CUENTAS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {k} — {v}
                    </option>
                  ))}
                </select>
              </CampoForm>
            )}

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
                      {formatoFechaHora(g.fecha)} · {g.metodo_pago}
                      {g.tipo_cuenta_1 ? ` · ${CUENTAS[g.tipo_cuenta_1] || g.tipo_cuenta_1}` : ""} · {g.concepto}
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