// app/_layout.tsx
// Layout raíz — controla la navegación global de la app
// Decide si el usuario va al login o a la app según su sesión

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Session } from '@supabase/supabase-js';
import { router } from 'expo-router';

export default function RootLayout() {
    const [session, setSession] = useState<Session | null>(null);

    useEffect(() => {
        // Verificar si ya hay una sesión activa al abrir la app
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session) {
                router.replace('/(tabs)/home');
            } else {
                router.replace('/(auth)/login');
            }
        });

        // Escuchar cambios de sesión (login y logout)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session) {
                router.replace('/(tabs)/home');
            } else {
                router.replace('/(auth)/login');
            }
        });

        // Limpiar el listener cuando el componente se desmonta
        return () => subscription.unsubscribe();
    }, []);

    return (
        <Stack screenOptions={{ headerShown: false }} />
    );
}