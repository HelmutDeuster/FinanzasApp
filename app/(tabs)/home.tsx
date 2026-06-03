// app/(tabs)/home.tsx
// Pantalla principal: balance del mes, donut de gastos por categoría y últimas transacciones.
// El usuario puede navegar entre meses con las flechas ← →.

import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTransactions } from '../../hooks/useTransactions';
import type { GastoPorCategoria, TransaccionConCategoria } from '../../hooks/useTransactions';
import SyncButton from '../../components/SyncButton';

// ─── Utilidades de formato ────────────────────────────────────────────────────

function formatearMonto(n: number): string {
  return `$ ${Math.abs(n).toLocaleString('es-CL')}`;
}

function formatearFecha(iso: string): string {
  const [año, mes, dia] = iso.split('-');
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(dia, 10)} ${meses[parseInt(mes, 10) - 1]} ${año}`;
}

const MESES_LARGO = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

// mes es 0-indexed
function labelMes(año: number, mes: number): string {
  return `${MESES_LARGO[mes]} ${año}`;
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

// Tarjeta de balance con selector de mes integrado.
// puedeIrSiguiente se pone en false cuando el mes mostrado es el mes actual.
function TarjetaBalance({
  balance,
  totalIngresos,
  totalGastos,
  etiquetaMes,
  enAnterior,
  enSiguiente,
  puedeIrSiguiente,
}: {
  balance: number;
  totalIngresos: number;
  totalGastos: number;
  etiquetaMes: string;
  enAnterior: () => void;
  enSiguiente: () => void;
  puedeIrSiguiente: boolean;
}) {
  const esPositivo = balance >= 0;
  const colorBalance = esPositivo ? '#34D399' : '#F87171';
  const signo = esPositivo ? '+' : '-';

  return (
    <View style={estilos.tarjetaBalance}>

      {/* Selector de mes: ← Mayo 2026 → */}
      <View style={estilos.selectorMes}>
        <TouchableOpacity
          onPress={enAnterior}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
        >
          <Text style={estilos.flecha}>←</Text>
        </TouchableOpacity>

        <Text style={estilos.labelMes}>{etiquetaMes}</Text>

        <TouchableOpacity
          onPress={enSiguiente}
          disabled={!puedeIrSiguiente}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
        >
          <Text style={[estilos.flecha, !puedeIrSiguiente && estilos.flechaDeshabilitada]}>
            →
          </Text>
        </TouchableOpacity>
      </View>

      {/* Balance grande — color según positivo/negativo */}
      <Text style={[estilos.balanceTexto, { color: colorBalance }]}>
        {signo} {formatearMonto(balance)}
      </Text>

      {/* Fila resumen: ingresos | gastos */}
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

function calcularArco(
  cx: number, cy: number,
  outerR: number, innerR: number,
  startDeg: number, endDeg: number,
): string {
  const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
  const s = toRad(startDeg);
  const e = toRad(endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  const x1 = cx + outerR * Math.cos(s);
  const y1 = cy + outerR * Math.sin(s);
  const x2 = cx + outerR * Math.cos(e);
  const y2 = cy + outerR * Math.sin(e);
  const x3 = cx + innerR * Math.cos(e);
  const y3 = cy + innerR * Math.sin(e);
  const x4 = cx + innerR * Math.cos(s);
  const y4 = cy + innerR * Math.sin(s);
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

  const SIZE = 220;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const outerR = SIZE / 2 - 6;
  const innerR = outerR * 0.52;

  const total = datos.reduce((sum, g) => sum + g.value, 0);
  let anguloActual = 0;

  const arcos = datos.map((g) => {
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
          {arcos.map((arco) => (
            <Path key={arco.label} d={arco.path} fill={arco.color} />
          ))}
        </Svg>
      </View>

      <View style={estilos.leyenda}>
        {datos.map((g) => (
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
  const color = tx.type === 'income' ? '#34D399' : '#F87171';
  const signo = tx.type === 'income' ? '+' : '-';

  return (
    <View style={estilos.filaTx}>
      <View style={[estilos.puntoCat, { backgroundColor: tx.categories?.color ?? '#9CA3AF' }]} />
      <View style={estilos.txInfo}>
        <Text style={estilos.txNota} numberOfLines={1}>{tx.note}</Text>
        <Text style={estilos.txFecha}>{formatearFecha(tx.date)}</Text>
      </View>
      <Text style={[estilos.txMonto, { color }]}>
        {signo} {formatearMonto(tx.amount)}
      </Text>
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function HomeScreen() {
  // Periodo seleccionado — arranca en el mes actual
  const hoy = new Date();
  const [periodo, setPeriodo] = useState({
    año: hoy.getFullYear(),
    mes: hoy.getMonth(), // 0-indexed
  });

  // La flecha → se deshabilita cuando el periodo ya es el mes actual
  const puedeIrSiguiente =
    periodo.año < hoy.getFullYear() ||
    (periodo.año === hoy.getFullYear() && periodo.mes < hoy.getMonth());

  const irAnterior = () => {
    setPeriodo(({ año, mes }) =>
      mes === 0 ? { año: año - 1, mes: 11 } : { año, mes: mes - 1 }
    );
  };

  const irSiguiente = () => {
    if (!puedeIrSiguiente) return;
    setPeriodo(({ año, mes }) =>
      mes === 11 ? { año: año + 1, mes: 0 } : { año, mes: mes + 1 }
    );
  };

  const { loading, error, datos, refrescar } = useTransactions(periodo.año, periodo.mes);

  if (loading) {
    return (
      <SafeAreaView style={estilos.centrado}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={estilos.textoVacio}>Cargando...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={estilos.centrado}>
        <Text style={estilos.textoError}>{error}</Text>
        <TouchableOpacity style={estilos.botonReintentar} onPress={refrescar}>
          <Text style={estilos.botonTexto}>Reintentar</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const { totalIngresos, totalGastos, balance, ultimasTransacciones, gastosPorCategoria } = datos!;

  return (
    <SafeAreaView style={estilos.fondo}>
      <ScrollView contentContainerStyle={estilos.contenido}>

        <TarjetaBalance
          balance={balance}
          totalIngresos={totalIngresos}
          totalGastos={totalGastos}
          etiquetaMes={labelMes(periodo.año, periodo.mes)}
          enAnterior={irAnterior}
          enSiguiente={irSiguiente}
          puedeIrSiguiente={puedeIrSiguiente}
        />

        <SyncButton onSincronizado={refrescar} />

        <GraficoGastos datos={gastosPorCategoria} />

        <View style={estilos.tarjeta}>
          <Text style={estilos.tituloSeccion}>Últimas transacciones</Text>

          {ultimasTransacciones.length === 0 ? (
            <Text style={estilos.textoVacio}>Sin transacciones este mes</Text>
          ) : (
            ultimasTransacciones.map((tx) => (
              <FilaTransaccion key={tx.id} tx={tx} />
            ))
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const estilos = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  contenido: {
    padding: 16,
    paddingBottom: 40,
  },
  centrado: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F3F4F6',
  },

  // Tarjeta de balance
  tarjetaBalance: {
    backgroundColor: '#1F2937',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
  },

  // Selector de mes ← Mayo 2026 →
  selectorMes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  flecha: {
    color: '#E5E7EB',
    fontSize: 20,
    fontWeight: '300',
  },
  flechaDeshabilitada: {
    color: '#374151', // gris oscuro: visible pero claramente inactiva
  },
  labelMes: {
    color: '#E5E7EB',
    fontSize: 15,
    fontWeight: '500',
    minWidth: 120,
    textAlign: 'center',
  },

  balanceTexto: {
    fontSize: 38,
    fontWeight: '700',
    marginBottom: 24,
    letterSpacing: -1,
  },
  filaResumen: {
    flexDirection: 'row',
    width: '100%',
  },
  bloqueResumen: {
    flex: 1,
    alignItems: 'center',
  },
  divisor: {
    width: 1,
    backgroundColor: '#374151',
  },
  labelResumen: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 4,
  },
  valorIngreso: {
    color: '#34D399',
    fontSize: 15,
    fontWeight: '600',
  },
  valorGasto: {
    color: '#F87171',
    fontSize: 15,
    fontWeight: '600',
  },

  // Tarjeta genérica (blanca)
  tarjeta: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  tituloSeccion: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  textoVacio: {
    color: '#9CA3AF',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 16,
  },
  textoError: {
    color: '#EF4444',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  // Donut chart
  contenedorDonut: {
    alignItems: 'center',
    marginBottom: 16,
  },
  leyenda: {
    gap: 8,
  },
  filaLeyenda: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leyendaNombre: {
    flex: 1,
    color: '#374151',
    fontSize: 13,
  },
  leyendaMonto: {
    color: '#374151',
    fontSize: 13,
    fontWeight: '500',
  },

  // Transacciones
  filaTx: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  txInfo: {
    flex: 1,
    marginRight: 8,
  },
  txNota: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '500',
  },
  txFecha: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  txMonto: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Punto de color de categoría (compartido por donut y transacciones)
  puntoCat: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
    flexShrink: 0,
  },

  // Botón reintentar
  botonReintentar: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  botonTexto: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
});
