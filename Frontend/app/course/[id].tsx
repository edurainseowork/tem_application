import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatPrice } from '@/constants/data';
import { useApp } from '@/context/AppContext';
import { useColors } from '@/hooks/useColors';
import { API_BASE_URL, type CourseMentor } from '@/api/client';
import { fetchPublicCoupons, validateCoupon } from '@/api/coupons';
import { fetchCourseLiveClasses, getLiveClassStatus, type LiveClass } from '@/api/liveClasses';
import { LiveClassCard } from '@/components/LiveClass/LiveClassCard';
import { useNow } from '@/hooks/useNow';
import { createPaymentOrder, reportPaymentFailed, verifyPayment, type PaymentOrder, type RazorpaySuccess } from '@/api/payments';
import { RazorpayCheckout } from '@/components/Payment/RazorpayCheckout';
import { KeyboardAwareScrollViewCompat } from '@/components/Shared/KeyboardAwareScrollViewCompat';
export default function CourseDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isPurchased, purchaseCourse, user } = useApp();
  
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    if (!id) return;
    
    fetch(`${API_BASE_URL}/api/courses/${id}`)
      .then(async (res) => {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
          return res.json();
        } else {
          const text = await res.text();
          throw new Error("Received non-JSON response from API: " + text.substring(0, 50));
        }
      })
      .then(data => {
        if (!data.error) {
          // Mentor and metrics come from the CMS (Course Manager); empty ones are hidden.
          setCourse({
            ...data,
            subtitle: data.category + " Mastery",
            tone: 'coral',
          });
        }
        setLoading(false);
      })
      .catch(e => {
        console.warn("Course fetch error:", e.message);
        setLoading(false);
      });
  }, [id]);

  const unlocked = course ? isPurchased(course.id.toString()) : false;
  
  const [coupon, setCoupon] = useState('');
  const [discount, setDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState('');
  const [couponValid, setCouponValid] = useState(false);
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [checkoutOrder, setCheckoutOrder] = useState<PaymentOrder | null>(null);
  const [paymentMessage, setPaymentMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [publicCoupon, setPublicCoupon] = useState<{ code: string; discountPercent: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'content'>('content');
  const [courseContent, setCourseContent] = useState<any[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);

  React.useEffect(() => {
    if (unlocked && user?.uid && course) {
      setLoadingContent(true);
      fetch(`${API_BASE_URL}/api/content/${course.id}?uid=${user.uid}&admin=true`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setCourseContent(data.data);
          }
        })
        .catch(e => console.error("Content fetch error:", e))
        .finally(() => setLoadingContent(false));
    }
  }, [unlocked, user?.uid, course]);

  // Live classes are only returned by the API for students enrolled in this course
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([]);
  const now = useNow();

  useFocusEffect(
    useCallback(() => {
      if (!unlocked || !user?.uid || !course) return;
      let active = true;
      const load = () => {
        fetchCourseLiveClasses(course.id)
          .then((data) => { if (active) setLiveClasses(data); })
          .catch((e) => {
            console.warn('Live classes fetch error:', e.message);
            if (active) setLiveClasses([]);
          });
      };
      load();
      const interval = setInterval(load, 20000); // polls every 20s
      return () => { active = false; clearInterval(interval); };
    }, [unlocked, user?.uid, course]),
  );

  const visibleLiveClasses = liveClasses.filter((liveClass) => getLiveClassStatus(liveClass, now) !== 'ended');

  // Suggest a public coupon that applies to this course
  React.useEffect(() => {
    if (!course || unlocked) return;
    fetchPublicCoupons(course.id)
      .then((coupons) => setPublicCoupon(coupons[0] ?? null))
      .catch(() => setPublicCoupon(null));
  }, [course, unlocked]);

  const clearCoupon = (message: string) => {
    setDiscount(0);
    setAppliedCode(null);
    setCouponValid(false);
    setCouponMessage(message);
  };

  const applyCoupon = async () => {
    const code = coupon.trim().toUpperCase();
    if (!course || !code) return;
    setApplyingCoupon(true);
    try {
      const quote = await validateCoupon(code, course.id);
      setDiscount(quote.discountAmount);
      setAppliedCode(quote.code);
      setCouponValid(true);
      setCouponMessage(`${quote.discountPercent}% off applied`);
    } catch (e: any) {
      clearCoupon(e.message || 'That code is not valid.');
    } finally {
      setApplyingCoupon(false);
    }
  };

  const completePurchase = async () => {
    await purchaseCourse(course.id.toString());
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setPaymentMessage({ text: 'Payment successful. Your course is unlocked!', ok: true });
  };

  // Razorpay flow: the backend creates the order (and sets the price), Razorpay takes the payment,
  // then the backend verifies the signature before the course is unlocked
  const buyNow = async () => {
    if (!course || purchasing) return;
    setPurchasing(true);
    setPaymentMessage(null);
    try {
      const order = await createPaymentOrder(course.id, appliedCode ?? undefined);
      if (order.free) {
        await completePurchase();
        setPurchasing(false);
        return;
      }
      setCheckoutOrder(order); // opens Razorpay; purchasing stays true until it closes
    } catch (e: any) {
      if (appliedCode && /coupon/i.test(e.message || '')) clearCoupon(e.message);
      setPaymentMessage({ text: e.message || 'Could not start the payment. Please try again.', ok: false });
      setPurchasing(false);
    }
  };

  const handlePaymentSuccess = async (result: RazorpaySuccess) => {
    setCheckoutOrder(null);
    try {
      await verifyPayment(result);
      await completePurchase();
    } catch (e: any) {
      setPaymentMessage({ text: `${e.message || 'Payment could not be verified'}. If money was deducted, contact support with payment ID ${result.razorpay_payment_id}.`, ok: false });
    } finally {
      setPurchasing(false);
    }
  };

  const handleCheckoutClosed = (lastError?: string) => {
    if (checkoutOrder) reportPaymentFailed(checkoutOrder.orderId, lastError ?? 'Checkout closed');
    setCheckoutOrder(null);
    setPurchasing(false);
    setPaymentMessage({ text: lastError ? `Payment failed: ${lastError}` : 'Payment cancelled.', ok: false });
  };

  const openExternal = (url: string) => Linking.openURL(url);

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.navy }}>Loading course details...</Text>
      </View>
    );
  }

  if (!course) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: colors.navy }}>Course not found.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 20 }}><Text style={{ color: colors.coral }}>Go Back</Text></Pressable>
      </View>
    );
  }
    const mentors: CourseMentor[] = Array.isArray(course.mentors) ? course.mentors.filter((m: CourseMentor) => m?.name) : [];

  const metrics: { icon: 'users' | 'clock' | 'layers'; value: string; label: string }[] = [
    course.studentsEnrolled != null && { icon: 'users' as const, value: Number(course.studentsEnrolled).toLocaleString('en-IN'), label: 'Students enrolled' },
    course.duration && { icon: 'clock' as const, value: String(course.duration), label: 'Duration' },
    course.totalLessons != null && { icon: 'layers' as const, value: String(course.totalLessons), label: 'Lessons' },
  ].filter(Boolean) as { icon: 'users' | 'clock' | 'layers'; value: string; label: string }[];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
            {/* Scrolls the focused coupon field above the keyboard (bottomOffset keeps Apply and the message visible too) */}
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
        bottomOffset={110}
      >
        <View style={styles.imageWrap}>
          <Image source={{ uri: course.thumbnail }} style={styles.cover} />
          <View style={styles.imageOverlay} />
          <Pressable onPress={() => router.back()} style={[styles.backButton, { backgroundColor: colors.card }]}>
            <Feather name="arrow-left" size={20} color={colors.navy} />
          </Pressable>
          {/* <View style={styles.coverMeta}><Text style={[styles.coverCategory, { color: colors.primaryForeground }]}>{course.category.toUpperCase()} · {course.duration}</Text></View> */}
        </View>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}><Text style={[styles.title, { color: colors.navy }]}>{course.title}</Text><Text style={[styles.subtitle, { color: colors.inkSubtle }]}>{course.subtitle}</Text></View>
            {unlocked ? <View style={[styles.unlockedBadge, { backgroundColor: colors.mint }]}><Feather name="unlock" size={13} color={colors.success} /><Text style={[styles.unlockedText, { color: colors.success }]}>Unlocked</Text></View> : null}
          </View>
                    {metrics.length > 0 && (
            <View style={styles.metricsRow}>
              {metrics.map((metric) => (
                <View key={metric.label} style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Feather name={metric.icon} size={16} color={colors.coral} />
                  <Text style={[styles.metricValue, { color: colors.navy }]} numberOfLines={1}>{metric.value}</Text>
                  <Text style={[styles.metricLabel, { color: colors.inkSubtle }]}>{metric.label}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={[styles.aboutCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.navy }]}>About this course</Text>
            <Text style={[styles.description, { color: colors.inkSubtle }]}>{course.description}</Text>
                        {mentors.length > 0 ? (
              <View style={[styles.mentorSection, { borderTopColor: colors.border }]}>
                <Text style={[styles.instructorLabel, { color: colors.inkSubtle }]}>{mentors.length > 1 ? 'YOUR MENTORS' : 'YOUR MENTOR'}</Text>
                {mentors.map((mentor, index) => (
                  <View key={`${mentor.name}-${index}`} style={styles.instructorRow}>
                    {mentor.photo ? (
                      <Image source={{ uri: mentor.photo }} style={styles.instructorPhoto} />
                    ) : (
                      <View style={[styles.instructorAvatar, { backgroundColor: colors[course.tone as keyof typeof colors] as string }]}><Text style={[styles.instructorInitial, { color: colors.primaryForeground }]}>{mentor.name[0]?.toUpperCase()}</Text></View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.instructorName, { color: colors.navy }]}>{mentor.name}</Text>
                      {mentor.experience ? <Text style={[styles.instructorExperience, { color: colors.inkSubtle }]} numberOfLines={2}>{mentor.experience}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>

          {!unlocked ? (
            <>
              <View style={[styles.couponCard, { backgroundColor: colors.accent }]}>
                <View style={styles.couponHeader}><View><Text style={[styles.cardTitle, { color: colors.navy }]}>Have a coupon?</Text><Text style={[styles.couponHint, { color: colors.inkSubtle }]}>{publicCoupon ? `Try ${publicCoupon.code} for ${publicCoupon.discountPercent}% off` : 'Enter your code to get a discount'}</Text></View><Feather name="tag" size={20} color={colors.coral} /></View>
                <View style={styles.couponInputRow}>
                  <TextInput value={coupon} onChangeText={(text) => { setCoupon(text); if (appliedCode) clearCoupon(''); }} placeholder="Enter code" placeholderTextColor={colors.inkSubtle} autoCapitalize="characters"  autoCorrect={false} returnKeyType="done" onSubmitEditing={applyCoupon} style={[styles.couponInput, { color: colors.navy, borderColor: colors.input, backgroundColor: colors.card }]} />
                  <Pressable onPress={applyCoupon} disabled={applyingCoupon} style={[styles.applyButton, { backgroundColor: colors.navy, opacity: applyingCoupon ? 0.7 : 1 }]}><Text style={[styles.applyText, { color: colors.primaryForeground }]}>{applyingCoupon ? '...' : 'Apply'}</Text></Pressable>
                </View>
                {couponMessage ? <Text style={[styles.couponMessage, { color: couponValid ? colors.success : colors.destructive }]}>{couponMessage}</Text> : null}
              </View>
              <View style={styles.checkoutRow}>
                <View><Text style={[styles.totalLabel, { color: colors.inkSubtle }]}>TOTAL TODAY</Text><Text style={[styles.totalPrice, { color: colors.navy }]}>{formatPrice((course.price - discount) / 100)} {course.originalPrice != null && course.originalPrice > course.price && <Text style={[styles.originalPrice, { color: colors.inkSubtle }]}>{formatPrice(course.originalPrice / 100)}</Text>}</Text></View>
                <Pressable testID="buy-now-button" onPress={buyNow} disabled={purchasing} style={({ pressed }) => [styles.buyButton, { backgroundColor: colors.coral, opacity: pressed || purchasing ? 0.8 : 1 }]}><Text style={[styles.buyText, { color: colors.primaryForeground }]}>{purchasing ? 'Processing...' : 'Buy now'}</Text><Feather name="arrow-right" size={17} color={colors.primaryForeground} /></Pressable>
              </View>
              {paymentMessage ? <Text style={[styles.couponMessage, { color: paymentMessage.ok ? colors.success : colors.destructive, textAlign: 'center' }]}>{paymentMessage.text}</Text> : null}
              <RazorpayCheckout order={checkoutOrder} onSuccess={handlePaymentSuccess} onClose={handleCheckoutClosed} />
              <View style={styles.lockedNote}><Feather name="lock" size={13} color={colors.inkSubtle} /><Text style={[styles.lockedText, { color: colors.inkSubtle }]}>Notes, live classes, replays & tests unlock instantly.</Text></View>
            </>
          ) : (
            <>
              <View style={[styles.unlockedIntro, { backgroundColor: colors.navy, marginTop: 12 }]}>
                <View style={[styles.checkCircle, { backgroundColor: colors.coral }]}><Feather name="check" size={15} color={colors.primaryForeground} /></View>
                <View style={{ flex: 1 }}><Text style={[styles.unlockedIntroTitle, { color: colors.primaryForeground }]}>You’re all set.</Text><Text style={[styles.unlockedIntroText, { color: '#bdc8df' }]}>Access your course materials below.</Text></View>
                <Feather name="star" size={20} color={colors.gold} />
              </View>

              {visibleLiveClasses.length > 0 && (
                <View style={{ marginBottom: 4 }}>
                  <Text style={[styles.cardTitle, { color: colors.navy, marginBottom: 10 }]}>Live Classes</Text>
                  {visibleLiveClasses.map((liveClass) => (
                    <LiveClassCard key={liveClass.id} liveClass={liveClass} now={now} />
                  ))}
                </View>
              )}
              
              <View style={[styles.contentPanel, { backgroundColor: colors.card, borderColor: colors.border, padding: 12 }]}>
                {loadingContent ? (
                  <Text style={{ color: colors.inkSubtle, padding: 10 }}>Loading content...</Text>
                ) : (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 }}>
                      <Pressable onPress={() => setCurrentFolderId(null)}>
                        <Text style={{ color: currentFolderId === null ? colors.navy : colors.coral, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Course Materials</Text>
                      </Pressable>
                      {currentFolderId !== null && (
                        <>
                          <Feather name="chevron-right" size={14} color={colors.inkSubtle} style={{ marginHorizontal: 4 }} />
                          <Text style={{ color: colors.navy, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>
                            {courseContent.find(c => c.id === currentFolderId)?.title || 'Folder'}
                          </Text>
                        </>
                      )}
                      <Pressable
                        onPress={() =>
                          router.push({
                            pathname: '/course/[id]/content',
                            params: { id: String(course.id), title: course.title },
                          } as any)
                        }
                        style={{
                          marginLeft: 'auto',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5,
                          backgroundColor: colors.coral,
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 7,
                        }}
                      >
                        <Feather name="book-open" size={13} color="#ffffff" />
                        <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#ffffff' }}>
                          Open Curriculum
                        </Text>
                      </Pressable>
                    </View>

                    {courseContent.filter(c => c.parentId === currentFolderId).length === 0 ? (
                      <Text style={{ color: colors.inkSubtle, padding: 10, textAlign: 'center' }}>This folder is empty.</Text>
                    ) : (
                      courseContent.filter(c => c.parentId === currentFolderId).map(item => (
                        <Pressable 
                          key={item.id} 
                          onPress={() => {
                            if (item.type === 'folder') {
                              setCurrentFolderId(item.id);
                            } else {
                              router.push({
                                pathname: '/course/[id]/content',
                                params: { id: String(course.id), title: course.title },
                              } as any);
                            }
                          }}
                          style={styles.contentRow}
                        >
                          <View style={[styles.contentIcon, { backgroundColor: item.type === 'folder' ? colors.mint : item.type === 'pdf' ? colors.sky : colors.accent }]}>
                            <Feather name={item.type === 'folder' ? 'folder' : item.type === 'pdf' ? 'file-text' : 'play'} size={18} color={item.type === 'folder' ? colors.teal : item.type === 'pdf' ? colors.lavender : colors.coral} />
                          </View>
                          <View style={styles.contentRowBody}>
                            <Text style={[styles.contentTitle, { color: colors.navy }]}>{item.title}</Text>
                            <Text style={[styles.contentMeta, { color: colors.inkSubtle }]}>{item.type.toUpperCase()}</Text>
                          </View>
                          <Feather name={item.type === 'folder' ? 'chevron-right' : 'arrow-up-right'} size={17} color={colors.inkSubtle} />
                        </Pressable>
                      ))
                    )}
                  </>
                )}
              </View>
            </>
          )}
        </View>
            </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  imageWrap: { height: 245, position: 'relative' },
  cover: { width: '100%', height: '100%' },
  imageOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,33,61,0.18)' },
  backButton: { position: 'absolute', top: 54, left: 19, width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  // coverMeta: { position: 'absolute', left: 20, bottom: 18 },
  // coverCategory: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },
  body: { paddingHorizontal: 20, paddingTop: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 28, lineHeight: 33, letterSpacing: -1 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 7 },
  unlockedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 7, marginLeft: 10 },
  unlockedText: { fontFamily: 'Inter_700Bold', fontSize: 9 },
  statsRow: { flexDirection: 'row', gap: 13, marginTop: 18, marginBottom: 20 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  aboutCard: { borderWidth: 1, borderRadius: 20, padding: 17, marginBottom: 14 },
  cardTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  description: { fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 19, marginTop: 10 },
    mentorSection: { borderTopWidth: 1, marginTop: 16, paddingTop: 14, gap: 12 },
  instructorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    instructorAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  instructorPhoto: { width: 44, height: 44, borderRadius: 22 },
  instructorExperience: { fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 2 },
  metricsRow: { flexDirection: 'row', gap: 10, marginTop: 18, marginBottom: 20 },
  metricCard: { flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', gap: 4 },
  metricValue: { fontFamily: 'Inter_700Bold', fontSize: 16, marginTop: 2 },
  metricLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, textAlign: 'center' },
  instructorInitial: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  instructorLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.6 },
    instructorName: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  couponCard: { borderRadius: 20, padding: 17, marginBottom: 17 },
  couponHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  couponHint: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 5 },
  couponInputRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  couponInput: { flex: 1, height: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontFamily: 'Inter_500Medium', fontSize: 12 },
  applyButton: { paddingHorizontal: 15, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  applyText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  couponMessage: { fontFamily: 'Inter_500Medium', fontSize: 11, marginTop: 8 },
  checkoutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.8 },
  totalPrice: { fontFamily: 'Inter_700Bold', fontSize: 23, marginTop: 4 },
  originalPrice: { fontFamily: 'Inter_400Regular', fontSize: 11, textDecorationLine: 'line-through' },
  buyButton: { borderRadius: 14, paddingHorizontal: 17, minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 8 },
  buyText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  lockedNote: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 16 },
  lockedText: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  unlockedIntro: { borderRadius: 19, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 16 },
  checkCircle: { width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  unlockedIntroTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  unlockedIntroText: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 3 },
  tabs: { gap: 8, paddingBottom: 13 },
  tab: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 6 },
  tabText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  contentPanel: { borderWidth: 1, borderRadius: 20, padding: 7 },
  contentRow: { flexDirection: 'row', alignItems: 'center', padding: 10, minHeight: 69, gap: 10 },
  contentRowBody: { flex: 1 },
  contentIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  contentTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12, lineHeight: 17 },
  contentMeta: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 3 },
  sessionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveBadge: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.4 },
  smallAction: { borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
  smallActionText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  miniProgressTrack: { height: 4, borderRadius: 2, marginTop: 8, overflow: 'hidden' },
  miniProgressFill: { height: 4, borderRadius: 2 },
  quizRow: { flexDirection: 'row', alignItems: 'center', padding: 10, minHeight: 80, gap: 10 },
});