// app/(auth)/login.tsx
// Pantalla de login — registro e inicio de sesión con email y contraseña

import { useState } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { router } from 'expo-router';

export default function LoginScreen() {
    // Estado local para los campos del formulario
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [isRegistro, setIsRegistro] = useState(false);

    // Maneja tanto login como registro según el estado isRegistro
    const handleAuth = async () => {
        setLoading(true);

        if (isRegistro) {
            // Crear cuenta nueva
            const { error } = await supabase.auth.signUp({ email, password });
            if (error) Alert.alert('Error al registrarse', error.message);
            else Alert.alert('Revisa tu correo para confirmar tu cuenta');
        } else {
            // Iniciar sesión
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) Alert.alert('Error al iniciar sesión', error.message);
            else router.replace('/(tabs)/home');
        }

        setLoading(false);
    };

    return (
        <View style={styles.contenedor}>
            <Text style={styles.titulo}>FinanzasApp</Text>

            <TextInput
                style={styles.input}
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
            />

            <TextInput
                style={styles.input}
                placeholder="Contraseña"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
            />

            <TouchableOpacity
                style={styles.boton}
                onPress={handleAuth}
                disabled={loading}
            >
                <Text style={styles.botonTexto}>
                    {loading ? 'Cargando...' : isRegistro ? 'Crear cuenta' : 'Iniciar sesión'}
                </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setIsRegistro(!isRegistro)}>
                <Text style={styles.cambiarModo}>
                    {isRegistro ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
                </Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    contenedor: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
    titulo: { fontSize: 32, fontWeight: 'bold', textAlign: 'center', marginBottom: 40, color: '#1a1a1a' },
    input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 14, marginBottom: 12, fontSize: 16 },
    boton: { backgroundColor: '#2563EB', borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 8 },
    botonTexto: { color: '#fff', fontSize: 16, fontWeight: '600' },
    cambiarModo: { textAlign: 'center', marginTop: 20, color: '#2563EB', fontSize: 14 },
});