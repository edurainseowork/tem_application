import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QUIZ_QUESTIONS, getCourse } from '@/constants/data';
import { useColors } from '@/hooks/useColors';

export default function QuizScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const course = getCourse(id);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const question = QUIZ_QUESTIONS[current];

  const choose = async (index: number) => {
    setSelected(index);
    await Haptics.selectionAsync();
  };

  const next = () => {
    if (selected === null) return;
    if (current === QUIZ_QUESTIONS.length - 1) {
      setScore(QUIZ_QUESTIONS.reduce((total, item, index) => total + (index === current ? (selected === item.answer ? 1 : 0) : 0), 0));
      return;
    }
    setCurrent((value) => value + 1);
    setSelected(null);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 26 }]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={[styles.back, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="arrow-left" size={19} color={colors.navy} /></Pressable>
          <View style={styles.topTitle}><Text style={[styles.kicker, { color: colors.coral }]}>WEEKLY CHECK-IN</Text><Text style={[styles.courseName, { color: colors.navy }]}>{course.title}</Text></View>
          <Text style={[styles.counter, { color: colors.inkSubtle }]}>{score === null ? `${current + 1}/${QUIZ_QUESTIONS.length}` : 'Done'}</Text>
        </View>
        {score === null ? (
          <>
            <View style={[styles.progressTrack, { backgroundColor: colors.secondary }]}><View style={[styles.progress, { backgroundColor: colors.coral, width: `${((current + 1) / QUIZ_QUESTIONS.length) * 100}%` }]} /></View>
            <Text style={[styles.questionLabel, { color: colors.inkSubtle }]}>QUESTION {current + 1}</Text>
            <Text style={[styles.question, { color: colors.navy }]}>{question.question}</Text>
            <View style={styles.options}>
              {question.options.map((option, index) => {
                const active = selected === index;
                return <Pressable key={option} onPress={() => choose(index)} style={[styles.option, { backgroundColor: active ? colors.accent : colors.card, borderColor: active ? colors.coral : colors.border }]}><View style={[styles.radio, { borderColor: active ? colors.coral : colors.input, backgroundColor: active ? colors.coral : colors.card }]}>{active ? <View style={[styles.radioDot, { backgroundColor: colors.primaryForeground }]} /> : null}</View><Text style={[styles.optionText, { color: colors.navy }]}>{option}</Text></Pressable>;
              })}
            </View>
            <Pressable onPress={next} disabled={selected === null} style={[styles.nextButton, { backgroundColor: selected === null ? colors.secondary : colors.coral }]}><Text style={[styles.nextText, { color: selected === null ? colors.inkSubtle : colors.primaryForeground }]}>{current === QUIZ_QUESTIONS.length - 1 ? 'Finish quiz' : 'Next question'}</Text><Feather name="arrow-right" size={17} color={selected === null ? colors.inkSubtle : colors.primaryForeground} /></Pressable>
          </>
        ) : (
          <View style={styles.result}>
            <View style={[styles.resultIcon, { backgroundColor: colors.mint }]}><Feather name="award" size={34} color={colors.success} /></View>
            <Text style={[styles.resultKicker, { color: colors.success }]}>QUIZ COMPLETE</Text>
            <Text style={[styles.resultTitle, { color: colors.navy }]}>A strong start.</Text>
            <Text style={[styles.resultScore, { color: colors.coral }]}>{score}/{QUIZ_QUESTIONS.length}</Text>
            <Text style={[styles.resultText, { color: colors.inkSubtle }]}>Keep showing up. Consistency compounds faster than you think.</Text>
            <Pressable onPress={() => router.back()} style={[styles.nextButton, { backgroundColor: colors.navy }]}><Text style={[styles.nextText, { color: colors.primaryForeground }]}>Back to course</Text><Feather name="arrow-right" size={17} color={colors.primaryForeground} /></Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  topTitle: { alignItems: 'center' },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1 },
  courseName: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 4 },
  counter: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  progressTrack: { height: 6, borderRadius: 3, marginTop: 27, overflow: 'hidden' },
  progress: { height: 6, borderRadius: 3 },
  questionLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1, marginTop: 37 },
  question: { fontFamily: 'Inter_700Bold', fontSize: 25, lineHeight: 32, letterSpacing: -0.7, marginTop: 10 },
  options: { gap: 10, marginTop: 28 },
  option: { minHeight: 60, borderWidth: 1, borderRadius: 16, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  radio: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  optionText: { fontFamily: 'Inter_500Medium', fontSize: 13, flex: 1, lineHeight: 19 },
  nextButton: { minHeight: 54, borderRadius: 16, marginTop: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  nextText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  result: { alignItems: 'center', paddingTop: 88 },
  resultIcon: { width: 78, height: 78, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  resultKicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2, marginTop: 24 },
  resultTitle: { fontFamily: 'Inter_700Bold', fontSize: 31, letterSpacing: -1, marginTop: 9 },
  resultScore: { fontFamily: 'Inter_700Bold', fontSize: 60, letterSpacing: -2, marginTop: 15 },
  resultText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 22, textAlign: 'center', maxWidth: 270, marginTop: 6 },
});