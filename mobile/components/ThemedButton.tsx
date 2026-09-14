/**
 * Shared large-touch-target button (UTA-13).
 *
 * Primary actions are 52pt high with 12pt gaps so small-screen and
 * large-text rendering never clips them. testID props keep smoke tests
 * stable.
 */

import {
  Pressable,
  StyleSheet,
  Text,
  type GestureResponderEvent,
} from 'react-native';
import { maxFontSizeMultiplier, theme } from '../src/theme/tokens';

interface ThemedButtonProps {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  testID?: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

export function ThemedButton({
  title,
  onPress,
  testID,
  variant = 'primary',
  disabled = false,
}: ThemedButtonProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text
        style={
          variant === 'primary' ? styles.primaryText : styles.secondaryText
        }
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        numberOfLines={1}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: theme.touch.button,
    minWidth: theme.touch.button,
    borderRadius: theme.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    marginVertical: theme.spacing.sm,
  },
  primary: {
    backgroundColor: theme.colors.primary,
  },
  secondary: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
  primaryText: {
    color: theme.colors.textInverse,
    fontSize: theme.type.body,
    fontWeight: '600',
  },
  secondaryText: {
    color: theme.colors.text,
    fontSize: theme.type.body,
    fontWeight: '600',
  },
});
