// app/(tabs)/ajustes.tsx
// Pantalla Ajustes — configuración completa de la app.
//
// Secciones:
//   Cuenta          — email (solo lectura) + cerrar sesión
//   Datos bancarios — RUT, banco, tipo cuenta para cobros futuros
//   Tarjetas        — una fila por tarjeta con días de ciclo y toggle activa
//   Sueldo estimado — campo numérico que alimenta la Proyección
//   Importación     — acceso inline al importador de cartola TXT
//   Preferencias    — selector de tema (UI solamente, sin lógica real aún)

import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAjustes } from '../../hooks/useAjustes';
import CSVImporter from '../../components/CSVImporter';
import type { TarjetaEditable } from '../../hooks/useAjustes';

type TemaOpcion = 'sistema' | 'claro' | 'oscuro';

// ─── Utilidades ───────────────────────────────────────────────────────────────

// Convierte string a número entero seguro para los días de ciclo
function parseDia(v: string): number {
  const n = parseInt(v, 10);
  if (isNaN(n)) return 1;
  return Math.min(31, Math.max(1, n));
}

// ─── Campo de formulario reutilizable ─────────────────────────────────────────

interface CampoProps {
  label: string;
  value: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  editable?: boolean;
}

function Campo({ label, value, onChangeText, placeholder, keyboardType = 'default', editable = true }: CampoProps) {
  return (
    <View style={estilos.campoFila}>
      <Text style={estilos.campoLabel}>{label}</Text>
      <TextInput
        style={[estilos.campoInput, !editable && estilos.campoInputReadonly]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? ''}
        placeholderTextColor="#4A4D5A"
        keyboardType={keyboardType}
        editable={editable}
        selectTextOnFocus={editable}
      />
    </View>
  );
}

// ─── Botón Guardar con estado de carga ────────────────────────────────────────

function BotonGuardar({ onPress, guardando, label = 'Guardar' }: {
  onPress: () => void;
  guardando: boolean;
  label?: string;
}) {
  return (
    <TouchableOpacity
      style={[estilos.botonGuardar, guardando && estilos.botonGuardando]}
      onPress={onPress}
      disabled={guardando}
      activeOpacity={0.8}
    >
      {guardando
        ? <ActivityIndicator size="small" color="#F1F0EC" />
        : <Text style={estilos.botonGuardarTexto}>{label}</Text>
      }
    </TouchableOpacity>
  );
}

// ─── Sección: Cuenta ─────────────────────────────────────────────────────────

