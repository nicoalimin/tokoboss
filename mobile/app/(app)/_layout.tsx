import { Stack } from 'expo-router';
import { theme } from '../../src/theme/tokens';

/** Signed-in shell: minimal home / settings / devices screens. */
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.secondarySoft },
        headerTintColor: theme.colors.text,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'TokoBoss' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="devices" options={{ title: 'Devices' }} />
    </Stack>
  );
}
