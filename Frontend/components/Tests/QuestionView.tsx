import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { choiceOptions, matchOptions, type AnswerValue, type TestQuestion } from '@/api/tests';
import { useColors } from '@/hooks/useColors';

type Props = {
  question: TestQuestion;
  index: number;
  total: number;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
};

const TYPE_LABELS: Record<TestQuestion['type'], string> = {
  multiple_choice: 'Multiple choice',
  integer: 'Integer answer',
  fill_ups: 'Fill in the blank',
  true_false: 'True or false',
  comprehension: 'Comprehension',
  match_the_following: 'Match the following',
};

// "A-2,B-1" ⇄ { A: "2", B: "1" }
const parsePairs = (value: AnswerValue): Record<string, string> =>
  Object.fromEntries((value ?? '').split(',').map((pair) => pair.split('-')).filter((p) => p.length === 2 && p[0] && p[1]));
const formatPairs = (pairs: Record<string, string>) => {
  const text = Object.keys(pairs).sort().map((key) => `${key}-${pairs[key]}`).join(',');
  return text || null;
};

export function QuestionView({ question, index, total, value, onChange }: Props) {
  const colors = useColors();
  const [showPassage, setShowPassage] = useState(true);
  const choices = choiceOptions(question.options);
  const match = matchOptions(question.options);
  const usesChoices = question.type === 'multiple_choice' || (question.type === 'comprehension' && choices.length > 0);
  const usesText = question.type === 'fill_ups' || (question.type === 'comprehension' && choices.length === 0);
  const selected = new Set((value ?? '').split(',').filter(Boolean));

  const toggleChoice = (key: string) => {
    if (!question.multiple_correct) {
      onChange(selected.has(key) ? null : key);
      return;
    }
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next.size ? [...next].sort().join(',') : null);
  };

  const pairs = parsePairs(value);
  const setPair = (left: string, right: string) => {
    const next = { ...pairs };
    if (next[left] === right) delete next[left];
    else next[left] = right;
    onChange(formatPairs(next));
  };

  const optionRow = (key: string, text: string, active: boolean, onPress: () => void, square = false) => (
    <Pressable
      key={key}
      testID={`option-${key}`}
      onPress={onPress}
      style={[styles.option, { backgroundColor: active ? colors.accent : colors.card, borderColor: active ? colors.coral : colors.border }]}
    >
      <View style={[square ? styles.checkbox : styles.radio, { borderColor: active ? colors.coral : colors.input, backgroundColor: active ? colors.coral : colors.card }]}>
        {active ? (square ? <Feather name="check" size={13} color={colors.primaryForeground} /> : <View style={[styles.radioDot, { backgroundColor: colors.primaryForeground }]} />) : null}
      </View>
      <Text style={[styles.optionKey, { color: colors.coral }]}>{key}</Text>
      <Text style={[styles.optionText, { color: colors.navy }]}>{text}</Text>
    </Pressable>
  );

  return (
    <View>
      <View style={styles.metaRow}>
        <Text style={[styles.questionLabel, { color: colors.inkSubtle }]}>QUESTION {index + 1} OF {total} · {TYPE_LABELS[question.type].toUpperCase()}</Text>
        <Text style={[styles.marks, { color: colors.inkSubtle }]}>+{question.marks_positive} / −{question.marks_negative}</Text>
      </View>

      {question.passage ? (
        <View style={[styles.passage, { backgroundColor: colors.sky, borderColor: colors.border }]}>
          <Pressable onPress={() => setShowPassage(!showPassage)} style={styles.passageHeader}>
            <Text style={[styles.passageTitle, { color: colors.navy }]}>Passage</Text>
            <Feather name={showPassage ? 'chevron-up' : 'chevron-down'} size={16} color={colors.navy} />
          </Pressable>
          {showPassage && <Text style={[styles.passageText, { color: colors.navy }]}>{question.passage}</Text>}
        </View>
      ) : null}

      <Text style={[styles.question, { color: colors.navy }]}>{question.question_text}</Text>

      {usesChoices && (
        <View style={styles.options}>
          {question.multiple_correct && <Text style={[styles.hint, { color: colors.inkSubtle }]}>One or more options may be correct. Select all that apply.</Text>}
          {choices.map((option) => optionRow(option.key, option.text, selected.has(option.key), () => toggleChoice(option.key), question.multiple_correct))}
        </View>
      )}

      {question.type === 'true_false' && (
        <View style={styles.options}>
          {optionRow('T', 'True', value === 'TRUE', () => onChange(value === 'TRUE' ? null : 'TRUE'))}
          {optionRow('F', 'False', value === 'FALSE', () => onChange(value === 'FALSE' ? null : 'FALSE'))}
        </View>
      )}

      {question.type === 'integer' && (
        <TextInput
          value={value ?? ''}
          onChangeText={(text) => {
            const cleaned = text.replace(/[^\d-]/g, '').replace(/(?!^)-/g, '');
            onChange(cleaned === '' ? null : cleaned);
          }}
          testID="answer-input"
          keyboardType="numbers-and-punctuation"
          placeholder="Type a whole number"
          placeholderTextColor={colors.inkSubtle}
          maxLength={12}
          style={[styles.input, { color: colors.navy, borderColor: value ? colors.coral : colors.border, backgroundColor: colors.card }]}
        />
      )}

      {usesText && (
        <TextInput
          value={value ?? ''}
          onChangeText={(text) => onChange(text.trim() === '' ? null : text)}
          testID="answer-input"
          placeholder="Type your answer"
          placeholderTextColor={colors.inkSubtle}
          maxLength={200}
          autoCorrect={false}
          autoCapitalize="none"
          style={[styles.input, { color: colors.navy, borderColor: value ? colors.coral : colors.border, backgroundColor: colors.card }]}
        />
      )}

      {match && (
        <View style={styles.options}>
          <View style={[styles.matchKey, { backgroundColor: colors.secondary }]}>
            {match.right.map((item) => (
              <Text key={item.key} style={[styles.matchKeyText, { color: colors.navy }]}><Text style={{ color: colors.coral }}>{item.key}.</Text> {item.text}</Text>
            ))}
          </View>
          {match.left.map((item) => (
            <View key={item.key} style={[styles.matchRow, { borderColor: pairs[item.key] ? colors.coral : colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.matchLeft, { color: colors.navy }]}><Text style={{ color: colors.coral }}>{item.key}.</Text> {item.text}</Text>
              <View style={styles.matchChoices}>
                {match.right.map((right) => {
                  const active = pairs[item.key] === right.key;
                  return (
                    <Pressable
                      key={right.key}
                      testID={`match-${item.key}-${right.key}`}
                      onPress={() => setPair(item.key, right.key)}
                      style={[styles.matchChip, { backgroundColor: active ? colors.coral : colors.secondary }]}
                    >
                      <Text style={[styles.matchChipText, { color: active ? colors.primaryForeground : colors.navy }]}>{right.key}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      )}

      {value !== null && (
        <Pressable onPress={() => onChange(null)} style={styles.clear} hitSlop={8}>
          <Feather name="x-circle" size={14} color={colors.inkSubtle} />
          <Text style={[styles.clearText, { color: colors.inkSubtle }]}>Clear answer</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  questionLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.8, flexShrink: 1 },
  marks: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  passage: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 14 },
  passageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  passageTitle: { fontFamily: 'Inter_700Bold', fontSize: 12 },
  passageText: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 8 },
  question: { fontFamily: 'Inter_700Bold', fontSize: 19, lineHeight: 27, letterSpacing: -0.3, marginTop: 14 },
  hint: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  options: { gap: 10, marginTop: 20 },
  option: { minHeight: 56, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  radio: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  checkbox: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  optionKey: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  optionText: { fontFamily: 'Inter_500Medium', fontSize: 14, flex: 1, lineHeight: 20 },
  input: { borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontFamily: 'Inter_500Medium', fontSize: 16, marginTop: 20 },
  matchKey: { borderRadius: 14, padding: 12, gap: 4 },
  matchKeyText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  matchRow: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 },
  matchLeft: { fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  matchChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  matchChip: { minWidth: 40, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  matchChipText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  clear: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, alignSelf: 'flex-start' },
  clearText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
});

export default QuestionView;
