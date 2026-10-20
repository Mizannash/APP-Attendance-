/**
 * Ringkasan.js — Screen 4 "Ringkasan AI"
 *
 * Sends the day's records to our own Cloudflare Worker, which forwards them to
 * DeepSeek and returns a Malay summary plus flags the model noticed (nobody
 * checked out, a whole department late, etc.).
 *
 * This screen is explicitly online: the rest of the app stays offline-first, so
 * a failed call only shows a Malay message — it never blocks check-in.
 */

import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Share from 'react-native-share';

import AppButton from '../components/AppButton';
import Card from '../components/Card';
import {COLORS, FONT, RADIUS, SPACING} from '../theme';
import {getRecordsByDate, summarise} from '../utils/storage';
import {buildPayload, janaRingkasan, ringkasanToText} from '../utils/ai';
import {isAiConfigured} from '../config';
import {dateKey, formatDate} from '../utils/date';

export default function Ringkasan() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const todayLabel = formatDate(new Date());
  const configured = isAiConfigured();

  const load = useCallback(async () => {
    const today = await getRecordsByDate(dateKey(new Date()));
    setRecords(today);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await load();
      if (alive) {
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const stats = summarise(records);
  const workerCount = buildPayload(records, todayLabel).pekerja.length;

  const run = useCallback(async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await janaRingkasan(records, {dayLabel: todayLabel});
      if (!response.ok) {
        setError(response.message);
        return;
      }
      setResult(response);
    } finally {
      setBusy(false);
    }
  }, [busy, records, todayLabel]);

  const share = useCallback(async () => {
    if (!result) {
      return;
    }
    const text = ringkasanToText(result, todayLabel);
    try {
      await Share.open({
        title: 'Ringkasan Kehadiran',
        message: text,
        type: 'text/plain',
        failOnCancel: false,
      });
    } catch (shareError) {
      Alert.alert('Kongsi Gagal', 'Ringkasan tidak dapat dikongsi.', [
        {text: 'OK'},
      ]);
    }
  }, [result, todayLabel]);

  const hasRecords = records.length > 0;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Card style={styles.hero}>
        <Text style={styles.heroTitle}>Ringkasan AI</Text>
        <Text style={styles.heroSub}>{todayLabel}</Text>
        <View style={styles.statsRow}>
          <Text style={styles.stat}>{stats.hadir} pekerja</Text>
          <Text style={styles.statDot}>·</Text>
          <Text style={styles.stat}>{stats.lewat} lewat</Text>
          <Text style={styles.statDot}>·</Text>
          <Text style={styles.stat}>{stats.sudahKeluar} keluar</Text>
        </View>
      </Card>

      {!configured ? (
        <Card style={styles.setupCard}>
          <View style={styles.setupHeader}>
            <MaterialIcons name="settings" size={26} color={COLORS.warning} />
            <Text style={styles.setupTitle}>Pelayan AI belum disediakan</Text>
          </View>
          <Text style={styles.body}>
            Deploy Worker DeepSeek dahulu (folder server/deepseek-proxy),
            kemudian masukkan URL dan kunci aplikasi dalam src/config.js. Lihat
            docs/DEPLOY.md bahagian 8.
          </Text>
        </Card>
      ) : null}

      <Card>
        <Text style={styles.sectionTitle}>Jana ringkasan hari ini</Text>
        <Text style={styles.body}>
          {loading
            ? 'Memuatkan rekod hari ini…'
            : hasRecords
            ? workerCount +
              ' pekerja akan dihantar ke DeepSeek untuk diringkaskan dalam Bahasa Malaysia.'
            : 'Tiada rekod hari ini. Daftar kehadiran dahulu di tab Daftar.'}
        </Text>

        <AppButton
          title={busy ? 'MENJANA…' : 'JANA RINGKASAN AI'}
          onPress={run}
          loading={busy}
          disabled={loading || !hasRecords || !configured}
          style={styles.button}
        />

        {busy ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.loadingText}>Menghubungi DeepSeek…</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <MaterialIcons
              name="error-outline"
              size={22}
              color={COLORS.danger}
            />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Text style={styles.privacy}>
          Nota privasi: nama, jabatan dan masa kehadiran hari ini dihantar ke
          pelayan DeepSeek untuk diproses. Tiada data disimpan di pelayan
          selepas jawapan dipulangkan.
        </Text>
      </Card>

      {result ? (
        <Card style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <MaterialIcons
              name="auto-awesome"
              size={24}
              color={COLORS.primary}
            />
            <Text style={styles.resultTitle}>Ringkasan</Text>
          </View>
          <Text style={styles.ringkasanText} selectable>
            {result.ringkasan}
          </Text>

          {result.amaran && result.amaran.length > 0 ? (
            <View style={styles.amaranBox}>
              <Text style={styles.amaranTitle}>Perlu perhatian</Text>
              {result.amaran.map((item, index) => (
                <View key={index} style={styles.amaranRow}>
                  <MaterialIcons
                    name="warning-amber"
                    size={20}
                    color={COLORS.warning}
                  />
                  <Text style={styles.amaranText}>{item}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {result.cadangan ? (
            <View style={styles.cadanganBox}>
              <Text style={styles.cadanganTitle}>Cadangan</Text>
              <Text style={styles.body}>{result.cadangan}</Text>
            </View>
          ) : null}

          <AppButton
            title="KONGSI RINGKASAN"
            color={COLORS.success}
            onPress={share}
            style={styles.button}
          />
          <Text style={styles.footnote}>
            Model: {result.model}
            {result.usage && result.usage.total_tokens
              ? ' · ' + result.usage.total_tokens + ' token'
              : ''}
          </Text>
        </Card>
      ) : null}
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
  setupCard: {
    marginBottom: SPACING.lg,
    borderColor: COLORS.warning,
  },
  setupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  setupTitle: {
    fontSize: FONT.value,
    fontWeight: '700',
    color: COLORS.warning,
    marginLeft: SPACING.sm,
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
  button: {
    marginTop: SPACING.lg,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  loadingText: {
    fontSize: FONT.body,
    color: COLORS.textMuted,
    marginLeft: SPACING.sm,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dangerTint,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  errorText: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: FONT.body,
    color: COLORS.danger,
    lineHeight: 22,
  },
  privacy: {
    fontSize: FONT.body,
    color: COLORS.textMuted,
    lineHeight: 22,
    marginTop: SPACING.md,
  },
  resultCard: {
    marginTop: SPACING.lg,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  resultTitle: {
    fontSize: FONT.title,
    fontWeight: '700',
    color: COLORS.text,
    marginLeft: SPACING.sm,
  },
  ringkasanText: {
    fontSize: FONT.value,
    color: COLORS.text,
    lineHeight: 26,
  },
  amaranBox: {
    backgroundColor: '#fef7e0',
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    marginTop: SPACING.lg,
  },
  amaranTitle: {
    fontSize: FONT.body,
    fontWeight: '700',
    color: COLORS.warning,
    marginBottom: SPACING.sm,
  },
  amaranRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  amaranText: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: FONT.body,
    color: COLORS.text,
    lineHeight: 22,
  },
  cadanganBox: {
    backgroundColor: COLORS.primaryTint,
    borderRadius: RADIUS.card,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  cadanganTitle: {
    fontSize: FONT.body,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: SPACING.xs,
  },
  footnote: {
    fontSize: FONT.body,
    color: COLORS.textMuted,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
});
