// app/(tabs)/home.tsx
// Pantalla principal con 3 sub-pestañas.
//
// [ Balance ]  [ Cuenta ]  [ Tarjetas de crédito ]
//
// Balance  — modelo contable Ingresos = Ahorro + Egresos, con selector ← mes →
// Cuenta   — saldo CC actual + gráfico de evolución + transacciones CC
// Tarjetas — cards individuales con gasto de cada una en su propio ciclo
//
// El botón Sincronizar en el header refresca la pestaña activa.
// La selección de pestaña es local (no persiste) — siempre arranca en Balance.

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
import { useUserSettings } from '../../hooks/useUserSettings';
import { useModoTarjeta } from '../../hooks/useModoTarjeta';
import { useBalanceMensual } from '../../hooks/useBalanceMensual';
import type { DatosBalanceMensual } from '../../hooks/useBalanceMensual';
import { useModoCuentaCC } from '../../hooks/useModoCuentaCC';
import type { TransaccionCC } from '../../hooks/useModoCuentaCC';
import { useProyeccionCuotas } from '../../hooks/useProyeccionCuotas';
import type { DatosProyeccionCuotas } from '../../hooks/useProyeccionCuotas';
import { useTransactions } from '../../hooks/useTransactions';
import type { GastoPorCategoria, TransaccionConCategoria } from '../../hooks/useTransactions';
import SyncButton from '../../components/SyncButton';
import GraficoBarrasMes from '../../components/GraficoBarrasMes';
import type { CreditCard } from '../../types';
import { getCycleRange, diasRestantes } from '../../lib/cycleUtils';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type SubTab = 'balance' | 'cuenta' | 'tarjetas';

// ─── Utilidades de formato ────────────────────────────────────────────────────

function fmt(n: number): string {
  return `$ ${Math.abs(n).toLocaleString('es-CL')}`;
}

function formatearFecha(iso: string): string {
  const [, mes, dia] = iso.split('-');
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(dia, 10)} ${meses[parseInt(mes, 10) - 1]}`;
}

function formatearFechaCiclo(d: Date): string {
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${d.getDate()} ${meses[d.getMonth()]}`;
}

// Calcula fecha de vencimiento del pago.
// Si next_billing_date (ISO) está disponible, úsala directamente.
// Fallback: regla de cierre → dueDay para calcular el vencimiento.
function getFechaVencimiento(card: CreditCard): Date {
  if (card.next_billing_date) {
    // next_billing_date ya viene en ISO desde syncService
    const d = new Date(card.next_billing_date + 'T12:00:00');
    if (!isNaN(d.getTime())) return d;
  }
  const { end } = getCycleRange(card.cycle_close_day);
  const dueDay = card.cycle_due_day;
  if (dueDay > end.getDate()) {
    return new Date(end.getFullYear(), end.getMonth(), dueDay);
  }
  return new Date(end.getFullYear(), end.getMonth() + 1, dueDay);
}

const MESES_LARGO = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

// ─── Header ───────────────────────────────────────────────────────────────────

