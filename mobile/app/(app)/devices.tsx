import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ThemedButton } from '../../components/ThemedButton';
import { createDeviceStubs } from '../../src/devices/stubs';
import { maxFontSizeMultiplier, theme } from '../../src/theme/tokens';

/**
 * Devices demo shell screen (UTA-13).
 *
 * Exercises the camera / barcode / photo-upload / notification stubs,
 * including the denial → recoverable-state path: a denied permission
 * renders inline recovery copy (never a crash, never a dead end).
 */
export default function DevicesScreen() {
  const devices = useMemo(() => createDeviceStubs(), []);
  const [, setTick] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null);
  const rerender = () => setTick((t) => t + 1);

  const show = async (work: () => Promise<{ note: string }>) => {
    setMessage(null);
    setRecovery(null);
    const result = await work();
    setMessage(result.note);
    rerender();
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title} maxFontSizeMultiplier={maxFontSizeMultiplier}>
        Devices
      </Text>
      <Text
        style={styles.subtitle}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        Camera: {devices.state.cameraPermission} · Notifications:{' '}
        {devices.state.notificationPermission}
      </Text>

      {message ? (
        <View style={styles.card}>
          <Text
            testID="devices-result"
            style={styles.message}
            maxFontSizeMultiplier={maxFontSizeMultiplier}
          >
            {message}
          </Text>
        </View>
      ) : null}
      {recovery ? (
        <View style={styles.recoveryCard}>
          <Text
            testID="devices-recovery"
            style={styles.recovery}
            maxFontSizeMultiplier={maxFontSizeMultiplier}
          >
            {recovery}
          </Text>
        </View>
      ) : null}

      <ThemedButton
        testID="devices-take-photo"
        title="Take photo"
        onPress={() =>
          show(async () => {
            const res = await devices.camera.capturePhoto();
            if (!res.ok) {
              setRecovery(res.recovery);
              return { note: `Photo unavailable (${res.reason}).` };
            }
            return { note: `Captured ${res.value.uri}.` };
          })
        }
      />
      <ThemedButton
        testID="devices-scan-barcode"
        title="Scan barcode"
        variant="secondary"
        onPress={() =>
          show(async () => {
            const res = await devices.barcode.scan();
            if (!res.ok) {
              setRecovery(res.recovery);
              return { note: `Scan unavailable (${res.reason}).` };
            }
            return { note: `Scanned ${res.value.format}: ${res.value.value}.` };
          })
        }
      />
      <ThemedButton
        testID="devices-test-notification"
        title="Send test reminder"
        variant="secondary"
        onPress={() =>
          show(async () => {
            const res = await devices.notifications.scheduleLocal(
              'Low stock',
              'Rice is running low.'
            );
            if (!res.ok) {
              setRecovery(res.recovery);
              return { note: `Reminder unavailable (${res.reason}).` };
            }
            return {
              note: `Reminder scheduled (${res.value.notificationId}).`,
            };
          })
        }
      />

      <Text
        style={styles.section}
        maxFontSizeMultiplier={maxFontSizeMultiplier}
      >
        Demo permission toggles
      </Text>
      <ThemedButton
        testID="devices-toggle-camera"
        title={
          devices.state.cameraPermission === 'granted'
            ? 'Simulate camera denial'
            : 'Simulate camera grant'
        }
        variant="secondary"
        onPress={() => {
          if (devices.state.cameraPermission === 'granted')
            devices.denyCamera();
          else devices.grantCamera();
          setMessage(null);
          setRecovery(null);
          rerender();
        }}
      />
      <ThemedButton
        testID="devices-toggle-notifications"
        title={
          devices.state.notificationPermission === 'granted'
            ? 'Simulate notification denial'
            : 'Simulate notification grant'
        }
        variant="secondary"
        onPress={() => {
          if (devices.state.notificationPermission === 'granted') {
            devices.denyNotifications();
          } else {
            devices.grantNotifications();
          }
          setMessage(null);
          setRecovery(null);
          rerender();
        }}
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
    marginBottom: theme.spacing.sm,
  },
  message: {
    fontSize: theme.type.body,
    color: theme.colors.text,
  },
  recoveryCard: {
    backgroundColor: theme.colors.warningSoft,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.warning,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  recovery: {
    fontSize: theme.type.body,
    color: theme.colors.text,
  },
  section: {
    fontSize: theme.type.caption,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },
});
