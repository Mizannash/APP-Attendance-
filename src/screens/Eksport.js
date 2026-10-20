/**
 * Eksport.js — Screen 3 "Eksport"
 *
 * Writes kehadiran_YYYY-MM-DD.csv (Downloads, falling back to app storage)
 * and hands the file to WhatsApp through react-native-share's share sheet.
 *
 * Share is wrapped in two attempts: direct-to-WhatsApp first (one tap for the
 * supervisor), then the generic Android share sheet if WhatsApp is not
 * installed or refuses a text/csv attachment.
 */

import React, {useCallback, useEffect, useState} from 'react';
import {Alert, ScrollView, StyleSheet, Text, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Share from 'react-native-share';

import AppButton from '../components/AppButton';
import Card from '../components/Card';
import {COLORS, FONT, RADIUS, SPACING} from '../theme';
import {
  CSV_HEADER,
  exportToCSV,
  getRecordsByDate,
  summarise,
} from '../utils/storage';
import {dateKey, formatDate} from '../utils/date';

export default function Eksport() {
  const [count, setCount] = useState(0);
  const [stats, setStats] = useState({hadir: 0, lewat: 0, sudahKeluar: 0});
  const [exported, setExported] = useState(null); // {path, fileName, count, location}
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);

  const today = dateKey(new Date());
  const todayLabel = formatDate(new Date());

  const loadCount = useCallback(async () => {
    const records = await getRecordsByDate(today);
    setCount(records.length);
    setStats(summarise(records));
  }, [today]);

  useEffect(() => {
    loadCount();
  }, [loadCount]);

  const doExport = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const result = await exportToCSV(today);
      if (!result.ok) {
        Alert.alert('Eksport Gagal', result.message, [{text: 'OK'}]);
        return;
      }
      setExported(result);
      Alert.alert(
        'CSV Disimpan',
        result.count +
          ' rekod dieksport ke folder ' +
          result.location +
          '.\n\n' +
          result.fileName,
        [{text: 'OK'}],
      );
    } finally {
      setBusy(false);
    }
  }, [busy, today]);

  const doShare = useCallback(async () => {
    if (sharing) {
      return;
    }
    setSharing(true);
    try {
      // Always re-export so the shared file matches storage right now
      // (someone may have tapped Daftar since the last export).
      const result = await exportToCSV(today);
      if (!result.ok) {
        Alert.alert('Kongsi Gagal', result.message, [{text: 'OK'}]);
        return;
      }
      setExported(result);

      const options = {
        title: 'Kongsi Rekod Kehadiran',
        subject: 'Kehadiran ' + todayLabel,
        message:
          'Rekod kehadiran ' +
          todayLabel +
          ' (' +
          result.count +
          ' rekod) — KehadiranPro',
        url: 'file://' + result.path,
        type: 'text/csv',
        filename: result.fileName,
        failOnCancel: false,
      };

      try {
        await Share.open({...options, social: Share.Social.WHATSAPP});
      } catch (whatsappError) {
        // WhatsApp missing / attachment rejected: fall back to any app.
        try {
          await Share.open(options);
        } catch (fallbackError) {
          // User dismissed the sheet — not an error worth shouting about.
          if (fallbackError && fallbackError.message !== 'User did not share') {
            Alert.alert(
              'Kongsi Gagal',
              'Fail tidak dapat dikongsi. Fail masih tersimpan di folder ' +
                result.location +
                '.',
              [{text: 'OK'}],
            );
          }
        }
      }
    } finally {
      setSharing(false);
    }
  }, [sharing, today, todayLabel]);

  const preview = exported ? exported.csv.split('\r\n').slice(0, 4) : [];
  const hasRecords = count > 0;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Card style={styles.hero}>
        <Text style={styles.heroTitle}>Eksport Rekod</Text>
        <Text style={styles.heroSub}>{todayLabel}</Text>
        <View style={styles.statsRow}>
          <Text style={styles.stat}>{stats.hadir} hadir</Text>
          <Text style={styles.statDot}>·</Text>
          <Text style={styles.stat}>{stats.lewat} lewat</Text>
          <Text style={styles.statDot}>·</Text>
          <Text style={styles.stat}>{stats.sudahKeluar} keluar</Text>
        </View>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Fail CSV</Text>
        <Text style={styles.body}>
          {hasRecords
            ? count + ' rekod sedia untuk dieksport.'
            : 'Tiada rekod hari ini untuk dieksport.'}
        </Text>
        <View style={styles.codeBox}>
          <Text style={styles.code}>{CSV_HEADER}</Text>
        </View>

        <AppButton
          title="EKSPORT CSV"
          onPress={doExport}
          loading={busy}
          disabled={!hasRecords}
          style={styles.button}
        />
        <AppButton
          title="KONGSI (WhatsApp)"
          color={COLORS.success}
          onPress={doShare}
          loading={sharing}
          disabled={!hasRecords}
          style={styles.button}
        />
        {!hasRecords ? (
          <Text style={styles.note}>
            Daftar kehadiran dahulu di tab Daftar. Fail CSV memerlukan
            sekurang-kurangnya satu rekod.
          </Text>
        ) : null}
      </Card>

      {exported ? (
        <Card>
          <View style={styles.savedHeader}>
            <MaterialIcons
              name="check-circle"
              size={24}
              color={COLORS.success}
            />
            <Text style={styles.savedTitle}>Fail disimpan</Text>
          </View>
          <Text style={styles.path} selectable>
            {exported.fileName}
          </Text>
          <Text style={styles.note} selectable>
            Lokasi: {exported.location}
            {'\n'}
            {exported.path}
          </Text>
          <View style={styles.previewBox}>
            {preview.map((line, index) => (
              <Text key={index} style={styles.previewLine} numberOfLines={1}>
                {line}
              </Text>
            ))}
            <Text style={styles.previewLine}>…</Text>
          </View>
        </Card>
      ) : null}

      <Card style={styles.tipCard}>
        <Text style={styles.sectionTitle}>Nota</Text>
        <Text style={styles.body}>
          Fail CSV menggunakan format UTF-8 dengan BOM, jadi ia dibuka terus
          dalam Excel tanpa huruf rosak. Setiap hari disimpan dalam fail
          berasingan: kehadiran_YYYY-MM-DD.csv.
        </Text>
      </Card>
    </ScrollView>
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
  hero: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    marginBottom: SPACING.lg,
  },
  heroTitle: {
    fontSize: FONT.title,
    fontWeight: '700',
    color: COLORS.white,
  },
  heroSub: {
    fontSize: FONT.body,
    color: 'rgba(255,255,255,0.9)',
    marginTop: SPACING.xs,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  stat: {
    fontSize: FONT.body,
    color: COLORS.white,
    fontWeight: '600',
  },
  statDot: {
    fontSize: FONT.body,
    color: 'rgba(255,255,255,0.7)',
    marginHorizontal: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT.title,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  body: {
    fontSize: FONT.body,
    color: COLORS.textMuted,
    lineHeight: 22,
  },
  codeBox: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  code: {
    fontSize: FONT.body,
    color: COLORS.text,
    fontFamily: 'monospace',
  },
  button: {
    marginBottom: SPACING.md,
  },
  note: {
    fontSize: FONT.body,
    color: COLORS.textMuted,
    lineHeight: 22,
    marginTop: SPACING.sm,
  },
  savedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  savedTitle: {
    fontSize: FONT.title,
    fontWeight: '700',
    color: COLORS.text,
    marginLeft: SPACING.sm,
  },
  path: {
    fontSize: FONT.value,
    fontWeight: '600',
    color: COLORS.text,
  },
  previewBox: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  previewLine: {
    fontSize: FONT.body,
    color: COLORS.textMuted,
    fontFamily: 'monospace',
  },
  tipCard: {
    marginTop: SPACING.lg,
  },
});