function EncabezadoHome({ onSincronizar }: { onSincronizar: () => void }) {
  return (
    <View style={estilos.headerFila}>
      <View>
        <Text style={estilos.headerTitulo}>Tu balance</Text>
        <Text style={estilos.headerSubtitulo}>Banco de Chile</Text>
      </View>
      <SyncButton onSincronizado={onSincronizar} />
    </View>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TABS: { key: SubTab; label: string }[] = [
  { key: 'balance',   label: 'Balance'  },
  { key: 'cuenta',    label: 'Cuenta'   },
  { key: 'tarjetas',  label: 'Tarjetas' },
];

function TabsHome({ tab, onChange }: { tab: SubTab; onChange: (t: SubTab) => void }) {
  return (
    <View style={estilos.tabsContenedor}>
      {TABS.map(t => (
        <TouchableOpacity
          key={t.key}
          style={[estilos.tabOpcion, tab === t.key && estilos.tabActivo]}
          onPress={() => onChange(t.key)}
          activeOpacity={0.8}
        >
          <Text style={[estilos.tabTexto, tab === t.key && estilos.tabTextoActivo]}>
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Componentes compartidos ──────────────────────────────────────────────────

function NavMes({
  año,
  mes,
  irAnterior,
  irSiguiente,
  puedeIrSiguiente,
}: {
  año: number;
  mes: number;
  irAnterior: () => void;
  irSiguiente: () => void;
  puedeIrSiguiente: boolean;
}) {
  return (
    <View style={estilos.selectorMes}>
      <TouchableOpacity onPress={irAnterior} hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}>
        <Text style={estilos.flecha}>←</Text>
      </TouchableOpacity>
      <Text style={estilos.labelMes}>{MESES_LARGO[mes]} {año}</Text>
      <TouchableOpacity
        onPress={irSiguiente}
        disabled={!puedeIrSiguiente}
        hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
      >
        <Text style={[estilos.flecha, !puedeIrSiguiente && estilos.flechaDeshabilitada]}>→</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Pestaña BALANCE ─────────────────────────────────────────────────────────

function ColBalance({
  label, colorLabel, amount, desglose,
}: {
  label: string; colorLabel: string; amount: number; desglose: string;
}) {
  const colorMonto = amount < 0 ? '#E24B4A' : colorLabel;
  return (
    <View style={estilos.colBalance}>
      <Text style={[estilos.colBalanceLabel, { color: colorLabel }]}>{label}</Text>
      <Text style={[estilos.colBalanceMonto, { color: colorMonto }]}>{fmt(amount)}</Text>
      <Text style={estilos.colBalanceDesglose}>{desglose}</Text>
    </View>
  );
}

function AlertBalance({ ahorro }: { ahorro: number }) {
  if (ahorro >= 0) {
    const msg = ahorro === 0
      ? '✓ El balance cierra exacto'
      : `✓ ${fmt(ahorro)} disponible para ahorrar`;
    return (
      <View style={[estilos.alert, { backgroundColor: '#162210', borderColor: '#639922' }]}>
        <Text style={[estilos.alertTexto, { color: '#639922' }]}>{msg}</Text>
      </View>
    );
  }
  return (
    <View style={[estilos.alert, { backgroundColor: '#2D1515', borderColor: '#E24B4A' }]}>
      <Text style={[estilos.alertTexto, { color: '#E24B4A' }]}>
        ⚠ Faltan {fmt(Math.abs(ahorro))} para cerrar el mes
      </Text>
    </View>
  );
}

// Formato abreviado para el desglose de egresos — tiene que caber en poco espacio
function fmtAbr(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString('es-CL')}`;
}

function BloqueBalance({
  datos, loading, año, mes, irAnterior, irSiguiente, puedeIrSiguiente,
  esMesFuturo = false, cuotasProyectadas = 0,
}: {
  datos: DatosBalanceMensual | null;
  loading: boolean;
  año: number; mes: number;
  irAnterior: () => void; irSiguiente: () => void; puedeIrSiguiente: boolean;
  esMesFuturo?: boolean;
  cuotasProyectadas?: number;
}) {
  if (loading) {
    return (
      <View style={estilos.tarjeta}>
        <NavMes año={año} mes={mes} irAnterior={irAnterior} irSiguiente={irSiguiente} puedeIrSiguiente={puedeIrSiguiente} />
        <View style={estilos.centradoContenido}><ActivityIndicator color="#378ADD" /></View>
      </View>
    );
  }

  // Mes futuro: sin transacciones reales, mostrar proyección de cuotas
  if (esMesFuturo) {
    return (
      <View style={estilos.tarjeta}>
        <NavMes año={año} mes={mes} irAnterior={irAnterior} irSiguiente={irSiguiente} puedeIrSiguiente={puedeIrSiguiente} />
        <Text style={estilos.mesFuturoLabel}>Mes proyectado</Text>
        {cuotasProyectadas > 0 ? (
          <>
            <Text style={estilos.balanceHero}>{fmt(cuotasProyectadas)}</Text>
            <Text style={estilos.balanceSubtitulo}>en cuotas TC comprometidas</Text>
            <View style={[estilos.alert, { backgroundColor: '#0F1E33', borderColor: '#378ADD', marginTop: 12 }]}>
              <Text style={[estilos.alertTexto, { color: '#378ADD' }]}>
                Solo refleja cuotas activas — no incluye gastos nuevos
              </Text>
            </View>
          </>
        ) : (
          <Text style={estilos.textoVacio}>Sin cuotas proyectadas para este mes</Text>
        )}
      </View>
    );
  }

  const { ingresos = 0, egresos = 0, egresosTc = 0, egresosCC = 0, ahorro = 0 } = datos ?? {};

  // Desglose con montos reales en formato abreviado para que quepan en la columna
  let desgloseEgresos: string;
  if (egresosTc > 0 && egresosCC > 0) {
    desgloseEgresos = `TC ${fmtAbr(egresosTc)} · CC ${fmtAbr(egresosCC)}`;
  } else if (egresosTc > 0) {
    desgloseEgresos = `TC ${fmtAbr(egresosTc)}`;
  } else if (egresosCC > 0) {
    desgloseEgresos = `CC ${fmtAbr(egresosCC)}`;
  } else {
    desgloseEgresos = 'Sin gastos';
  }

  return (
    <View style={estilos.tarjeta}>
      <NavMes año={año} mes={mes} irAnterior={irAnterior} irSiguiente={irSiguiente} puedeIrSiguiente={puedeIrSiguiente} />
      <Text style={estilos.balanceHero}>{fmt(ingresos)}</Text>
      <Text style={estilos.balanceSubtitulo}>ingresos del mes</Text>
      <View style={estilos.ecuacionFila}>
        <ColBalance label="Ingresos" colorLabel="#639922" amount={ingresos} desglose="Sueldo · Transfers" />
        <Text style={estilos.ecuacionSep}>=</Text>
        <ColBalance label="Ahorro" colorLabel="#378ADD" amount={ahorro} desglose="Fintual · Saldo CC" />
        <Text style={estilos.ecuacionSep}>+</Text>
        <ColBalance label="Egresos" colorLabel="#E24B4A" amount={egresos} desglose={desgloseEgresos} />
      </View>
      <View style={estilos.divisor} />
      <AlertBalance ahorro={ahorro} />
    </View>
  );
}

// ─── Cuotas activas ───────────────────────────────────────────────────────────

function BloqueCuotas({ datos, loading }: { datos: DatosProyeccionCuotas | null; loading: boolean }) {
  if (loading || !datos || datos.cuotasActivas.length === 0) return null;

  return (
    <View style={estilos.tarjeta}>
      <View style={estilos.cuotasHeader}>
        <Text style={estilos.tituloSeccion}>Cuotas activas</Text>
        <View style={estilos.badgeCuotaCount}>
          <Text style={estilos.badgeCuotaCountTexto}>{datos.cuotasActivas.length}</Text>
        </View>
      </View>

      {datos.cuotasActivas.map((c, i) => (
        <View key={i} style={estilos.cuotaFila}>
          {/* Nombre de la compra */}
          <Text style={estilos.cuotaNota} numberOfLines={1}>{c.note}</Text>
          {/* Datos de cuota en una línea, total a la derecha */}
          <View style={estilos.cuotaFilaTop}>
            <Text style={estilos.cuotaInfo}>
              Cuota {c.cuotaActual} de {c.cuotaTotal}
              {'  '}·{'  '}
              {fmt(c.montoCuota)}/mes
              {'  '}·{'  '}
              {c.cuotasRestantes} {c.cuotasRestantes === 1 ? 'pago restante' : 'pagos restantes'}
            </Text>
            <Text style={estilos.cuotaMonto}>{fmt(c.totalRestante)}</Text>
          </View>
        </View>
      ))}

      <View style={estilos.cuotasTotalFila}>
        <Text style={estilos.cuotasTotalLabel}>Total aún por pagar en cuotas</Text>
        <Text style={estilos.cuotasTotalMonto}>{fmt(datos.totalComprometido)}</Text>
      </View>
    </View>
  );
}

// ─── Proyección mensual de cuotas ─────────────────────────────────────────────

function BloqueProyeccionCuotas({ datos }: { datos: DatosProyeccionCuotas | null }) {
  if (!datos || datos.proyeccion.every(m => m.monto === 0)) return null;

  const maxMonto = Math.max(...datos.proyeccion.map(m => m.monto), 1);

  return (
    <View style={estilos.tarjeta}>
      <Text style={estilos.tituloSeccion}>¿Cuánto pagaré en cuotas?</Text>
      <Text style={estilos.proySubtitulo}>
        Pagos TC comprometidos que caen cada mes — sin contar gastos nuevos
      </Text>

      {datos.proyeccion.map((mes, i) => {
        const pct = mes.monto > 0 ? (mes.monto / maxMonto) * 100 : 0;
        return (
          <View key={i} style={estilos.proyFila}>
            <View style={estilos.proyFilaTop}>
              <Text style={estilos.proyLabel}>{mes.label}</Text>
              <Text style={mes.monto > 0 ? estilos.proyMonto : estilos.proyMontoVacio}>
                {mes.monto > 0 ? fmt(mes.monto) : 'sin cuotas'}
              </Text>
            </View>
            {/* Barra proporcional: largo = % del mes con más cuotas */}
            <View style={estilos.proyBarraFondo}>
              {pct > 0 && (
                <View style={[estilos.proyBarraRelleno, { width: `${pct}%` as `${number}%` }]} />
              )}
            </View>
            {mes.detalle.length > 0 && (
              <Text style={estilos.proyDetalle} numberOfLines={1}>
                {mes.detalle.map(d => `${d.note} ${fmt(d.monto)}`).join(' · ')}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Helper de navegación de mes ─────────────────────────────────────────────
// Permite navegar hasta MAX_MESES_FUTURO meses en el futuro.
// Esto habilita ver proyecciones de cuotas en meses aún sin transacciones.
const MAX_MESES_FUTURO = 3;

function usePeriodoMes() {
  const hoy = new Date();
  const [periodo, setPeriodo] = useState({ año: hoy.getFullYear(), mes: hoy.getMonth() });

  const limiteMax = new Date(hoy.getFullYear(), hoy.getMonth() + MAX_MESES_FUTURO, 1);
  const periodoDate = new Date(periodo.año, periodo.mes, 1);
  const puedeIrSiguiente = periodoDate < limiteMax;

  // El selector muestra meses futuros como "proyectados"
  const esMesFuturo =
    periodo.año > hoy.getFullYear() ||
    (periodo.año === hoy.getFullYear() && periodo.mes > hoy.getMonth());

  const irAnterior = () =>
    setPeriodo(({ año, mes }) => mes === 0 ? { año: año - 1, mes: 11 } : { año, mes: mes - 1 });
  const irSiguiente = () => {
    if (!puedeIrSiguiente) return;
    setPeriodo(({ año, mes }) => mes === 11 ? { año: año + 1, mes: 0 } : { año, mes: mes + 1 });
  };

  return { periodo, puedeIrSiguiente, esMesFuturo, irAnterior, irSiguiente };
}

// ─── PestañaBalance ───────────────────────────────────────────────────────────

function PestañaBalance({ onSetRefrescar }: { onSetRefrescar: (fn: () => void) => void }) {
  const { periodo, puedeIrSiguiente, esMesFuturo, irAnterior, irSiguiente } = usePeriodoMes();

  const { datos, loading, refrescar } = useBalanceMensual(periodo.año, periodo.mes);
  const { datos: datosCuotas, loading: loadingCuotas } = useProyeccionCuotas();

  useEffect(() => { onSetRefrescar(refrescar); }, [onSetRefrescar, refrescar]);

  // Para meses futuros, mostrar las cuotas proyectadas de ese mes específico
  const cuotasMesFuturo: { note: string; monto: number }[] | null = (() => {
    if (!esMesFuturo || !datosCuotas) return null;
    const hoy = new Date();
    for (let i = 1; i <= MAX_MESES_FUTURO; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
      if (d.getFullYear() === periodo.año && d.getMonth() === periodo.mes) {
        return datosCuotas.proyeccion[i - 1]?.detalle ?? [];
      }
    }
    return null;
  })();

  const totalCuotasMesFuturo = cuotasMesFuturo?.reduce((s, c) => s + c.monto, 0) ?? 0;

  return (
    <>
      <BloqueBalance
        datos={datos}
        loading={loading}
        año={periodo.año}
        mes={periodo.mes}
        irAnterior={irAnterior}
        irSiguiente={irSiguiente}
        puedeIrSiguiente={puedeIrSiguiente}
        esMesFuturo={esMesFuturo}
        cuotasProyectadas={totalCuotasMesFuturo}
      />
      {/* En mes futuro: detalle de cuotas que caen ese mes */}
      {esMesFuturo && cuotasMesFuturo && cuotasMesFuturo.length > 0 && (
        <View style={estilos.tarjeta}>
          <Text style={estilos.tituloSeccion}>Cuotas que caen este mes</Text>
          {cuotasMesFuturo.map((c, i) => (
            <View key={i} style={estilos.cuotaFila}>
              <View style={estilos.cuotaFilaTop}>
                <Text style={estilos.cuotaNota} numberOfLines={1}>{c.note}</Text>
                <Text style={estilos.cuotaMonto}>{fmt(c.monto)}</Text>
              </View>
            </View>
          ))}
          <View style={estilos.cuotasTotalFila}>
            <Text style={estilos.cuotasTotalLabel}>Total cuotas en este mes</Text>
            <Text style={estilos.cuotasTotalMonto}>{fmt(totalCuotasMesFuturo)}</Text>
          </View>
        </View>
      )}
      {!esMesFuturo && <BloqueCuotas datos={datosCuotas} loading={loadingCuotas} />}
      {!esMesFuturo && <BloqueProyeccionCuotas datos={datosCuotas} />}
    </>
  );
}

// ─── Pestaña CUENTA ──────────────────────────────────────────────────────────

// Extrae día y mes en corto desde "yyyy-mm-dd" sin crear un objeto Date completo
function parsearDiaMes(iso: string): { dia: string; mes: string } {
  const partes = iso.split('-');
  const MESES_C = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
  const dia = partes[2] ? String(parseInt(partes[2], 10)) : '—';
  const mes = partes[1] ? (MESES_C[parseInt(partes[1], 10) - 1] ?? '—') : '—';
  return { dia, mes };
}

function FilaTxCC({ tx }: { tx: TransaccionCC }) {
  const color = tx.type === 'income' ? '#639922' : '#E24B4A';
  const signo = tx.type === 'income' ? '+' : '-';
  const { dia, mes } = parsearDiaMes(tx.date);

  return (
    <View style={estilos.filaTx}>
      {/* Fecha tipo extracto bancario */}
      <View style={estilos.txFechaBox}>
        <Text style={estilos.txFechaDia}>{dia}</Text>
        <Text style={estilos.txFechaMes}>{mes}</Text>
      </View>
      {/* Descripción */}
      <View style={estilos.txInfo}>
        <Text style={estilos.txNota} numberOfLines={2}>{tx.note}</Text>
        <Text style={estilos.txTipo}>{tx.type === 'income' ? 'Abono' : 'Cargo'}</Text>
      </View>
      <Text style={[estilos.txMonto, { color }]}>{signo} {fmt(tx.amount)}</Text>
    </View>
  );
}

function PestañaCuenta({ onSetRefrescar }: { onSetRefrescar: (fn: () => void) => void }) {
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

  const { datos, loading, refrescar } = useModoCuentaCC(periodo.año, periodo.mes);

  useEffect(() => { onSetRefrescar(refrescar); }, [onSetRefrescar, refrescar]);

  if (loading) {
    return (
      <View style={estilos.centradoContenido}>
        <ActivityIndicator color="#378ADD" />
      </View>
    );
  }

  const saldoActual = datos?.saldoActual ?? null;
  const colorSaldo = saldoActual !== null ? (saldoActual >= 0 ? '#639922' : '#E24B4A') : '#6B6A66';

  return (
    <>
      {/* Saldo actual */}
      <View style={estilos.tarjeta}>
        <Text style={estilos.seccionLabel}>Saldo cuenta corriente</Text>
        {saldoActual !== null ? (
          <Text style={[estilos.saldoHero, { color: colorSaldo }]}>{fmt(saldoActual)}</Text>
        ) : (
          <Text style={estilos.saldoVacio}>Sin sincronizar todavía</Text>
        )}
        {datos?.syncedAt && (
          <Text style={estilos.syncTimestamp}>
            Actualizado {formatearFecha(datos.syncedAt.slice(0, 10))}
          </Text>
        )}
      </View>

      {/* Evolución del saldo — gráfico de barras.
          Con un solo sync no hay "evolución" que mostrar — necesitamos al menos 2 puntos. */}
      <View style={estilos.tarjeta}>
        {(datos?.historialSaldo.length ?? 0) >= 2 ? (
          <GraficoBarrasMes
            datos={(datos?.historialSaldo ?? []).map(s => ({
              idx:       s.idx,
              label:     s.label,
              monto:     s.balance,
              esCurrent: false,
              año:       new Date().getFullYear(),
            }))}
            titulo="Evolución del saldo CC"
            colorBarra="#378ADD"
            altura={150}
          />
        ) : (
          <>
            <Text style={estilos.seccionLabel}>Evolución del saldo CC</Text>
            <Text style={estilos.textoVacio}>
              Sincroniza más días para ver la evolución del saldo
            </Text>
          </>
        )}
      </View>

      {/* Ingresos vs gastos del mes */}
      <View style={estilos.tarjeta}>
        <NavMes
          año={periodo.año}
          mes={periodo.mes}
          irAnterior={irAnterior}
          irSiguiente={irSiguiente}
          puedeIrSiguiente={puedeIrSiguiente}
        />
        <View style={estilos.filasStats}>
          <View style={estilos.statBloque}>
            <Text style={estilos.statLabel}>Ingresos</Text>
            <Text style={[estilos.statMonto, { color: '#639922' }]}>{fmt(datos?.ingresosMes ?? 0)}</Text>
          </View>
          <View style={estilos.statDivisor} />
          <View style={estilos.statBloque}>
            <Text style={estilos.statLabel}>Gastos directos</Text>
            <Text style={[estilos.statMonto, { color: '#E24B4A' }]}>{fmt(datos?.gastosMes ?? 0)}</Text>
          </View>
        </View>
      </View>

      {/* Últimas transacciones CC */}
      <View style={estilos.tarjeta}>
        <Text style={estilos.tituloSeccion}>Últimas transacciones CC</Text>
        {(datos?.ultimas.length ?? 0) === 0 ? (
          <Text style={estilos.textoVacio}>Sin transacciones de CC este mes</Text>
        ) : (
          datos!.ultimas.map(tx => <FilaTxCC key={tx.id} tx={tx} />)
        )}
      </View>
    </>
  );
}

// ─── Pestaña TARJETAS ────────────────────────────────────────────────────────

function CardTarjeta({
  card,
  spendNeto,
  isDesktop,
}: {
  card: CreditCard;
  spendNeto: number;
  isDesktop: boolean;
}) {
  // Si next_billing_date (ISO) está disponible, calcular días directamente.
  // Fallback: cycle_close_day para calcular el cierre del ciclo.
  const vencimiento = getFechaVencimiento(card);
  const { end: cycleEnd } = getCycleRange(card.cycle_close_day);

  const label = card.last_four ? `${card.name} ····${card.last_four}` : card.name;
  const dias = diasRestantes(vencimiento);
  const colorDias = dias <= 3 ? '#E24B4A' : dias <= 7 ? '#F5A623' : '#4A4D5A';
  const labelDias = dias === 0 ? 'hoy cierra' : dias === 1 ? '1 día' : `${dias} días`;

  const cardStyle = isDesktop
    ? [estilos.cardTarjeta, { flex: 1 }]
    : estilos.cardTarjeta;

  return (
    <View style={cardStyle}>
      <Text style={estilos.cardNombre}>{label}</Text>
      <Text style={estilos.cardCicloFechas} numberOfLines={1}>
        cierre {formatearFechaCiclo(cycleEnd)} · vence {formatearFechaCiclo(vencimiento)}
      </Text>
      <View style={estilos.cardFilaBottom}>
        <Text style={estilos.cardMonto}>{fmt(spendNeto)}</Text>
        <Text style={[estilos.cardDias, { color: colorDias }]}>{labelDias}</Text>
      </View>
      {/* Cupo disponible si está cargado */}
      {card.available_clp !== null && (
        <Text style={estilos.cardCupo}>
          Cupo disponible: {fmt(card.available_clp ?? 0)}
        </Text>
      )}
    </View>
  );
}

function PestañaTarjetas({
  defaultCloseDay,
  onSetRefrescar,
}: {
  defaultCloseDay: number;
  onSetRefrescar: (fn: () => void) => void;
}) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const { datos, loading, refrescar } = useModoTarjeta(defaultCloseDay);

  useEffect(() => { onSetRefrescar(refrescar); }, [onSetRefrescar, refrescar]);

  const cards = datos?.cards ?? [];
  const spendPorTarjeta = datos?.spendPorTarjeta ?? [];

  // Ordenar por vencimiento más próximo (quien vence antes va primero)
  const cardsSorted = [...cards].sort((a, b) => {
    const va = getFechaVencimiento(a);
    const vb = getFechaVencimiento(b);
    return va.getTime() - vb.getTime();
  });

  if (loading) {
    return (
      <View style={estilos.centradoContenido}>
        <ActivityIndicator color="#378ADD" />
      </View>
    );
  }

  if (cardsSorted.length === 0) {
    return (
      <View style={estilos.tarjeta}>
        <Text style={estilos.textoVacio}>No tienes tarjetas configuradas.</Text>
        <Text style={estilos.textoVacioSub}>Sincroniza o agrégalas en Ajustes.</Text>
      </View>
    );
  }

  // ── Resumen consolidado de cupo ─────────────────────────────────────────────
  const totalUsado     = cards.reduce((s, c) => s + (c.used_clp ?? 0), 0);
  const totalDisponible = cards.reduce((s, c) => s + (c.available_clp ?? 0), 0);
  const totalCupo       = cards.reduce((s, c) => s + (c.total_clp ?? 0), 0);
  const pctUso          = totalCupo > 0 ? (totalUsado / totalCupo) * 100 : 0;
  const totalNeto       = datos?.totalNeto ?? 0;

  return (
    <>
      {/* Resumen consolidado */}
      {totalCupo > 0 && (
        <View style={estilos.tarjeta}>
          <Text style={estilos.tituloSeccion}>Resumen consolidado</Text>

          <View style={estilos.cupoFila}>
            <View style={estilos.cupoBloque}>
              <Text style={estilos.cupoLabel}>Gastado ciclo</Text>
              <Text style={[estilos.cupoMonto, { color: '#E24B4A' }]}>{fmt(totalNeto)}</Text>
            </View>
            <View style={estilos.cupoBloque}>
              <Text style={estilos.cupoLabel}>Utilizado</Text>
              <Text style={[estilos.cupoMonto, { color: '#F5A623' }]}>{fmt(totalUsado)}</Text>
            </View>
            <View style={estilos.cupoBloque}>
              <Text style={estilos.cupoLabel}>Disponible</Text>
              <Text style={[estilos.cupoMonto, { color: '#639922' }]}>{fmt(totalDisponible)}</Text>
            </View>
          </View>

          {/* Barra de utilización de cupo */}
          <View style={estilos.cuotaBarraFondo}>
            <View style={[estilos.cuotaBarraRelleno, {
              width: `${Math.min(pctUso, 100)}%` as `${number}%`,
              backgroundColor: pctUso >= 80 ? '#E24B4A' : pctUso >= 60 ? '#F5A623' : '#639922',
            }]} />
          </View>
          <Text style={estilos.cupoSubtitulo}>
            {pctUso.toFixed(1)}% del cupo total utilizado · {fmt(totalCupo)} cupo total
          </Text>
        </View>
      )}

      {/* Cards individuales */}
      <View style={isDesktop ? estilos.gridDesktop : estilos.gridMobile}>
        {cardsSorted.map(card => {
          const spend = spendPorTarjeta.find(s => s.cardId === card.id);
          return (
            <Pressable
              key={card.id}
              onPress={() => router.push(`/tarjeta/${card.id}`)}
              style={isDesktop ? { flex: 1 } : undefined}
            >
              <CardTarjeta card={card} spendNeto={spend?.neto ?? 0} isDesktop={isDesktop} />
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

// ─── Donut chart (Pestaña Cuenta — gastos por categoría) ─────────────────────

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
        <Text style={estilos.textoVacio}>Sin gastos este mes</Text>
      </View>
    );
  }
  const SIZE = 200; const cx = SIZE / 2; const cy = SIZE / 2;
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
            <Text style={estilos.leyendaMonto}>{fmt(g.value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function HomeScreen() {
  const [tab, setTab] = useState<SubTab>('balance');

  const { settings, loading: loadingSettings } = useUserSettings();

  const refrescarRef = useRef<(() => void) | null>(null);
  const onSetRefrescar = useCallback((fn: () => void) => {
    refrescarRef.current = fn;
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

  const defaultCloseDay = settings?.default_close_day ?? 23;

  return (
    <SafeAreaView style={estilos.fondo}>
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">

        <EncabezadoHome onSincronizar={() => refrescarRef.current?.()} />
        <TabsHome tab={tab} onChange={setTab} />

        {tab === 'balance' && (
          <PestañaBalance onSetRefrescar={onSetRefrescar} />
        )}

        {tab === 'cuenta' && (
          <PestañaCuenta onSetRefrescar={onSetRefrescar} />
        )}

        {tab === 'tarjetas' && (
          <PestañaTarjetas
            defaultCloseDay={defaultCloseDay}
            onSetRefrescar={onSetRefrescar}
          />
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Estilos — modo oscuro ────────────────────────────────────────────────────

const estilos = StyleSheet.create({
  fondo:    { flex: 1, backgroundColor: '#0F1117' },
  contenido: { padding: 16, paddingBottom: 48 },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centradoContenido: { alignItems: 'center', paddingVertical: 40 },

  // ── Header ────────────────────────────────────────────────────────────
  headerFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerTitulo: {
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

  // ── Tabs ──────────────────────────────────────────────────────────────
  tabsContenedor: {
    flexDirection: 'row',
    backgroundColor: '#181B24',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  tabOpcion: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActivo: { backgroundColor: '#2A2D38' },
  tabTexto: { fontSize: 13, fontWeight: '500', color: '#4A4D5A' },
  tabTextoActivo: { color: '#F1F0EC' },

  // ── Selector de mes ───────────────────────────────────────────────────
  selectorMes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  flecha: { color: '#6B6A66', fontSize: 20, fontWeight: '300' },
  flechaDeshabilitada: { color: '#2A2D38' },
  labelMes: {
    color: '#F1F0EC',
    fontSize: 15,
    fontWeight: '500',
    minWidth: 120,
    textAlign: 'center',
  },

  // ── Tarjeta contenedor ────────────────────────────────────────────────
  tarjeta: {
    backgroundColor: '#181B24',
    borderWidth: 0.5,
    borderColor: '#2A2D38',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  tituloSeccion: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F1F0EC',
    marginBottom: 16,
  },
  seccionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B6A66',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  textoVacio: { color: '#4A4D5A', fontSize: 14, textAlign: 'center', paddingVertical: 8 },
  textoVacioSub: { color: '#4A4D5A', fontSize: 12, textAlign: 'center' },

  // ── Balance ───────────────────────────────────────────────────────────
  balanceHero: {
    color: '#F1F0EC',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 4,
  },
  balanceSubtitulo: { color: '#6B6A66', fontSize: 13, marginBottom: 0 },
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
  colBalanceMonto: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  colBalanceDesglose: { fontSize: 11, color: '#6B6A66', textAlign: 'center', lineHeight: 15 },
  divisor: { height: 1, backgroundColor: '#2A2D38', marginVertical: 14 },
  alert: {
    borderWidth: 0.5,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  alertTexto: { fontSize: 13, fontWeight: '500' },

  // ── Cuenta ────────────────────────────────────────────────────────────
  saldoHero: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1,
    marginBottom: 4,
  },
  saldoVacio: { fontSize: 18, color: '#4A4D5A', marginBottom: 4 },
  syncTimestamp: { fontSize: 11, color: '#4A4D5A', marginTop: 4 },
  filasStats: { flexDirection: 'row', alignItems: 'center' },
  statBloque: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  statLabel: {
    color: '#4A4D5A',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    textAlign: 'center',
  },
  statMonto: { fontSize: 18, fontWeight: '700', letterSpacing: -0.5 },
  statDivisor: { width: 1, height: 40, backgroundColor: '#2A2D38' },

  // ── Tarjetas (cards individuales) ─────────────────────────────────────
  gridMobile: { gap: 12 },
  gridDesktop: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cardTarjeta: {
    backgroundColor: '#181B24',
    borderWidth: 0.5,
    borderColor: '#2A2D38',
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  cardNombre: { fontSize: 15, fontWeight: '600', color: '#F1F0EC' },
  cardCicloFechas: { fontSize: 12, color: '#4A4D5A' },
  cardFilaBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 8,
  },
  cardMonto: { fontSize: 24, fontWeight: '700', color: '#F1F0EC', letterSpacing: -0.5 },
  cardDias: { fontSize: 13, fontWeight: '500' },
  cardCupo: { fontSize: 11, color: '#4A4D5A', marginTop: 4 },

  // ── Cuotas activas ────────────────────────────────────────────────────
  cuotasHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  badgeCuotaCount: {
    backgroundColor: '#E24B4A',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 16,
  },
  badgeCuotaCountTexto: { color: '#F1F0EC', fontSize: 11, fontWeight: '700' },
  cuotaFila: {
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2A2D38',
  },
  cuotaFilaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  cuotaNota: { flex: 1, fontSize: 13, color: '#F1F0EC', fontWeight: '500', marginRight: 8 },
  cuotaMonto: { fontSize: 13, color: '#E24B4A', fontWeight: '700' },
  cuotaFilaBot: { marginBottom: 6 },
  cuotaInfo: { fontSize: 11, color: '#4A4D5A' },
  cuotaBarraFondo: { height: 4, backgroundColor: '#2A2D38', borderRadius: 2, marginTop: 2 },
  cuotaBarraRelleno: { height: 4, borderRadius: 2, backgroundColor: '#E24B4A' },
  cuotasTotalFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#2A2D38',
  },
  cuotasTotalLabel: { fontSize: 13, color: '#6B6A66', fontWeight: '500' },
  cuotasTotalMonto: { fontSize: 16, color: '#E24B4A', fontWeight: '700' },

  // ── Proyección cuotas ─────────────────────────────────────────────────
  proySubtitulo: { fontSize: 12, color: '#4A4D5A', marginBottom: 14, marginTop: -10 },
  proyFila: { marginBottom: 12 },
  proyFilaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  proyLabel: { fontSize: 13, color: '#6B6A66', fontWeight: '500' },
  proyMonto: { fontSize: 14, color: '#E24B4A', fontWeight: '700' },
  proyMontoVacio: { fontSize: 12, color: '#2A2D38' },
  proyBarraFondo: { height: 5, backgroundColor: '#2A2D38', borderRadius: 3 },
  proyBarraRelleno: { height: 5, borderRadius: 3, backgroundColor: '#E24B4A' },
  proyDetalle: { fontSize: 10, color: '#4A4D5A', marginTop: 3 },

  // ── Cupo consolidado Tarjetas ─────────────────────────────────────────
  cupoFila: { flexDirection: 'row', marginBottom: 12 },
  cupoBloque: { flex: 1, alignItems: 'center' },
  cupoLabel: { fontSize: 10, color: '#4A4D5A', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4, textAlign: 'center' },
  cupoMonto: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  cupoSubtitulo: { fontSize: 11, color: '#4A4D5A', marginTop: 6, textAlign: 'center' },

  // ── Transacciones ─────────────────────────────────────────────────────
  filaTx: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2D38',
  },
  txFechaBox: {
    width: 32,
    alignItems: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  txFechaDia: { fontSize: 16, fontWeight: '700', color: '#F1F0EC', lineHeight: 20 },
  txFechaMes: { fontSize: 9, color: '#4A4D5A', textTransform: 'uppercase', letterSpacing: 0.5 },
  txInfo: { flex: 1, marginRight: 8 },
  txNota: { fontSize: 13, color: '#F1F0EC', fontWeight: '500' },
  txFecha: { fontSize: 11, color: '#4A4D5A', marginTop: 2 },
  txTipo: { fontSize: 11, color: '#4A4D5A', marginTop: 2 },
  txMonto: { fontSize: 13, fontWeight: '600' },
  puntoCat: { width: 10, height: 10, borderRadius: 5, marginRight: 10, flexShrink: 0 },

  // ── Donut ─────────────────────────────────────────────────────────────
  contenedorDonut: { alignItems: 'center', marginBottom: 16 },
  leyenda: { gap: 8 },
  filaLeyenda: { flexDirection: 'row', alignItems: 'center' },
  leyendaNombre: { flex: 1, color: '#6B6A66', fontSize: 13 },
  leyendaMonto: { color: '#6B6A66', fontSize: 13, fontWeight: '500' },
});
