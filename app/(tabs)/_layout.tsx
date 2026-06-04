// app/(tabs)/_layout.tsx
// Define la barra de tabs inferior para las pantallas principales.
// Las pantallas de detalle (tarjeta, etc.) viven en el root Stack y
// se presentan encima de este navigator sin mostrar la barra de tabs.

import { Tabs } from 'expo-router';
import { Text } from 'react-native';

// Iconos como texto unicode — sin dependencias extra
function IconoInicio({ color }: { color: string }) {
  return <Text style={{ color, fontSize: 20, lineHeight: 24 }}>⌂</Text>;
}

function IconoMeDeben({ color }: { color: string }) {
  return <Text style={{ color, fontSize: 20, lineHeight: 24 }}>↩</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Barra inferior en modo oscuro
        tabBarStyle: {
          backgroundColor: '#181B24',
          borderTopWidth: 0.5,
          borderTopColor: '#2A2D38',
          height: 60,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: '#F1F0EC',
        tabBarInactiveTintColor: '#4A4D5A',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color }) => <IconoInicio color={color} />,
        }}
      />
      <Tabs.Screen
        name="me-deben"
        options={{
          title: 'Me deben',
          tabBarIcon: ({ color }) => <IconoMeDeben color={color} />,
        }}
      />
    </Tabs>
  );
}
