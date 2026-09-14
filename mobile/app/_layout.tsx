import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SessionProvider, useSession } from '../src/session/provider';
import { maxFontSizeMultiplier, theme } from '../src/theme/tokens';

/**
 * Signed-in / signed-out navigation guard (UTA-13).
 *
 * - `loading` → pastel splash (no route flash).
 * - signed-out outside `(auth)` → `/sign-in`.
 * - signed-in inside `(auth)` → `/` (the `(app)` home).
 */
function AuthGuard({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const inAuthGroup = segments[0] === '(auth)';

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'signed-out' && !inAuthGroup) {
      router.replace('/sign-in');
    } else if (status === 'signed-in' && inAuthGroup) {
      router.replace('/');
    }
  }, [status, inAuthGroup, router]);

  if (status === 'loading') {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text
          style={styles.splashText}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
        >
          Loading TokoBoss…
        </Text>
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <AuthGuard>
        <Slot />
      </AuthGuard>
      <StatusBar style="auto" />
    </SessionProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  splashText: {
    fontSize: theme.type.body,
    color: theme.colors.textSecondary,
  },
});
