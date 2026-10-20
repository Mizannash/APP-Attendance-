/**
 * AppButton.js — the big, glove-friendly action button.
 *
 * minHeight 56dp, 18sp label, high contrast, ripple feedback, and a busy
 * state that blocks double taps while a write is in flight (important:
 * two fast taps on DAFTAR MASUK must not produce two records).
 */

import React from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text} from 'react-native';
import {COLORS, FONT, RADIUS, SPACING, TOUCH} from '../theme';

export default function AppButton({
  title,
  onPress,
  color = COLORS.primary,
  textColor = COLORS.white,
  disabled = false,
  loading = false,
  style,
  accessibilityLabel,
}) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{disabled: isDisabled, busy: loading}}
      onPress={isDisabled ? undefined : onPress}
      android_ripple={{color: 'rgba(255,255,255,0.25)'}}
      style={({pressed}) => [
        styles.base,
        {backgroundColor: isDisabled ? COLORS.disabled : color},
        pressed && !isDisabled ? styles.pressed : null,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text style={[styles.label, {color: textColor}]} numberOfLines={1}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TOUCH.minHeight,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    // Subtle elevation so the button reads as tappable on a cheap LCD panel.
    elevation: 2,
  },
  pressed: {
    opacity: 0.9,
    transform: [{scale: 0.99}],
  },
  label: {
    fontSize: FONT.button,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
