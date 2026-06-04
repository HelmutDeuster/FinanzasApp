// app/tarjeta/[id].tsx
// Pantalla de detalle de tarjeta — transacciones del ciclo activo o ciclos pasados.
// Vive en el root Stack (fuera del grupo tabs) para que la barra de tabs
// no aparezca en esta pantalla de detalle.

import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useDetalleTarjeta } from '../../hooks/useDetalleTarjeta';
import type { TransaccionDetalle } from '../../hooks/useDetalleTarjeta';
import { DetalleTransaccion } from '../../components/DetalleTransaccion';

// ─── Utilidades ───────────────────────────────────────────────────────────────

function formatearMonto(n: number): string {
  return `$ ${Math.abs(n).toLocaleString('es-CL')}`;
}

function formatearFecha(iso: string): string {
  const [, mes, dia] = iso.split('-');
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(dia, 10)} ${meses[parseInt(mes, 10) - 1]}`;
}

// ─── Fila de transacción ──────────────────────────────────────────────────────

function FilaTx({ tx, onPress }: { tx: TransaccionDetalle; onPress: () => void }) {
  const esOther = tx.owner === 'other';
  const esSplit = tx.owner === 'split';

  return (
    <TouchableOpacity style={estilos.filaTx} onPress={onPress} activeOpacity={0.7}>
      <View style={estilos.filaTxIzq}>
        <View style={estilos.filaTxFila}>
          <Text
            style={[estilos.txNota, esOther && estilos.txNotaTachada]}
            numberOfLines={1}
          >
            {tx.note}
          </Text>
          {esSplit && (
            <View style={estilos.badgeSplit}>
              <Text style={estilos.badgeSplitTexto}>👥 split</Text>
            </View>
          )}
        </View>
        <View style={estilos.filaTxFila}>
          <Text style={estilos.txFecha}>{formatearFecha(tx.date)}</Text>
          {esSplit && tx.split_amount != null && (
            <Text style={estilos.txSplitParte}>
              Tu parte: {formatearMonto(tx.split_amount)}
            </Text>
          )}
          {esOther && (
            <Text style={estilos.txExcluido}>excluido</Text>
          )}
        </View>
      </View>
      <Text style={[estilos.txMonto, esOther && estilos.txMontoTachado]}>
        {formatearMonto(tx.amount)}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function DetalleTarjetaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    tarjeta,
    transacciones,
    cicloOffset,
    setCicloOffset,
    puedeAvanzar,
    totalNeto,
    totalBruto,
    cicloLabel,
    loading,
    error,
    recargar,
  } = useDetalleTarjeta(id ?? '');

  // Transacción seleccionada al tocar una fila — null significa modal cerrado
  const [txSeleccionada, setTxSeleccionada] = useState<TransaccionDetalle | null>(null);

  const nombreTarjeta = tarjeta
    ? (tarjeta.last_four ? `${tarjeta.name} ****${tarjeta.last_four}` : tarjeta.name)
    : '—';

  const haySplits = totalBruto !== totalNeto;

  return (
    <SafeAreaView style={estilos.fondo}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={estilos.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
        >
          <Text style={estilos.headerFlecha}>←</Text>
        </TouchableOpacity>
        <View style={estilos.headerCentro}>
          <Text style={estilos.headerNombre} numberOfLines={1}>{nombreTarjeta}</Text>
          <Text style={estilos.headerCiclo}>{cicloLabel}</Text>
        </View>
        <View style={estilos.headerEspaciador} />
      </View>

      {loading ? (
        <View style={estilos.centrado}>
          <ActivityIndicator color="#378ADD" />
        </View>
      ) : error ? (
        <View style={estilos.centrado}>
          <Text style={estilos.textoError}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={estilos.contenido}>

          {/* ── Navegación entre ciclos ──────────────────────────────── */}
          <View style={estilos.navCiclo}>
            <TouchableOpacity
              onPress={() => setCicloOffset(cicloOffset - 1)}
              hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
            >
              <Text style={estilos.navFlecha}>←</Text>
            </TouchableOpacity>
            <Text style={estilos.navLabel}>{cicloLabel}</Text>
            <TouchableOpacity
              onPress={() => setCicloOffset(cicloOffset + 1)}
              disabled={!puedeAvanzar}
              hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
            >
              <Text style={[estilos.navFlecha, !puedeAvanzar && estilos.flechaDeshabilitada]}>→</Text>
            </TouchableOpacity>
          </View>

          {/* ── Stats ──────────────────────────────────────────────── */}
          <View style={estilos.card}>
            <View style={estilos.statsRow}>
              <View style={estilos.statBloque}>
                <Text style={estilos.statLabel}>Tu parte</Text>
                <Text style={estilos.statMonto}>{formatearMonto(totalNeto)}</Text>
              </View>
              {haySplits && (
                <>
                  <View style={estilos.statDivisor} />
                  <View style={estilos.statBloque}>
                    <Text style={estilos.statLabel}>Total bruto</Text>
                    <Text style={[estilos.statMonto, estilos.statMontoSecundario]}>
                      {formatearMonto(totalBruto)}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>

          {/* ── Lista de transacciones ──────────────────────────────── */}
          <View style={estilos.card}>
            <Text style={estilos.tituloSeccion}>Transacciones</Text>
            {transacciones.length === 0 ? (
              <Text style={estilos.textoVacio}>Sin transacciones en este ciclo</Text>
            ) : (
              transacciones.map(tx => (
                <FilaTx
                  key={tx.id}
                  tx={tx}
                  onPress={() => setTxSeleccionada(tx)}
                />
              ))
            )}
          </View>

        </ScrollView>
      )}

      {/* Modal de split — visible cuando hay una transacción seleccionada */}
      <DetalleTransaccion
        transaccion={txSeleccionada}
        visible={txSeleccionada !== null}
        onCerrar={() => setTxSeleccionada(null)}
        onGuardado={recargar}
      />
    </SafeAreaView>
  );
}

// ─── Estilos — modo oscuro ────────────────────────────────────────────────────

const estilos = StyleSheet.create({
  fondo:    { flex: 1, backgroundColor: '#0F1117' },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  contenido: { padding: 16, paddingBottom: 40 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2A2D38',
  },
  headerFlecha:     { color: '#F1F0EC', fontSize: 22, fontWeight: '300', width: 32 },
  headerCentro:     { flex: 1, alignItems: 'center' },
  headerNombre:     { color: '#F1F0EC', fontSize: 15, fontWeight: '600' },
  headerCiclo:      { color: '#4A4D5A', fontSize: 12, marginTop: 2 },
  headerEspaciador: { width: 32 },

  // Nav ciclos
  navCiclo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 16,
  },
  navFlecha:           { color: '#F1F0EC', fontSize: 20, fontWeight: '300', paddingHorizontal: 12 },
  flechaDeshabilitada: { color: '#2A2D38' },
  navLabel: {
    color: '#F1F0EC', fontSize: 14, fontWeight: '500',
    textAlign: 'center', flex: 1,
  },

  // Stats
  statsRow:            { flexDirection: 'row', alignItems: 'center' },
  statBloque:          { flex: 1, alignItems: 'center', paddingVertical: 8 },
  statLabel:           { color: '#4A4D5A', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  statMonto:           { color: '#F1F0EC', fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  statMontoSecundario: { color: '#6B6A66', fontSize: 18 },
  statDivisor:         { width: 1, height: 40, backgroundColor: '#2A2D38' },

  // Card contenedor
  card: {
    backgroundColor: '#181B24',
    borderWidth: 0.5,
    borderColor: '#2A2D38',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  tituloSeccion: { fontSize: 15, fontWeight: '600', color: '#F1F0EC', marginBottom: 16 },
  textoVacio:    { color: '#4A4D5A', fontSize: 14, textAlign: 'center', paddingVertical: 8 },
  textoError:    { color: '#E24B4A', fontSize: 14, textAlign: 'center', paddingHorizontal: 24 },

  // Filas de transacción
  filaTx: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2A2D38',
  },
  filaTxIzq:      { flex: 1, marginRight: 12, gap: 4 },
  filaTxFila:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  txNota:         { fontSize: 13, color: '#F1F0EC', fontWeight: '500', flex: 1 },
  txNotaTachada:  { textDecorationLine: 'line-through', color: '#4A4D5A' },
  txFecha:        { fontSize: 11, color: '#4A4D5A' },
  txSplitParte:   { fontSize: 11, color: '#378ADD' },
  txExcluido:     { fontSize: 11, color: '#4A4D5A', fontStyle: 'italic' },
  txMonto:        { fontSize: 13, fontWeight: '600', color: '#E24B4A' },
  txMontoTachado: { textDecorationLine: 'line-through', color: '#4A4D5A' },
  badgeSplit: {
    backgroundColor: '#1A2535',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeSplitTexto: { fontSize: 11, color: '#378ADD', fontWeight: '500' },
});
