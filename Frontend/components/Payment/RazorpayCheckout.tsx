import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import React, { useMemo, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { buildCheckoutOptions, type PaymentOrder, type RazorpaySuccess } from '@/api/payments';
import { useColors } from '@/hooks/useColors';

export type RazorpayCheckoutProps = {
  order: PaymentOrder | null; // checkout opens while this is set
  onSuccess: (result: RazorpaySuccess) => void;
  onClose: (lastError?: string) => void; // closed without a successful payment
};

// Runs Razorpay's standard checkout.js inside a WebView and reports the result back to the app
const checkoutHtml = (order: PaymentOrder) => {
  // Escape "<" so values from the server cannot break out of the script tag
  const options = JSON.stringify(buildCheckoutOptions(order)).replace(/</g, '\\u003c');
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;background:#ffffff">
<script>
  function send(message) { window.ReactNativeWebView.postMessage(JSON.stringify(message)); }
</script>
<script src="https://checkout.razorpay.com/v1/checkout.js" onerror="send({ type: 'error', message: 'Could not load Razorpay. Check your internet connection.' })"></script>
<script>
  var options = ${options};
  options.handler = function (response) { send({ type: 'success', data: response }); };
  options.modal = { ondismiss: function () { send({ type: 'dismiss' }); }, escape: false, confirm_close: true };
  var checkout = new Razorpay(options);
  checkout.on('payment.failed', function (response) {
    send({ type: 'failed', message: (response.error && (response.error.description || response.error.reason)) || 'Payment failed' });
  });
  checkout.open();
</script>
</body></html>`;
};

export function RazorpayCheckout({ order, onSuccess, onClose }: RazorpayCheckoutProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const lastError = useRef<string | undefined>(undefined);
  const html = useMemo(() => (order ? checkoutHtml(order) : ''), [order]);

  const handleMessage = (event: WebViewMessageEvent) => {
    let message: { type: string; data?: RazorpaySuccess; message?: string };
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message.type === 'success' && message.data) {
      lastError.current = undefined;
      onSuccess(message.data);
    } else if (message.type === 'failed') {
      // Razorpay lets the user retry inside checkout, so only remember the error
      lastError.current = message.message;
    } else if (message.type === 'dismiss') {
      onClose(lastError.current);
      lastError.current = undefined;
    } else if (message.type === 'error') {
      onClose(message.message);
    }
  };

  return (
    <Modal visible={!!order} animationType="slide" onRequestClose={() => onClose(lastError.current)}>
      <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => onClose(lastError.current)} style={styles.close} accessibilityLabel="Cancel payment">
            <Feather name="x" size={22} color={colors.navy} />
          </Pressable>
          <Text style={[styles.title, { color: colors.navy }]}>Secure payment</Text>
        </View>
        {order ? (
          <WebView
            originWhitelist={['*']}
            source={{ html, baseUrl: 'https://checkout.razorpay.com' }}
            onMessage={handleMessage}
            javaScriptEnabled
            domStorageEnabled
            setSupportMultipleWindows={false}
            // UPI apps and bank pages open outside the WebView (upi://, intent://, tez://, ...)
            onShouldStartLoadWithRequest={(request) => {
              if (/^(https?|about|data|blob):/i.test(request.url)) return true;
              Linking.openURL(request.url).catch(() => undefined);
              return false;
            }}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 16 },
});
