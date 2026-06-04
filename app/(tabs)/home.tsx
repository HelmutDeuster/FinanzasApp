// app/(tabs)/home.tsx
// Pantalla principal con toggle Tarjeta / Cuenta.
//
// Layout:
//   EncabezadoHome — "Junio 2026 · Tu balance financiero" + [Sincronizar]
//   ToggleModo     — persiste en user_settings.home_mode
//   ModoTarjeta:
//     Bloque 1 — Balance mensual (Ingresos = Ahorro + Egresos)
//     Bloque 2 — Ciclo tarjetas (hero + cards sin barras, ordenadas por cierre)
//   ModoCuenta — balance mensual, donut, transacciones
//
// El botón Sincronizar vive en el header y refresca el modo activo.
// Tema: modo oscuro — paleta del doc UX/UI.

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { router } from 'expo-router';
import { useTransactions } from '../../hooks/useTransactions';
import type { GastoPorCategoria, TransaccionConCategoria } from '../../hooks/useTransactions';
import { useUserSettings } from '../../hooks/useUserSettings';
import { useModoTarjeta } from '../../hooks/useModoTarjeta';
import { useBalanceMensual } from '../../hooks/useBalanceMensual';
import type { DatosBalanceMensual } from '../../hooks/useBalanceMensual';
import SyncButton from '../../components/SyncButton';
import type { CreditCard } from '../../types';
import { getCycleRange, diasRestantes } from '../../lib/cycleUtils';

// ─── Utilidades de formato ────────────────────────────────────────────────────

function formatearMonto(n: number): string {
  return `$ ${Math.abs(n).toLocaleString('es-CL')}`;
}

function formatearFecha(iso: string): string {
  const [año, mes, dia] = iso.split('-');
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(dia, 10)} ${meses[parseInt(mes, 10) - 1]} ${año}`;
}

function formatearFechaCiclo(d: Date): string {
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d.getDate()} ${meses[d.getMonth()]}`;
}

// Calcula la fecha de vencimiento del pago dado el cierre del ciclo.
// Si dueDay > closeDay → mismo mes que el cierre.
// Si dueDay <= closeDay → mes siguiente al cierre.
// Mastercard (cierra 5, vence 20): 20 > 5 → "vence 20 jun"
// Visa       (cierra 23, vence 6): 6 <= 23 → "vence 6 jul"
function getDueDate(cycleEnd: Date, dueDay: number): Date {
  if (dueDay > cycleEnd.getDate()) {
    return new Date(cycleEnd.getFullYear(), cycleEnd.getMonth(), dueDay);
  }
  return new Date(cycleEnd.getFullYear(), cycleEnd.getMonth() + 1, dueDay);
}

const MESES_LARGO = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

function labelMes(año: number, mes: number): string {
  return `${MESES_LARGO[mes]} ${año}`;
}

// ─── Header ───────────────────────────────────────────────────────────────────
// Muestra el mes actual, el subtítulo y el botón Sincronizar discreto.
// El botón usa la función de refresh del modo activo, registrada desde HomeScreen.

function EncabezadoHome({ onSincronizar }: { onSincronizar: () => void }) {
  const hoy = new Date();
  return (
    <View style={estilos.headerFila}>
      <View>
        <Text style={estilos.headerMes}>
          {MESES_LARGO[hoy.getMonth()]} {hoy.getFullYear()}
        </Text>
        <Text style={estilos.headerSubtitulo}>Tu balance financiero</Text>
      </View>
      <SyncButton onSincronizado={onSincronizar} />
    </View>
  );
}

// ─── Toggle Tarjeta / Cuenta ──────────────────────────────────────────────────

