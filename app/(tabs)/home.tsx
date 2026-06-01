// app/(tabs)/home.tsx
// Pantalla principal — por ahora muestra el importador de CSV
// Se expandirá en Sesión 03 con balance y gráfica

import { View, StyleSheet } from 'react-native';
import CSVImporter from '../../components/CSVImporter';

export default function HomeScreen() {
  return (
    <View style={estilos.contenedor}>
      <CSVImporter />
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
});