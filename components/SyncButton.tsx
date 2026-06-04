// components/SyncButton.tsx
// Botón de sincronización con Banco de Chile.
// Cuatro estados: idle → sincronizando → éxito → error
// Estilo discreto para modo oscuro — no es un CTA prominente.

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

      {/* ── Listo ────────────────────────────────────────────────────── */}
      {estado === 'idle' && (
        <TouchableOpacity
          style={estilos.boton}
          onPress={manejarSync}
          activeOpacity={0.7}
        >
          <Text style={estilos.botonTexto}>↻  Sincronizar</Text>
        </TouchableOpacity>
      )}

      {/* ── Sincronizando ─────────────────────────────────────────────── */}
      {estado === 'sincronizando' && (
        <View style={estilos.filaEstado}>
          <ActivityIndicator color="#378ADD" size="small" />
          <View style={estilos.textoEstadoContenedor}>
            <Text style={estilos.estadoTitulo}>Sincronizando...</Text>
            <Text style={estilos.estadoSubtitulo}>Puede tardar 30–60 s</Text>
          </View>
        </View>
      )}

      {/* ── Éxito ────────────────────────────────────────────────────── */}
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

      {/* ── Error ────────────────────────────────────────────────────── */}
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
    backgroundColor: '#181B24',
    borderWidth: 0.5,
    borderColor: '#2A2D38',
    borderRadius: 10,
    padding: 10,
  },

  // Botón idle: discreto, no es un CTA azul
  boton: {
    borderWidth: 0.5,
    borderColor: '#2A2D38',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  botonTexto: {
    color: '#4A4D5A',
    fontSize: 13,
    fontWeight: '500',
  },

  // Fila compartida por sincronizando y éxito
  filaEstado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  textoEstadoContenedor: {
    flex: 1,
  },
  estadoTitulo: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B6A66',
  },
  estadoSubtitulo: {
    fontSize: 11,
    color: '#4A4D5A',
    marginTop: 2,
  },

  // Éxito
  exitoIcono: {
    fontSize: 16,
    color: '#639922',
    fontWeight: '700',
  },
  exitoTexto: {
    fontSize: 13,
    fontWeight: '500',
    color: '#639922',
    flex: 1,
  },

  // Error
  errorContenedor: {
    gap: 8,
  },
  errorTexto: {
    fontSize: 12,
    color: '#E24B4A',
    lineHeight: 18,
  },

  // Botón secundario (OK / Reintentar)
  botonChico: {
    backgroundColor: '#2A2D38',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  botonChicoTexto: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B6A66',
  },
});
