// components/SyncButton.tsx
// Botón de sincronización con Banco de Chile.
// Cuatro estados: idle → sincronizando → éxito → error
// El estado "sincronizando" avisa que puede tardar ~30-60s (Chrome scraping).

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { sincronizar } from '../lib/syncService';
import type { ResultadoImportacion } from '../types';

type EstadoSync = 'idle' | 'sincronizando' | 'exito' | 'error';

interface Props {
  // Callback para que la pantalla Home refresque la lista al terminar
  onSincronizado?: () => void;
}

export default function SyncButton({ onSincronizado }: Props) {
  const [estado, setEstado] = useState<EstadoSync>('idle');
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [mensajeError, setMensajeError] = useState<string>('');

  async function manejarSync() {
    setEstado('sincronizando');
    setResultado(null);
    setMensajeError('');

    try {
      const res = await sincronizar();
      setResultado(res);
      setEstado('exito');
      // Notificar al padre para que recargue transacciones
      onSincronizado?.();
    } catch (error) {
      const mensaje =
        error instanceof Error ? error.message : 'Error desconocido al sincronizar';
      setMensajeError(mensaje);
      setEstado('error');
    }
  }

  function reiniciar() {
    setEstado('idle');
    setResultado(null);
    setMensajeError('');
  }

  return (
    <View style={estilos.contenedor}>

      {/* ── Estado: listo ─────────────────────────────────────────────── */}
      {estado === 'idle' && (
        <TouchableOpacity
          style={estilos.boton}
          onPress={manejarSync}
          activeOpacity={0.8}
        >
          <Text style={estilos.botonTexto}>↻  Sincronizar con banco</Text>
        </TouchableOpacity>
      )}

      {/* ── Estado: sincronizando ──────────────────────────────────────── */}
      {estado === 'sincronizando' && (
        <View style={estilos.filaEstado}>
          <ActivityIndicator color="#2563EB" size="small" />
          <View style={estilos.textoEstadoContenedor}>
            <Text style={estilos.estadoTitulo}>Sincronizando...</Text>
            <Text style={estilos.estadoSubtitulo}>
              Puede tardar 30–60 segundos (abre Chrome)
            </Text>
          </View>
        </View>
      )}

      {/* ── Estado: éxito ─────────────────────────────────────────────── */}
      {estado === 'exito' && resultado && (
        <View style={estilos.filaEstado}>
          <Text style={estilos.exitoIcono}>✓</Text>
          <Text style={estilos.exitoTexto}>
            {resultado.importadas} nuevas · {resultado.duplicadas} omitidas
          </Text>
          <TouchableOpacity onPress={reiniciar} style={estilos.botonChico}>
            <Text style={estilos.botonChicoTexto}>OK</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Estado: error ─────────────────────────────────────────────── */}
      {estado === 'error' && (
        <View style={estilos.errorContenedor}>
          <Text style={estilos.errorTexto} numberOfLines={3}>
            {mensajeError}
          </Text>
          <TouchableOpacity onPress={reiniciar} style={estilos.botonChico}>
            <Text style={estilos.botonChicoTexto}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },

  // Botón principal (estado idle)
  boton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  botonTexto: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },

  // Fila horizontal compartida por sincronizando y éxito
  filaEstado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  textoEstadoContenedor: {
    flex: 1,
  },
  estadoTitulo: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  estadoSubtitulo: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },

  // Éxito
  exitoIcono: {
    fontSize: 18,
    color: '#059669',
    fontWeight: '700',
  },
  exitoTexto: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
    flex: 1,
  },

  // Error
  errorContenedor: {
    gap: 10,
  },
  errorTexto: {
    fontSize: 13,
    color: '#DC2626',
    lineHeight: 18,
  },

  // Botón pequeño (OK / Reintentar)
  botonChico: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  botonChicoTexto: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
});
