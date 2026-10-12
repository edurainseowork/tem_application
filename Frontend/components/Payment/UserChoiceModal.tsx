import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export type BillingChoice = 'google_play' | 'razorpay';

export interface UserChoiceModalProps {
  visible: boolean;
  amountFormatted: string;
  courseTitle: string;
  onSelect: (choice: BillingChoice) => void;
  onClose: () => void;
}

export function UserChoiceModal({
  visible,
  amountFormatted,
  courseTitle,
  onSelect,
  onClose,
}: UserChoiceModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        {/* Modal Card adhering to Golden Ratio (1.618) spacing scale and horizontal symmetry */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: 'rgba(255, 255, 255, 0.2)',
              paddingBottom: insets.bottom > 0 ? insets.bottom + 16 : 26,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={[styles.title, { color: colors.navy }]}>
                Choose Payment Method
              </Text>
              <Text style={[styles.subtitle, { color: colors.inkSubtle }]}>
                {courseTitle} • {amountFormatted}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: colors.background }]}
              accessibilityLabel="Close payment options"
            >
              <Feather name="x" size={20} color={colors.navy} />
            </Pressable>
          </View>

          <Text style={[styles.infoNote, { color: colors.inkSubtle }]}>
            In compliance with Google Play's User Choice Billing policy, you can pay using Google Play or our direct secure payment gateway.
          </Text>

          {/* Option 1: Google Play */}
          <Pressable
            style={({ pressed }) => [
              styles.optionCard,
              {
                backgroundColor: colors.background,
                borderColor: pressed ? colors.coral : 'rgba(0,0,0,0.08)',
                transform: [{ scale: pressed ? 0.985 : 1 }],
              },
            ]}
            onPress={() => onSelect('google_play')}
          >
            <View style={[styles.iconWrap, { backgroundColor: '#4285F415' }]}>
              <Feather name="shopping-bag" size={22} color="#4285F4" />
            </View>
            <View style={styles.optionContent}>
              <View style={styles.optionTitleRow}>
                <Text style={[styles.optionTitle, { color: colors.navy }]}>
                  Google Play Billing
                </Text>
                <View style={[styles.badge, { backgroundColor: '#4285F415' }]}>
                  <Text style={[styles.badgeText, { color: '#4285F4' }]}>Official</Text>
                </View>
              </View>
              <Text style={[styles.optionDesc, { color: colors.inkSubtle }]}>
                Pay via Google Play balance, Cards, or UPI linked to your Google Account.
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.inkSubtle} />
          </Pressable>

          {/* Option 2: Razorpay / Direct UPI & Cards */}
          <Pressable
            style={({ pressed }) => [
              styles.optionCard,
              {
                backgroundColor: colors.background,
                borderColor: pressed ? colors.coral : 'rgba(0,0,0,0.08)',
                transform: [{ scale: pressed ? 0.985 : 1 }],
              },
            ]}
            onPress={() => onSelect('razorpay')}
          >
            <View style={[styles.iconWrap, { backgroundColor: '#FF6B4A15' }]}>
              <Feather name="credit-card" size={22} color={colors.coral} />
            </View>
            <View style={styles.optionContent}>
              <View style={styles.optionTitleRow}>
                <Text style={[styles.optionTitle, { color: colors.navy }]}>
                  Direct Payment (Razorpay)
                </Text>
                <View style={[styles.badge, { backgroundColor: '#FF6B4A15' }]}>
                  <Text style={[styles.badgeText, { color: colors.coral }]}>Instant</Text>
                </View>
              </View>
              <Text style={[styles.optionDesc, { color: colors.inkSubtle }]}>
                Pay via direct UPI (GPay, PhonePe, Paytm), NetBanking, or Credit/Debit Cards.
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.inkSubtle} />
          </Pressable>

          {/* Security note */}
          <View style={styles.footerNote}>
            <Feather name="shield" size={14} color="#10B981" />
            <Text style={styles.footerNoteText}>
              256-bit encrypted • PCI-DSS Certified • RBI Compliant
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  card: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    paddingHorizontal: 21, // ~13 * 1.618 golden scale
    paddingTop: 21,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerLeft: {
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 3,
    fontWeight: '500',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoNote: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 16,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 13, // ~8 * 1.618
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 13,
  },
  optionContent: {
    flex: 1,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  optionDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  footerNoteText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
});
