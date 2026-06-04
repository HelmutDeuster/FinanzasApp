// components/BarraCiclo.tsx
// Barra temporal que visualiza el avance del ciclo de facturación.
//
// Diseño:
//   "24 may"  [████████░░░░░░░░░░]  "23 jun"
//              ^ progreso (%)
//
// La parte sólida (azul) = días transcurridos.
// La parte vacía (gris)  = días restantes.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { progresoCiclo, diasRestantes, formatearRangoCiclo } from '../lib/cycleUtils';

interface Props {
  start: Date;
  end: Date;
  // Color de la barra — se puede sobreescribir para variantes oscuras
  colorBarra?: string;
}

export default function BarraCiclo({ start, end, colorBarra = '#3B82F6' }: Props) {
  const pct = progresoCiclo(start, end);
  const diasLeft = diasRestantes(end);
  const label = formatearRangoCiclo(start, end);

  return (
    <View style={estilos.contenedor}>

      {/* Etiqueta del rango completo */}
      <View style={estilos.filaEtiquetas}>
        <Text style={estilos.etiquetaFecha}>{label.split(' → ')[0]}</Text>
        <Text style={estilos.etiquetaDias}>
          {diasLeft === 0 ? 'Hoy cierra' : `${diasLeft} días restantes`}
        </Text>
        <Text style={estilos.etiquetaFecha}>{label.split(' → ')[1]}</Text>
      </View>

      {/* Barra de progreso */}
      <View style={estilos.barraFondo}>
        <View
          style={[
            estilos.barraRelleno,
            { width: `${pct}%` as `${number}%`, backgroundColor: colorBarra },
          ]}
        />
        {/* Marcador "Hoy" — circulo al final del relleno */}
        {pct > 0 && pct < 100 && (
          <View
            style={[
              estilos.marcadorHoy,
              { left: `${pct}%` as `${number}%`, backgroundColor: colorBarra },
            ]}
          />
        )}
      </View>

      {/* Porcentaje del ciclo transcurrido */}
      <Text style={estilos.pct}>{pct}% del ciclo</Text>

    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    gap: 6,
  },
  filaEtiquetas: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  etiquetaFecha: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  etiquetaDias: {
    fontSize: 11,
    color: '#6B7280',
  },
  barraFondo: {
    height: 4,
    backgroundColor: '#2A2D38',
    borderRadius: 2,
    overflow: 'visible',
    position: 'relative',
  },
  barraRelleno: {
    height: '100%',
    borderRadius: 2,
  },
  marcadorHoy: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    top: -3,
    marginLeft: -5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  pct: {
    fontSize: 10,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
