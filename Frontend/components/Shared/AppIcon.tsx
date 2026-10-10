import { Image, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

const EDURAIN_LOGO = require('@/assets/images/icon.png');

export function AppIcon({ small = false }: { small?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.logoFrame, small && styles.smallLogoFrame, { backgroundColor: colors.card }]}>
      <Image source={EDURAIN_LOGO} style={styles.logoImage} resizeMode="contain" accessibilityLabel="EDURAIN logo" />
    </View>
  );
}

export function Wordmark() {
  return <Image source={EDURAIN_LOGO} style={styles.wordmarkLogo} resizeMode="contain" accessibilityLabel="EDURAIN logo" />;
}

const styles = StyleSheet.create({
  logoFrame: {
    width: 48,
    height: 48,
    borderRadius: 15,
    overflow: 'hidden',
  },
  smallLogoFrame: { width: 38, height: 38, borderRadius: 12 },
  logoImage: { width: '100%', height: '100%' },
  wordmarkLogo: { width: 52, height: 52, borderRadius: 14 },
});