/**
 * CheckIn.js — Screen 1 "Daftar"
 *
 * One form, two actions. The screen owns only presentation + alerts; every
 * rule (late flag, duplicate block, orphan check-out) lives in
 * utils/storage.js#registerAttendance so it is testable outside React.
 *
 * Bahasa Malaysia copy, English comments.
 */

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import AppButton from '../components/AppButton';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import JabatanPicker from '../components/JabatanPicker';
import {COLORS, FONT, RADIUS, SPACING} from '../theme';
import {
  JABATAN_LIST,
  getRecordsByDate,
  registerAttendance,
} from '../utils/storage';
import {
  dateKey,
  formatDate,
  formatTime,
  nameKey,
  normalizeName,
} from '../utils/date';

export default function CheckIn({navigation}) {
  const [name, setName] = useState('');
  const [jabatan, setJabatan] = useState(JABATAN_LIST[0]);
  const [records, setRecords] = useState([]);
  const [clock, setClock] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  // Reload today's bucket from AsyncStorage. Cheap (<2 KB read) and called on
  // focus so the screen is never stale after visiting Rekod/Eksport.
  const refresh = useCallback(async () => {
    const today = await getRecordsByDate(dateKey(new Date()));
    if (mounted.current) {
      setRecords(today);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;

    // Live clock: one 1s interval for the whole screen. Cleared on unmount so
    // Hermes does not keep a timer alive after the tab is replaced.
    const timer = setInterval(() => setClock(new Date()), 1000);
    refresh();

    const unsubscribe = navigation.addListener('focus', refresh);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      unsubscribe();
    };
  }, [navigation, refresh]);

  // If the typed name matches a worker who is still checked in, tell the user
  // up-front instead of only failing when they press DAFTAR MASUK.
  const openRecord = useMemo(() => {
    const wanted = nameKey(name);
    if (!wanted) {
      return null;
    }
    let open = null;
    records.forEach(record => {
      if (nameKey(record.name) !== wanted) {
        return;
      }
      open = record.type === 'masuk' ? record : null;
    });
    return open;
  }, [name, records]);

  const submit = useCallback(
    async type => {
      if (busy) {
        return; // second tap while writing: ignore
      }
      setBusy(true);
      try {
        const result = await registerAttendance({
          name: name,
          jabatan: jabatan,
          type: type,
        });

        if (!result.ok) {
          Alert.alert(
            type === 'masuk'
              ? 'Tidak Boleh Daftar Masuk'
              : 'Tidak Boleh Daftar Keluar',
            result.message,
            [{text: 'OK'}],
          );
          return;
        }

        const record = result.record;
        Alert.alert(
          record.type === 'masuk' ? 'Kehadiran Direkod' : 'Keluar Direkod',
          record.name +
            '\n' +
            (record.type === 'masuk' ? 'Masuk: ' : 'Keluar: ') +
            record.time +
            '  (' +
            record.date +
            ')' +
            (record.type === 'masuk'
              ? '\nStatus: ' + (result.late ? 'LEWAT' : 'Tepat Masa')
              : ''),
          [{text: 'OK'}],
        );

        setName(''); // ready for the next worker; jabatan is kept on purpose
        await refresh();
      } finally {
        if (mounted.current) {
          setBusy(false);
        }
      }
    },
    [busy, jabatan, name, refresh],
  );

  const confirmSubmit = type => {
    if (normalizeName(name).length < 2) {
      // Fail fast with a clear message; never let a blank record reach storage.
      Alert.alert(
        'Nama Diperlukan',
        'Sila masukkan nama pekerja sebelum mendaftar.',
        [{text: 'OK'}],
      );
      return;
    }
    submit(type);
  };

  const recent = records.slice(-3).reverse();

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        {/* Live clock + date: the operator can see the device time that will
            be stamped, which prevents "the phone clock is wrong" disputes. */}
        <Card style={styles.clockCard}>
          <Text style={styles.clockLabel}>Waktu Sekarang</Text>
          <Text style={styles.clockValue}>{formatTime(clock)}</Text>
          <Text style={styles.clockDate}>{formatDate(clock)}</Text>
          <View style={styles.rule} />
          <Text style={styles.ruleText}>
            Waktu masuk standard: 08:30 pagi. Selepas itu ditanda LEWAT.
          </Text>
        </Card>

        <Card>
          <Text style={styles.label}>Nama Pekerja</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Contoh: Ahmad bin Ali"
            placeholderTextColor={COLORS.disabled}
            style={styles.input}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            editable={!busy}
            maxLength={60}
            accessibilityLabel="Nama Pekerja"
          />

          <Text style={[styles.label, styles.labelSpaced]}>Jabatan</Text>
          <JabatanPicker
            value={jabatan}
            options={JABATAN_LIST}
            onChange={setJabatan}
            disabled={busy}
          />

          {openRecord ? (
            <View style={styles.hint}>
              <MaterialIcons
                name="info-outline"
                size={22}
                color={COLORS.warning}
              />
              <Text style={styles.hintText}>
                {openRecord.name} sudah masuk pada {openRecord.time} dan belum
                keluar.
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <AppButton
              title="DAFTAR MASUK"
              color={COLORS.success}
              onPress={() => confirmSubmit('masuk')}
              loading={busy}
              style={styles.actionButton}
            />
            <AppButton
              title="DAFTAR KELUAR"
              color={COLORS.danger}
              onPress={() => confirmSubmit('keluar')}
              loading={busy}
              style={styles.actionButton}
            />
          </View>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>Aktiviti Terkini</Text>
          {recent.length === 0 ? (
            <Text style={styles.muted}>Belum ada rekod hari ini.</Text>
          ) : (
            recent.map(record => (
              <View key={record.id} style={styles.recentRow}>
                <View style={styles.recentLeft}>
                  <Text style={styles.recentName} numberOfLines={1}>
                    {record.name}
                  </Text>
                  <Text style={styles.recentMeta}>
                    {record.type === 'masuk' ? 'Masuk' : 'Keluar'} ·{' '}
                    {record.time}
                  </Text>
                </View>
                <StatusBadge status={record.status} />
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  clockCard: {
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  clockLabel: {
    fontSize: FONT.body,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600',
  },
  clockValue: {
    fontSize: FONT.hero,
    color: COLORS.white,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: SPACING.xs,
  },
  clockDate: {
    fontSize: FONT.value,
    color: 'rgba(255,255,255,0.95)',
    marginTop: SPACING.xs,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.4)',
    marginVertical: SPACING.md,
  },
  ruleText: {
    fontSize: FONT.body,
    color: 'rgba(255,255,255,0.95)',
    lineHeight: 22,
  },
  label: {
    fontSize: FONT.label,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  labelSpaced: {
    marginTop: SPACING.lg,
  },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.button,
    paddingHorizontal: SPACING.md,
    fontSize: FONT.value,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef7e0',
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  hintText: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: FONT.body,
    color: COLORS.warning,
    lineHeight: 22,
  },
  actions: {
    marginTop: SPACING.xl,
  },
  actionButton: {
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: FONT.title,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  muted: {
    fontSize: FONT.body,
    color: COLORS.textMuted,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  recentLeft: {
    flex: 1,
    paddingRight: SPACING.md,
  },
  recentName: {
    fontSize: FONT.body,
    fontWeight: '600',
    color: COLORS.text,
  },
  recentMeta: {
    fontSize: FONT.body,
    color: COLORS.textMuted,
    marginTop: 2,
  },
});
