import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { ThemedButton } from '../../components/ThemedButton';
import { useSession } from '../../src/session/provider';
import { maxFontSizeMultiplier, theme } from '../../src/theme/tokens';

/**
 * Signed-out shell screen (UTA-13).
 *
 * Mock sign-in only — no real auth provider yet (out of scope).
 * Successful sign-in stores tokens in platform secure storage and the
 * root guard routes into the signed-in `(app)` shell.
 */
export default function SignInScreen() {
  const router = useRouter();
  const { signIn, lastError } = useSession();
  const [email, setEmail] = useState('owner@toko.example');
  const [password, setPassword] = useState('mock-password');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/');
    } catch {
      // `lastError` from context already carries UI-safe copy.
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        Welcome back
      </Text>
      <Text
        style={styles.subtitle}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        Sign in to continue to your toko.
      </Text>

      <Text style={styles.label} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        Email
      </Text>
      <TextInput
        testID="sign-in-email"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
        placeholder="owner@toko.example"
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      />

      <Text style={styles.label} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        Password
      </Text>
      <TextInput
        testID="sign-in-password"
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        placeholder="••••••••"
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      />

      {lastError ? (
        <Text
          style={styles.error}
          maxFontSizeMultiplier={maxFontSizeMultiplier}
        >
          {lastError}
        </Text>
      ) : null}

      <ThemedButton
        testID="sign-in-submit"
        title={busy ? 'Signing in…' : 'Sign in'}
        onPress={submit}
        disabled={busy}
      />

      <Text style={styles.note} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        Mock auth for the scaffold — tokens are stored in platform secure
        storage, never in plain app storage or logs.
      </Text>
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
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.type.heading,
    fontWeight: '700',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: theme.type.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  label: {
    fontSize: theme.type.caption,
    fontWeight: '600',
    color: theme.colors.text,
    marginTop: theme.spacing.sm,
  },
  input: {
    minHeight: theme.touch.buttonBase,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.type.body,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
  },
  error: {
    fontSize: theme.type.body,
    color: theme.colors.error,
  },
  note: {
    fontSize: theme.type.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
});
