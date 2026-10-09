import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ScreenCapture from 'expo-screen-capture';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, BackHandler, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  SUBMISSION_REASON_TEXT, TestApiError, choiceOptions, fetchTest, fetchTestQuestions, fetchTestResult, formatCountdown, formatTestTime,
  matchOptions, reportViolation, startTest, submitTest,
  type AnswerValue, type ReviewItem, type StudentTest, type SubmissionReason, type TestQuestion, type TestResult,
} from '@/api/tests';
import { QuestionView } from '@/components/Tests/QuestionView';
import { useColors } from '@/hooks/useColors';

// Leaving the app this many times during a test submits it automatically
const MAX_APP_EXITS = 2;
const answersKey = (testId: string, startedAt: string) => `@edurain_test_answers_${testId}_${startedAt}`;

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'intro'; test: StudentTest }
  | { kind: 'taking'; test: StudentTest; questions: TestQuestion[]; endsAt: number; clockOffset: number; storageKey: string; violations: number }
  | { kind: 'result'; result: TestResult; closeTime: string | null };

// Alert.alert does nothing on web, so confirmations fall back to the browser dialogs there
const confirmAsync = (title: string, message: string, confirmText: string) =>
  new Promise<boolean>((resolve) => {
    if (Platform.OS === 'web') {
      resolve(window.confirm(`${title}\n\n${message}`));
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
const notify = (title: string, message: string) => {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

// Integer answers like "-" are incomplete, so they are sent as unanswered
const cleanAnswers = (questions: TestQuestion[], answers: Record<number, AnswerValue>) =>
  Object.fromEntries(questions.map((question) => {
    let value = answers[question.id] ?? null;
    if (value !== null) value = value.trim();
    if (question.type === 'integer' && value !== null && !/^-?\d+$/.test(value)) value = null;
    return [question.id, value || null];
  }));

export default function TestScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const testId = String(id);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);

  const showResult = useCallback(async (closeTime: string | null) => {
    const result = await fetchTestResult(testId);
    setPhase({ kind: 'result', result, closeTime });
  }, [testId]);

  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    try {
      const test = await fetchTest(testId);
      if (test.myAttempt?.status === 'SUBMITTED') await showResult(test.closeTime);
      else setPhase({ kind: 'intro', test });
    } catch (e: any) {
      setPhase({ kind: 'error', message: e.message || 'Failed to load the test' });
    }
  }, [testId, showResult]);

  useEffect(() => { load(); }, [load]);

  const begin = async (test: StudentTest) => {
    setBusy(true);
    try {
      const started = await startTest(testId);
      const { questions, violation_count } = await fetchTestQuestions(testId);
      // The countdown follows the server's clock, not the phone's
      const clockOffset = new Date(started.server_time).getTime() - Date.now();
      setPhase({
        kind: 'taking',
        test,
        questions,
        endsAt: new Date(started.end_at).getTime(),
        clockOffset,
        storageKey: answersKey(testId, started.started_at),
        violations: violation_count,
      });
    } catch (e: any) {
      if (e instanceof TestApiError && e.status === 409) await load(); // already submitted
      else notify('Cannot start the test', e.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* No swipe-back while writing; the hardware back button is handled inside the test */}
      <Stack.Screen options={{ headerShown: false, gestureEnabled: phase.kind !== 'taking' }} />
      <StatusBar hidden={phase.kind === 'taking'} />

      {phase.kind === 'loading' && (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.coral} /></View>
      )}

      {phase.kind === 'error' && (
        <View style={[styles.center, { paddingHorizontal: 30 }]}>
          <Feather name="alert-triangle" size={34} color={colors.destructive} />
          <Text style={[styles.centerTitle, { color: colors.navy }]}>Unable to open the test</Text>
          <Text style={[styles.centerText, { color: colors.inkSubtle }]}>{phase.message}</Text>
          <Pressable onPress={load} style={[styles.primaryButton, { backgroundColor: colors.navy }]}><Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Try again</Text></Pressable>
          <Pressable onPress={() => router.back()} style={styles.linkButton}><Text style={[styles.linkText, { color: colors.inkSubtle }]}>Go back</Text></Pressable>
        </View>
      )}

      {phase.kind === 'intro' && (
        <IntroView test={phase.test} busy={busy} onStart={() => begin(phase.test)} onRefresh={load} topInset={insets.top} bottomInset={insets.bottom} />
      )}

      {phase.kind === 'taking' && (
        <TakingView
          key={phase.storageKey}
          testId={testId}
          phase={phase}
          topInset={insets.top}
          bottomInset={insets.bottom}
          onSubmitted={() => showResult(phase.test.closeTime).catch(() => load())}
        />
      )}

      {phase.kind === 'result' && (
        <ResultView result={phase.result} closeTime={phase.closeTime} topInset={insets.top} bottomInset={insets.bottom} />
      )}
    </View>
  );
}

