// app/(tabs)/home.tsx
// Pantalla principal — se muestra cuando el usuario tiene sesión activa

import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function HomeScreen() {
    // Cerrar sesión
    const handleLogout = async () => {
        await supabase.auth.signOut();
    };

    return (
        <View style={styles.contenedor}>
            <Text style={styles.titulo}>¡Bienvenido a FinanzasApp!</Text>
            <Text style={styles.subtitulo}>Tu app de finanzas personales</Text>

            <TouchableOpacity style={styles.boton} onPress={handleLogout}>
                <Text style={styles.botonTexto}>Cerrar sesión</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    contenedor: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' },
    titulo: { fontSize: 24, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 8 },
    subtitulo: { fontSize: 16, color: '#666', marginBottom: 40 },
    boton: { backgroundColor: '#EF4444', borderRadius: 8, padding: 16, alignItems: 'center', width: '100%' },
    botonTexto: { color: '#fff', fontSize: 16, fontWeight: '600' },
});