import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { canJoinLiveClass, formatLiveClassWindow, getLiveClassStatus, JOIN_EARLY_MINUTES, type LiveClass } from '@/api/liveClasses';
import { useColors } from '@/hooks/useColors';

type Props = {
  liveClass: LiveClass;
  now: number;
  eyebrow?: string;
  subtitle?: string | null;
  highlighted?: boolean;
};

// We only redirect to Google Meet; the call itself happens in the Meet app or browser
export const joinLiveClass = async (meetUrl: string) => {
  try {
    await Linking.openURL(meetUrl);
  } catch {
    Alert.alert('Unable to open Google Meet', 'Please install Google Meet or try again from your browser.');
  }
};

export function LiveClassCard({ liveClass, now, eyebrow, subtitle, highlighted }: Props) {
  const colors = useColors();
  const status = getLiveClassStatus(liveClass, now);
  const isLive = status === 'live';
  const joinable = canJoinLiveClass(liveClass, now);

  return (
    <View style={[styles.card, { backgroundColor: isLive ? colors.navy : colors.card, borderColor: isLive ? colors.navy : highlighted ? colors.coral : colors.border }]}>
      <View style={styles.headerRow}>
        <View style={[styles.icon, { backgroundColor: isLive ? colors.coral : colors.accent }]}>
          <Feather name="video" size={17} color={isLive ? colors.primaryForeground : colors.coral} />
        </View>
        <View style={{ flex: 1 }}>
          {eyebrow ? <Text style={[styles.eyebrow, { color: isLive ? '#bdc8df' : colors.inkSubtle }]}>{eyebrow}</Text> : null}
          <Text style={[styles.title, { color: isLive ? colors.primaryForeground : colors.navy }]}>{liveClass.title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: isLive ? '#bdc8df' : colors.inkSubtle }]}>{subtitle}</Text> : null}
        </View>
        <View style={[styles.badge, { backgroundColor: isLive ? colors.coral : status === 'ended' ? colors.muted : colors.sky }]}>
          <Text style={[styles.badgeText, { color: isLive ? colors.primaryForeground : colors.navy }]}>
            {isLive ? 'LIVE NOW' : status === 'ended' ? 'ENDED' : 'UPCOMING'}
          </Text>
        </View>
      </View>

      <View style={styles.timeRow}>
        <Feather name="calendar" size={13} color={isLive ? colors.gold : colors.coral} />
        <Text style={[styles.timeText, { color: isLive ? colors.primaryForeground : colors.navy }]}>
          {formatLiveClassWindow(liveClass.startTime, liveClass.endTime, new Date(now))}
        </Text>
      </View>

      {status === 'ended' ? null : joinable ? (
        <Pressable
          testID={`join-live-class-${liveClass.id}`}
          onPress={() => joinLiveClass(liveClass.meetUrl)}
          style={({ pressed }) => [styles.joinButton, { backgroundColor: colors.coral, opacity: pressed ? 0.8 : 1 }]}
        >
          <Feather name="video" size={16} color={colors.primaryForeground} />
          <Text style={[styles.joinText, { color: colors.primaryForeground }]}>Join Live Class</Text>
        </Pressable>
      ) : (
        <View style={[styles.joinButton, { backgroundColor: colors.muted }]}>
          <Feather name="clock" size={15} color={colors.inkSubtle} />
          <Text style={[styles.joinText, { color: colors.inkSubtle }]}>Join opens {JOIN_EARLY_MINUTES} min before start</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 15, marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.6, marginBottom: 3 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 14, lineHeight: 19 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 },
  badge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5 },
  badgeText: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.4 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  timeText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  joinButton: { marginTop: 13, minHeight: 46, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  joinText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
});