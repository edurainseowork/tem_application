import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fetchCourseTests, type StudentTest } from '@/api/tests';
import { useColors } from '@/hooks/useColors';
import { useNow } from '@/hooks/useNow';
import { TestCard } from './TestCard';

// "Tests" block at the top of the course content screen. Renders nothing when the course has no tests.
export function CourseTestsSection({ courseId }: { courseId: string }) {
  const colors = useColors();
  const now = useNow(15000);
  const [tests, setTests] = useState<StudentTest[]>([]);
  const [error, setError] = useState('');

  // Reload whenever the screen comes back into view, e.g. after finishing a test
  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchCourseTests(courseId)
        .then((data) => { if (active) { setTests(data); setError(''); } })
        .catch((e) => { if (active) setError(e.message || 'Failed to load tests'); });
      return () => { active = false; };
    }, [courseId]),
  );

  if (tests.length === 0 && !error) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: colors.navy }]}>Tests</Text>
      {error ? (
        <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
      ) : (
        tests.map((test) => <TestCard key={test.id} test={test} now={now} />)
      )}
      <Text style={[styles.heading, { color: colors.navy, marginTop: 8 }]}>Materials</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 4 },
  heading: { fontFamily: 'Inter_700Bold', fontSize: 15, marginBottom: 10 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 12, marginBottom: 10 },
});

export default CourseTestsSection;