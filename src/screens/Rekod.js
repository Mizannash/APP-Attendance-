/**
 * Rekod.js — Screen 2 "Rekod"
 *
 * FlatList of today's records + three summary counters.
 * FlatList (not ScrollView) because a 60-worker site produces 120 rows a day
 * and we want windowing on low-RAM devices.
 */

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import {COLORS, FONT, RADIUS, SPACING} from '../theme';
import {getRecordsByDate, summarise} from '../utils/storage';
import {dateKey, formatDate} from '../utils/date';

function Counter({label, value, color}) {
  return (
    <View style={styles.counter}>
      <Text style={[styles.counterValue, {color: color}]}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </View>
  );
}

function Row({record}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.name} numberOfLines={1}>
          {record.name}
        </Text>
        <Text style={styles.meta}>
          {record.jabatan} · {record.type === 'masuk' ? 'Masuk' : 'Keluar'} ·{' '}
          {record.time}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <StatusBadge status={record.status} />
        <Text style={styles.rowDate}>{record.date}</Text>
      </View>
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

export default function Rekod() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Newest first for the list; counters come from the shared pure helper so
  // the numbers here and in the CSV can never drift apart.
  const data = useMemo(() => records.slice().reverse(), [records]);
  const stats = useMemo(() => summarise(records), [records]);
  const today = formatDate(new Date());

  return (
    <View style={styles.flex}>
      <View style={styles.summaryBar}>
        <Counter label="Hadir" value={stats.hadir} color={COLORS.primary} />
        <View style={styles.divider} />
        <Counter label="Lewat" value={stats.lewat} color={COLORS.danger} />
        <View style={styles.divider} />
        <Counter
          label="Sudah Keluar"
          value={stats.sudahKeluar}
          color={COLORS.success}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.muted}>Memuatkan rekod…</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={item => item.id}
          renderItem={({item}) => <Row record={item} />}
          contentContainerStyle={
            data.length === 0 ? styles.emptyContainer : styles.listContent
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.primary]}
              tintColor={COLORS.primary}
            />
          }
          ListHeaderComponent={
            data.length > 0 ? (
              <Card style={styles.headerCard}>
                <Text style={styles.headerTitle}>Rekod Hari Ini</Text>
                <Text style={styles.headerSub}>
                  {today} · {stats.jumlahRekod} rekod
                </Text>
              </Card>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Tiada rekod hari ini</Text>
              <Text style={styles.emptyBody}>
                Tekan tab Daftar untuk merekod kehadiran pekerja.
              </Text>
            </View>
          }
          ItemSeparatorComponent={Separator}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  summaryBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    margin: SPACING.lg,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    elevation: 1,
    paddingVertical: SPACING.lg,
  },
  counter: {
    flex: 1,
    alignItems: 'center',
  },
  counterValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  counterLabel: {
    fontSize: FONT.body,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  emptyContainer: {
    flexGrow: 1,
    paddingHorizontal: SPACING.lg,
  },
  headerCard: {
    marginBottom: SPACING.md,
  },
  headerTitle: {
    fontSize: FONT.title,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerSub: {
    fontSize: FONT.body,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.card,
    padding: SPACING.lg,
    elevation: 1,
  },
  rowMain: {
    flex: 1,
    paddingRight: SPACING.md,
  },
  name: {
    fontSize: FONT.value,
    fontWeight: '700',
    color: COLORS.text,
  },
  meta: {
    fontSize: FONT.body,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  rowDate: {
    fontSize: FONT.body,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },
  separator: {
    height: SPACING.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: {
    fontSize: FONT.body,
    color: COLORS.textMuted,
    marginTop: SPACING.md,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
  },
  emptyTitle: {
    fontSize: FONT.title,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: FONT.body,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: SPACING.sm,
    lineHeight: 22,
    paddingHorizontal: SPACING.lg,
  },
});
