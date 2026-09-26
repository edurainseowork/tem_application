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
import { AppIcon, Wordmark } from '@/components/AppIcon';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, isReady, login } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isReady && user) router.replace('/(tabs)');
  }, [isReady, user]);

  const handleContinue = async () => {
    if (!email.includes('@')) {
      setError('Enter a valid email to continue.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await login(name, email);
    setIsSubmitting(false);
    router.replace('/(tabs)');
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
        <Wordmark />
        <View style={styles.hero}>
          <View style={[styles.iconHalo, { backgroundColor: colors.accent }]}>
            <AppIcon />
          </View>
          <Text style={[styles.kicker, { color: colors.coral }]}>YOUR NEXT WIN STARTS HERE</Text>
          <Text style={[styles.title, { color: colors.navy }]}>Learn with momentum.</Text>
          <Text style={[styles.subtitle, { color: colors.inkSubtle }]}>
            Focused courses, live mentors, and a clear path to your next big score.
          </Text>
        </View>

        <View style={[styles.formCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.formTitle, { color: colors.navy }]}>Start your journey</Text>
          <Text style={[styles.formHint, { color: colors.inkSubtle }]}>Save your progress across devices.</Text>

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
                <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Continue</Text>
                <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
              </>
            )}
          </Pressable>
          <Text style={[styles.legal, { color: colors.inkSubtle }]}>
            By continuing, you agree to learn at your own pace.
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
  hero: { alignItems: 'center', marginTop: 54, marginBottom: 28 },
  iconHalo: { padding: 10, borderRadius: 26, marginBottom: 22 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.3, marginBottom: 10 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 34, letterSpacing: -1.5, textAlign: 'center' },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 12, maxWidth: 310 },
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