// components/GraficoBarrasMes.tsx
// Gráfico de barras mensual — react-native-svg puro (web + nativo).
//
// Layout: 7 barras, mes actual al centro (idx 3 de 0..6)
//   [−3] [−2] [−1] [ HOY ] [+1] [+2] [+3]
//
// Barra actual: color sólido + indicador puntual abajo
// Barras pasadas/futuras: 70 % de opacidad
// Encima de cada barra: monto abreviado siempre visible
// Etiqueta de mes: incluye año abreviado cuando cambia (ej. "ene '27")

import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Text as SvgText, G, Circle } from 'react-native-svg';
import type { GastoMes } from '../hooks/useGastoMensualTarjeta';

export type { GastoMes };

// ─── Layout interno del canvas ────────────────────────────────────────────────
const PAD_X    = 6;   // margen lateral
const PAD_TOP  = 22;  // espacio para monto encima de barra
const PAD_BOT  = 20;  // espacio para etiqueta de mes

interface Props {
  datos:       GastoMes[];
  colorBarra?: string;
  altura?:     number;
  titulo?:     string;
}

// ─── Formato de montos ────────────────────────────────────────────────────────
// Formato completo con separador de miles (chileno: punto como separador)
// Se mantiene M para millones para que no desborde el espacio disponible en la barra
function abr(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return Math.round(n).toLocaleString('es-CL');
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function GraficoBarrasMes({
  datos,
  colorBarra = '#378ADD',
  altura     = 170,
  titulo,
}: Props) {
  const [svgW, setSvgW] = useState(320);

  if (datos.length === 0) {
    return (
      <View style={estilos.contenedor}>
        {titulo && <Text style={estilos.titulo}>{titulo}</Text>}
        <View style={[estilos.vacio, { height: altura }]}>
          <Text style={estilos.textoVacio}>Sin datos históricos</Text>
        </View>
      </View>
    );
  }

  // El máximo se calcula solo sobre barras con datos para que las futuras
  // (monto 0) no aplanen visualmente todo el gráfico
  const montosConDatos = datos.map(d => d.monto).filter(m => m > 0);
  const maxMonto       = montosConDatos.length > 0 ? Math.max(...montosConDatos) : 1;

  const barAreaH = altura - PAD_TOP - PAD_BOT;
  const n        = datos.length;
  const slotW    = (svgW - PAD_X * 2) / n;
  const barW     = slotW * 0.52;
  const barGap   = (slotW - barW) / 2;

  return (
    <View style={estilos.contenedor}>
      {titulo && <Text style={estilos.titulo}>{titulo}</Text>}

      <View onLayout={e => setSvgW(e.nativeEvent.layout.width)}>
        <Svg width={svgW} height={altura}>
          {datos.map((d, i) => {
            const xSlot = PAD_X + i * slotW;
            const xBar  = xSlot + barGap;
            const xC    = xSlot + slotW / 2;

            // Altura mínima 3px para barras con monto 0 (indica mes sin datos)
            const bH   = d.monto > 0 ? Math.max(4, (d.monto / maxMonto) * barAreaH) : 3;
            const yBar = PAD_TOP + (barAreaH - bH);

            // Barra actual: opacidad total; pasadas: 0.65; futuras: 0.25
            const opacity = d.esCurrent ? 1 : (d.monto > 0 ? 0.65 : 0.25);
            // Color: actual levemente más claro para destacar
            const fill = d.monto === 0 ? '#2A2D38' : colorBarra;

            // Barras proyectadas (cuotas futuras) van con opacidad reducida
            const esProyectado = !!d.esProyectado;
            const opacidadBarra = d.esCurrent ? 1 : esProyectado ? 0.4 : (d.monto > 0 ? 0.65 : 0.25);
            // Color de proyección levemente diferente para distinguir de datos reales
            const fillEfectivo = esProyectado ? '#F5A623' : fill;

            return (
              <G key={d.idx}>
                {/* Barra */}
                <Rect
                  x={xBar} y={yBar}
                  width={barW} height={bH}
                  rx={3} ry={3}
                  fill={fillEfectivo}
                  opacity={opacidadBarra}
                />

                {/* Monto encima */}
                {d.monto > 0 && (
                  <SvgText
                    x={xC} y={yBar - 5}
                    fontSize={10}
                    fontWeight={d.esCurrent ? '700' : '500'}
                    fill={d.esCurrent ? '#F1F0EC' : esProyectado ? '#F5A623' : '#6B6A66'}
                    textAnchor="middle"
                  >
                    {esProyectado ? `~${abr(d.monto)}` : abr(d.monto)}
                  </SvgText>
                )}

                {/* Etiqueta de mes */}
                <SvgText
                  x={xC} y={altura - 6}
                  fontSize={9}
                  fontWeight={d.esCurrent ? '700' : '400'}
                  fill={d.esCurrent ? '#F1F0EC' : esProyectado ? '#6B6A66' : '#6B6A66'}
                  textAnchor="middle"
                >
                  {d.label}
                </SvgText>

                {/* Punto indicador bajo mes actual */}
                {d.esCurrent && (
                  <Circle
                    cx={xC}
                    cy={altura - PAD_BOT + 6}
                    r={2.5}
                    fill={colorBarra}
                  />
                )}
              </G>
            );
          })}
        </Svg>
      </View>

      {/* Total del mes actual como referencia rápida */}
      {(() => {
        const actual = datos.find(d => d.esCurrent);
        if (!actual || actual.monto === 0) return null;
        return (
          <Text style={estilos.labelActual}>
            Este mes: <Text style={estilos.labelActualMonto}>${actual.monto.toLocaleString('es-CL')}</Text>
          </Text>
        );
      })()}
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const estilos = StyleSheet.create({
  contenedor: { gap: 0 },
  titulo: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B6A66',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  vacio: { justifyContent: 'center', alignItems: 'center' },
  textoVacio: { fontSize: 13, color: '#4A4D5A' },
  labelActual: {
    fontSize: 11,
    color: '#4A4D5A',
    textAlign: 'right',
    marginTop: 4,
    paddingRight: 2,
  },
  labelActualMonto: {
    color: '#F1F0EC',
    fontWeight: '600',
  },
});
