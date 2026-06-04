// app/(tabs)/proyeccion.tsx
// Pantalla Proyección — dos sub-vistas accesibles por toggle:
//
//   Proyección: resumen con las 3 preguntas clave + waterfall + fijos editables
//   ¿Y si?:     simulador interactivo con 3 pestañas (Sueldo / Gasto extra / Meta)
//
// Toda la carga de datos vive en useProyeccion.
// El simulador es estado local puro (useSimulador, sin BD).

import { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useProyeccion } from '../../hooks/useProyeccion';
import WaterfallProyeccion from '../../components/WaterfallProyeccion';
import GastosFijos from '../../components/GastosFijos';
import SimuladorYSi from '../../components/SimuladorYSi';

type SubVista = 'proyeccion' | 'simulador';

function fmt(n: number): string {
  return `$ ${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;
}

// ─── Toggle principal Proyección / ¿Y si? ────────────────────────────────────

function ToggleSubVista({ vista, onChange }: { vista: SubVista; onChange: (v: SubVista) => void }) {
  return (
    <View style={estilos.toggle}>
      {(['proyeccion', 'simulador'] as SubVista[]).map(v => (
        <TouchableOpacity
          key={v}
          style={[estilos.toggleOpcion, vista === v && estilos.toggleActivo]}
          onPress={() => onChange(v)}
          activeOpacity={0.8}
        >
          <Text style={[estilos.toggleTexto, vista === v && estilos.toggleTextoActivo]}>
            {v === 'proyeccion' ? 'Proyección' : '¿Y si?'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Las 3 preguntas clave ────────────────────────────────────────────────────

interface CardPreguntaProps {
  pregunta: string;
  respuesta: string;
  colorRespuesta: string;
  bgColor: string;
  borderColor: string;
}

function CardPregunta({ pregunta, respuesta, colorRespuesta, bgColor, borderColor }: CardPreguntaProps) {
  return (
    <View style={[estilos.cardPregunta, { backgroundColor: bgColor, borderColor }]}>
      <Text style={estilos.cardPreguntaTexto}>{pregunta}</Text>
      <Text style={[estilos.cardPreguntaRespuesta, { color: colorRespuesta }]}>
        {respuesta}
      </Text>
    </View>
  );
}

function TresPreguntas({
  paraAhorrar,
  alcanzaSueldo,
  puedeGastar,
  diasRestantesCiclo,
}: {
  paraAhorrar: number;
  alcanzaSueldo: boolean;
  puedeGastar: number;
  diasRestantesCiclo: number;
}) {
  const deficit = Math.abs(Math.min(0, paraAhorrar));

  return (
    <View style={estilos.tresPreguntas}>
      {/* P1 — ¿Cuánto me sobra para ahorrar? */}
      <CardPregunta
        pregunta="¿Cuánto me sobra para ahorrar?"
        respuesta={paraAhorrar >= 0 ? `+${fmt(paraAhorrar)}` : `−${fmt(deficit)}`}
        colorRespuesta={paraAhorrar >= 0 ? '#639922' : '#E24B4A'}
        bgColor={paraAhorrar >= 0 ? '#162210' : '#2D1515'}
        borderColor={paraAhorrar >= 0 ? '#639922' : '#E24B4A'}
      />

      {/* P2 — ¿Alcanza el sueldo? */}
      <CardPregunta
        pregunta="¿Alcanza el sueldo?"
        respuesta={alcanzaSueldo ? '✓ Sí' : `⚠ No, faltan ${fmt(deficit)}`}
        colorRespuesta={alcanzaSueldo ? '#639922' : '#E24B4A'}
        bgColor={alcanzaSueldo ? '#162210' : '#2D1515'}
        borderColor={alcanzaSueldo ? '#639922' : '#E24B4A'}
      />

      {/* P3 — ¿Cuánto puedo gastar hasta el cierre? */}
      <CardPregunta
        pregunta={`¿Puedo gastar más? · ${diasRestantesCiclo}d restantes`}
        respuesta={puedeGastar > 0 ? fmt(puedeGastar) : 'Sin margen'}
        colorRespuesta={puedeGastar > 0 ? '#378ADD' : '#E24B4A'}
        bgColor={puedeGastar > 0 ? '#0F1E33' : '#2D1515'}
        borderColor={puedeGastar > 0 ? '#378ADD' : '#E24B4A'}
      />
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function ProyeccionScreen() {
  const [vista, setVista] = useState<SubVista>('proyeccion');
  const { datos, loading, toggleFijo, editarMonto } = useProyeccion();

  return (
    <SafeAreaView style={estilos.fondo}>
      <ScrollView contentContainerStyle={estilos.contenido}>

        {/* Header */}
        <View style={estilos.header}>
          <Text style={estilos.headerTitulo}>Proyección</Text>
          <Text style={estilos.headerSubtitulo}>ciclo actual</Text>
        </View>

        {/* Toggle principal */}
        <ToggleSubVista vista={vista} onChange={setVista} />

        {loading ? (
          <View style={estilos.centrado}>
            <ActivityIndicator color="#378ADD" />
          </View>
        ) : (
          <>
            {/* Aviso si no hay sueldo configurado */}
            {datos.sueldoEstimado === 0 && (
              <View style={[estilos.alerta, { backgroundColor: '#2A1E08', borderColor: '#EF9F27' }]}>
                <Text style={[estilos.alertaTexto, { color: '#EF9F27' }]}>
                  ⚠ Configura tu sueldo estimado en Ajustes para ver la proyección completa.
                </Text>
              </View>
            )}

            {vista === 'proyeccion' ? (
              <>
                {/* Las 3 preguntas */}
                <TresPreguntas
                  paraAhorrar={datos.paraAhorrar}
                  alcanzaSueldo={datos.alcanzaSueldo}
                  puedeGastar={datos.puedeGastar}
                  diasRestantesCiclo={datos.diasRestantesCiclo}
                />

                {/* Waterfall del ciclo */}
                <View style={estilos.tarjeta}>
                  <Text style={estilos.tituloSeccion}>Desglose del ciclo</Text>
                  <WaterfallProyeccion
                    sueldoEstimado={datos.sueldoEstimado}
                    tcCiclo={datos.tcCiclo}
                    fijosTotal={datos.fijosTotal}
                    paraAhorrar={datos.paraAhorrar}
                  />
                </View>

                {/* Gastos fijos editables */}
                <View style={estilos.tarjeta}>
                  <GastosFijos
                    fijos={datos.fijos}
                    onToggle={toggleFijo}
                    onEditarMonto={editarMonto}
                  />
                </View>
              </>
            ) : (
              /* Simulador ¿y si? */
              <View style={estilos.tarjeta}>
                <Text style={estilos.tituloSeccion}>Simulador ¿y si?</Text>
                <SimuladorYSi
                  sueldoBase={datos.sueldoEstimado}
                  tcCiclo={datos.tcCiclo}
                  fijosTotal={datos.fijosTotal}
                />
              </View>
            )}
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Estilos — modo oscuro ────────────────────────────────────────────────────

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: '#0F1117' },
  contenido: { padding: 16, paddingBottom: 40 },
  centrado: { paddingVertical: 40, alignItems: 'center' },

  // Header
  header: {
    marginBottom: 20,
  },
  headerTitulo: {
    color: '#F1F0EC',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  headerSubtitulo: {
    color: '#4A4D5A',
    fontSize: 13,
    marginTop: 3,
  },

  // Toggle principal
  toggle: {
    flexDirection: 'row',
    backgroundColor: '#181B24',
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  toggleOpcion: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleActivo: { backgroundColor: '#2A2D38' },
  toggleTexto: { fontSize: 14, fontWeight: '500', color: '#4A4D5A' },
  toggleTextoActivo: { color: '#F1F0EC' },

  // Alerta (sueldo no configurado, etc.)
  alerta: {
    borderWidth: 0.5,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  alertaTexto: { fontSize: 13, fontWeight: '500' },

  // Cards de preguntas
  tresPreguntas: {
    gap: 8,
    marginBottom: 16,
  },
  cardPregunta: {
    borderWidth: 0.5,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  cardPreguntaTexto: {
    fontSize: 12,
    color: '#6B6A66',
    fontWeight: '500',
  },
  cardPreguntaRespuesta: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.5,
  },

  // Tarjeta de sección
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
});
