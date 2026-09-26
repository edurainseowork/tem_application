import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export function AppIcon({ small = false }: { small?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.mark, small && styles.smallMark, { backgroundColor: colors.coral }]}>
      <Feather name="book-open" size={small ? 16 : 22} color={colors.primaryForeground} />
      <View style={[styles.spark, { backgroundColor: colors.gold }]} />
    </View>
  );
}

export function Wordmark({ light = false }: { light?: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.wordmark}>
      <AppIcon small />
      <Text style={[styles.word, { color: light ? colors.primaryForeground : colors.navy }]}>
        EDU<Text style={{ color: colors.coral }}>RAIN</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  smallMark: { width: 30, height: 30, borderRadius: 10 },
  spark: {
    width: 7,
    height: 7,
    borderRadius: 3,
    position: 'absolute',
    top: 7,
    right: 8,
  },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  word: { fontFamily: 'Inter_700Bold', fontSize: 18, letterSpacing: -0.5 },
});