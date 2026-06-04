// components/GastosFijos.tsx
// Lista editable de gastos fijos detectados automáticamente.
// El usuario puede activar/desactivar cada fijo y editar su monto tocándolo.

import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Switch, StyleSheet,
} from 'react-native';
import type { GastoFijo } from '../hooks/useProyeccion';

interface Props {
  fijos: GastoFijo[];
  onToggle: (id: string, incluido: boolean) => void;
  onEditarMonto: (id: string, monto: number) => void;
}

function fmt(n: number): string {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`;
}

// ─── Fila de un gasto fijo ────────────────────────────────────────────────────

function FilaFijo({
  fijo,
  onToggle,
  onEditarMonto,
}: {
  fijo: GastoFijo;
  onToggle: (incluido: boolean) => void;
  onEditarMonto: (monto: number) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [textoBorrador, setTextoBorrador] = useState(String(fijo.montoEditado));

  function confirmarEdicion() {
    const numero = parseInt(textoBorrador.replace(/\D/g, ''), 10);
    if (!isNaN(numero) && numero > 0) {
      onEditarMonto(numero);
    } else {
      // Revertir al monto actual si el input es inválido
      setTextoBorrador(String(fijo.montoEditado));
    }
    setEditando(false);
  }

  // Color del badge según cuántos ciclos se detectó (3/3 = verde, 2/3 = ámbar)
  const colorBadge = fijo.ciclosDetectados === 3 ? '#639922' : '#EF9F27';

  return (
    <View style={[estilos.fila, !fijo.incluido && estilos.filaApagada]}>

      {/* Badge con ciclos detectados */}
      <View style={[estilos.badge, { borderColor: colorBadge }]}>
        <Text style={[estilos.badgeTexto, { color: colorBadge }]}>
          {fijo.ciclosDetectados}/3
        </Text>
      </View>

      {/* Nombre del gasto */}
      <Text
        style={[estilos.nota, !fijo.incluido && estilos.notaApagada]}
        numberOfLines={1}
      >
        {fijo.note}
      </Text>

      {/* Monto — toca para editar inline */}
      <TouchableOpacity
        onPress={() => {
          if (!fijo.incluido) return;
          setTextoBorrador(String(fijo.montoEditado));
          setEditando(true);
        }}
        disabled={!fijo.incluido}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {editando ? (
          <TextInput
            style={estilos.inputMonto}
            value={textoBorrador}
            onChangeText={setTextoBorrador}
            onBlur={confirmarEdicion}
            onSubmitEditing={confirmarEdicion}
            keyboardType="numeric"
            autoFocus
            selectTextOnFocus
          />
        ) : (
          <Text style={[estilos.monto, !fijo.incluido && estilos.montoApagado]}>
            {fmt(fijo.montoEditado)}
          </Text>
        )}
      </TouchableOpacity>

      {/* Toggle de inclusión */}
      <Switch
        value={fijo.incluido}
        onValueChange={onToggle}
        trackColor={{ false: '#2A2D38', true: '#1E3A12' }}
        thumbColor={fijo.incluido ? '#639922' : '#4A4D5A'}
        ios_backgroundColor="#2A2D38"
        style={estilos.switch}
      />
    </View>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function GastosFijos({ fijos, onToggle, onEditarMonto }: Props) {
  if (fijos.length === 0) {
    return (
      <Text style={estilos.vacio}>
        Sin gastos fijos detectados en los últimos 3 ciclos.{'\n'}
        Necesitas transacciones recurrentes con la misma descripción.
      </Text>
    );
  }

  const totalIncluido = fijos
    .filter(f => f.incluido)
    .reduce((s, f) => s + f.montoEditado, 0);

  return (
    <View>
      {/* Encabezado con conteo y total */}
      <View style={estilos.encabezado}>
        <Text style={estilos.encabezadoTitulo}>Gastos fijos detectados</Text>
        <Text style={estilos.encabezadoSub}>
          {fijos.filter(f => f.incluido).length}/{fijos.length} incluidos · {fmt(totalIncluido)} proyectados
        </Text>
      </View>

      {/* Leyenda de columnas */}
      <View style={estilos.leyenda}>
        <Text style={estilos.leyendaTexto}>Toca el monto para editar</Text>
      </View>

      {/* Filas */}
      {fijos.map(fijo => (
        <FilaFijo
          key={fijo.id}
          fijo={fijo}
          onToggle={(incluido) => onToggle(fijo.id, incluido)}
          onEditarMonto={(monto) => onEditarMonto(fijo.id, monto)}
        />
      ))}
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const estilos = StyleSheet.create({
  encabezado: {
    marginBottom: 12,
    gap: 3,
  },
  encabezadoTitulo: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F1F0EC',
  },
  encabezadoSub: {
    fontSize: 12,
    color: '#4A4D5A',
  },
  leyenda: {
    marginBottom: 6,
  },
  leyendaTexto: {
    fontSize: 11,
    color: '#4A4D5A',
    fontStyle: 'italic',
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2A2D38',
  },
  filaApagada: {
    opacity: 0.45,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    minWidth: 34,
    alignItems: 'center',
  },
  badgeTexto: {
    fontSize: 10,
    fontWeight: '700',
  },
  nota: {
    flex: 1,
    fontSize: 13,
    color: '#F1F0EC',
  },
  notaApagada: {
    color: '#4A4D5A',
  },
  monto: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF9F27',
    minWidth: 95,
    textAlign: 'right',
  },
  montoApagado: {
    color: '#4A4D5A',
  },
  inputMonto: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF9F27',
    backgroundColor: '#2A2D38',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 95,
    textAlign: 'right',
  },
  switch: {
    transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }],
  },
  vacio: {
    fontSize: 13,
    color: '#4A4D5A',
    textAlign: 'center',
    lineHeight: 20,
    paddingVertical: 12,
  },
});
