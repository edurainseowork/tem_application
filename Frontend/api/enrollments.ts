import { auth } from '../firebaseConfig';
import { API_BASE_URL } from './client';

// TEMPORARY until Razorpay checkout: records the purchase on the backend so the student
// receives Go Live notifications for this course.
export const enrollInCourse = async (courseId: number) => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Please sign in again');
  const res = await fetch(`${API_BASE_URL}/api/enrollments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ courseId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not save your enrollment');
  return data;
};
