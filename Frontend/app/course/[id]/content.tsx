import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CourseContentScreen } from '@/screens/CourseContentScreen';

export default function CourseContentRoute() {
  const params = useLocalSearchParams<{ id?: string; courseId?: string; title?: string }>();
  const router = useRouter();

  return (
    <CourseContentScreen
      courseId={String(params.id || params.courseId || '10')}
      courseTitle={params.title}
      onBack={() => router.back()}
    />
  );
}
