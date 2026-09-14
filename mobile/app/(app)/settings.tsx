import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ThemedButton } from '../../components/ThemedButton';
import { resolveMobileEnv } from '../../src/env';
import { useSession } from '../../src/session/provider';
import { maxFontSizeMultiplier, theme } from '../../src/theme/tokens';

/** Settings shell screen: environment, session, sign-out. */
export default function SettingsScreen() {
  const { signOut, userId } = useSession();
  const env = useMemo(() => {
    try {
      return resolveMobileEnv();
    } catch {
      return null;
    }
  }, []);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        Settings
      </Text>

      <View style={styles.card}>
        <Text style={styles.row} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          Environment: {env?.env ?? 'invalid'}
        </Text>
        <Text style={styles.row} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          BFF: {env?.apiBaseUrl ?? 'not configured'}
        </Text>
        <Text style={styles.row} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          API: /api/{env?.apiVersion ?? 'v1'}
        </Text>
        <Text style={styles.row} maxFontSizeMultiplier={maxFontSizeMultiplier}>
          User: {userId ?? 'unknown'}
        </Text>
      </View>

      <Text style={styles.note} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        Session tokens live in platform secure storage (iOS Keychain / Android
        EncryptedSharedPrefs). Sign-out wipes them.
      </Text>

      <ThemedButton
        testID="sign-out"
        title="Sign out"
        onPress={() => signOut()}
      />
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
    marginBottom: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  row: {
    fontSize: theme.type.body,
    color: theme.colors.text,
  },
  note: {
    fontSize: theme.type.caption,
    color: theme.colors.textSecondary,
    marginVertical: theme.spacing.md,
  },
});
