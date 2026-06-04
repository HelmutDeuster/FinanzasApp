// app/(tabs)/me-deben.tsx
// Pantalla "Me deben" — muestra quién le debe al usuario y cuánto,
// agrupado por persona, con opción de marcar como pagado.

import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMeDeben } from '../../hooks/useMeDeben';
import type { DeudaPorPersona, TxCobro } from '../../hooks/useMeDeben';

// ─── Utilidades ───────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `$ ${Math.round(Math.abs(n)).toLocaleString('es-CL')}`;
}

function formatearFecha(iso: string): string {
  const [, mes, dia] = iso.split('-');
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(dia, 10)} ${meses[parseInt(mes, 10) - 1]}`;
}

// ─── Fila de transacción dentro de la card de una persona ─────────────────────

function FilaDeuda({ tx }: { tx: TxCobro }) {
  return (
    <View style={estilos.filaTx}>
      <View style={estilos.filaTxIzq}>
        <Text style={estilos.filaNota} numberOfLines={1}>{tx.note}</Text>
        <View style={estilos.filaMetaRow}>
          <Text style={estilos.filaFecha}>{formatearFecha(tx.date)}</Text>
          {tx.owner === 'split' && tx.split_amount != null && (
            <Text style={estilos.filaTuParte}>
              Tu parte: {fmt(tx.split_amount)}
            </Text>
          )}
          {tx.owner === 'other' && (
            <Text style={estilos.filaTuParte}>100% de otro</Text>
          )}
        </View>
      </View>
      <Text style={estilos.filaDeuda}>{fmt(tx.deuda)}</Text>
    </View>
  );
}

// ─── Card por persona ─────────────────────────────────────────────────────────

interface CardPersonaProps {
  deuda: DeudaPorPersona;
  confirmando: boolean;       // si está esperando confirmación de "Pagó"
  pagando: boolean;           // si está en proceso de guardado
  onPressPago: () => void;    // primer toque → pide confirmación
  onConfirmar: () => void;    // segundo toque → ejecuta
  onCancelar: () => void;     // toca fuera → cancela confirmación
}

function CardPersona({
  deuda, confirmando, pagando, onPressPago, onConfirmar, onCancelar,
}: CardPersonaProps) {
  return (
    <View style={estilos.card}>

      {/* Header de la card */}
      <View style={estilos.cardHeader}>
        <View>
          <Text style={estilos.cardNombre}>{deuda.persona}</Text>
          <Text style={estilos.cardCantidadTxs}>
            {deuda.transacciones.length} {deuda.transacciones.length === 1 ? 'gasto' : 'gastos'}
          </Text>
        </View>
        <Text style={estilos.cardTotal}>{fmt(deuda.totalDeuda)}</Text>
      </View>

      <View style={estilos.separador} />

      {/* Lista de transacciones */}
      {deuda.transacciones.map(tx => (
        <FilaDeuda key={tx.id} tx={tx} />
      ))}

      <View style={estilos.separador} />

      {/* Botón Pagó — con flujo de confirmación en dos toques */}
      {confirmando ? (
        <View style={estilos.confirmRow}>
          <Text style={estilos.confirmTexto}>¿Confirmar pago de {deuda.persona}?</Text>
          <View style={estilos.confirmBotones}>
            <TouchableOpacity style={estilos.btnCancelar} onPress={onCancelar}>
              <Text style={estilos.btnCancelarTexto}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={estilos.btnConfirmar} onPress={onConfirmar} disabled={pagando}>
              {pagando
                ? <ActivityIndicator color="#0F1117" size="small" />
                : <Text style={estilos.btnConfirmarTexto}>Sí, pagó</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={estilos.btnPago} onPress={onPressPago}>
          <Text style={estilos.btnPagoTexto}>Pagó ✓</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Estado vacío ─────────────────────────────────────────────────────────────

function EstadoVacio() {
  return (
    <View style={estilos.vacio}>
      <Text style={estilos.vacioIcono}>↩</Text>
      <Text style={estilos.vacioTitulo}>Sin cobros pendientes</Text>
      <Text style={estilos.vacioDescripcion}>
        Cuando marques un gasto como split o{'\n'}
        "100% de otro" desde el detalle de una tarjeta,{'\n'}
        aparecerá aquí con el monto a cobrar.
      </Text>
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function MeDebenScreen() {
  const { personas, loading, error, totalPendiente, pagandoA, registrarPago } = useMeDeben();

  // Nombre de la persona cuyo botón "Pagó" fue tocado una primera vez
  const [confirmando, setConfirmando] = useState<string | null>(null);

  async function handleConfirmar(persona: string) {
    setConfirmando(null);
    await registrarPago(persona);
  }

  return (
    <SafeAreaView style={estilos.fondo}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={estilos.header}>
        <Text style={estilos.headerTitulo}>Me deben</Text>
        {!loading && personas.length > 0 && (
          <View style={estilos.headerTotal}>
            <Text style={estilos.headerTotalLabel}>Total pendiente</Text>
            <Text style={estilos.headerTotalMonto}>{fmt(totalPendiente)}</Text>
          </View>
        )}
      </View>

      {/* ── Contenido ───────────────────────────────────────────────────── */}
      {loading ? (
        <View style={estilos.centrado}>
          <ActivityIndicator color="#378ADD" />
        </View>
      ) : error ? (
        <View style={estilos.centrado}>
          <Text style={estilos.textoError}>{error}</Text>
        </View>
      ) : personas.length === 0 ? (
        <EstadoVacio />
      ) : (
        <ScrollView contentContainerStyle={estilos.contenido}>
          {personas.map(deuda => (
            <CardPersona
              key={deuda.persona}
              deuda={deuda}
              confirmando={confirmando === deuda.persona}
              pagando={pagandoA === deuda.persona}
              onPressPago={() => setConfirmando(deuda.persona)}
              onConfirmar={() => handleConfirmar(deuda.persona)}
              onCancelar={() => setConfirmando(null)}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Estilos — modo oscuro ────────────────────────────────────────────────────

const AMBER = '#EF9F27';

const estilos = StyleSheet.create({
  fondo:    { flex: 1, backgroundColor: '#0F1117' },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  contenido: { padding: 16, paddingBottom: 40 },

  // Header con total general
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2A2D38',
  },
  headerTitulo: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F1F0EC',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  headerTotal: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  headerTotalLabel: {
    fontSize: 13,
    color: '#6B6A66',
  },
  headerTotalMonto: {
    fontSize: 22,
    fontWeight: '700',
    color: AMBER,
    letterSpacing: -0.5,
  },

  // Card por persona
  card: {
    backgroundColor: '#181B24',
    borderWidth: 0.5,
    borderColor: '#2A2D38',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardNombre: {
    fontSize: 17,
    fontWeight: '700',
    color: '#F1F0EC',
  },
  cardCantidadTxs: {
    fontSize: 12,
    color: '#4A4D5A',
    marginTop: 2,
  },
  cardTotal: {
    fontSize: 20,
    fontWeight: '700',
    color: AMBER,
    letterSpacing: -0.5,
  },

  separador: {
    height: 0.5,
    backgroundColor: '#2A2D38',
    marginVertical: 12,
  },

  // Filas de transacción dentro de la card
  filaTx: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2A2D38',
  },
  filaTxIzq:   { flex: 1, marginRight: 12, gap: 3 },
  filaNota:    { fontSize: 13, color: '#F1F0EC', fontWeight: '500' },
  filaMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filaFecha:   { fontSize: 11, color: '#4A4D5A' },
  filaTuParte: { fontSize: 11, color: '#6B6A66', fontStyle: 'italic' },
  filaDeuda:   { fontSize: 13, fontWeight: '600', color: AMBER },

  // Botón Pagó
  btnPago: {
    backgroundColor: '#162210',
    borderWidth: 1,
    borderColor: '#639922',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 4,
  },
  btnPagoTexto: {
    color: '#639922',
    fontSize: 14,
    fontWeight: '700',
  },

  // Confirmación en dos toques
  confirmRow: {
    marginTop: 4,
    gap: 10,
  },
  confirmTexto: {
    fontSize: 13,
    color: '#F1F0EC',
    textAlign: 'center',
  },
  confirmBotones: {
    flexDirection: 'row',
    gap: 10,
  },
  btnCancelar: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2A2D38',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  btnCancelarTexto: { color: '#6B6A66', fontSize: 14, fontWeight: '500' },
  btnConfirmar: {
    flex: 1,
    backgroundColor: '#162210',
    borderWidth: 1,
    borderColor: '#639922',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  btnConfirmarTexto: { color: '#639922', fontSize: 14, fontWeight: '700' },

  // Estado vacío
  vacio: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  vacioIcono:       { fontSize: 40, color: '#2A2D38', marginBottom: 4 },
  vacioTitulo:      { fontSize: 18, fontWeight: '700', color: '#F1F0EC' },
  vacioDescripcion: { fontSize: 14, color: '#4A4D5A', textAlign: 'center', lineHeight: 22 },

  textoError: { color: '#E24B4A', fontSize: 14, textAlign: 'center', paddingHorizontal: 24 },
});
