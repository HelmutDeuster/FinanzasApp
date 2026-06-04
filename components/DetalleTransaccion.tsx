// components/DetalleTransaccion.tsx
// Modal que sube desde abajo al tocar una transacción.
// Permite asignar el gasto a tres modos: solo mío, split o 100% de otro.

import {
  View, Text, Modal, TouchableOpacity, TextInput,
  StyleSheet, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Dimensions,
} from 'react-native';
import { useSplit } from '../hooks/useSplit';
import type { TransaccionDetalle } from '../hooks/useDetalleTarjeta';
import type { SplitOwner, SplitModo } from '../types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  transaccion: TransaccionDetalle | null;
  visible: boolean;
  onCerrar: () => void;
  onGuardado: () => void;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `$ ${Math.round(Math.abs(n)).toLocaleString('es-CL')}`;
}

const ALTURA_MAX = Dimensions.get('window').height * 0.85;

// ─── Componente ───────────────────────────────────────────────────────────────

export function DetalleTransaccion({ transaccion, visible, onCerrar, onGuardado }: Props) {
  const split = useSplit({
    transaccion,
    // Al guardar: cerramos el modal y avisamos a la lista para que recargue
    onGuardado: () => { onGuardado(); onCerrar(); },
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCerrar}
    >
      {/* Fondo oscuro — tocar cierra el modal */}
      <View style={estilos.contenedor}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCerrar} />

        {/* Hoja que sube desde abajo */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={estilos.hoja}
        >
          {/* Pastilla de arrastre visual */}
          <View style={estilos.handle} />

          {/* ── Header: nombre y monto de la transacción ── */}
          <View style={estilos.header}>
            <Text style={estilos.txNota} numberOfLines={2}>{transaccion?.note ?? '—'}</Text>
            <Text style={estilos.txMonto}>{fmt(transaccion?.amount ?? 0)}</Text>
          </View>

          {/* ── Selector de modo ── */}
          <View style={estilos.botonesModo}>
            {(['me', 'split', 'other'] as SplitOwner[]).map(o => (
              <TouchableOpacity
                key={o}
                style={[estilos.botonModo, split.owner === o && estilos.botonModoActivo]}
                onPress={() => split.setOwner(o)}
              >
                <Text style={[
                  estilos.botonModoTexto,
                  split.owner === o && estilos.botonModoTextoActivo,
                ]}>
                  {o === 'me' ? 'Solo mío' : o === 'split' ? 'Split' : '100% de otro'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Contenido scrolleable según modo ── */}
          <ScrollView
            style={estilos.cuerpo}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            {/* Campo de nombre — aparece en modo split y other */}
            {split.owner !== 'me' && (
              <View style={estilos.campo}>
                <Text style={estilos.label}>Nombre de la persona</Text>
                <TextInput
                  style={estilos.input}
                  placeholder="Ej: María"
                  placeholderTextColor="#4A4D5A"
                  value={split.nombre}
                  onChangeText={split.setNombre}
                  autoCapitalize="words"
                  returnKeyType="done"
                />
              </View>
            )}

            {/* ─ Modo SPLIT: selector de cálculo + cálculo en tiempo real ─ */}
            {split.owner === 'split' && (
              <>
                {/* Toggle Porcentaje / Monto fijo */}
                <ToggleModo modo={split.modo} onChange={split.setModo} />

                {split.modo === 'porcentaje' ? (
                  <BotonesRapidos valor={split.porcentaje} onChange={split.setPorcentaje} />
                ) : (
                  <View style={estilos.campo}>
                    <Text style={estilos.label}>Tu parte ($)</Text>
                    <TextInput
                      style={estilos.input}
                      placeholder="0"
                      placeholderTextColor="#4A4D5A"
                      value={split.montoFijo}
                      onChangeText={split.setMontoFijo}
                      keyboardType="numeric"
                      returnKeyType="done"
                    />
                  </View>
                )}

                {/* Resumen en tiempo real */}
                <Resumen
                  tuParte={split.tuParte}
                  teDebeMonto={split.teDebeMonto}
                  nombre={split.nombre}
                />
              </>
            )}

            {/* ─ Modo OTHER: aviso de exclusión ─ */}
            {split.owner === 'other' && split.nombre.trim().length > 0 && (
              <View style={estilos.avisoOther}>
                <Text style={estilos.avisoOtherTexto}>
                  Este gasto se excluirá de tu total.
                  {'\n'}{split.nombre} lo pagó completo.
                </Text>
              </View>
            )}

            {split.error && (
              <Text style={estilos.textoError}>{split.error}</Text>
            )}

            {/* Espacio para que el botón guardar no tape contenido */}
            <View style={{ height: 16 }} />
          </ScrollView>

          {/* ── Botón guardar (fijo en la parte inferior) ── */}
          <View style={estilos.footer}>
            <TouchableOpacity
              style={[
                estilos.btnGuardar,
                !split.puedeGuardar && estilos.btnGuardarDeshabilitado,
              ]}
              onPress={split.guardar}
              disabled={!split.puedeGuardar || split.guardando}
            >
              {split.guardando
                ? <ActivityIndicator color="#0F1117" />
                : <Text style={estilos.btnGuardarTexto}>Guardar</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function ToggleModo({ modo, onChange }: { modo: SplitModo; onChange: (m: SplitModo) => void }) {
  return (
    <View style={estilos.toggleContenedor}>
      {(['porcentaje', 'monto'] as SplitModo[]).map(m => (
        <TouchableOpacity
          key={m}
          style={[estilos.toggleBtn, modo === m && estilos.toggleBtnActivo]}
          onPress={() => onChange(m)}
        >
          <Text style={[estilos.toggleTexto, modo === m && estilos.toggleTextoActivo]}>
            {m === 'porcentaje' ? 'Porcentaje' : 'Monto fijo'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const PORCENTAJES = [25, 33, 50, 67, 75] as const;

function BotonesRapidos({ valor, onChange }: { valor: number; onChange: (p: number) => void }) {
  return (
    <View style={estilos.botonesRapidos}>
      {PORCENTAJES.map(p => (
        <TouchableOpacity
          key={p}
          style={[estilos.btnRapido, valor === p && estilos.btnRapidoActivo]}
          onPress={() => onChange(p)}
        >
          <Text style={[estilos.btnRapidoTexto, valor === p && estilos.btnRapidoTextoActivo]}>
            {p}%
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function Resumen({ tuParte, teDebeMonto, nombre }: {
  tuParte: number;
  teDebeMonto: number;
  nombre: string;
}) {
  const etiqueta = nombre.trim() || 'La otra persona';
  return (
    <View style={estilos.resumen}>
      <View style={estilos.resumenFila}>
        <Text style={estilos.resumenLabel}>Tu parte</Text>
        <Text style={estilos.resumenMonto}>{fmt(tuParte)}</Text>
      </View>
      <View style={estilos.resumenDivisor} />
      <View style={estilos.resumenFila}>
        <Text style={estilos.resumenLabel}>{etiqueta} te debe</Text>
        <Text style={[estilos.resumenMonto, estilos.resumenDeuda]}>{fmt(teDebeMonto)}</Text>
      </View>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const estilos = StyleSheet.create({
  // Capa transparente sobre toda la pantalla
  contenedor: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },

  // La hoja blanca que sube desde abajo
  hoja: {
    backgroundColor: '#181B24',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 0.5,
    borderColor: '#2A2D38',
    maxHeight: ALTURA_MAX,
  },

  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#2A2D38',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2A2D38',
    gap: 12,
  },
  txNota:  { flex: 1, fontSize: 15, fontWeight: '600', color: '#F1F0EC', lineHeight: 20 },
  txMonto: { fontSize: 15, fontWeight: '700', color: '#E24B4A' },

  // Selector de modo (Solo mío / Split / 100% de otro)
  botonesModo: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 8,
  },
  botonModo: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2D38',
    alignItems: 'center',
  },
  botonModoActivo:      { backgroundColor: '#1A2535', borderColor: '#378ADD' },
  botonModoTexto:       { fontSize: 12, fontWeight: '500', color: '#6B6A66' },
  botonModoTextoActivo: { color: '#378ADD' },

  // Contenido scrolleable
  cuerpo: { paddingHorizontal: 20 },

  // Campo de texto genérico
  campo: { marginBottom: 16 },
  label: { fontSize: 11, fontWeight: '600', color: '#6B6A66', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  input: {
    backgroundColor: '#0F1117',
    borderWidth: 1,
    borderColor: '#2A2D38',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#F1F0EC',
  },

  // Toggle porcentaje / monto
  toggleContenedor: {
    flexDirection: 'row',
    backgroundColor: '#0F1117',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2D38',
    marginBottom: 16,
    overflow: 'hidden',
  },
  toggleBtn:           { flex: 1, paddingVertical: 9, alignItems: 'center' },
  toggleBtnActivo:     { backgroundColor: '#1A2535' },
  toggleTexto:         { fontSize: 13, fontWeight: '500', color: '#6B6A66' },
  toggleTextoActivo:   { color: '#378ADD' },

  // Botones rápidos de porcentaje
  botonesRapidos: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  btnRapido: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2D38',
    alignItems: 'center',
  },
  btnRapidoActivo:      { backgroundColor: '#1A2535', borderColor: '#378ADD' },
  btnRapidoTexto:       { fontSize: 13, fontWeight: '600', color: '#6B6A66' },
  btnRapidoTextoActivo: { color: '#378ADD' },

  // Resumen de cálculo en tiempo real
  resumen: {
    backgroundColor: '#0F1117',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A2D38',
    padding: 16,
    marginBottom: 8,
  },
  resumenFila:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  resumenLabel:   { fontSize: 13, color: '#6B6A66' },
  resumenMonto:   { fontSize: 15, fontWeight: '700', color: '#F1F0EC' },
  resumenDeuda:   { color: '#378ADD' },
  resumenDivisor: { height: 0.5, backgroundColor: '#2A2D38', marginVertical: 4 },

  // Aviso modo "other"
  avisoOther: {
    backgroundColor: '#2D1515',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#3D1515',
  },
  avisoOtherTexto: { fontSize: 13, color: '#E24B4A', lineHeight: 20 },

  textoError: { color: '#E24B4A', fontSize: 13, marginBottom: 8 },

  // Botón guardar
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 32 : 20 },
  btnGuardar: {
    backgroundColor: '#378ADD',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  btnGuardarDeshabilitado: { backgroundColor: '#1A2535' },
  btnGuardarTexto: { color: '#F1F0EC', fontSize: 15, fontWeight: '700' },
});