// ---- Before the test ----

function IntroView({ test, busy, onStart, onRefresh, topInset, bottomInset }: {
  test: StudentTest; busy: boolean; onStart: () => void; onRefresh: () => void; topInset: number; bottomInset: number;
}) {
  const colors = useColors();
  const [now, setNow] = useState(Date.now());
  const startsAt = new Date(test.publishTime).getTime();
  const closesAt = test.closeTime ? new Date(test.closeTime).getTime() : null;
  const notYet = now < startsAt;
  const closed = test.status === 'COMPLETED' || (closesAt !== null && now >= closesAt);
  const resuming = test.myAttempt?.status === 'IN_PROGRESS';

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  // Ask the server again the moment the test should open
  const refreshed = useRef(false);
  useEffect(() => {
    if (!notYet && test.status === 'SCHEDULED' && !refreshed.current) {
      refreshed.current = true;
      onRefresh();
    }
  }, [notYet, test.status, onRefresh]);

  const rules = [
    `${test.totalQuestions} questions · ${test.durationMinutes} minutes`,
    `Correct answer: +${test.marksPositive} · Wrong answer: −${test.marksNegative} · Not answered: 0`,
    'The timer runs on the server and keeps running even if you close the app. The test is submitted automatically when time is up.',
    `Do not leave the app during the test. The first time you get a warning; the ${MAX_APP_EXITS === 2 ? 'second' : `${MAX_APP_EXITS}th`} time the test is submitted automatically.`,
    'Screenshots and screen recording are blocked during the test.',
    'You can attempt this test only once.',
  ];

  return (
    <ScrollView contentContainerStyle={{ paddingTop: topInset + 16, paddingBottom: bottomInset + 30, paddingHorizontal: 20 }}>
      <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="arrow-left" size={19} color={colors.navy} />
      </Pressable>
      <Text style={[styles.kicker, { color: colors.coral, marginTop: 22 }]}>{test.courseName.toUpperCase()}</Text>
      <Text style={[styles.title, { color: colors.navy }]}>{test.title}</Text>
      {test.description ? <Text style={[styles.body, { color: colors.inkSubtle }]}>{test.description}</Text> : null}

      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <InfoRow icon="calendar" label="Starts" value={formatTestTime(test.publishTime)} />
        {test.closeTime ? <InfoRow icon="lock" label="Closes" value={formatTestTime(test.closeTime)} /> : null}
        <InfoRow icon="clock" label="Duration" value={`${test.durationMinutes} min`} />
        <InfoRow icon="list" label="Questions" value={String(test.totalQuestions)} />
      </View>

      <Text style={[styles.sectionTitle, { color: colors.navy }]}>Instructions</Text>
      {rules.map((rule) => (
        <View key={rule} style={styles.ruleRow}>
          <View style={[styles.ruleDot, { backgroundColor: colors.coral }]} />
          <Text style={[styles.ruleText, { color: colors.navy }]}>{rule}</Text>
        </View>
      ))}

      {closed && !resuming ? (
        <View style={[styles.notice, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.noticeText, { color: colors.navy }]}>This test is closed.</Text>
        </View>
      ) : notYet ? (
        <View style={[styles.notice, { backgroundColor: colors.sky }]}>
          <Text style={[styles.noticeLabel, { color: colors.inkSubtle }]}>TEST STARTS IN</Text>
          <Text style={[styles.countdown, { color: colors.navy }]}>{formatCountdown((startsAt - now) / 1000)}</Text>
          <Text style={[styles.noticeText, { color: colors.inkSubtle }]}>The Start button unlocks at {formatTestTime(test.publishTime)}.</Text>
        </View>
      ) : (
        <Pressable onPress={onStart} disabled={busy} style={[styles.primaryButton, { backgroundColor: busy ? colors.secondary : colors.coral }]}>
          {busy ? <ActivityIndicator color={colors.coral} /> : <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>{resuming ? 'Resume test' : 'Start test'}</Text>}
        </Pressable>
      )}
    </ScrollView>
  );
}

