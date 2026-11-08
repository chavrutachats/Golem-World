import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '@/theme/theme';
import { fonts, radius, space, type as scale } from '@/theme/tokens';
import { T } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  hint?: string;
  error?: string | null;
  /** Para campos sobre o veludo azul. */
  onVelvet?: boolean;
}

export function TextField({ label, hint, error, onVelvet, ...input }: TextFieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const labelColor = onVelvet ? '#FFFFFF' : colors.ink;
  const borderColor = error ? colors.danger : focused ? colors.focus : onVelvet ? '#33478F' : colors.line;
  return (
    <View style={styles.wrap}>
      <T variant="small" weight="medium" color={labelColor}>
        {label}
      </T>
      <TextInput
        placeholderTextColor={onVelvet ? '#8D99C7' : colors.inkMuted}
        accessibilityLabel={label}
        {...input}
        onFocus={(e) => {
          setFocused(true);
          input.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          input.onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            color: onVelvet ? '#FFFFFF' : colors.ink,
            backgroundColor: onVelvet ? '#1F3277' : colors.surface,
            borderColor,
          },
        ]}
      />
      {error ? (
        <T variant="caption" color={onVelvet ? '#FFB4AB' : colors.danger} accessibilityLiveRegion="polite">
          {error}
        </T>
      ) : hint ? (
        <T variant="caption" color={onVelvet ? '#A9B4DB' : colors.inkMuted}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs + 2 },
  input: {
    minHeight: 52,
    borderWidth: 1.5,
    borderRadius: radius.control,
    paddingHorizontal: space.lg,
    fontFamily: fonts.ui,
    fontSize: scale.body,
  },
});
