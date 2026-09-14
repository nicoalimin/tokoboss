import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ThemedButton } from '../../components/ThemedButton';
import { useSession } from '../../src/session/provider';
import { maxFontSizeMultiplier, theme } from '../../src/theme/tokens';

/**
 * Signed-in home shell (UTA-13).
 *
 * Minimal by design — no catalog/stock features (out of scope). Proves:
 * - the shell renders on iOS/Android dev builds,
 * - a mocked *authenticated* API request validates through shared contracts,
 * - navigation into settings/devices works from large-touch-target actions.
 */
export default function HomeScreen() {
  const router = useRouter();
  const { api, userId } = useSession();
  const [output, setOutput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (kind: 'health' | 'session') => {
    if (busy) return;
    setBusy(true);
    setOutput(null);
    try {
      if (kind === 'health') {
        const health = await api.getHealth();
        setOutput(`BFF ${health.service} is ${health.status} (${health.env}).`);
      } else {
        const session = await api.getSession();
        setOutput(`Authenticated as ${session.userId} — contract valid.`);
      }
    } catch {
      setOutput(
        kind === 'health'
          ? 'BFF unreachable. Start web (`pnpm dev`) or check EXPO_PUBLIC_API_BASE_URL.'
          : 'Session request failed. Sign in again.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        TokoBoss
      </Text>
      <Text
        style={styles.subtitle}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        {userId ? `Signed in · ${userId}` : 'Signed in'}
      </Text>

      <View style={styles.card}>
        <View style={styles.statusRow}>
          <View style={styles.statusDot} />
          <Text
            style={styles.statusText}
            maxFontSizeMultiplier={maxFontSizeMultiplier}
          >
            Shell ready
          </Text>
        </View>
        {output ? (
          <Text
            testID="home-api-output"
            style={styles.output}
            maxFontSizeMultiplier={maxFontSizeMultiplier}
          >
            {output}
          </Text>
        ) : null}
      </View>

      <View testID="home-primary-actions">
        <ThemedButton
          testID="home-check-health"
          title="Check BFF health"
          onPress={() => run('health')}
          disabled={busy}
        />
        <ThemedButton
          testID="home-load-session"
          title="Load my session (authenticated)"
          onPress={() => run('session')}
          disabled={busy}
          variant="secondary"
        />
        <ThemedButton
          testID="home-open-devices"
          title="Open devices demo"
          onPress={() => router.push('/devices')}
          variant="secondary"
        />
        <ThemedButton
          testID="home-open-settings"
          title="Open settings"
          onPress={() => router.push('/settings')}
          variant="secondary"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
  },
  title: {
    fontSize: theme.type.heading,
    fontWeight: '700',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: theme.type.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  statusDot: {
    width: theme.icons.sm,
    height: theme.icons.sm,
    borderRadius: theme.icons.sm / 2,
    backgroundColor: theme.colors.success,
  },
  statusText: {
    fontSize: theme.type.body,
    color: theme.colors.text,
    fontWeight: '600',
  },
  output: {
    fontSize: theme.type.body,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
});
