/**
 * StatusBadge.js — "Baik" (green) / "Lewat" (red) pill.
 * 16sp text so it is still legible when Android font scale is turned down.
 */

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {COLORS, FONT, RADIUS, SPACING} from '../theme';

export default function StatusBadge({status}) {
  const isLate = status === 'Lewat';
  return (
    <View
      style={[
        styles.badge,
        {backgroundColor: isLate ? COLORS.dangerTint : COLORS.successTint},
      ]}>
      <Text
        style={[styles.text, {color: isLate ? COLORS.danger : COLORS.success}]}>
        {isLate ? 'Lewat' : 'Baik'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.pill,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: FONT.body,
    fontWeight: '700',
  },
});
