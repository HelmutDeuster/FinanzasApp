// app/index.tsx
// Punto de entrada — redirige automáticamente según la sesión

import { Redirect } from 'expo-router';

export default function Index() {
    return <Redirect href="/(auth)/login" />;
}
