// Componente CSVImporter — importador de cartola TXT del Banco de Chile
// Funciona en web y en móvil gracias a expo-document-picker

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../lib/supabase';
import { parsearTXTBancoChile } from '../lib/csvParser';
import { importarTransacciones } from '../lib/importService';
import { ResultadoImportacion } from '../types';

// Estados posibles del importador — la UI cambia según el estado
type EstadoImportacion = 'idle' | 'leyendo' | 'procesando' | 'exito' | 'error';

export default function CSVImporter() {
  // Estado principal del proceso
  const [estado, setEstado] = useState<EstadoImportacion>('idle');
  // Progreso de 0 a 100 para la barra
  const [progreso, setProgreso] = useState<number>(0);
  // Resultado final de la importación
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  // Mensaje de error si algo sale mal
  const [mensajeError, setMensajeError] = useState<string>('');

  // Función principal que se ejecuta al presionar el botón
  async function manejarImportacion() {
    try {
      // --- PASO 1: Seleccionar el archivo ---
      setEstado('leyendo');
      setProgreso(0);
      setResultado(null);
      setMensajeError('');

      // expo-document-picker abre el selector de archivos nativo
      // En web: abre el explorador de archivos del navegador
      // En iOS/Android: abre el explorador de archivos del sistema
      const resultado = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });

      // El usuario canceló sin seleccionar archivo
      if (resultado.canceled) {
        setEstado('idle');
        return;
      }

      const archivo = resultado.assets[0];

      // --- PASO 2: Leer el contenido del archivo ---
      // fetch() funciona con URIs locales tanto en web como en móvil (Expo lo maneja)
      const respuesta = await fetch(archivo.uri);
      const textoTXT = await respuesta.text();

      // --- PASO 3: Obtener el usuario autenticado ---
      setEstado('procesando');

      const { data: { user }, error: errorAuth } = await supabase.auth.getUser();

      if (errorAuth || !user) {
        throw new Error('No hay sesión activa. Por favor inicia sesión nuevamente.');
      }

      // --- PASO 4: Parsear el TXT ---
      // Le pasamos el userId directamente al parser para que construya las transacciones
      const transacciones = parsearTXTBancoChile(textoTXT, user.id);

      if (transacciones.length === 0) {
        throw new Error(
          'No se encontraron transacciones válidas en el archivo. ' +
          'Asegúrate de descargar la cartola en formato TXT desde la banca en línea.'
        );
      }

      // --- PASO 5: Importar a Supabase ---
      // Pasamos el callback de progreso para actualizar la barra
      const resultadoFinal = await importarTransacciones(
        transacciones,
        (porcentaje) => setProgreso(porcentaje)
      );

      // --- PASO 6: Mostrar resultado ---
      setResultado(resultadoFinal);
      setEstado('exito');

    } catch (error) {
      const mensaje = error instanceof Error
        ? error.message
        : 'Error desconocido al importar el archivo';

      setMensajeError(mensaje);
      setEstado('error');

      // En móvil mostramos también un Alert nativo
      if (Platform.OS !== 'web') {
        Alert.alert('Error al importar', mensaje);
      }
    }
  }

  // Resetea el componente al estado inicial
  function reiniciar() {
    setEstado('idle');
    setProgreso(0);
    setResultado(null);
    setMensajeError('');
  }

  // --- RENDERIZADO ---

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.titulo}>Importar Cartola</Text>
      <Text style={estilos.subtitulo}>
        Descarga tu cartola desde la banca en línea del Banco de Chile en formato TXT
      </Text>

      {/* Estado: listo para importar */}
      {estado === 'idle' && (
        <TouchableOpacity
          style={estilos.botonImportar}
          onPress={manejarImportacion}
          activeOpacity={0.8}
        >
          <Text style={estilos.textoBoton}>📂 Seleccionar archivo TXT</Text>
        </TouchableOpacity>
      )}

      {/* Estado: leyendo archivo */}
      {estado === 'leyendo' && (
        <View style={estilos.estadoContenedor}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={estilos.estadoTexto}>Leyendo archivo...</Text>
        </View>
      )}

      {/* Estado: procesando e importando */}
      {estado === 'procesando' && (
        <View style={estilos.estadoContenedor}>
          <Text style={estilos.estadoTexto}>Importando transacciones...</Text>

          {/* Barra de progreso */}
          <View style={estilos.barraContenedor}>
            <View style={[estilos.barraProgreso, { width: `${progreso}%` as any }]} />
          </View>
          <Text style={estilos.porcentajeTexto}>{progreso}%</Text>
        </View>
      )}

      {/* Estado: éxito */}
      {estado === 'exito' && resultado && (
        <View style={estilos.exitoContenedor}>
          <Text style={estilos.exitoIcono}>✅</Text>
          <Text style={estilos.exitoTitulo}>¡Importación completada!</Text>

          {/* Resumen de resultados */}
          <View style={estilos.resumenContenedor}>
            <FilaResumen etiqueta="Total encontradas" valor={resultado.total} color="#374151" />
            <FilaResumen etiqueta="Nuevas importadas" valor={resultado.importadas} color="#059669" />
            <FilaResumen etiqueta="Duplicadas (ignoradas)" valor={resultado.duplicadas} color="#D97706" />
            {resultado.actualizadas > 0 && (
              <FilaResumen etiqueta="Actualizadas (no facturado → facturado)" valor={resultado.actualizadas} color="#378ADD" />
            )}
            {resultado.errores > 0 && (
              <FilaResumen etiqueta="Con error" valor={resultado.errores} color="#DC2626" />
            )}
          </View>

          <TouchableOpacity
            style={estilos.botonReiniciar}
            onPress={reiniciar}
            activeOpacity={0.8}
          >
            <Text style={estilos.textoBotonReiniciar}>Importar otro archivo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Estado: error */}
      {estado === 'error' && (
        <View style={estilos.errorContenedor}>
          <Text style={estilos.errorIcono}>⚠️</Text>
          <Text style={estilos.errorTitulo}>No se pudo importar</Text>
          <Text style={estilos.errorMensaje}>{mensajeError}</Text>

          <TouchableOpacity
            style={estilos.botonReiniciar}
            onPress={reiniciar}
            activeOpacity={0.8}
          >
            <Text style={estilos.textoBotonReiniciar}>Intentar de nuevo</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// Componente auxiliar para las filas del resumen
function FilaResumen({
  etiqueta,
  valor,
  color,
}: {
  etiqueta: string;
  valor: number;
  color: string;
}) {
  return (
    <View style={estilos.filaResumen}>
      <Text style={estilos.etiquetaResumen}>{etiqueta}</Text>
      <Text style={[estilos.valorResumen, { color }]}>{valor}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    margin: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  titulo: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  subtitulo: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 24,
    lineHeight: 20,
  },
  botonImportar: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  textoBoton: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  estadoContenedor: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 12,
  },
  estadoTexto: {
    fontSize: 15,
    color: '#374151',
    marginTop: 8,
  },
  barraContenedor: {
    width: '100%',
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barraProgreso: {
    height: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 4,
  },
  porcentajeTexto: {
    fontSize: 13,
    color: '#6B7280',
  },
  exitoContenedor: {
    alignItems: 'center',
    gap: 8,
  },
  exitoIcono: {
    fontSize: 40,
    marginBottom: 4,
  },
  exitoTitulo: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  resumenContenedor: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginBottom: 16,
  },
  filaResumen: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  etiquetaResumen: {
    fontSize: 14,
    color: '#6B7280',
  },
  valorResumen: {
    fontSize: 14,
    fontWeight: '700',
  },
  botonReiniciar: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    width: '100%',
  },
  textoBotonReiniciar: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '600',
  },
  errorContenedor: {
    alignItems: 'center',
    gap: 8,
  },
  errorIcono: {
    fontSize: 36,
    marginBottom: 4,
  },
  errorTitulo: {
    fontSize: 17,
    fontWeight: '700',
    color: '#DC2626',
  },
  errorMensaje: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
});
