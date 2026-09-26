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

type AuthMode = 'login' | 'signup';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, isReady, login, signup } = useApp();
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isReady && user) router.replace('/home');
  }, [isReady, user]);

  const handleContinue = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = mode === 'login'
      ? await login(normalizedEmail, password)
      : await signup(name, normalizedEmail, password);
    if (!result.ok) {
      setError(result.error ?? 'Something went wrong. Please try again.');
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(false);
    router.replace('/home');
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

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
          <Text style={[styles.kicker, { color: colors.coral }]}>ADRENALINE</Text>
          <Text style={[styles.title, { color: colors.navy }]}>YOUR VICTORY STARTS HERE</Text>
        </View>

        <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.modeToggle, { backgroundColor: colors.secondary }]}>
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
          <Text style={[styles.formTitle, { color: colors.navy }]}>{mode === 'login' ? 'Welcome back' : 'Start your journey'}</Text>
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
            </>
          ) : null}
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
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.inkSubtle}
              style={[styles.input, { color: colors.navy }]}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {mode === 'signup' ? (
            <>
              <Text style={[styles.label, { color: colors.navy }]}>Confirm password</Text>
              <View style={[styles.inputWrap, { borderColor: error ? colors.destructive : colors.input, backgroundColor: colors.background }]}>
                <Feather name="check" size={17} color={colors.inkSubtle} />
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Type it again"
                  placeholderTextColor={colors.inkSubtle}
                  style={[styles.input, { color: colors.navy }]}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </>
          ) : null}
          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
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
                <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{mode === 'login' ? 'Log in' : 'Create account'}</Text>
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