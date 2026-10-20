/**
 * Card.js — white rounded surface (12px radius) used for every block in the UI.
 * Kept as a component so padding/radius stay consistent across screens.
 */

import React from 'react';
import {StyleSheet, View} from 'react-native';
import {COLORS, RADIUS, SPACING} from '../theme';

export default function Card({children, style, padded = true}) {
  return (
    <View style={[styles.card, padded ? styles.padded : null, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    // Android-only shadow (elevation). No shadow* props: cheaper on old GPUs.
    elevation: 1,
  },
  padded: {
    padding: SPACING.lg,
  },
});
