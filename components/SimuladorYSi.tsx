// components/SimuladorYSi.tsx
// Simulador "¿y si?" con tres pestañas internas: Sueldo, Gasto extra, Meta ahorro.
// Ajusta variables en tiempo real para ver el impacto en la proyección.
// No hace llamadas a BD — toda la lógica vive en useSimulador.

import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useSimulador } from '../hooks/useSimulador';
import type { TabSimulador } from '../hooks/useSimulador';

interface Props {
  sueldoBase: number;
  tcCiclo: number;
  fijosTotal: number;
}

function fmt(n: number): string {
  return `$ ${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;
}

// ─── Input numérico compartido por los tres tabs ──────────────────────────────
//
// Mantiene un borrador de texto local para no interrumpir al usuario mientras
// escribe. La sincronización con el valor externo (valor) solo ocurre cuando
// el campo NO está enfocado — así un preset toca el campo sin cortar el tipeo.
//
// Flujo:
//   Preset pulsado  → valor prop cambia → useEffect actualiza texto (no enfocado)
//   Usuario escribe → handleChangeText  → actualiza texto + llama onChange si válido
//   Usuario sale    → handleBlur        → valida, confirma o revierte

interface InputNumericoProps {
  valor: number;
  onChange: (n: number) => void;
  label: string;
}

function InputNumerico({ valor, onChange, label }: InputNumericoProps) {
  const [texto, setTexto] = useState(valor > 0 ? String(valor) : '');
  const [enfocado, setEnfocado] = useState(false);

  // Sincronizar desde el valor externo cuando el campo no está activo
  useEffect(() => {
    if (!enfocado) {
      setTexto(valor > 0 ? String(valor) : '');
    }
  }, [valor, enfocado]);

  function handleChangeText(t: string) {
    // Solo dígitos — el usuario no necesita escribir $ ni puntos
    const soloDigitos = t.replace(/\D/g, '');
    setTexto(soloDigitos);
    const n = parseInt(soloDigitos, 10);
    if (!isNaN(n) && n > 0) onChange(n);
  }

  function handleBlur() {
    setEnfocado(false);
    const n = parseInt(texto.replace(/\D/g, ''), 10);
    if (!isNaN(n) && n > 0) {
      onChange(n);
      setTexto(String(n));
    } else {
      // Input inválido o vacío → revertir al valor actual
      setTexto(valor > 0 ? String(valor) : '');
    }
  }

  return (
    <View style={estilos.inputContenedor}>
      <Text style={estilos.inputLabel}>{label}</Text>
      <TextInput
        style={[estilos.inputNumerico, enfocado && estilos.inputNumericoEnfocado]}
        value={texto}
        onChangeText={handleChangeText}
        onFocus={() => setEnfocado(true)}
        onBlur={handleBlur}
        keyboardType="numeric"
        placeholder="Escribe el monto exacto"
        placeholderTextColor="#4A4D5A"
        returnKeyType="done"
      />
    </View>
  );
}

// ─── Toggle de pestañas ───────────────────────────────────────────────────────

const TABS: { id: TabSimulador; label: string }[] = [
  { id: 'sueldo',      label: 'Sueldo' },
  { id: 'gasto_extra', label: 'Gasto extra' },
  { id: 'meta_ahorro', label: 'Meta ahorro' },
];

function ToggleTabs({ tab, onChange }: { tab: TabSimulador; onChange: (t: TabSimulador) => void }) {
  return (
    <View style={estilos.tabsContenedor}>
      {TABS.map(t => (
        <TouchableOpacity
          key={t.id}
          style={[estilos.tabOpcion, tab === t.id && estilos.tabActivo]}
          onPress={() => onChange(t.id)}
          activeOpacity={0.8}
        >
          <Text style={[estilos.tabTexto, tab === t.id && estilos.tabTextoActivo]}>
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Card de resultado (visible en los tres tabs) ─────────────────────────────

function CardResultado({
  disponible,
  sueldoSim,
  tcCiclo,
  fijosTotal,
  gastoExtra,
  tab,
}: {
  disponible: number;
  sueldoSim: number;
  tcCiclo: number;
  fijosTotal: number;
  gastoExtra: number;
  tab: TabSimulador;
}) {
  const positivo = disponible >= 0;
  const bgColor = positivo ? '#162210' : '#2D1515';
  const borderColor = positivo ? '#639922' : '#E24B4A';
  const colorTexto = positivo ? '#639922' : '#E24B4A';
  const signo = positivo ? '+' : '−';

  // La fórmula que se muestra debajo del resultado cambia por tab
  const parteGasto = tab === 'gasto_extra' ? ` − ${fmt(gastoExtra)}` : '';
  const formula = `${fmt(sueldoSim)} − ${fmt(tcCiclo)} − ${fmt(fijosTotal)}${parteGasto}`;

  return (
    <View style={[estilos.cardResultado, { backgroundColor: bgColor, borderColor }]}>
      <Text style={[estilos.cardResultadoLabel, { color: colorTexto }]}>
        {positivo ? '✓ Para ahorrar' : '⚠ Déficit'}
      </Text>
      <Text style={[estilos.cardResultadoMonto, { color: colorTexto }]}>
        {signo} {fmt(disponible)}
      </Text>
      <Text style={estilos.cardFormula}>{formula}</Text>
    </View>
  );
}

// ─── Tab Sueldo ───────────────────────────────────────────────────────────────

function TabSueldo({
  sueldo,
  sueldoBase,
  setSueldo,
}: {
  sueldo: number;
  sueldoBase: number;
  setSueldo: (v: number) => void;
}) {
  const PASO = 50_000;
  const MAXIMO = Math.max(sueldoBase * 3, 5_000_000);
  const presets = [500_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000];

  return (
    <View style={estilos.tabContenido}>
      <Text style={estilos.tabDescripcion}>
        Ajusta el sueldo para ver cómo cambia tu proyección.
      </Text>

      {/* Control principal +/− */}
      <View style={estilos.controlFila}>
        <TouchableOpacity
          style={estilos.btnAjuste}
          onPress={() => setSueldo(Math.max(0, sueldo - PASO))}
        >
          <Text style={estilos.btnAjusteTexto}>−</Text>
        </TouchableOpacity>

        <View style={estilos.valorCentral}>
          <Text style={estilos.valorLabel}>Sueldo simulado</Text>
          <Text style={estilos.valorMonto}>{fmt(sueldo)}</Text>
        </View>

        <TouchableOpacity
          style={estilos.btnAjuste}
          onPress={() => setSueldo(Math.min(MAXIMO, sueldo + PASO))}
        >
          <Text style={estilos.btnAjusteTexto}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Presets de valores comunes */}
      <View style={estilos.presetsGrid}>
        {presets.map(v => (
          <TouchableOpacity
            key={v}
            style={[estilos.btnPreset, sueldo === v && estilos.btnPresetActivo]}
            onPress={() => setSueldo(v)}
          >
            <Text style={[estilos.btnPresetTexto, sueldo === v && estilos.btnPresetTextoActivo]}>
              {v >= 1_000_000 ? `$${v / 1_000_000}M` : `$${v / 1_000}K`}
            </Text>
          </TouchableOpacity>
        ))}
        {sueldoBase > 0 && (
          <TouchableOpacity
            style={[estilos.btnPreset, sueldo === sueldoBase && estilos.btnPresetActivo]}
            onPress={() => setSueldo(sueldoBase)}
          >
            <Text style={[estilos.btnPresetTexto, sueldo === sueldoBase && estilos.btnPresetTextoActivo]}>
              Actual
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Ingreso exacto */}
      <InputNumerico
        valor={sueldo}
        onChange={setSueldo}
        label="O escribe el monto exacto"
      />
    </View>
  );
}

// ─── Tab Gasto extra ──────────────────────────────────────────────────────────

function TabGastoExtra({
  gastoExtra,
  setGastoExtra,
  agregarGastoExtra,
}: {
  gastoExtra: number;
  setGastoExtra: (v: number) => void;
  agregarGastoExtra: (delta: number) => void;
}) {
  const PASO = 50_000;

  return (
    <View style={estilos.tabContenido}>
      <Text style={estilos.tabDescripcion}>
        Simula un gasto adicional para ver su impacto en tu ahorro.
      </Text>

      <View style={estilos.controlFila}>
        <TouchableOpacity
          style={estilos.btnAjuste}
          onPress={() => setGastoExtra(Math.max(0, gastoExtra - PASO))}
        >
          <Text style={estilos.btnAjusteTexto}>−</Text>
        </TouchableOpacity>

        <View style={estilos.valorCentral}>
          <Text style={estilos.valorLabel}>Gasto extra</Text>
          <Text style={[estilos.valorMonto, { color: '#E24B4A' }]}>
            {gastoExtra > 0 ? `−${fmt(gastoExtra)}` : fmt(0)}
          </Text>
        </View>

        <TouchableOpacity
          style={estilos.btnAjuste}
          onPress={() => agregarGastoExtra(PASO)}
        >
          <Text style={estilos.btnAjusteTexto}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Botones rápidos de incremento */}
      <View style={estilos.presetsGrid}>
        {[100_000, 200_000, 500_000].map(delta => (
          <TouchableOpacity
            key={delta}
            style={estilos.btnPreset}
            onPress={() => agregarGastoExtra(delta)}
          >
            <Text style={estilos.btnPresetTexto}>+{fmt(delta)}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[estilos.btnPreset, { borderColor: '#E24B4A' }]}
          onPress={() => setGastoExtra(0)}
        >
          <Text style={[estilos.btnPresetTexto, { color: '#E24B4A' }]}>Reset</Text>
        </TouchableOpacity>
      </View>

      {/* Ingreso exacto — setGastoExtra fija el total, no lo suma */}
      <InputNumerico
        valor={gastoExtra}
        onChange={setGastoExtra}
        label="O escribe el total exacto del gasto"
      />
    </View>
  );
}

// ─── Tab Meta ahorro ──────────────────────────────────────────────────────────

function TabMetaAhorro({
  metaAhorro,
  setMetaAhorro,
  cumpliMeta,
  faltaParaMeta,
}: {
  metaAhorro: number;
  setMetaAhorro: (v: number) => void;
  cumpliMeta: boolean;
  faltaParaMeta: number;
}) {
  const PASO = 50_000;

  return (
    <View style={estilos.tabContenido}>
      <Text style={estilos.tabDescripcion}>
        Define cuánto quieres ahorrar y verifica si el sueldo alcanza.
      </Text>

      <View style={estilos.controlFila}>
        <TouchableOpacity
          style={estilos.btnAjuste}
          onPress={() => setMetaAhorro(Math.max(0, metaAhorro - PASO))}
        >
          <Text style={estilos.btnAjusteTexto}>−</Text>
        </TouchableOpacity>

        <View style={estilos.valorCentral}>
          <Text style={estilos.valorLabel}>Meta de ahorro</Text>
          <Text style={[estilos.valorMonto, { color: '#378ADD' }]}>{fmt(metaAhorro)}</Text>
        </View>

        <TouchableOpacity
          style={estilos.btnAjuste}
          onPress={() => setMetaAhorro(metaAhorro + PASO)}
        >
          <Text style={estilos.btnAjusteTexto}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={estilos.presetsGrid}>
        {[100_000, 200_000, 300_000, 500_000].map(v => (
          <TouchableOpacity
            key={v}
            style={[estilos.btnPreset, metaAhorro === v && estilos.btnPresetActivo]}
            onPress={() => setMetaAhorro(v)}
          >
            <Text style={[estilos.btnPresetTexto, metaAhorro === v && estilos.btnPresetTextoActivo]}>
              {fmt(v)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Ingreso exacto */}
      <InputNumerico
        valor={metaAhorro}
        onChange={setMetaAhorro}
        label="O escribe la meta exacta"
      />

      {/* Alerta de meta solo si el usuario fijó un valor */}
      {metaAhorro > 0 && (
        <View style={[
          estilos.alertMeta,
          {
            backgroundColor: cumpliMeta ? '#162210' : '#2D1515',
            borderColor: cumpliMeta ? '#639922' : '#E24B4A',
          },
        ]}>
          <Text style={[estilos.alertMetaTexto, { color: cumpliMeta ? '#639922' : '#E24B4A' }]}>
            {cumpliMeta
              ? `✓ El sueldo alcanza para ahorrar ${fmt(metaAhorro)}`
              : `⚠ Faltan ${fmt(faltaParaMeta)} para alcanzar la meta`
            }
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function SimuladorYSi({ sueldoBase, tcCiclo, fijosTotal }: Props) {
  const {
    datos,
    setTab,
    setSueldoSim,
    setGastoExtra,
    setMetaAhorro,
    agregarGastoExtra,
  } = useSimulador(sueldoBase, tcCiclo, fijosTotal);

  return (
    <View>
      <ToggleTabs tab={datos.tab} onChange={setTab} />

      {datos.tab === 'sueldo' && (
        <TabSueldo
          sueldo={datos.sueldoSim}
          sueldoBase={sueldoBase}
          setSueldo={setSueldoSim}
        />
      )}
      {datos.tab === 'gasto_extra' && (
        <TabGastoExtra
          gastoExtra={datos.gastoExtra}
          setGastoExtra={setGastoExtra}
          agregarGastoExtra={agregarGastoExtra}
        />
      )}
      {datos.tab === 'meta_ahorro' && (
        <TabMetaAhorro
          metaAhorro={datos.metaAhorro}
          setMetaAhorro={setMetaAhorro}
          cumpliMeta={datos.cumpliMeta}
          faltaParaMeta={datos.faltaParaMeta}
        />
      )}

      <CardResultado
        disponible={datos.disponible}
        sueldoSim={datos.sueldoSim}
        tcCiclo={tcCiclo}
        fijosTotal={fijosTotal}
        gastoExtra={datos.gastoExtra}
        tab={datos.tab}
      />
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const estilos = StyleSheet.create({
  // Pestañas internas
  tabsContenedor: {
    flexDirection: 'row',
    backgroundColor: '#0F1117',
    borderRadius: 8,
    padding: 3,
    marginBottom: 16,
  },
  tabOpcion: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: 'center',
  },
  tabActivo: { backgroundColor: '#2A2D38' },
  tabTexto: { fontSize: 12, fontWeight: '500', color: '#4A4D5A' },
  tabTextoActivo: { color: '#F1F0EC' },

  // Contenido del tab
  tabContenido: {
    marginBottom: 16,
    gap: 12,
  },
  tabDescripcion: {
    fontSize: 13,
    color: '#4A4D5A',
    lineHeight: 19,
  },

  // Control +/−
  controlFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  btnAjuste: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2A2D38',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnAjusteTexto: {
    color: '#F1F0EC',
    fontSize: 20,
    fontWeight: '300',
    lineHeight: 22,
  },
  valorCentral: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  valorLabel: {
    fontSize: 11,
    color: '#4A4D5A',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  valorMonto: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F1F0EC',
    letterSpacing: -0.5,
  },

  // Presets
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  btnPreset: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2D38',
    backgroundColor: '#0F1117',
  },
  btnPresetActivo: {
    borderColor: '#378ADD',
    backgroundColor: '#0F1E33',
  },
  btnPresetTexto: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B6A66',
  },
  btnPresetTextoActivo: {
    color: '#378ADD',
  },

  // Input numérico de ingreso exacto
  inputContenedor: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 11,
    color: '#4A4D5A',
    fontWeight: '500',
  },
  inputNumerico: {
    backgroundColor: '#0F1117',
    borderWidth: 0.5,
    borderColor: '#2A2D38',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    fontWeight: '500',
    color: '#F1F0EC',
  },
  inputNumericoEnfocado: {
    borderColor: '#4A4D5A',
  },

  // Alerta meta ahorro
  alertMeta: {
    borderWidth: 0.5,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  alertMetaTexto: {
    fontSize: 13,
    fontWeight: '500',
  },

  // Card de resultado
  cardResultado: {
    borderWidth: 0.5,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
  },
  cardResultadoLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardResultadoMonto: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -1,
  },
  cardFormula: {
    fontSize: 11,
    color: '#4A4D5A',
    marginTop: 2,
  },
});
