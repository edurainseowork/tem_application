import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { EmailAuthProvider, reauthenticateWithCredential, verifyBeforeUpdateEmail } from 'firebase/auth';
import React from 'react';
import { ActivityIndicator, Alert, Image, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wordmark } from '@/components/Shared/AppIcon';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { auth } from '@/firebaseConfig';
import {
  fetchProfile,
  removeProfilePhoto,
  updateProfile,
  uploadProfilePhoto,
  type Gender,
  type StudentProfile,
} from '@/api/profile';
import { compressProfilePhoto } from '@/utils/compressImage';

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

type Draft = {
  name: string;
  phone: string;
  gender: Gender | null;
  address: string;
  city: string;
  state: string;
  pincode: string;
};

const toDraft = (p: StudentProfile): Draft => ({
  name: p.name ?? '',
  phone: p.phone ?? '',
  gender: p.gender,
  address: p.address ?? '',
  city: p.city ?? '',
  state: p.state ?? '',
  pincode: p.pincode ?? '',
});

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout, updateUser } = useApp();

  const [profile, setProfile] = React.useState<StudentProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [loadError, setLoadError] = React.useState('');

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState('');

  const [photoBusy, setPhotoBusy] = React.useState(false);

  const [changingEmail, setChangingEmail] = React.useState(false);
  const [newEmail, setNewEmail] = React.useState('');
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [emailBusy, setEmailBusy] = React.useState(false);
  const [emailMessage, setEmailMessage] = React.useState<{ text: string; ok: boolean } | null>(null);

  const name = profile?.name || user?.name || 'Student';
  const initials = name.split(' ').map((item) => item[0]).join('').slice(0, 2).toUpperCase();

  const applyProfile = React.useCallback((next: StudentProfile) => {
    setProfile(next);
    updateUser({ name: next.name, email: next.email });
  }, [updateUser]);

  const load = React.useCallback(async () => {
    try {
      const next = await fetchProfile();
      applyProfile(next);
      setLoadError('');
    } catch (e: any) {
      setLoadError(e.message || 'Could not load your profile');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyProfile]);

  // Refresh every time the tab is opened, so new purchases and today's streak show up
  useFocusEffect(
    React.useCallback(() => {
      if (!editing) load();
    }, [load, editing]),
  );

  const handleLogout = async () => {
    await logout();
    router.replace('/');
  };

  const startEditing = () => {
    if (!profile) return;
    setDraft(toDraft(profile));
    setFormError('');
    setEditing(true);
  };

  const saveProfile = async () => {
    if (!draft) return;
    if (draft.name.trim().length < 2) {
      setFormError('Name must be at least 2 characters');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const next = await updateProfile({
        name: draft.name.trim(),
        phone: draft.phone.trim() || null,
        gender: draft.gender,
        address: draft.address.trim() || null,
        city: draft.city.trim() || null,
        state: draft.state.trim() || null,
        pincode: draft.pincode.trim() || null,
      });
      // Also update the Firebase session so the new name shows everywhere straight away
      if (auth.currentUser && auth.currentUser.displayName !== next.name) {
        await auth.currentUser.reload().catch(() => undefined);
      }
      applyProfile(next);
      setEditing(false);
    } catch (e: any) {
      setFormError(e.message || 'Could not save your details');
    } finally {
      setSaving(false);
    }
  };

  const pickPhoto = async () => {
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow photo access to set a profile picture.');
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
            aspect: [1, 1],
      // Lower quality + base64 are only used if on-device resizing is unavailable
      quality: 0.6,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setPhotoBusy(true);
    try {
            const compressed = await compressProfilePhoto(asset.uri, asset.width, asset.height, asset.base64);
      applyProfile(await uploadProfilePhoto(compressed));
    } catch (e: any) {
      Alert.alert('Upload failed', e.message || 'Could not upload your photo. Please try again.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const deletePhoto = async () => {
    setPhotoBusy(true);
    try {
      applyProfile(await removeProfilePhoto());
    } catch (e: any) {
      Alert.alert('Could not remove photo', e.message || 'Please try again.');
    } finally {
      setPhotoBusy(false);
    }
  };

  const onAvatarPress = () => {
    if (photoBusy || !profile) return;
    if (!profile.profilePhoto) {
      pickPhoto();
      return;
    }
    if (Platform.OS === 'web') {
      pickPhoto();
      return;
    }
    Alert.alert('Profile photo', undefined, [
      { text: 'Choose new photo', onPress: pickPhoto },
      { text: 'Remove photo', style: 'destructive', onPress: deletePhoto },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const submitEmailChange = async () => {
    const current = auth.currentUser;
    const email = newEmail.trim().toLowerCase();
    if (!current?.email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailMessage({ text: 'Enter a valid email address', ok: false });
      return;
    }
    if (email === current.email.toLowerCase()) {
      setEmailMessage({ text: 'That is already your email', ok: false });
      return;
    }
    if (!currentPassword) {
      setEmailMessage({ text: 'Enter your current password to confirm', ok: false });
      return;
    }
    setEmailBusy(true);
    setEmailMessage(null);
    try {
      await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, currentPassword));
      // Firebase emails a confirmation link; the login email changes only after it is clicked
      await verifyBeforeUpdateEmail(current, email);
      setEmailMessage({ text: `We sent a confirmation link to ${email}. Open it to finish changing your email.`, ok: true });
      setNewEmail('');
      setCurrentPassword('');
    } catch (e: any) {
      const code = e?.code || '';
      const text =
        code === 'auth/wrong-password' || code === 'auth/invalid-credential' ? 'Current password is incorrect' :
        code === 'auth/email-already-in-use' ? 'That email is already used by another account' :
        code === 'auth/too-many-requests' ? 'Too many attempts. Please try again later.' :
        e.message || 'Could not change your email';
      setEmailMessage({ text, ok: false });
    } finally {
      setEmailBusy(false);
    }
  };

  const genderLabel = GENDER_OPTIONS.find((g) => g.value === profile?.gender)?.label;
  const fullAddress = profile
    ? [profile.address, profile.city, profile.state, profile.pincode].filter(Boolean).join(', ')
    : '';

  const inputStyle = [styles.input, { borderColor: colors.input, backgroundColor: colors.card, color: colors.navy }];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 94 }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.coral} />}
    >
      <View style={styles.brandRow}><Wordmark /><Feather name="settings" size={20} color={colors.inkSubtle} /></View>

      <View style={styles.profileHeader}>
        <Pressable testID="profile-photo" onPress={onAvatarPress} disabled={photoBusy || !profile} style={styles.avatarWrap}>
          {profile?.profilePhoto ? (
            <Image source={{ uri: profile.profilePhoto }} style={styles.bigAvatar} />
          ) : (
            <View style={[styles.bigAvatar, { backgroundColor: colors.coral }]}><Text style={[styles.initials, { color: colors.primaryForeground }]}>{initials}</Text></View>
          )}
          <View style={[styles.cameraBadge, { backgroundColor: colors.navy, borderColor: colors.background }]}>
            {photoBusy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="camera" size={13} color={colors.primaryForeground} />}
          </View>
        </Pressable>
        <Text style={[styles.name, { color: colors.navy }]}>{name}</Text>
        <Text style={[styles.email, { color: colors.inkSubtle }]}>{profile?.email ?? user?.email}</Text>
      </View>

      <View style={styles.stats}>
        <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.navy }]}>{profile ? profile.courses.length : '–'}</Text>
          <Text style={[styles.statLabel, { color: colors.inkSubtle }]}>Courses</Text>
        </View>
        <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.navy }]}>{profile ? `${profile.streak.current} 🔥` : '–'}</Text>
          <Text style={[styles.statLabel, { color: colors.inkSubtle }]}>Day streak</Text>
          {profile && profile.streak.longest > 0 ? (
            <Text style={[styles.statHint, { color: colors.inkSubtle }]}>Best: {profile.streak.longest}</Text>
          ) : null}
        </View>
      </View>

      {loading && !profile ? (
        <ActivityIndicator color={colors.coral} style={{ marginVertical: 24 }} />
      ) : loadError && !profile ? (
        <Pressable onPress={() => { setLoading(true); load(); }} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: 'center' }]}>
          <Feather name="wifi-off" size={20} color={colors.inkSubtle} />
          <Text style={[styles.emptyText, { color: colors.inkSubtle }]}>{loadError}</Text>
          <Text style={[styles.linkText, { color: colors.coral }]}>Tap to retry</Text>
        </Pressable>
      ) : profile ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.navy }]}>Personal details</Text>
            {!editing ? (
              <Pressable testID="edit-profile" onPress={startEditing} hitSlop={8} style={styles.editLink}>
                <Feather name="edit-2" size={13} color={colors.coral} />
                <Text style={[styles.linkText, { color: colors.coral, marginTop: 0 }]}>Edit</Text>
              </Pressable>
            ) : null}
          </View>

          {!editing ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <DetailRow icon="user" label="Name" value={profile.name} colors={colors} />
              <DetailRow icon="mail" label="Email" value={profile.email} colors={colors} />
              <DetailRow icon="phone" label="Phone" value={profile.phone} colors={colors} />
              <DetailRow icon="users" label="Gender" value={genderLabel} colors={colors} />
              <DetailRow icon="map-pin" label="Address" value={fullAddress} colors={colors} />
              <DetailRow icon="calendar" label="Member since" value={formatDate(profile.memberSince)} colors={colors} last />
            </View>
          ) : draft ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Field label="Full name" colors={colors}>
                <TextInput value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} maxLength={80} placeholder="Your name" placeholderTextColor={colors.inkSubtle} style={inputStyle} />
              </Field>
              <Field label="Phone number" colors={colors}>
                <TextInput value={draft.phone} onChangeText={(phone) => setDraft({ ...draft, phone: phone.replace(/[^0-9+]/g, '') })} maxLength={16} keyboardType="phone-pad" placeholder="+91 98765 43210" placeholderTextColor={colors.inkSubtle} style={inputStyle} />
              </Field>
              <Field label="Gender" colors={colors}>
                <View style={styles.chips}>
                  {GENDER_OPTIONS.map((option) => {
                    const active = draft.gender === option.value;
                    return (
                      <Pressable key={option.value} onPress={() => setDraft({ ...draft, gender: active ? null : option.value })} style={[styles.chip, { backgroundColor: active ? colors.navy : colors.card, borderColor: active ? colors.navy : colors.border }]}>
                        <Text style={[styles.chipText, { color: active ? colors.primaryForeground : colors.inkSubtle }]}>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>
              <Field label="Address" colors={colors}>
                <TextInput value={draft.address} onChangeText={(address) => setDraft({ ...draft, address })} maxLength={300} multiline placeholder="House no., street, area" placeholderTextColor={colors.inkSubtle} style={[inputStyle, styles.multiline]} />
              </Field>
              <View style={styles.inlineFields}>
                <Field label="City" colors={colors} style={{ flex: 1 }}>
                  <TextInput value={draft.city} onChangeText={(city) => setDraft({ ...draft, city })} maxLength={80} placeholder="City" placeholderTextColor={colors.inkSubtle} style={inputStyle} />
                </Field>
                <Field label="Pincode" colors={colors} style={{ flex: 1 }}>
                  <TextInput value={draft.pincode} onChangeText={(pincode) => setDraft({ ...draft, pincode: pincode.replace(/[^0-9]/g, '') })} maxLength={6} keyboardType="number-pad" placeholder="411001" placeholderTextColor={colors.inkSubtle} style={inputStyle} />
                </Field>
              </View>
              <Field label="State" colors={colors}>
                <TextInput value={draft.state} onChangeText={(state) => setDraft({ ...draft, state })} maxLength={80} placeholder="State" placeholderTextColor={colors.inkSubtle} style={inputStyle} />
              </Field>

              {formError ? <Text style={[styles.errorText, { color: colors.destructive }]}>{formError}</Text> : null}

              <View style={styles.formActions}>
                <Pressable onPress={() => setEditing(false)} disabled={saving} style={[styles.secondaryButton, { borderColor: colors.border }]}>
                  <Text style={[styles.secondaryButtonText, { color: colors.navy }]}>Cancel</Text>
                </Pressable>
                <Pressable testID="save-profile" onPress={saveProfile} disabled={saving} style={[styles.primaryButton, { backgroundColor: colors.coral, opacity: saving ? 0.7 : 1 }]}>
                  {saving ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Save changes</Text>}
                </Pressable>
              </View>

              <View style={[styles.emailBox, { borderTopColor: colors.border }]}>
                <Pressable onPress={() => { setChangingEmail(!changingEmail); setEmailMessage(null); }} style={styles.editLink}>
                  <Feather name="mail" size={13} color={colors.coral} />
                  <Text style={[styles.linkText, { color: colors.coral, marginTop: 0 }]}>{changingEmail ? 'Cancel email change' : 'Change login email'}</Text>
                </Pressable>
                {changingEmail ? (
                  <>
                    <TextInput value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" keyboardType="email-address" placeholder="New email address" placeholderTextColor={colors.inkSubtle} style={[inputStyle, { marginTop: 10 }]} />
                    <TextInput value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry placeholder="Current password" placeholderTextColor={colors.inkSubtle} style={[inputStyle, { marginTop: 8 }]} />
                    <Pressable onPress={submitEmailChange} disabled={emailBusy} style={[styles.primaryButton, { backgroundColor: colors.navy, marginTop: 10, opacity: emailBusy ? 0.7 : 1 }]}>
                      {emailBusy ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Send confirmation link</Text>}
                    </Pressable>
                  </>
                ) : null}
                {emailMessage ? <Text style={[styles.errorText, { color: emailMessage.ok ? colors.success : colors.destructive }]}>{emailMessage.text}</Text> : null}
              </View>
            </View>
          ) : null}

          <Text style={[styles.sectionTitle, { color: colors.navy, marginTop: 24 }]}>Courses purchased</Text>
          {profile.courses.length ? profile.courses.map((course) => (
            <Pressable key={course.id} onPress={() => router.push(`/course/${course.id}`)} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {course.thumbnail ? (
                <Image source={{ uri: course.thumbnail }} style={styles.courseThumb} />
              ) : (
                <View style={[styles.rowIcon, { backgroundColor: colors.mint }]}><Feather name="book" size={18} color={colors.teal} /></View>
              )}
              <View style={styles.rowBody}>
                <Text style={[styles.rowTitle, { color: colors.navy }]} numberOfLines={2}>{course.title}</Text>
                <Text style={[styles.rowMeta, { color: colors.inkSubtle }]}>{course.category} · Purchased {formatDate(course.purchasedAt)}</Text>
              </View>
              <Feather name="chevron-right" size={17} color={colors.inkSubtle} />
            </Pressable>
          )) : (
            <Pressable onPress={() => router.push('/(tabs)/explore')} style={[styles.emptyLearning, { backgroundColor: colors.accent }]}>
              <Feather name="book-open" size={20} color={colors.coral} />
              <Text style={[styles.emptyTitle, { color: colors.navy }]}>No courses yet</Text>
              <Text style={[styles.emptyText, { color: colors.inkSubtle }]}>Explore a course and start building your streak.</Text>
              <Text style={[styles.linkText, { color: colors.coral }]}>Browse courses <Feather name="arrow-right" size={13} color={colors.coral} /></Text>
            </Pressable>
          )}
        </>
      ) : null}

      <Pressable testID="logout-button" onPress={handleLogout} style={({ pressed }) => [styles.logout, { borderColor: colors.border, opacity: pressed ? 0.65 : 1 }]}><Feather name="log-out" size={17} color={colors.destructive} /><Text style={[styles.logoutText, { color: colors.destructive }]}>Log out</Text></Pressable>
    </ScrollView>
  );
}

