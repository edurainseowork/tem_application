import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '@/components/AppIcon';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { auth } from '@/firebaseConfig';
import { Msg91Widget as DefaultWidget } from '@/components/Msg91Widget';

type AuthMode = 'login' | 'signup';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, isReady, login, getEmailByPhone, verifyOtpAndSignup, sendPasswordReset } = useApp();
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showWidget, setShowWidget] = useState(false);

  useEffect(() => {
    if (isReady && user) router.replace('/home');
  }, [isReady, user]);

  const handleContinue = async () => {
    setError('');
    setIsSubmitting(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (mode === 'signup') {
      if (!name.trim()) { setError('Please enter your name.'); setIsSubmitting(false); return; }
      if (!phone || phone.length < 10) { setError('Please enter a valid 10-digit phone number.'); setIsSubmitting(false); return; }
      const normalizedEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setError('Enter a valid email address.'); setIsSubmitting(false); return; }
      if (password.length < 6) { setError('Password must be at least 6 characters.'); setIsSubmitting(false); return; }
      if (password !== confirmPassword) { setError('Passwords do not match.'); setIsSubmitting(false); return; }

      // Open MSG91 Widget
      setShowWidget(true);
      setIsSubmitting(false);
      return;
    }

    // Login Flow
    const normalizedInput = email.trim().toLowerCase();
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      setIsSubmitting(false);
      return;
    }
    
    // Check if input is a 10 digit phone number
    if (/^\d{10}$/.test(normalizedInput)) {
      const res = await getEmailByPhone(normalizedInput);
      if (!res.ok || !res.email) {
        setError(res.error ?? 'Account not found for this phone number.');
        setIsSubmitting(false);
        return;
      }
      const loginRes = await login(res.email, password);
      if (!loginRes.ok) {
        setError(loginRes.error ?? 'Invalid password.');
        setIsSubmitting(false);
        return;
      }
      setIsSubmitting(false);
      router.replace('/home');
    } else {
      // Treat as email
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedInput)) {
        setError('Enter a valid email or 10-digit phone number.');
        setIsSubmitting(false);
        return;
      }
      const loginRes = await login(normalizedInput, password);
      if (!loginRes.ok) {
        setError(loginRes.error ?? 'Invalid email or password.');
        setIsSubmitting(false);
        return;
      }
      setIsSubmitting(false);
      router.replace('/home');
    }
  };

  const handleForgotPassword = async () => {
    if (!email || /^\d{10}$/.test(email.trim())) {
      setError('Please enter your email address to reset password.');
      return;
    }
    setIsSubmitting(true);
    const res = await sendPasswordReset(email.trim().toLowerCase());
    setIsSubmitting(false);
    if (res.ok) {
      alert('Password reset link sent to your email!');
    } else {
      setError(res.error ?? 'Failed to send reset link.');
    }
  };

  const switchMode = (nextMode: AuthMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setError('');
    setPassword('');
    setConfirmPassword('');
    setShowWidget(false);
  };

  const handleVerificationComplete = async (result: any) => {
    setShowWidget(false);
    if (result.success) {
      setIsSubmitting(true);
      const res = await verifyOtpAndSignup(phone, result.message, name, email, password);
      if (!res.ok) {
        setError(res.error ?? 'Signup failed.');
      } else {
        router.replace('/home');
      }
      setIsSubmitting(false);
    } else {
      setError(result.message || 'OTP Verification failed');
    }
  };

  const passwordMismatch = mode === 'signup' && confirmPassword.length > 0 && password !== confirmPassword;

  if (!isReady) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.coral} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 22, paddingBottom: insets.bottom + 28 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={[styles.iconHalo, { backgroundColor: colors.accent }]}>
            <AppIcon />
          </View>
          <Text style={[styles.kicker, { color: colors.coral }]}>EDURAIN</Text>
          <Text style={[styles.title, { color: colors.navy }]}>YOUR VICTORY STARTS HERE</Text>
        </View>

        <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.modeToggle, { backgroundColor: colors.secondary, marginBottom: 10 }]}>
            {(['login', 'signup'] as AuthMode[]).map((item) => {
              const active = item === mode;
              return (
                <Pressable
                  key={item}
                  onPress={() => switchMode(item)}
                  style={[styles.modeButton, { backgroundColor: active ? colors.card : 'transparent' }]}
                >
                  <Text style={[styles.modeButtonText, { color: active ? colors.navy : colors.inkSubtle }]}>
                    {item === 'login' ? 'Log in' : 'Sign up'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.formTitle, { color: colors.navy, marginTop: 15 }]}>{mode === 'login' ? 'Welcome back' : 'Start your journey'}</Text>
          <Text style={[styles.formHint, { color: colors.inkSubtle }]}>{mode === 'login' ? 'Continue where you left off.' : 'Start building your learning streak.'}</Text>

          {mode === 'signup' ? (
              <>
                <Text style={[styles.label, { color: colors.navy }]}>Your name</Text>
                <View style={[styles.inputWrap, { borderColor: colors.input, backgroundColor: colors.background }]}>
                  <Feather name="user" size={17} color={colors.inkSubtle} />
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g. Ananya"
                    placeholderTextColor={colors.inkSubtle}
                    style={[styles.input, { color: colors.navy }]}
                    autoCapitalize="words"
                  />
                </View>
                <Text style={[styles.label, { color: colors.navy }]}>Phone Number</Text>
                <View style={[styles.inputWrap, { borderColor: colors.input, backgroundColor: colors.background }]}>
                  <Feather name="phone" size={17} color={colors.inkSubtle} />
                  <Text style={{ fontFamily: 'Inter_600SemiBold', color: colors.navy }}>+91</Text>
                  <TextInput
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="9876543210"
                    placeholderTextColor={colors.inkSubtle}
                    style={[styles.input, { color: colors.navy }]}
                    keyboardType="number-pad"
                    maxLength={10}
                  />
                </View>
                <Text style={[styles.label, { color: colors.navy }]}>Email address</Text>
                <View style={[styles.inputWrap, { borderColor: error ? colors.destructive : colors.input, backgroundColor: colors.background }]}>
                  <Feather name="mail" size={17} color={colors.inkSubtle} />
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.inkSubtle}
                    style={[styles.input, { color: colors.navy }]}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <Text style={[styles.label, { color: colors.navy }]}>Password</Text>
                <View style={[styles.inputWrap, { borderColor: error ? colors.destructive : colors.input, backgroundColor: colors.background }]}>
                  <Feather name="lock" size={17} color={colors.inkSubtle} />
                  <TextInput
                    value={password}
                    onChangeText={(value) => {
                      setPassword(value);
                      if (error) setError('');
                    }}
                    placeholder="At least 6 characters"
                    placeholderTextColor={colors.inkSubtle}
                    style={[styles.input, { color: colors.navy }]}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
                    <Feather name={showPassword ? "eye-off" : "eye"} size={17} color={colors.inkSubtle} />
                  </Pressable>
                </View>
                <Text style={[styles.label, { color: colors.navy }]}>Confirm password</Text>
                <View style={[styles.inputWrap, { borderColor: passwordMismatch || error ? colors.destructive : colors.input, backgroundColor: colors.background }]}>
                  <Feather name="check" size={17} color={colors.inkSubtle} />
                  <TextInput
                    value={confirmPassword}
                    onChangeText={(value) => {
                      setConfirmPassword(value);
                      if (error) setError('');
                    }}
                    placeholder="Type it again"
                    placeholderTextColor={colors.inkSubtle}
                    style={[styles.input, { color: colors.navy }]}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                {passwordMismatch ? (
                  <Text style={[styles.error, { color: colors.destructive }]}>
                    आपका password और confirm password same नहीं है।
                  </Text>
                ) : null}
              </>
          ) : (
            <>
              <Text style={[styles.label, { color: colors.navy }]}>Email or Phone Number</Text>
              <View style={[styles.inputWrap, { borderColor: error ? colors.destructive : colors.input, backgroundColor: colors.background }]}>
                <Feather name="user" size={17} color={colors.inkSubtle} />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com or 9876543210"
                  placeholderTextColor={colors.inkSubtle}
                  style={[styles.input, { color: colors.navy }]}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <Text style={[styles.label, { color: colors.navy }]}>Password</Text>
              <View style={[styles.inputWrap, { borderColor: error ? colors.destructive : colors.input, backgroundColor: colors.background }]}>
                <Feather name="lock" size={17} color={colors.inkSubtle} />
                <TextInput
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    if (error) setError('');
                  }}
                  placeholder="Your password"
                  placeholderTextColor={colors.inkSubtle}
                  style={[styles.input, { color: colors.navy }]}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
                  <Feather name={showPassword ? "eye-off" : "eye"} size={17} color={colors.inkSubtle} />
                </Pressable>
              </View>
              <Pressable onPress={handleForgotPassword} style={{ alignSelf: 'flex-end', marginTop: 12 }}>
                <Text style={{ fontFamily: 'Inter_500Medium', fontSize: 12, color: colors.coral }}>Forgot Password?</Text>
              </Pressable>
            </>
          )}

          {error ? <Text style={[styles.error, { color: colors.destructive, marginTop: 12 }]}>{error}</Text> : null}
          
          <Pressable
            testID="continue-button"
            onPress={handleContinue}
            disabled={isSubmitting}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.coral, opacity: pressed || isSubmitting ? 0.8 : 1 },
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <>
                <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                  {mode === 'signup' ? 'Verify & Sign up' : 'Log in'}
                </Text>
                <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
              </>
            )}
          </Pressable>
          <Text style={[styles.legal, { color: colors.inkSubtle }]}>
            {mode === 'login' ? 'Your learning progress stays saved on this device.' : 'Create your account to save your learning progress.'}
          </Text>
        </View>
        <View style={styles.bottomNote}>
          <Feather name="shield" size={15} color={colors.success} />
          <Text style={[styles.bottomNoteText, { color: colors.inkSubtle }]}>Your learning space is private and secure.</Text>
        </View>
      </ScrollView>
      {showWidget && (
        <DefaultWidget
          visible={showWidget}
          onClose={() => setShowWidget(false)}
          onCompletion={handleVerificationComplete}
          widgetId="366942657566373130303537"
          tokenAuth="575019TcH2mXdWy6ab9fc92P1"
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flexGrow: 1, paddingHorizontal: 22 },
  hero: { alignItems: 'center', marginTop: 34, marginBottom: 18 },
  iconHalo: { padding: 8, borderRadius: 23, marginBottom: 15 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 1.5, marginBottom: 8 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 25, lineHeight: 31, letterSpacing: -0.8, textAlign: 'center' },
  modeToggle: { flexDirection: 'row', borderRadius: 12, padding: 4, marginBottom: 18 },
  modeButton: { flex: 1, minHeight: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  modeButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  formCard: { borderWidth: 1, borderRadius: 24, padding: 20, shadowColor: '#14213d', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  formTitle: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  formHint: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 5, marginBottom: 22 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginBottom: 8, marginTop: 12 },
  inputWrap: { minHeight: 52, borderWidth: 1, borderRadius: 15, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 10 },
  input: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 15 },
  error: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 8 },
  primaryButton: { minHeight: 54, borderRadius: 16, marginTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryButtonText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  legal: { fontFamily: 'Inter_400Regular', fontSize: 11, textAlign: 'center', marginTop: 14 },
  bottomNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 'auto', paddingTop: 24 },
  bottomNoteText: { fontFamily: 'Inter_400Regular', fontSize: 12 },
});