import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatTestTime, type StudentTest } from '@/api/tests';
import { useColors } from '@/hooks/useColors';

type Props = { test: StudentTest; now: number };

type CardState = { label: string; tone: 'live' | 'upcoming' | 'done' | 'missed'; action: string | null; detail: string };

// What the student can do with this test right now. The server re-checks everything when the test starts.
export function testCardState(test: StudentTest, now: number): CardState {
  const attempt = test.myAttempt;
  const started = now >= new Date(test.publishTime).getTime();
  const closed = test.status === 'COMPLETED' || (test.closeTime !== null && now >= new Date(test.closeTime).getTime());

  if (attempt?.status === 'SUBMITTED') {
    return { label: 'SUBMITTED', tone: 'done', action: 'View result', detail: `Score ${attempt.score} · ${attempt.correct_count} correct` };
  }
  if (attempt?.status === 'IN_PROGRESS') {
    return { label: 'IN PROGRESS', tone: 'live', action: 'Resume test', detail: `Ends ${formatTestTime(attempt.end_at)}` };
  }
  if (closed) return { label: 'CLOSED', tone: 'missed', action: null, detail: 'You did not attempt this test' };
  if (!started) return { label: 'UPCOMING', tone: 'upcoming', action: null, detail: `Starts ${formatTestTime(test.publishTime)}` };
  return {
    label: 'LIVE NOW',
    tone: 'live',
    action: 'Start test',
    detail: test.closeTime ? `Open until ${formatTestTime(test.closeTime)}` : `Opened ${formatTestTime(test.publishTime)}`,
  };
}

export function TestCard({ test, now }: Props) {
  const colors = useColors();
  const state = testCardState(test, now);
  const toneColor = { live: colors.coral, upcoming: colors.lavender, done: colors.success, missed: colors.inkSubtle }[state.tone];

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/test/[id]', params: { id: test.id } })}
      style={[styles.card, { backgroundColor: colors.card, borderColor: state.tone === 'live' ? colors.coral : colors.border }]}
    >
      <View style={[styles.icon, { backgroundColor: colors.accent }]}>
        <Feather name={state.tone === 'done' ? 'check-circle' : state.tone === 'upcoming' ? 'lock' : 'edit-3'} size={18} color={toneColor} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.badge, { color: toneColor }]}>{state.label}</Text>
        <Text style={[styles.title, { color: colors.navy }]} numberOfLines={2}>{test.title}</Text>
        <Text style={[styles.meta, { color: colors.inkSubtle }]}>
          {test.totalQuestions} questions · {test.durationMinutes} min · +{test.marksPositive}/−{test.marksNegative}
        </Text>
        <Text style={[styles.meta, { color: colors.inkSubtle }]}>{state.detail}</Text>
      </View>
      {state.action ? (
        <View style={[styles.action, { backgroundColor: state.tone === 'done' ? colors.secondary : colors.coral }]}>
          <Text style={[styles.actionText, { color: state.tone === 'done' ? colors.navy : colors.primaryForeground }]}>{state.action}</Text>
        </View>
      ) : (
        <Feather name="chevron-right" size={18} color={colors.inkSubtle} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  icon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  badge: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  meta: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
  action: { borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8 },
  actionText: { fontFamily: 'Inter_700Bold', fontSize: 11 },
});

export default TestCard;