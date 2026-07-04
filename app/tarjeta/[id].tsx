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
import { useGastoMensualTarjeta } from '../../hooks/useGastoMensualTarjeta';
import type { GastoMes } from '../../hooks/useGastoMensualTarjeta';
import { useProyeccionCuotas } from '../../hooks/useProyeccionCuotas';
import { DetalleTransaccion } from '../../components/DetalleTransaccion';
import GraficoBarrasMes from '../../components/GraficoBarrasMes';

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
          {tx.installments && (
            <View style={estilos.badgeCuota}>
              <Text style={estilos.badgeCuotaTexto}>cuota {tx.installments}</Text>
            </View>
          )}
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

// ─── Filtro Facturado/No facturado/En cuotas ──────────────────────────────────
type FiltroTC = 'todas' | 'facturado' | 'no_facturado' | 'cuotas';

function SegmentedFiltroTC({ filtro, onChange }: { filtro: FiltroTC; onChange: (f: FiltroTC) => void }) {
  const opciones: { valor: FiltroTC; label: string }[] = [
    { valor: 'todas',        label: 'Todas' },
    { valor: 'facturado',    label: 'Facturado' },
    { valor: 'no_facturado', label: 'No facturado' },
    { valor: 'cuotas',       label: 'En cuotas' },
  ];
  return (
    <View style={estilos.toggle}>
      {opciones.map(({ valor, label }) => (
        <TouchableOpacity
          key={valor}
          style={[estilos.toggleOpcion, filtro === valor && estilos.toggleActivo]}
          onPress={() => onChange(valor)}
          activeOpacity={0.8}
        >
          <Text
            style={[estilos.toggleTexto, filtro === valor && estilos.toggleTextoActivo]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
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
    factorPeso: factorPesoDetalle,
    esProporcional,
    pagosCiclo,
    cicloLabel,
    loading,
    error,
    recargar,
  } = useDetalleTarjeta(id ?? '');

  // Filtro Facturado/No facturado/En cuotas — sobre las transacciones del ciclo activo
  const [filtroTC, setFiltroTC] = useState<FiltroTC>('todas');

  // Subtotales por categoría — SIEMPRE sobre todas las transacciones del ciclo
  // (no sobre el filtro activo), para que sirvan de referencia comparativa constante.
  // Se escalan con factorPesoDetalle, igual que totalNeto/totalBruto del hook, para
  // ser consistentes con la distribución proporcional (card_last_four es NULL hoy).
  const subtotalFacturado = Math.round(
    transacciones
      .filter(tx => tx.bank_source === 'credit_card_billed')
      .reduce((s, tx) => s + Number(tx.amount), 0) * factorPesoDetalle
  );
  const subtotalNoFacturado = Math.round(
    transacciones
      .filter(tx => tx.bank_source === 'credit_card_unbilled')
      .reduce((s, tx) => s + Number(tx.amount), 0) * factorPesoDetalle
  );
  const subtotalCuotas = Math.round(
    transacciones
      .filter(tx => tx.installments !== null)
      .reduce((s, tx) => s + Number(tx.amount), 0) * factorPesoDetalle
  );

  // Cuadre: facturado + no facturado cubre el 100% de las transacciones del ciclo
  // (son las dos únicas categorías de bank_source, mutuamente excluyentes), así que
  // equivale exactamente a totalBruto — ya escalado por factorPesoDetalle.
  // Solo tiene sentido en el ciclo vigente (cicloOffset === 0): used_clp es el cupo
  // usado HOY según el banco, no un valor histórico por ciclo.
  const diferenciaCuadre = totalBruto - (tarjeta?.used_clp ?? 0);
  const cuadraOk = Math.abs(diferenciaCuadre) <= 1000;

  // Lista filtrada para la sección de transacciones
  const transaccionesFiltradas = transacciones.filter(tx => {
    if (filtroTC === 'facturado')    return tx.bank_source === 'credit_card_billed';
    if (filtroTC === 'no_facturado') return tx.bank_source === 'credit_card_unbilled';
    if (filtroTC === 'cuotas')       return tx.installments !== null;
    return true;
  });

  // Auditoría del ciclo: un ciclo con offset negativo ya cerró (getCycleRange
  // garantiza que el ciclo de offset 0 siempre termina hoy o en el futuro).
  // Si todavía queda algo 'credit_card_unbilled' ahí, es el síntoma del bug de
  // dedup que dejaba filas viejas sin facturar (ver auditoría de julio 2026):
  // el banco ya facturó ese movimiento, pero la fila vieja nunca se actualizó.
  const cicloCerrado = cicloOffset < 0;
  const movimientosNoFacturados = cicloCerrado
    ? transacciones.filter(tx => tx.bank_source === 'credit_card_unbilled')
    : [];

  // Gráfico: histórico TC real (pasado/actual) + proyección de cuotas (futuro).
  // Pasamos el id de la tarjeta para que el hook aplique distribución proporcional
  // cuando card_last_four es NULL (situación actual con el scraper v2.1.2).
  // factorPeso también se aplica a las barras futuras de cuotas para consistencia.
  const { datos: datosHistorico, factorPeso } = useGastoMensualTarjeta(id ?? null);
  const { datos: datosCuotas }                = useProyeccionCuotas();

  // Combinar: barras futuras (idx 4-6) se reemplazan con la proyección de cuotas
  // escalada al mismo factor proporcional que el histórico.
  const datosGrafico: GastoMes[] = datosHistorico.map(barra => {
    const delta = barra.idx - 3;
    if (delta <= 0) return barra;

    const proyMes = datosCuotas?.proyeccion[delta - 1];
    const montoProyectado = Math.round((proyMes?.monto ?? 0) * factorPeso);

    return {
      ...barra,
      monto:        montoProyectado,
      esProyectado: montoProyectado > 0,
    };
  });

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

          {/* ── Cupo de la tarjeta ──────────────────────────────────── */}
          {tarjeta && tarjeta.total_clp !== null && tarjeta.total_clp > 0 && (() => {
            const pct = ((tarjeta.used_clp ?? 0) / tarjeta.total_clp!) * 100;
            return (
              <View style={estilos.card}>
                <Text style={estilos.tituloSeccion}>Cupo</Text>
                <View style={estilos.statsRow}>
                  <View style={estilos.statBloque}>
                    <Text style={estilos.statLabel}>Utilizado</Text>
                    <Text style={[estilos.statMonto, { color: '#E24B4A', fontSize: 17 }]}>
                      {formatearMonto(tarjeta.used_clp ?? 0)}
                    </Text>
                  </View>
                  <View style={estilos.statDivisor} />
                  <View style={estilos.statBloque}>
                    <Text style={estilos.statLabel}>Disponible</Text>
                    <Text style={[estilos.statMonto, { color: '#639922', fontSize: 17 }]}>
                      {formatearMonto(tarjeta.available_clp ?? 0)}
                    </Text>
                  </View>
                  <View style={estilos.statDivisor} />
                  <View style={estilos.statBloque}>
                    <Text style={estilos.statLabel}>Cupo total</Text>
                    <Text style={[estilos.statMonto, { fontSize: 17 }]}>
                      {formatearMonto(tarjeta.total_clp ?? 0)}
                    </Text>
                  </View>
                </View>
                {/* Barra de utilización */}
                <View style={estilos.cupoBarraFondo}>
                  <View style={[estilos.cupoBarraRelleno, {
                    width: `${Math.min(pct, 100)}%` as `${number}%`,
                    backgroundColor: pct >= 80 ? '#E24B4A' : pct >= 60 ? '#F5A623' : '#639922',
                  }]} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                  <Text style={estilos.cupoSubtitulo}>{pct.toFixed(1)}% utilizado</Text>
                  {tarjeta.total_usd && tarjeta.total_usd > 0 && (
                    <Text style={estilos.cupoSubtitulo}>
                      USD ${(tarjeta.used_usd ?? 0).toFixed(0)} / ${tarjeta.total_usd.toFixed(0)}
                    </Text>
                  )}
                </View>
                {tarjeta.billing_period && (
                  <Text style={estilos.cupoSubtitulo}>Período: {tarjeta.billing_period}</Text>
                )}
              </View>
            );
          })()}

          {/* ── Gráfico histórico + proyección cuotas ──────────────── */}
          <View style={estilos.card}>
            <GraficoBarrasMes
              datos={datosGrafico}
              titulo="Gasto TC · azul=real · naranja=cuotas proyectadas"
              colorBarra="#378ADD"
              altura={160}
            />
          </View>

          {/* ── Stats del ciclo ─────────────────────────────────────── */}
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
            {esProporcional && (
              <Text style={estilos.notaProporcional}>
                Estimación proporcional · el banco no informa a qué tarjeta pertenece cada movimiento
              </Text>
            )}
          </View>

          {/* ── Subtotales por categoría + cuadre con el banco ───────── */}
          <View style={estilos.card}>
            <Text style={estilos.tituloSeccion}>Subtotales del ciclo</Text>
            <View style={estilos.statsRow}>
              <View style={estilos.statBloque}>
                <Text style={estilos.statLabel}>Facturado</Text>
                <Text style={estilos.statMonto}>{formatearMonto(subtotalFacturado)}</Text>
              </View>
              <View style={estilos.statDivisor} />
              <View style={estilos.statBloque}>
                <Text style={estilos.statLabel}>No facturado</Text>
                <Text style={estilos.statMonto}>{formatearMonto(subtotalNoFacturado)}</Text>
              </View>
              <View style={estilos.statDivisor} />
              <View style={estilos.statBloque}>
                <Text style={estilos.statLabel}>En cuotas</Text>
                <Text style={estilos.statMonto}>{formatearMonto(subtotalCuotas)}</Text>
              </View>
            </View>

            {/* Pagado a la tarjeta este ciclo — informativo, explica bajadas de used_clp */}
            {pagosCiclo > 0 && (
              <Text style={estilos.notaPago}>
                Pagado a la tarjeta este ciclo: {formatearMonto(pagosCiclo)}
              </Text>
            )}

            {/* Cuadre contra el cupo usado que informa el banco — solo ciclo vigente */}
            {cicloOffset === 0 && tarjeta?.used_clp != null && (
              cuadraOk ? (
                <Text style={estilos.cuadreOk}>
                  ✓ Cuadra con el cupo usado informado por el banco
                </Text>
              ) : (
                <View style={estilos.alertaCuadre}>
                  <Text style={estilos.alertaCuadreTexto}>
                    ⚠ Diferencia de {formatearMonto(diferenciaCuadre)} vs. el cupo usado
                    informado por el banco ({formatearMonto(tarjeta.used_clp)})
                  </Text>
                </View>
              )
            )}
          </View>

          {/* ── Alerta: ciclo cerrado con movimientos sin facturar ──── */}
          {cicloCerrado && movimientosNoFacturados.length > 0 && (
            <View style={estilos.card}>
              <View style={estilos.alertaCuadre}>
                <Text style={estilos.alertaCuadreTexto}>
                  ⚠ {movimientosNoFacturados.length} movimiento{movimientosNoFacturados.length === 1 ? '' : 's'}{' '}
                  no debería{movimientosNoFacturados.length === 1 ? '' : 'n'} estar sin facturar en un ciclo cerrado
                </Text>
              </View>
              {movimientosNoFacturados.map(tx => (
                <View key={tx.id} style={estilos.filaTx}>
                  <View style={estilos.filaTxIzq}>
                    <Text style={estilos.txNota} numberOfLines={1}>{tx.note}</Text>
                    <Text style={estilos.txFecha}>{formatearFecha(tx.date)}</Text>
                  </View>
                  <Text style={estilos.txMonto}>{formatearMonto(tx.amount)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── Lista de transacciones ──────────────────────────────── */}
          <View style={estilos.card}>
            <Text style={estilos.tituloSeccion}>Transacciones</Text>
            <SegmentedFiltroTC filtro={filtroTC} onChange={setFiltroTC} />
            {transacciones.length === 0 ? (
              <Text style={estilos.textoVacio}>Sin transacciones en este ciclo</Text>
            ) : transaccionesFiltradas.length === 0 ? (
              <Text style={estilos.textoVacio}>Sin transacciones en esta categoría</Text>
            ) : (
              transaccionesFiltradas.map(tx => (
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

  // Cuotas
  badgeCuota: {
    backgroundColor: '#2A1515',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 0.5,
    borderColor: '#E24B4A',
  },
  badgeCuotaTexto: { fontSize: 10, color: '#E24B4A', fontWeight: '500' },

  // Cupo
  cupoBarraFondo: { height: 6, backgroundColor: '#2A2D38', borderRadius: 3, marginTop: 12 },
  cupoBarraRelleno: { height: 6, borderRadius: 3 },
  cupoSubtitulo: { fontSize: 11, color: '#4A4D5A', marginTop: 4 },

  // Nota informativa del gráfico
  notaGrafico: { fontSize: 10, color: '#2A2D38', marginTop: 8, textAlign: 'center' },
  notaProporcional: { fontSize: 10, color: '#4A4D5A', marginTop: 10, textAlign: 'center', fontStyle: 'italic' },

  // Segmentado Todas/Facturado/No facturado/En cuotas
  toggle: {
    flexDirection: 'row',
    backgroundColor: '#0F1117',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  toggleOpcion: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleActivo: { backgroundColor: '#2A2D38' },
  toggleTexto: { fontSize: 11, fontWeight: '500', color: '#4A4D5A', textAlign: 'center' },
  toggleTextoActivo: { color: '#F1F0EC' },

  // Cuadre con el banco
  notaPago: { fontSize: 11, color: '#4A4D5A', marginTop: 12, textAlign: 'center' },
  cuadreOk: { fontSize: 11, color: '#639922', marginTop: 12, textAlign: 'center' },
  alertaCuadre: {
    backgroundColor: '#2A1F0F',
    borderWidth: 0.5,
    borderColor: '#F5A623',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
  },
  alertaCuadreTexto: { fontSize: 12, color: '#F5A623', fontWeight: '500', textAlign: 'center' },
});