type Colors = ReturnType<typeof useColors>;

function DetailRow({ icon, label, value, colors, last }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; value?: string | null; colors: Colors; last?: boolean }) {
  return (
    <View style={[styles.detailRow, !last && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <View style={[styles.detailIcon, { backgroundColor: colors.sky }]}><Feather name={icon} size={14} color={colors.navy} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.detailLabel, { color: colors.inkSubtle }]}>{label}</Text>
        <Text style={[styles.detailValue, { color: value ? colors.navy : colors.inkSubtle }]}>{value || 'Not added'}</Text>
      </View>
    </View>
  );
}

function Field({ label, colors, children, style }: { label: string; colors: Colors; children: React.ReactNode; style?: object }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={[styles.fieldLabel, { color: colors.inkSubtle }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  profileHeader: { alignItems: 'center', marginTop: 35, marginBottom: 24 },
  avatarWrap: { position: 'relative' },
  bigAvatar: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  cameraBadge: { position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: 'Inter_700Bold', fontSize: 28 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 23, marginTop: 14 },
  email: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 5 },
  stats: { flexDirection: 'row', gap: 9, marginBottom: 28 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 16, alignItems: 'center', paddingVertical: 14 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 18 },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 4 },
  statHint: { fontFamily: 'Inter_400Regular', fontSize: 9, marginTop: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, marginBottom: 12 },
  editLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 18, padding: 14 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  detailIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  detailLabel: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  detailValue: { fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 2 },
  field: { marginBottom: 12 },
  fieldLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'Inter_500Medium', fontSize: 13 },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  inlineFields: { flexDirection: 'row', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  errorText: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 8 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  primaryButton: { flex: 1, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  secondaryButton: { flex: 1, height: 46, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  emailBox: { borderTopWidth: 1, marginTop: 16, paddingTop: 14 },
  row: { borderWidth: 1, borderRadius: 18, padding: 13, flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  rowIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  courseThumb: { width: 56, height: 40, borderRadius: 9 },
  rowBody: { flex: 1, marginLeft: 11 },
  rowTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  rowMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  emptyLearning: { borderRadius: 20, padding: 20, alignItems: 'center' },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 11 },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 5, textAlign: 'center' },
  linkText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 16 },
  logout: { borderWidth: 1, borderRadius: 15, height: 50, marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  logoutText: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});