function SeccionCuenta({ email, onCerrarSesion }: { email: string | null; onCerrarSesion: () => void }) {
  function confirmarCierre() {
    Alert.alert(
      'Cerrar sesión',
      '¿Seguro que quieres cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar sesión', style: 'destructive', onPress: onCerrarSesion },
      ]
    );
  }

  return (
    <View style={estilos.card}>
      <Text style={estilos.seccionHeader}>Cuenta</Text>
      <View style={estilos.campoFila}>
        <Text style={estilos.campoLabel}>Email</Text>
        <Text style={estilos.valorReadonly}>{email ?? '—'}</Text>
      </View>
      <View style={estilos.separador} />
      <TouchableOpacity style={estilos.botonDestructivo} onPress={confirmarCierre} activeOpacity={0.8}>
        <Text style={estilos.botonDestructivoTexto}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Sección: Datos bancarios ─────────────────────────────────────────────────

function SeccionDatosBancarios({
  rutInicial,
  bancoInicial,
  cuentaInicial,
  guardando,
  onGuardar,
}: {
  rutInicial: string;
  bancoInicial: string;
  cuentaInicial: string;
  guardando: boolean;
  onGuardar: (rut: string, banco: string, cuenta: string) => void;
}) {
  // Estado local mientras el usuario edita — no va a la BD hasta presionar Guardar
  const [rut, setRut] = useState(rutInicial);
  const [banco, setBanco] = useState(bancoInicial);
  const [cuenta, setCuenta] = useState(cuentaInicial);

  return (
    <View style={estilos.card}>
      <Text style={estilos.seccionHeader}>Datos bancarios personales</Text>
      <Text style={estilos.seccionSubtitulo}>Para recibir cobros de gastos compartidos</Text>
      <Campo label="RUT" value={rut} onChangeText={setRut} placeholder="12.345.678-9" />
      <Campo label="Banco" value={banco} onChangeText={setBanco} placeholder="Banco de Chile" />
      <Campo label="Tipo de cuenta" value={cuenta} onChangeText={setCuenta} placeholder="Cuenta corriente" />
      <BotonGuardar
        onPress={() => onGuardar(rut, banco, cuenta)}
        guardando={guardando}
      />
    </View>
  );
}

// ─── Fila de tarjeta de crédito ───────────────────────────────────────────────

function FilaTarjeta({
  tarjeta,
  onEditar,
  onGuardar,
}: {
  tarjeta: TarjetaEditable;
  onEditar: (cambios: Partial<Omit<TarjetaEditable, 'id' | 'guardando'>>) => void;
  onGuardar: () => void;
}) {
  return (
    <View style={estilos.tarjetaCard}>
      {/* Encabezado: nombre editable + últimos 4 dígitos */}
      <View style={estilos.tarjetaEncabezado}>
        <TextInput
          style={estilos.tarjetaNombre}
          value={tarjeta.name}
          onChangeText={name => onEditar({ name })}
          placeholderTextColor="#4A4D5A"
        />
        {tarjeta.last_four && (
          <Text style={estilos.tarjetaLastFour}>···· {tarjeta.last_four}</Text>
        )}
      </View>

      {/* Días de ciclo en una fila */}
      <View style={estilos.tarjetaDiasFila}>
        <View style={estilos.tarjetaDiaCampo}>
          <Text style={estilos.campoLabel}>Día cierre</Text>
          <TextInput
            style={estilos.tarjetaDiaInput}
            value={String(tarjeta.cycle_close_day)}
            onChangeText={v => onEditar({ cycle_close_day: parseDia(v) })}
            keyboardType="numeric"
            maxLength={2}
          />
        </View>
        <View style={estilos.tarjetaDiaCampo}>
          <Text style={estilos.campoLabel}>Día venc.</Text>
          <TextInput
            style={estilos.tarjetaDiaInput}
            value={String(tarjeta.cycle_due_day)}
            onChangeText={v => onEditar({ cycle_due_day: parseDia(v) })}
            keyboardType="numeric"
            maxLength={2}
          />
        </View>
        {/* Toggle activa/inactiva al extremo derecho */}
        <View style={estilos.tarjetaToggleFila}>
          <Text style={estilos.campoLabel}>Activa</Text>
          <Switch
            value={tarjeta.active}
            onValueChange={active => onEditar({ active })}
            trackColor={{ false: '#2A2D38', true: '#162210' }}
            thumbColor={tarjeta.active ? '#639922' : '#6B6A66'}
          />
        </View>
      </View>

      <BotonGuardar onPress={onGuardar} guardando={tarjeta.guardando} />
    </View>
  );
}

// ─── Sección: Tarjetas de crédito ─────────────────────────────────────────────

function SeccionTarjetas({
  tarjetas,
  onEditar,
  onGuardar,
}: {
  tarjetas: TarjetaEditable[];
  onEditar: (id: string, cambios: Partial<Omit<TarjetaEditable, 'id' | 'guardando'>>) => void;
  onGuardar: (id: string) => void;
}) {
  return (
    <View style={estilos.card}>
      <Text style={estilos.seccionHeader}>Tarjetas de crédito</Text>
      {tarjetas.length === 0 && (
        <Text style={estilos.textoVacio}>No hay tarjetas registradas todavía.</Text>
      )}
      {tarjetas.map((t, i) => (
        <View key={t.id}>
          {i > 0 && <View style={estilos.separador} />}
          <FilaTarjeta
            tarjeta={t}
            onEditar={cambios => onEditar(t.id, cambios)}
            onGuardar={() => onGuardar(t.id)}
          />
        </View>
      ))}
    </View>
  );
}

// ─── Sección: Sueldo estimado ─────────────────────────────────────────────────

function SeccionSueldo({
  sueldoInicial,
  guardando,
  onGuardar,
}: {
  sueldoInicial: number | null;
  guardando: boolean;
  onGuardar: (sueldo: number | null) => void;
}) {
  const [valor, setValor] = useState(sueldoInicial !== null ? String(sueldoInicial) : '');

  function guardar() {
    const n = parseInt(valor.replace(/\D/g, ''), 10);
    onGuardar(isNaN(n) ? null : n);
  }

  return (
    <View style={estilos.card}>
      <Text style={estilos.seccionHeader}>Sueldo estimado</Text>
      <Text style={estilos.seccionSubtitulo}>Lo usa la Proyección para calcular cuánto te queda</Text>
      <Campo
        label="Monto (CLP)"
        value={valor}
        onChangeText={setValor}
        placeholder="1.200.000"
        keyboardType="numeric"
      />
      <BotonGuardar onPress={guardar} guardando={guardando} />
    </View>
  );
}

// ─── Sección: Importación de datos ───────────────────────────────────────────

function SeccionImportacion() {
  // El CSVImporter se muestra inline — no navega a otra pantalla
  const [mostrar, setMostrar] = useState(false);

  return (
    <View style={estilos.card}>
      <Text style={estilos.seccionHeader}>Importación de datos</Text>
      <TouchableOpacity
        style={estilos.botonSecundario}
        onPress={() => setMostrar(v => !v)}
        activeOpacity={0.8}
      >
        <Text style={estilos.botonSecundarioTexto}>
          {mostrar ? 'Ocultar importador' : '📄 Importar cartola TXT'}
        </Text>
      </TouchableOpacity>
      {mostrar && (
        <View style={estilos.importadorContenedor}>
          <CSVImporter />
        </View>
      )}
    </View>
  );
}

// ─── Sección: Preferencias ────────────────────────────────────────────────────

const TEMAS: { valor: TemaOpcion; label: string }[] = [
  { valor: 'sistema', label: 'Sistema' },
  { valor: 'claro', label: 'Claro' },
  { valor: 'oscuro', label: 'Oscuro' },
];

function SeccionPreferencias({ tema, onCambiarTema }: {
  tema: TemaOpcion;
  onCambiarTema: (t: TemaOpcion) => void;
}) {
  return (
    <View style={estilos.card}>
      <Text style={estilos.seccionHeader}>Preferencias</Text>
      <Text style={estilos.campoLabel}>Tema</Text>
      <View style={estilos.temaFila}>
        {TEMAS.map(t => (
          <TouchableOpacity
            key={t.valor}
            style={[estilos.temaOpcion, tema === t.valor && estilos.temaOpcionActiva]}
            onPress={() => onCambiarTema(t.valor)}
            activeOpacity={0.8}
          >
            <Text style={[estilos.temaTexto, tema === t.valor && estilos.temaTextoActivo]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={estilos.seccionSubtitulo}>El cambio de tema se implementará en una versión futura.</Text>
    </View>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function AjustesScreen() {
  const {
    email,
    settings,
    tarjetas,
    loading,
    guardandoSettings,
    editarTarjeta,
    guardarTarjeta,
    guardarDatosBancarios,
    guardarSueldo,
    cerrarSesion,
  } = useAjustes();

  // El tema vive solo en estado local — sin lógica real de cambio de tema todavía
  const [tema, setTema] = useState<TemaOpcion>('oscuro');

  if (loading) {
    return (
      <SafeAreaView style={estilos.contenedor}>
        <ActivityIndicator size="large" color="#378ADD" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={estilos.contenedor} edges={['top']}>
      <ScrollView
        style={estilos.scroll}
        contentContainerStyle={estilos.scrollContenido}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={estilos.titulo}>Ajustes</Text>

        <SeccionCuenta
          email={email}
          onCerrarSesion={cerrarSesion}
        />

        <SeccionDatosBancarios
          rutInicial={settings?.payment_rut ?? ''}
          bancoInicial={settings?.payment_bank ?? ''}
          cuentaInicial={settings?.payment_account ?? ''}
          guardando={guardandoSettings}
          onGuardar={guardarDatosBancarios}
        />

        <SeccionTarjetas
          tarjetas={tarjetas}
          onEditar={editarTarjeta}
          onGuardar={guardarTarjeta}
        />

        <SeccionSueldo
          sueldoInicial={settings?.estimated_salary ?? null}
          guardando={guardandoSettings}
          onGuardar={guardarSueldo}
        />

        <SeccionImportacion />

        <SeccionPreferencias tema={tema} onCambiarTema={setTema} />

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const estilos = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: '#0F1117',
  },
  scroll: {
    flex: 1,
  },
  scrollContenido: {
    padding: 16,
  },
  titulo: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F1F0EC',
    marginBottom: 20,
    marginTop: 8,
  },

  // ─── Cards de sección ─────────────────────────────────────────────────────
  card: {
    backgroundColor: '#181B24',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2D38',
    padding: 16,
    marginBottom: 16,
  },
  seccionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B6A66',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  seccionSubtitulo: {
    fontSize: 12,
    color: '#6B6A66',
    marginBottom: 12,
    marginTop: -4,
  },
  separador: {
    height: 1,
    backgroundColor: '#2A2D38',
    marginVertical: 12,
  },

  // ─── Campo de formulario ──────────────────────────────────────────────────
  campoFila: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    minHeight: 36,
  },
  campoLabel: {
    fontSize: 13,
    color: '#6B6A66',
    width: 110,
    flexShrink: 0,
  },
  campoInput: {
    flex: 1,
    fontSize: 14,
    color: '#F1F0EC',
    backgroundColor: '#0F1117',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2D38',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  campoInputReadonly: {
    color: '#6B6A66',
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  valorReadonly: {
    flex: 1,
    fontSize: 14,
    color: '#F1F0EC',
  },

  // ─── Botón Guardar ────────────────────────────────────────────────────────
  botonGuardar: {
    backgroundColor: '#378ADD',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
    minHeight: 40,
    justifyContent: 'center',
  },
  botonGuardando: {
    opacity: 0.6,
  },
  botonGuardarTexto: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F1F0EC',
  },

  // ─── Botón destructivo (cerrar sesión) ────────────────────────────────────
  botonDestructivo: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E24B4A',
    backgroundColor: '#2D1515',
  },
  botonDestructivoTexto: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E24B4A',
  },

  // ─── Botón secundario (importar) ──────────────────────────────────────────
  botonSecundario: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2D38',
    backgroundColor: '#0F1117',
  },
  botonSecundarioTexto: {
    fontSize: 14,
    fontWeight: '500',
    color: '#F1F0EC',
  },
  importadorContenedor: {
    marginTop: 12,
  },

  // ─── Tarjetas de crédito ──────────────────────────────────────────────────
  tarjetaCard: {
    paddingVertical: 4,
  },
  tarjetaEncabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  tarjetaNombre: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#F1F0EC',
    backgroundColor: '#0F1117',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2D38',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
  },
  tarjetaLastFour: {
    fontSize: 13,
    color: '#6B6A66',
    fontVariant: ['tabular-nums'],
  },
  tarjetaDiasFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  tarjetaDiaCampo: {
    flex: 1,
  },
  tarjetaDiaInput: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F1F0EC',
    backgroundColor: '#0F1117',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2D38',
    paddingHorizontal: 10,
    paddingVertical: 6,
    textAlign: 'center',
    marginTop: 4,
  },
  tarjetaToggleFila: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  textoVacio: {
    fontSize: 14,
    color: '#6B6A66',
    textAlign: 'center',
    paddingVertical: 8,
  },

  // ─── Preferencias / tema ──────────────────────────────────────────────────
  temaFila: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    marginTop: 8,
  },
  temaOpcion: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A2D38',
    backgroundColor: '#0F1117',
    alignItems: 'center',
  },
  temaOpcionActiva: {
    borderColor: '#378ADD',
    backgroundColor: '#0F1E33',
  },
  temaTexto: {
    fontSize: 13,
    color: '#6B6A66',
    fontWeight: '500',
  },
  temaTextoActivo: {
    color: '#378ADD',
  },
});
