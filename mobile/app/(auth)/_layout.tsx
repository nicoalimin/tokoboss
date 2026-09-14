import { Stack } from 'expo-router';
import { theme } from '../../src/theme/tokens';

/** Signed-out shell: sign-in only. No product screens here. */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.primarySoft },
        headerTintColor: theme.colors.text,
      }}
    >
      <Stack.Screen name="sign-in" options={{ title: 'Sign in to TokoBoss' }} />
    </Stack>
  );
}
