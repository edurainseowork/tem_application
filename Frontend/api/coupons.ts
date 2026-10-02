import { auth } from '../firebaseConfig';
import { API_BASE_URL } from './client';

export interface CouponQuote {
  code: string;
  discountPercent: number;
  originalPrice: number;
  discountAmount: number;
  finalPrice: number;
}

const postJson = async (path: string, body: unknown, token?: string) => {
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
};

// Checks the code against this course without using it up
export const validateCoupon = async (code: string, courseId: number): Promise<CouponQuote> =>
  postJson('/coupons/validate', { code, courseId });

// Counts one use of the coupon; fails if it expired or ran out in the meantime
export const redeemCoupon = async (code: string, courseId: number): Promise<CouponQuote> => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Please sign in to use a coupon');
  return postJson('/coupons/redeem', { code, courseId }, token);
};

export const fetchPublicCoupons = async (courseId: number): Promise<{ code: string; discountPercent: number }[]> => {
  const res = await fetch(`${API_BASE_URL}/api/coupons/public?courseId=${courseId}`);
  const data = await res.json();
  return res.ok ? data.data : [];
};