function ToggleModo({
  modo,
  onChange,
}: {
  modo: 'credit_card' | 'checking';
  onChange: (m: 'credit_card' | 'checking') => void;
}) {
  return (
    <View style={estilos.toggleContenedor}>
      <TouchableOpacity
        style={[estilos.toggleOpcion, modo === 'credit_card' && estilos.toggleActivo]}
        onPress={() => onChange('credit_card')}
        activeOpacity={0.8}
      >
        <Text style={[estilos.toggleTexto, modo === 'credit_card' && estilos.toggleTextoActivo]}>
          Tarjeta
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[estilos.toggleOpcion, modo === 'checking' && estilos.toggleActivo]}
        onPress={() => onChange('checking')}
        activeOpacity={0.8}
      >
        <Text style={[estilos.toggleTexto, modo === 'checking' && estilos.toggleTextoActivo]}>
          Cuenta
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Bloque 1 — Balance mensual ───────────────────────────────────────────────

function ColBalance({
  label,
  colorLabel,
  amount,
  desglose,
}: {
  label: string;
  colorLabel: string;
  amount: number;
  desglose: string;
}) {
  const colorMonto = amount < 0 ? '#E24B4A' : colorLabel;
  return (
    <View style={estilos.colBalance}>
      <Text style={[estilos.colBalanceLabel, { color: colorLabel }]}>{label}</Text>
      <Text style={[estilos.colBalanceMonto, { color: colorMonto }]}>
        {formatearMonto(amount)}
      </Text>
      <Text style={estilos.colBalanceDesglose}>{desglose}</Text>
    </View>
  );
}

function AlertBalance({ ahorro }: { ahorro: number }) {
  if (ahorro >= 0) {
    const mensaje = ahorro === 0
      ? '✓ El balance cierra exacto este mes'
      : `✓ Tienes ${formatearMonto(ahorro)} para ahorrar este mes`;
    return (
      <View style={[estilos.alertContenedor, { backgroundColor: '#162210', borderColor: '#639922', marginBottom: 0 }]}>
        <Text style={[estilos.alertTexto, { color: '#639922' }]}>{mensaje}</Text>
      </View>
    );
  }
  return (
    <View style={[estilos.alertContenedor, { backgroundColor: '#2D1515', borderColor: '#E24B4A', marginBottom: 0 }]}>
      <Text style={[estilos.alertTexto, { color: '#E24B4A' }]}>
        ⚠ Faltan {formatearMonto(Math.abs(ahorro))} para cerrar el mes
      </Text>
    </View>
  );
}

function BloqueBalance({
  datos,
  loading,
}: {
  datos: DatosBalanceMensual | null;
  loading: boolean;
}) {
  const hoy = new Date();
  const labelMesActual = `${MESES_LARGO[hoy.getMonth()]} ${hoy.getFullYear()}`;

  if (loading) {
    return (
      <View style={estilos.tarjeta}>
        <Text style={estilos.balanceMesLabel}>{labelMesActual}</Text>
        <View style={estilos.centradoContenido}>
          <ActivityIndicator color="#378ADD" />
        </View>
      </View>
    );
  }

  const { ingresos, egresos, egresosTc, egresosCC, ahorro } = datos ?? {
    ingresos: 0, egresos: 0, egresosTc: 0, egresosCC: 0, ahorro: 0,
  };

  const desgloseEgresos = egresosTc > 0 && egresosCC > 0
    ? 'TCs · CC directo'
    : egresosTc > 0 ? 'Tarjetas crédito' : 'CC directo';

  return (
    <View style={estilos.tarjeta}>
      <Text style={estilos.balanceMesLabel}>{labelMesActual}</Text>
      <Text style={estilos.balanceHero}>{formatearMonto(ingresos)}</Text>
      <Text style={estilos.balanceSubtitulo}>ingresos del mes</Text>

      <View style={estilos.ecuacionFila}>
        <ColBalance label="Ingresos" colorLabel="#639922" amount={ingresos} desglose="Sueldo · Transfers" />
        <Text style={estilos.ecuacionSep}>=</Text>
        <ColBalance label="Ahorro" colorLabel="#378ADD" amount={ahorro} desglose="Fintual · Saldo CC" />
        <Text style={estilos.ecuacionSep}>+</Text>
        <ColBalance label="Egresos" colorLabel="#E24B4A" amount={egresos} desglose={desgloseEgresos} />
      </View>

      <View style={estilos.divisorBalance} />
      <AlertBalance ahorro={ahorro} />
    </View>
  );
}

// ─── Bloque 2 — Card de tarjeta de crédito ────────────────────────────────────
// Sin barras — solo números. Layout de dos columnas.
// isDesktop → flex: 1 para distribuir el ancho equitativamente en paralelo.

function CardCreditCard({
  card,
  spendNeto,
  isDesktop,
}: {
  card: CreditCard;
  spendNeto: number;
  isDesktop: boolean;
}) {
  const { end: cycleEnd } = getCycleRange(card.cycle_close_day);
  const dueDate = getDueDate(cycleEnd, card.cycle_due_day);
  const label = card.last_four ? `${card.name} ****${card.last_four}` : card.name;

  const dias = diasRestantes(cycleEnd);
  const colorDias = dias <= 3 ? '#E24B4A' : '#4A4D5A';
  const labelDias = dias === 0 ? 'hoy cierra' : dias === 1 ? '1 día' : `${dias} días`;

  const cardStyle = isDesktop
    ? [estilos.cardTarjeta, estilos.cardTarjetaDesktop]
    : estilos.cardTarjeta;

  return (
    <View style={cardStyle}>
      <View style={estilos.cardTarjetaFila}>
        <View style={estilos.cardTarjetaIzq}>
          <Text style={estilos.cardTarjetaNombre}>{label}</Text>
          <Text style={estilos.cardTarjetaCicloFechas} numberOfLines={1}>
            cierre {formatearFechaCiclo(cycleEnd)} · vence {formatearFechaCiclo(dueDate)}
          </Text>
        </View>
        <View style={estilos.cardTarjetaDer}>
          <Text style={estilos.cardTarjetaMonto}>{formatearMonto(spendNeto)}</Text>
          <Text style={[estilos.cardTarjetaDias, { color: colorDias }]}>
            {labelDias}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Modo Tarjeta ─────────────────────────────────────────────────────────────

function ModoTarjeta({
  defaultCloseDay,
  onSetRefrescar,
}: {
  defaultCloseDay: number;
  onSetRefrescar: (fn: () => void) => void;
}) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const { datos: dadosBalance, loading: loadingBalance, refrescar: refrescarBalance } =
    useBalanceMensual();
  const { datos: dadosTC, loading: loadingTC, refrescar: refrescarTC } =
    useModoTarjeta(defaultCloseDay);

  // Registrar función de refresh en el header al montar y cuando cambian los deps
  const refrescarTodo = useCallback(() => {
    refrescarBalance();
    refrescarTC();
  }, [refrescarBalance, refrescarTC]);

  useEffect(() => {
    onSetRefrescar(refrescarTodo);
  }, [onSetRefrescar, refrescarTodo]);

  const totalNeto = dadosTC?.totalNeto ?? 0;
  const cicloRef = dadosTC?.cicloRef;
  const cards = dadosTC?.cards ?? [];
  const transacciones = dadosTC?.transacciones ?? [];

  const cardsSorted = [...cards].sort((a, b) => {
    const { end: endA } = getCycleRange(a.cycle_close_day);
    const { end: endB } = getCycleRange(b.cycle_close_day);
    return endA.getTime() - endB.getTime();
  });

  return (
    <>
      {/* ── Bloque 1: Balance mensual ──────────────────────────────── */}
      <BloqueBalance datos={dadosBalance} loading={loadingBalance} />

      {/* ── Bloque 2: Ciclo tarjetas ───────────────────────────────── */}
      <View style={estilos.tarjeta}>
        {loadingTC ? (
          <View style={estilos.centradoContenido}>
            <ActivityIndicator color="#378ADD" />
          </View>
        ) : (
          <>
            {cicloRef && (
              <>
                <Text style={estilos.bloque2ProxVenc}>
                  próximo vencimiento {formatearFechaCiclo(cicloRef.end)}
                </Text>
                <Text style={estilos.bloque2Hero}>{formatearMonto(totalNeto)}</Text>
                <Text style={estilos.bloque2Subtitulo}>
                  total a pagar en el próximo cierre
                </Text>
                <View style={estilos.divisorBalance} />
              </>
            )}

            {cardsSorted.length === 0 ? (
              <View style={estilos.estadoVacioContenedor}>
                <Text style={estilos.textoVacio}>No tienes tarjetas configuradas.</Text>
                <Text style={estilos.textoVacioSub}>
                  Agrega tus tarjetas en Ajustes.
                </Text>
              </View>
            ) : (
              <View style={isDesktop ? estilos.cardsContenedorDesktop : estilos.cardsContenedorMobile}>
                {cardsSorted.map(card => {
                  const spend = dadosTC?.spendPorTarjeta.find(s => s.cardId === card.id);
                  return (
                    <Pressable
                      key={card.id}
                      onPress={() => router.push(`/tarjeta/${card.id}`)}
                      style={isDesktop ? { flex: 1 } : undefined}
                    >
                      <CardCreditCard
                        card={card}
                        spendNeto={spend?.neto ?? 0}
                        isDesktop={isDesktop}
                      />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}
      </View>

      {/* ── Transacciones del ciclo ───────────────────────────────── */}
      <View style={estilos.tarjeta}>
        <Text style={estilos.tituloSeccion}>Transacciones del ciclo</Text>
        {loadingTC ? (
          <View style={estilos.centradoContenido}>
            <ActivityIndicator color="#378ADD" />
          </View>
        ) : transacciones.length === 0 ? (
          <View style={estilos.estadoVacioContenedor}>
            <Text style={estilos.textoVacio}>Sin transacciones TC en este ciclo.</Text>
            <Text style={estilos.textoVacioSub}>
              Sincroniza de nuevo para ver los movimientos aquí.
            </Text>
          </View>
        ) : (
          transacciones.slice(0, 10).map(tx => (
            <FilaTransaccion key={tx.id} tx={tx} />
          ))
        )}
      </View>
    </>
  );
}

// ─── Modo Cuenta ──────────────────────────────────────────────────────────────

function ModoCuenta({
  periodo,
  irAnterior,
  irSiguiente,
  puedeIrSiguiente,
  onSetRefrescar,
}: {
  periodo: { año: number; mes: number };
  irAnterior: () => void;
  irSiguiente: () => void;
  puedeIrSiguiente: boolean;
  onSetRefrescar: (fn: () => void) => void;
}) {
  const { loading, error, datos, refrescar } = useTransactions(periodo.año, periodo.mes);

  // Registrar la función de refresh para que el header pueda llamarla
  useEffect(() => {
    onSetRefrescar(refrescar);
  }, [onSetRefrescar, refrescar]);

  if (loading) {
    return (
      <View style={estilos.centradoContenido}>
        <ActivityIndicator color="#378ADD" />
        <Text style={estilos.textoVacio}>Cargando...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={estilos.centradoContenido}>
        <Text style={estilos.textoError}>{error}</Text>
        <TouchableOpacity style={estilos.botonReintentar} onPress={refrescar}>
          <Text style={estilos.botonTexto}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { totalIngresos, totalGastos, balance, ultimasTransacciones, gastosPorCategoria } = datos!;

  return (
    <>
      <TarjetaBalance
        balance={balance}
        totalIngresos={totalIngresos}
        totalGastos={totalGastos}
        etiquetaMes={labelMes(periodo.año, periodo.mes)}
        enAnterior={irAnterior}
        enSiguiente={irSiguiente}
        puedeIrSiguiente={puedeIrSiguiente}
      />
      <GraficoGastos datos={gastosPorCategoria} />
      <View style={estilos.tarjeta}>
        <Text style={estilos.tituloSeccion}>Últimas transacciones</Text>
        {ultimasTransacciones.length === 0 ? (
          <Text style={estilos.textoVacio}>Sin transacciones este mes</Text>
        ) : (
          ultimasTransacciones.map(tx => (
            <FilaTransaccion key={tx.id} tx={tx} />
          ))
        )}
      </View>
    </>
  );
}

// ─── TarjetaBalance ───────────────────────────────────────────────────────────

function TarjetaBalance({
  balance, totalIngresos, totalGastos,
  etiquetaMes, enAnterior, enSiguiente, puedeIrSiguiente,
}: {
  balance: number;
  totalIngresos: number;
  totalGastos: number;
  etiquetaMes: string;
  enAnterior: () => void;
  enSiguiente: () => void;
  puedeIrSiguiente: boolean;
}) {
  const colorBalance = balance >= 0 ? '#639922' : '#E24B4A';
  const signo = balance >= 0 ? '+' : '-';

  return (
    <View style={estilos.tarjetaBalance}>
      <View style={estilos.selectorMes}>
        <TouchableOpacity onPress={enAnterior} hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}>
          <Text style={estilos.flecha}>←</Text>
        </TouchableOpacity>
        <Text style={estilos.labelMes}>{etiquetaMes}</Text>
        <TouchableOpacity
          onPress={enSiguiente}
          disabled={!puedeIrSiguiente}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
        >
          <Text style={[estilos.flecha, !puedeIrSiguiente && estilos.flechaDeshabilitada]}>→</Text>
        </TouchableOpacity>
      </View>
      <Text style={[estilos.balanceTexto, { color: colorBalance }]}>
        {signo} {formatearMonto(balance)}
      </Text>
      <View style={estilos.filaResumen}>
        <View style={estilos.bloqueResumen}>
          <Text style={estilos.labelResumen}>Ingresos</Text>
          <Text style={estilos.valorIngreso}>{formatearMonto(totalIngresos)}</Text>
        </View>
        <View style={estilos.divisor} />
        <View style={estilos.bloqueResumen}>
          <Text style={estilos.labelResumen}>Gastos</Text>
          <Text style={estilos.valorGasto}>{formatearMonto(totalGastos)}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Donut chart ──────────────────────────────────────────────────────────────

function calcularArco(cx: number, cy: number, outerR: number, innerR: number, startDeg: number, endDeg: number): string {
  const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
  const s = toRad(startDeg); const e = toRad(endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const x1 = cx + outerR * Math.cos(s); const y1 = cy + outerR * Math.sin(s);
  const x2 = cx + outerR * Math.cos(e); const y2 = cy + outerR * Math.sin(e);
  const x3 = cx + innerR * Math.cos(e); const y3 = cy + innerR * Math.sin(e);
  const x4 = cx + innerR * Math.cos(s); const y4 = cy + innerR * Math.sin(s);
  return `M${x1} ${y1} A${outerR} ${outerR} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${innerR} ${innerR} 0 ${large} 0 ${x4} ${y4}Z`;
}

function GraficoGastos({ datos }: { datos: GastoPorCategoria[] }) {
  if (datos.length === 0) {
    return (
      <View style={estilos.tarjeta}>
        <Text style={estilos.tituloSeccion}>Gastos por categoría</Text>
        <Text style={estilos.textoVacio}>Sin gastos registrados este mes</Text>
      </View>
    );
  }
  const SIZE = 220; const cx = SIZE / 2; const cy = SIZE / 2;
  const outerR = SIZE / 2 - 6; const innerR = outerR * 0.52;
  const total = datos.reduce((sum, g) => sum + g.value, 0);
  let anguloActual = 0;
  const arcos = datos.map(g => {
    const barrido = (g.value / total) * 360;
    const path = calcularArco(cx, cy, outerR, innerR, anguloActual + 0.25, anguloActual + barrido - 0.25);
    anguloActual += barrido;
    return { ...g, path };
  });
  return (
    <View style={estilos.tarjeta}>
      <Text style={estilos.tituloSeccion}>Gastos por categoría</Text>
      <View style={estilos.contenedorDonut}>
        <Svg width={SIZE} height={SIZE}>
          {arcos.map(arco => <Path key={arco.label} d={arco.path} fill={arco.color} />)}
        </Svg>
      </View>
      <View style={estilos.leyenda}>
        {datos.map(g => (
          <View key={g.label} style={estilos.filaLeyenda}>
            <View style={[estilos.puntoCat, { backgroundColor: g.color }]} />
            <Text style={estilos.leyendaNombre} numberOfLines={1}>{g.label}</Text>
            <Text style={estilos.leyendaMonto}>{formatearMonto(g.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Fila de transacción ──────────────────────────────────────────────────────

function FilaTransaccion({ tx }: { tx: TransaccionConCategoria }) {
  const color = tx.type === 'income' ? '#639922' : '#E24B4A';
  const signo = tx.type === 'income' ? '+' : '-';
  return (
    <View style={estilos.filaTx}>
      <View style={[estilos.puntoCat, { backgroundColor: tx.categories?.color ?? '#4A4D5A' }]} />
      <View style={estilos.txInfo}>
        <Text style={estilos.txNota} numberOfLines={1}>{tx.note}</Text>
        <Text style={estilos.txFecha}>{formatearFecha(tx.date)}</Text>
      </View>
      <Text style={[estilos.txMonto, { color }]}>{signo} {formatearMonto(tx.amount)}</Text>
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function HomeScreen() {
  const hoy = new Date();
  const [periodo, setPeriodo] = useState({ año: hoy.getFullYear(), mes: hoy.getMonth() });

  const puedeIrSiguiente =
    periodo.año < hoy.getFullYear() ||
    (periodo.año === hoy.getFullYear() && periodo.mes < hoy.getMonth());

  const irAnterior = () =>
    setPeriodo(({ año, mes }) => mes === 0 ? { año: año - 1, mes: 11 } : { año, mes: mes - 1 });
  const irSiguiente = () => {
    if (!puedeIrSiguiente) return;
    setPeriodo(({ año, mes }) => mes === 11 ? { año: año + 1, mes: 0 } : { año, mes: mes + 1 });
  };

  const { settings, loading: loadingSettings, actualizarModo } = useUserSettings();

  // Ref que apunta a la función de refresh del modo activo (Tarjeta o Cuenta).
  // El header la usa para sincronizar sin saber qué modo está activo.
  const refrescarModoActivo = useRef<(() => void) | null>(null);
  const onSetRefrescar = useCallback((fn: () => void) => {
    refrescarModoActivo.current = fn;
  }, []);

  if (loadingSettings) {
    return (
      <SafeAreaView style={estilos.fondo}>
        <View style={estilos.centrado}>
          <ActivityIndicator size="large" color="#378ADD" />
        </View>
      </SafeAreaView>
    );
  }

  const modo = settings?.home_mode ?? 'credit_card';
  const defaultCloseDay = settings?.default_close_day ?? 23;

  return (
    <SafeAreaView style={estilos.fondo}>
      <ScrollView contentContainerStyle={estilos.contenido}>

        {/* Header: mes + subtítulo + Sincronizar */}
        <EncabezadoHome
          onSincronizar={() => refrescarModoActivo.current?.()}
        />

        {/* Toggle persiste entre sesiones */}
        <ToggleModo modo={modo} onChange={actualizarModo} />

        {modo === 'credit_card' ? (
          <ModoTarjeta
            defaultCloseDay={defaultCloseDay}
            onSetRefrescar={onSetRefrescar}
          />
        ) : (
          <ModoCuenta
            periodo={periodo}
            irAnterior={irAnterior}
            irSiguiente={irSiguiente}
            puedeIrSiguiente={puedeIrSiguiente}
            onSetRefrescar={onSetRefrescar}
          />
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Estilos — modo oscuro ────────────────────────────────────────────────────

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: '#0F1117' },
  contenido: { padding: 16, paddingBottom: 40 },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centradoContenido: { alignItems: 'center', gap: 8, paddingVertical: 24 },

  // ── Header ────────────────────────────────────────────────────────────
  headerFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerMes: {
    color: '#F1F0EC',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  headerSubtitulo: {
    color: '#4A4D5A',
    fontSize: 13,
    marginTop: 3,
  },

  // ── Toggle ────────────────────────────────────────────────────────────
  toggleContenedor: {
    flexDirection: 'row',
    backgroundColor: '#181B24',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  toggleOpcion: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleActivo: { backgroundColor: '#2A2D38' },
  toggleTexto: { fontSize: 14, fontWeight: '500', color: '#4A4D5A' },
  toggleTextoActivo: { color: '#F1F0EC' },

  // ── Alert genérico ────────────────────────────────────────────────────
  alertContenedor: {
    borderWidth: 0.5,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  alertTexto: { fontSize: 13, fontWeight: '500' },

  // ── Bloque 1 — balance mensual ────────────────────────────────────────
  balanceMesLabel: {
    color: '#4A4D5A',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  balanceHero: {
    color: '#F1F0EC',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 4,
  },
  balanceSubtitulo: { color: '#6B6A66', fontSize: 13 },
  ecuacionFila: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 4,
  },
  ecuacionSep: { fontSize: 14, color: '#4A4D5A', fontWeight: '500', paddingHorizontal: 2 },
  colBalance: { flex: 1, alignItems: 'center', gap: 3 },
  colBalanceLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  colBalanceMonto: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  colBalanceDesglose: {
    fontSize: 9,
    color: '#4A4D5A',
    textAlign: 'center',
    lineHeight: 13,
  },
  divisorBalance: { height: 1, backgroundColor: '#2A2D38', marginVertical: 14 },

  // ── Bloque 2 — hero ciclo tarjetas ────────────────────────────────────
  bloque2ProxVenc: {
    color: '#4A4D5A',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  bloque2Hero: {
    color: '#F1F0EC',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 4,
  },
  bloque2Subtitulo: { color: '#6B6A66', fontSize: 12 },

  // ── Card de tarjeta (sin barras, responsiva) ──────────────────────────
  cardTarjeta: {
    backgroundColor: '#0F1117',
    borderWidth: 0.5,
    borderColor: '#2A2D38',
    borderRadius: 8,
    padding: 14,
  },
  cardTarjetaDesktop: { flex: 1 },
  cardsContenedorMobile: { flexDirection: 'column' as const, gap: 8 },
  cardsContenedorDesktop: { flexDirection: 'row' as const, gap: 8, flexWrap: 'wrap' as const },
  cardTarjetaFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTarjetaIzq: { flex: 1, marginRight: 12, gap: 4 },
  cardTarjetaDer: { alignItems: 'flex-end', gap: 4 },
  cardTarjetaNombre: { fontSize: 14, fontWeight: '500', color: '#F1F0EC' },
  cardTarjetaCicloFechas: { fontSize: 12, color: '#4A4D5A' },
  cardTarjetaMonto: { fontSize: 18, fontWeight: '600', color: '#F1F0EC' },
  cardTarjetaDias: { fontSize: 12, fontWeight: '500' },

  // ── Estado vacío ──────────────────────────────────────────────────────
  estadoVacioContenedor: { paddingVertical: 12, gap: 4 },
  textoVacioSub: { fontSize: 12, color: '#4A4D5A', lineHeight: 18 },

  // ── Modo Cuenta — tarjeta de balance ─────────────────────────────────
  tarjetaBalance: {
    backgroundColor: '#181B24',
    borderWidth: 0.5,
    borderColor: '#2A2D38',
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
  },
  selectorMes: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  flecha: { color: '#6B6A66', fontSize: 20, fontWeight: '300' },
  flechaDeshabilitada: { color: '#2A2D38' },
  labelMes: {
    color: '#F1F0EC', fontSize: 15, fontWeight: '500',
    minWidth: 120, textAlign: 'center',
  },
  balanceTexto: { fontSize: 38, fontWeight: '700', marginBottom: 24, letterSpacing: -1 },

  // ── Stats ─────────────────────────────────────────────────────────────
  filaResumen: { flexDirection: 'row', width: '100%' },
  bloqueResumen: { flex: 1, alignItems: 'center' },
  divisor: { width: 1, backgroundColor: '#2A2D38' },
  labelResumen: { color: '#4A4D5A', fontSize: 12, marginBottom: 4 },
  valorIngreso: { color: '#639922', fontSize: 15, fontWeight: '600' },
  valorGasto: { color: '#E24B4A', fontSize: 15, fontWeight: '600' },

  // ── Tarjeta de sección ────────────────────────────────────────────────
  tarjeta: {
    backgroundColor: '#181B24',
    borderWidth: 0.5,
    borderColor: '#2A2D38',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  tituloSeccion: { fontSize: 15, fontWeight: '600', color: '#F1F0EC', marginBottom: 16 },
  textoVacio: { color: '#4A4D5A', fontSize: 14, textAlign: 'center', paddingVertical: 8 },
  textoError: { color: '#E24B4A', fontSize: 14, textAlign: 'center', paddingHorizontal: 24 },

  // ── Donut ─────────────────────────────────────────────────────────────
  contenedorDonut: { alignItems: 'center', marginBottom: 16 },
  leyenda: { gap: 8 },
  filaLeyenda: { flexDirection: 'row', alignItems: 'center' },
  leyendaNombre: { flex: 1, color: '#6B6A66', fontSize: 13 },
  leyendaMonto: { color: '#6B6A66', fontSize: 13, fontWeight: '500' },

  // ── Transacciones ─────────────────────────────────────────────────────
  filaTx: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2D38',
  },
  txInfo: { flex: 1, marginRight: 8 },
  txNota: { fontSize: 13, color: '#F1F0EC', fontWeight: '500' },
  txFecha: { fontSize: 11, color: '#4A4D5A', marginTop: 2 },
  txMonto: { fontSize: 13, fontWeight: '600' },
  puntoCat: { width: 10, height: 10, borderRadius: 5, marginRight: 10, flexShrink: 0 },

  // ── Botón reintentar ──────────────────────────────────────────────────
  botonReintentar: {
    backgroundColor: '#2A2D38',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  botonTexto: { color: '#F1F0EC', fontWeight: '600', fontSize: 14 },
});
