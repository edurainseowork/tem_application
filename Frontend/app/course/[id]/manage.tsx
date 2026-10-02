import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CourseContentManagerScreen } from '@/screens/CourseContentManagerScreen';

export default function CourseContentManagerRoute() {
  const params = useLocalSearchParams<{ id?: string; courseId?: string; title?: string }>();
  const router = useRouter();

  return (
    <CourseContentManagerScreen
      courseId={params.id || params.courseId}
      courseTitle={params.title}
      onBack={() => router.back()}
    />
  );
}
