import { auth } from '../firebaseConfig';
import { API_BASE_URL } from './client';

// Razorpay order created by the backend. Contains only the public key id, never the secret.
export interface PaymentOrder {
  free: false;
  orderId: string;
  amount: number; // paise
  currency: string;
  keyId: string;
  courseTitle: string;
  prefill: { name: string; email: string };
}

export type CreateOrderResult = PaymentOrder | { free: true; courseId: number };

export interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

const authPost = async (path: string, body: unknown) => {
  // After a page reload Firebase restores the saved login asynchronously; wait for it
  await auth.authStateReady();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Please sign in to continue');
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
};

// The price is calculated on the server from the course (and coupon)
export const createPaymentOrder = (courseId: number, couponCode?: string): Promise<CreateOrderResult> =>
  authPost('/razorpay/order', { courseId, couponCode });

export const verifyPayment = (result: RazorpaySuccess): Promise<{ success: true; courseId: number }> =>
  authPost('/razorpay/verify', result);

export const reportPaymentFailed = (orderId: string, reason?: string) =>
  authPost('/razorpay/failed', { razorpay_order_id: orderId, reason }).catch(() => undefined);

export const fetchPurchasedCourseIds = async (): Promise<number[]> => {
  await auth.authStateReady();
  const token = await auth.currentUser?.getIdToken();
  if (!token) return [];
  const res = await fetch(`${API_BASE_URL}/api/razorpay/my-courses`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  return res.ok && Array.isArray(data.data) ? data.data : [];
};

// Options passed to Razorpay Checkout (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/)
export const buildCheckoutOptions = (order: PaymentOrder) => ({
  key: order.keyId,
  order_id: order.orderId,
  amount: order.amount,
  currency: order.currency,
  name: 'Edurain',
  description: order.courseTitle,
  prefill: order.prefill,
  theme: { color: '#ff6b4a' },
});