function InfoRow({ icon, label, value }: { icon: keyof typeof Feather.glyphMap; label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={styles.infoRow}>
      <Feather name={icon} size={15} color={colors.coral} />
      <Text style={[styles.infoLabel, { color: colors.inkSubtle }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.navy }]}>{value}</Text>
    </View>
  );
}

// ---- During the test ----

function TakingView({ testId, phase, topInset, bottomInset, onSubmitted }: {
  testId: string;
  phase: Extract<Phase, { kind: 'taking' }>;
  topInset: number;
  bottomInset: number;
  onSubmitted: () => void;
}) {
  const colors = useColors();
  const { test, questions, endsAt, clockOffset, storageKey, violations } = phase;
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [current, setCurrent] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(() => (endsAt - (Date.now() + clockOffset)) / 1000);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{ reason: SubmissionReason; message: string } | null>(null);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [showBackModal, setShowBackModal] = useState(false);
  const submittedRef = useRef(false);
  // Starts from the server's count, so closing and reopening the app does not reset it
  const exitsRef = useRef(violations);
  const answersRef = useRef(answers);
  const leftActiveRef = useRef(false);
  answersRef.current = answers;

  // Restore answers after the app was closed and the test resumed
  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((saved) => { if (saved) setAnswers(JSON.parse(saved)); }).catch(() => undefined);
  }, [storageKey]);

  const setAnswer = (questionId: number, value: AnswerValue) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: value };
      AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  };

  const finish = useCallback(async (reason: SubmissionReason) => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitTest(testId, cleanAnswers(questions, answersRef.current), reason, exitsRef.current);
      AsyncStorage.removeItem(storageKey).catch(() => undefined);
      onSubmitted();
    } catch (e: any) {
      // 409 = the server already closed this attempt (time over or already submitted): show the result
      if (e instanceof TestApiError && e.status === 409) {
        AsyncStorage.removeItem(storageKey).catch(() => undefined);
        onSubmitted();
        return;
      }
      submittedRef.current = false;
      setSubmitting(false);
      setSubmitError({ reason, message: e.message || 'Could not submit. Check your internet connection.' });
    }
  }, [testId, questions, storageKey, onSubmitted]);

  // Server-based countdown; submits automatically at zero
  useEffect(() => {
    const tick = () => {
      const left = (endsAt - (Date.now() + clockOffset)) / 1000;
      setSecondsLeft(left);
      if (left <= 0) finish('TIME_EXPIRED');
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [endsAt, clockOffset, finish]);

  // Anti-cheat (NTA-Level): Minimizing the app, split-screen, or app-switching is strictly tracked
  useEffect(() => {
    let lastState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (submittedRef.current) return;

      // Detect leaving the active test window (minimize, split-screen, notification shade, app switch)
      if (lastState === 'active' && (next === 'background' || next === 'inactive')) {
        if (!leftActiveRef.current) {
          leftActiveRef.current = true;
          exitsRef.current += 1;
          reportViolation(testId, 'APP_MINIMIZED')
            .then((serverCount) => { exitsRef.current = Math.max(exitsRef.current, serverCount); })
            .catch(() => undefined);
        }
      }

      // Detect returning to active app focus
      if (next === 'active' && leftActiveRef.current) {
        leftActiveRef.current = false;
        if (exitsRef.current >= MAX_APP_EXITS) {
          // 2nd Attempt: Immediately auto-submits with Cheating flag
          finish('CHEATING_APP_MINIMIZED');
        } else if (exitsRef.current === 1) {
          // 1st Attempt: Prominent red warning pop-up
          setShowWarningModal(true);
        }
      }

      lastState = next;
    });
    return () => subscription.remove();
  }, [testId, finish]);

  // Block screenshots and screen recording while the test is open (FLAG_SECURE)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    ScreenCapture.preventScreenCaptureAsync('test').catch(() => undefined);
    return () => { ScreenCapture.allowScreenCaptureAsync('test').catch(() => undefined); };
  }, []);

  const answeredCount = questions.filter((q) => (answers[q.id] ?? null) !== null).length;

  const askSubmit = useCallback(async () => {
    const unanswered = questions.length - answeredCount;
    const ok = await confirmAsync(
      'Submit test?',
      unanswered > 0 ? `You have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'}. You cannot change answers after submitting.` : 'You cannot change answers after submitting.',
      'Submit',
    );
    if (ok) finish('MANUAL_SUBMIT');
  }, [questions.length, answeredCount, finish]);

  // Android back button: intercept and warn that back navigation is locked
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setShowBackModal(true);
      return true;
    });
    return () => sub.remove();
  }, []);

  const question = questions[current];
  const lowTime = secondsLeft <= 60;

  if (submitting || submitError) {
    return (
      <View style={[styles.center, { paddingHorizontal: 30 }]}>
        {submitError ? (
          <>
            <Feather name="wifi-off" size={34} color={colors.destructive} />
            <Text style={[styles.centerTitle, { color: colors.navy }]}>Your test is not submitted yet</Text>
            <Text style={[styles.centerText, { color: colors.inkSubtle }]}>{submitError.message} Your answers are saved on this phone.</Text>
            <Pressable onPress={() => finish(submitError.reason)} style={[styles.primaryButton, { backgroundColor: colors.coral }]}>
              <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Try again</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={colors.coral} />
            <Text style={[styles.centerText, { color: colors.inkSubtle, marginTop: 14 }]}>Submitting your answers...</Text>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.testHeader, { paddingTop: topInset + 10, backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: colors.coral }]} numberOfLines={1}>{test.courseName.toUpperCase()}</Text>
          <Text style={[styles.headerTitle, { color: colors.navy }]} numberOfLines={1}>{test.title}</Text>
        </View>
        <View style={[styles.timer, { backgroundColor: lowTime ? colors.destructive : colors.navy }]}>
          <Feather name="clock" size={13} color={colors.primaryForeground} />
          <Text style={[styles.timerText, { color: colors.primaryForeground }]}>{formatCountdown(secondsLeft)}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.palette} style={{ flexGrow: 0 }}>
        {questions.map((q, index) => {
          const answered = (answers[q.id] ?? null) !== null;
          const active = index === current;
          return (
            <Pressable
              key={q.id}
              testID={`palette-${index + 1}`}
              onPress={() => setCurrent(index)}
              style={[styles.paletteItem, { backgroundColor: answered ? colors.coral : colors.card, borderColor: active ? colors.navy : answered ? colors.coral : colors.border, borderWidth: active ? 2 : 1 }]}
            >
              <Text style={[styles.paletteText, { color: answered ? colors.primaryForeground : colors.navy }]}>{index + 1}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
        <QuestionView
          key={question.id}
          question={question}
          index={current}
          total={questions.length}
          value={answers[question.id] ?? null}
          onChange={(value: AnswerValue) => setAnswer(question.id, value)}
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomInset + 12, backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable onPress={() => setCurrent(Math.max(0, current - 1))} disabled={current === 0} style={[styles.navButton, { backgroundColor: colors.secondary, opacity: current === 0 ? 0.5 : 1 }]}>
          <Feather name="arrow-left" size={17} color={colors.navy} />
        </Pressable>
        <Text style={[styles.footerText, { color: colors.inkSubtle }]}>{answeredCount}/{questions.length} answered</Text>
        {current < questions.length - 1 ? (
          <Pressable onPress={() => setCurrent(current + 1)} style={[styles.navWide, { backgroundColor: colors.navy }]}>
            <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Next</Text>
            <Feather name="arrow-right" size={16} color={colors.primaryForeground} />
          </Pressable>
        ) : (
          <Pressable onPress={askSubmit} style={[styles.navWide, { backgroundColor: colors.coral }]}>
            <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Submit</Text>
          </Pressable>
        )}
      </View>
      {current < questions.length - 1 && (
        <Pressable onPress={askSubmit} style={[styles.submitEarly, { bottom: bottomInset + 82, backgroundColor: colors.card, borderColor: colors.coral }]}>
          <Text style={[styles.submitEarlyText, { color: colors.coral }]}>Submit test</Text>
        </Pressable>
      )}

      {/* NTA Anti-Cheat Warning Modal (1st Attempt) */}
      <Modal visible={showWarningModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.warningCard, { backgroundColor: '#1A0B0B', borderColor: '#EF4444' }]}>
            <View style={styles.warningIconBadge}>
              <Feather name="alert-triangle" size={38} color="#EF4444" />
            </View>
            <Text style={styles.warningTitle}>Warning 1/2: Do not minimize the app.</Text>
            <Text style={styles.warningBody}>
              Leaving the exam screen, minimizing the app, opening split-screen, or switching to other apps is strictly prohibited under exam conditions.
            </Text>
            <View style={styles.warningAlertBox}>
              <Text style={styles.warningAlertText}>
                ⚠️ Warning: If you minimize or leave the test 1 more time, your test will be immediately AUTO-SUBMITTED and flagged for Cheating.
              </Text>
            </View>
            <Pressable
              onPress={() => setShowWarningModal(false)}
              style={styles.warningButton}
            >
              <Text style={styles.warningButtonText}>I Understand — Return to Test</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Back Button Disabled Modal */}
      <Modal visible={showBackModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.warningCard, { backgroundColor: '#111827', borderColor: '#6366F1' }]}>
            <View style={[styles.warningIconBadge, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
              <Feather name="shield" size={38} color="#818CF8" />
            </View>
            <Text style={[styles.warningTitle, { color: '#FFFFFF' }]}>Full-Screen Exam Mode Active</Text>
            <Text style={styles.warningBody}>
              Back navigation is strictly locked to prevent cheating. If you wish to finish your test, please complete all questions and use the Submit button.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Pressable
                onPress={() => setShowBackModal(false)}
                style={[styles.warningButton, { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)' }]}
              >
                <Text style={styles.warningButtonText}>Continue Test</Text>
              </Pressable>
              <Pressable
                onPress={() => { setShowBackModal(false); askSubmit(); }}
                style={[styles.warningButton, { flex: 1, backgroundColor: colors.coral }]}
              >
                <Text style={styles.warningButtonText}>Submit Now</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---- After the test ----

const formatAnswer = (item: ReviewItem, value: string | null) => {
  if (value === null) return 'Not answered';
  const choices = choiceOptions(item.options);
  if (choices.length) return value.split(',').map((key) => `${key}. ${choices.find((o) => o.key === key)?.text ?? ''}`).join(', ');
  const match = matchOptions(item.options);
  if (match) return value.split(',').join('  ');
  return value.split('|').join(' or ');
};

function ResultView({ result, closeTime, topInset, bottomInset }: { result: TestResult; closeTime: string | null; topInset: number; bottomInset: number }) {
  const colors = useColors();
  const statusColor = { CORRECT: colors.success, WRONG: colors.destructive, SKIPPED: colors.inkSubtle };
  const stats: [string, number | undefined, string][] = [
    ['Correct', result.correct_count, colors.success],
    ['Wrong', result.wrong_count, colors.destructive],
    ['Skipped', result.skipped_count, colors.inkSubtle],
  ];

  return (
    <ScrollView contentContainerStyle={{ paddingTop: topInset + 16, paddingBottom: bottomInset + 30, paddingHorizontal: 20 }}>
      <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="arrow-left" size={19} color={colors.navy} />
      </Pressable>
      <View style={{ alignItems: 'center', marginTop: 16 }}>
        <View style={[styles.resultIcon, { backgroundColor: colors.mint }]}><Feather name="award" size={32} color={colors.success} /></View>
        <Text style={[styles.kicker, { color: colors.success, marginTop: 18 }]}>TEST SUBMITTED</Text>
        <Text style={[styles.title, { color: colors.navy, textAlign: 'center' }]}>{result.test_title}</Text>
        <Text style={[styles.body, { color: colors.inkSubtle }]}>{result.course_name}</Text>
        <Text style={[styles.score, { color: colors.coral }]}>{result.score}</Text>
        <Text style={[styles.body, { color: colors.inkSubtle, marginTop: 0 }]}>score</Text>
      </View>

      <View style={styles.statsRow}>
        {stats.map(([label, value, color]) => (
          <View key={label} style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color }]}>{value ?? 0}</Text>
            <Text style={[styles.statLabel, { color: colors.inkSubtle }]}>{label}</Text>
          </View>
        ))}
      </View>
      {result.submission_reason ? (
        <Text style={[styles.reason, { color: result.submission_reason.startsWith('CHEATING') ? colors.destructive : colors.inkSubtle }]}>
          {SUBMISSION_REASON_TEXT[result.submission_reason] ?? result.submission_reason}
        </Text>
      ) : null}

      <Text style={[styles.sectionTitle, { color: colors.navy }]}>Answers</Text>
      {!result.answers_available || !result.review ? (
        <View style={[styles.notice, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.noticeText, { color: colors.navy }]}>
            {closeTime
              ? `Correct answers will be shown after the test closes at ${formatTestTime(closeTime)}.`
              : 'Correct answers will be shown after the test closes.'}
          </Text>
        </View>
      ) : (
        result.review.map((item) => (
          <View key={item.questionId} style={[styles.reviewCard, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: statusColor[item.status] }]}>
            <View style={styles.reviewHeader}>
              <Text style={[styles.reviewNumber, { color: colors.navy }]}>Q{item.questionOrder}</Text>
              <Text style={[styles.reviewStatus, { color: statusColor[item.status] }]}>{item.status} · {item.marks > 0 ? `+${item.marks}` : item.marks}</Text>
            </View>
            {item.passage ? <Text style={[styles.reviewPassage, { color: colors.inkSubtle }]} numberOfLines={3}>{item.passage}</Text> : null}
            <Text style={[styles.reviewQuestion, { color: colors.navy }]}>{item.questionText}</Text>
            <Text style={[styles.reviewLine, { color: colors.inkSubtle }]}>Your answer: <Text style={{ color: item.status === 'WRONG' ? colors.destructive : colors.navy }}>{formatAnswer(item, item.myAnswer)}</Text></Text>
            <Text style={[styles.reviewLine, { color: colors.inkSubtle }]}>Correct answer: <Text style={{ color: colors.success }}>{formatAnswer(item, item.correctAnswer)}</Text></Text>
            {item.solution ? <Text style={[styles.reviewLine, { color: colors.inkSubtle }]}>Solution: {item.solution}</Text> : null}
          </View>
        ))
      )}

      <Pressable onPress={() => router.back()} style={[styles.primaryButton, { backgroundColor: colors.navy }]}>
        <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>Back to course</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 14, textAlign: 'center' },
  centerText: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 6, textAlign: 'center' },
  back: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 25, lineHeight: 31, letterSpacing: -0.7, marginTop: 6 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 6 },
  infoCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 10, marginTop: 20 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoLabel: { fontFamily: 'Inter_500Medium', fontSize: 12, width: 72 },
  infoValue: { fontFamily: 'Inter_600SemiBold', fontSize: 13, flex: 1 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 26, marginBottom: 10 },
  ruleRow: { flexDirection: 'row', gap: 10, marginBottom: 9 },
  ruleDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  ruleText: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, flex: 1 },
  notice: { borderRadius: 16, padding: 16, marginTop: 22, alignItems: 'center' },
  noticeLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },
  noticeText: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  countdown: { fontFamily: 'Inter_700Bold', fontSize: 34, letterSpacing: -1, marginVertical: 6 },
  primaryButton: { minHeight: 54, borderRadius: 16, marginTop: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, alignSelf: 'stretch' },
  primaryText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  linkButton: { marginTop: 14 },
  linkText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  testHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 2 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8 },
  timerText: { fontFamily: 'Inter_700Bold', fontSize: 14, fontVariant: ['tabular-nums'] },
  palette: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  paletteItem: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  paletteText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  footerText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  navButton: { width: 48, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  navWide: { minWidth: 110, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  submitEarly: { position: 'absolute', right: 16, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  submitEarlyText: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  resultIcon: { width: 72, height: 72, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  score: { fontFamily: 'Inter_700Bold', fontSize: 56, letterSpacing: -2, marginTop: 12 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  statBox: { flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 22 },
  statLabel: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 2 },
  reason: { fontFamily: 'Inter_500Medium', fontSize: 12, textAlign: 'center', marginTop: 14 },
  reviewCard: { borderWidth: 1, borderLeftWidth: 4, borderRadius: 14, padding: 13, marginBottom: 10, gap: 5 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  reviewNumber: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  reviewStatus: { fontFamily: 'Inter_700Bold', fontSize: 11 },
  reviewPassage: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 },
  reviewQuestion: { fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 20 },
  reviewLine: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  warningCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 25,
  },
  warningIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  warningTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: '#EF4444',
    textAlign: 'center',
    marginBottom: 10,
  },
  warningBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 20,
    color: '#E5E7EB',
    textAlign: 'center',
    marginBottom: 14,
  },
  warningAlertBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 12,
    padding: 12,
    width: '100%',
    marginBottom: 18,
  },
  warningAlertText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    lineHeight: 18,
    color: '#FCA5A5',
    textAlign: 'center',
  },
  warningButton: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningButtonText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
});