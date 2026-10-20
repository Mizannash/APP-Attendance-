/**
 * JabatanPicker.js — department dropdown.
 *
 * Built in-house instead of @react-native-picker/picker: one less native
 * dependency in the APK, no extra Gradle linking, and we get 56dp rows that
 * are usable with gloves. Behaves like a dropdown (collapsed field + sheet of
 * options) and is a plain controlled input: (value, onChange).
 */

import React, {useState} from 'react';
import {Modal, Pressable, StyleSheet, Text} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {COLORS, FONT, RADIUS, SPACING, TOUCH} from '../theme';

export default function JabatanPicker({value, options, onChange, disabled}) {
  const [open, setOpen] = useState(false);

  const select = option => {
    setOpen(false);
    if (option !== value) {
      onChange(option);
    }
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={'Jabatan: ' + value + '. Tekan untuk tukar.'}
        disabled={disabled}
        onPress={() => setOpen(true)}
        android_ripple={{color: COLORS.primaryTint}}
        style={({pressed}) => [
          styles.field,
          pressed ? styles.fieldPressed : null,
          disabled ? styles.fieldDisabled : null,
        ]}>
        <Text style={styles.fieldText}>{value}</Text>
        <MaterialIcons
          name="arrow-drop-down"
          size={28}
          color={COLORS.textMuted}
        />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* Inner pressable swallows taps so the sheet does not close itself. */}
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Pilih Jabatan</Text>
            {options.map(option => {
              const selected = option === value;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{selected: selected}}
                  onPress={() => select(option)}
                  android_ripple={{color: COLORS.primaryTint}}
                  style={styles.option}>
                  <Text
                    style={[
                      styles.optionText,
                      selected ? styles.optionTextSelected : null,
                    ]}>
                    {option}
                  </Text>
                  {selected ? (
                    <MaterialIcons
                      name="check"
                      size={24}
                      color={COLORS.primary}
                    />
                  ) : null}
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setOpen(false)}
              style={styles.cancel}
              accessibilityRole="button">
              <Text style={styles.cancelText}>BATAL</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: TOUCH.minHeight,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.button,
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldPressed: {
    backgroundColor: COLORS.primaryTint,
  },
  fieldDisabled: {
    opacity: 0.6,
  },
  fieldText: {
    fontSize: FONT.value,
    color: COLORS.text,
    fontWeight: '500',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(32,33,36,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS.card,
    borderTopRightRadius: RADIUS.card,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  sheetTitle: {
    fontSize: FONT.title,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  option: {
    minHeight: TOUCH.minHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  optionText: {
    fontSize: FONT.value,
    color: COLORS.text,
  },
  optionTextSelected: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  cancel: {
    minHeight: TOUCH.minHeight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.sm,
  },
  cancelText: {
    fontSize: FONT.label,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
});
