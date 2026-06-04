// components/WaterfallProyeccion.tsx
// Visualización tipo cascada del presupuesto del ciclo.
// Cada fila muestra su signo y color para leer el flujo de un vistazo.

import { View, Text, StyleSheet } from 'react-native';

interface Props {
  sueldoEstimado: number;
  tcCiclo: number;
  fijosTotal: number;
  paraAhorrar: number;
}

function fmt(n: number): string {
  return `$ ${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;
}

// ─── Fila individual del waterfall ───────────────────────────────────────────

interface FilaProps {
  label: string;
  signo: string;
  monto: number;
  colorMonto: string;
  esResultado?: boolean;
}

function FilaWaterfall({ label, signo, monto, colorMonto, esResultado = false }: FilaProps) {
  return (
    <View style={[estilos.fila, esResultado && estilos.filaResultado]}>
      <Text style={[estilos.label, esResultado && estilos.labelResultado]}>
        {label}
      </Text>
      <Text style={[estilos.monto, { color: colorMonto }, esResultado && estilos.montoResultado]}>
        {signo}{fmt(monto)}
      </Text>
    </View>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function WaterfallProyeccion({ sueldoEstimado, tcCiclo, fijosTotal, paraAhorrar }: Props) {
  const colorResultado = paraAhorrar >= 0 ? '#639922' : '#E24B4A';
  const signoResultado = paraAhorrar >= 0 ? '+' : '−';

  return (
    <View>
      <FilaWaterfall
        label="Sueldo estimado"
        signo="+"
        monto={sueldoEstimado}
        colorMonto="#639922"
      />
      <FilaWaterfall
        label="TC del ciclo actual"
        signo="−"
        monto={tcCiclo}
        colorMonto="#E24B4A"
      />
      <FilaWaterfall
        label="Fijos proyectados"
        signo="−"
        monto={fijosTotal}
        colorMonto="#EF9F27"
      />
      <View style={estilos.divisor} />
      <FilaWaterfall
        label="Para ahorrar"
        signo={signoResultado}
        monto={Math.abs(paraAhorrar)}
        colorMonto={colorResultado}
        esResultado
      />
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const estilos = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2A2D38',
  },
  filaResultado: {
    paddingTop: 12,
    borderBottomWidth: 0,
  },
  label: {
    fontSize: 14,
    color: '#6B6A66',
  },
  labelResultado: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F1F0EC',
  },
  monto: {
    fontSize: 14,
    fontWeight: '500',
  },
  montoResultado: {
    fontSize: 20,
    fontWeight: '700',
  },
  divisor: {
    height: 1,
    backgroundColor: '#2A2D38',
    marginVertical: 6,
  },
});
