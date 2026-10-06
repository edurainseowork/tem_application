import { useEffect, useRef } from 'react';
import { buildCheckoutOptions } from '@/api/payments';
import type { RazorpayCheckoutProps } from './RazorpayCheckout';

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

let scriptPromise: Promise<void> | null = null;
const loadCheckoutScript = () => {
  if ((window as any).Razorpay) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('Could not load Razorpay. Check your internet connection.'));
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
};

// Web build: opens Razorpay's standard checkout popup on top of the page
export function RazorpayCheckout({ order, onSuccess, onClose }: RazorpayCheckoutProps) {
  const callbacks = useRef({ onSuccess, onClose });
  callbacks.current = { onSuccess, onClose };

  useEffect(() => {
    if (!order) return;
    let lastError: string | undefined;
    loadCheckoutScript()
      .then(() => {
        const checkout = new (window as any).Razorpay({
          ...buildCheckoutOptions(order),
          handler: (response: any) => callbacks.current.onSuccess(response),
          modal: { ondismiss: () => callbacks.current.onClose(lastError), escape: false, confirm_close: true },
        });
        checkout.on('payment.failed', (response: any) => {
          lastError = response?.error?.description || response?.error?.reason || 'Payment failed';
        });
        checkout.open();
      })
      .catch((e: Error) => callbacks.current.onClose(e.message));
  }, [order]);

  return null;
}
