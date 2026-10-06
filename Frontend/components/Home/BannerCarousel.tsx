import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  Pressable,
  Platform,
  AppState,
} from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedScrollHandler, 
  useAnimatedStyle, 
  interpolate, 
  Extrapolation 
} from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { API_BASE_URL } from '@/api/client';

interface Banner {
  id: number;
  imageUrl: string;
}

interface BannerCarouselProps {
  banners: Banner[];
}

export default function BannerCarousel({ banners }: BannerCarouselProps) {
  const { width } = useWindowDimensions();
  const itemWidth = width - 40; // 20 padding on each side

  // 1. Max 5 banners as per requirement
  const displayBanners = useMemo(() => {
    return banners.slice(0, 5).map((b, i) => ({ ...b, originalIndex: i }));
  }, [banners]);

  // 2. Prepare extended array for seamless infinite looping: [last, ...items, first]
  const extendedBanners = useMemo(() => {
    if (displayBanners.length <= 1) return displayBanners;
    return [
      { ...displayBanners[displayBanners.length - 1], key: 'clone-last' },
      ...displayBanners.map((b) => ({ ...b, key: b.id.toString() })),
      { ...displayBanners[0], key: 'clone-first' },
    ];
  }, [displayBanners]);

  const scrollX = useSharedValue(0);
  const flatListRef = useRef<any>(null);

  const [isAutoScrolling, setIsAutoScrolling] = useState(true);
  const currentIndexRef = useRef(displayBanners.length > 1 ? 1 : 0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDraggingRef = useRef(false);

  const scrollToIndex = useCallback(
    (index: number, animated: boolean) => {
      flatListRef.current?.scrollToOffset({
        offset: index * itemWidth,
        animated,
      });
      currentIndexRef.current = index;
    },
    [itemWidth]
  );

  const startTimer = useCallback(() => {
    if (displayBanners.length <= 1) return;
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      if (isDraggingRef.current || !isAutoScrolling) return;

      const nextIndex = currentIndexRef.current + 1;
      scrollToIndex(nextIndex, true);

      if (nextIndex === extendedBanners.length - 1) {
        setTimeout(() => {
          if (!isDraggingRef.current) {
            scrollToIndex(1, false);
          }
        }, 400); 
      }
    }, 3000);
  }, [displayBanners.length, extendedBanners.length, isAutoScrolling, scrollToIndex]);

  // Pause when the app goes into the background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState !== 'active') {
        setIsAutoScrolling(false);
      } else {
        setIsAutoScrolling(true);
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  // Pause when this specific tab loses focus, and clear timer on unmount
  useFocusEffect(
    useCallback(() => {
      setIsAutoScrolling(true);
      return () => {
        setIsAutoScrolling(false);
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }, [])
  );

  useEffect(() => {
    if (isAutoScrolling) {
      startTimer();
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startTimer, isAutoScrolling]);

  const handleMomentumScrollEnd = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(offsetX / itemWidth);

    if (displayBanners.length > 1) {
      if (newIndex === 0) {
        // Scrolled backward to the leading clone (last item)
        scrollToIndex(extendedBanners.length - 2, false);
      } else if (newIndex === extendedBanners.length - 1) {
        // Scrolled forward to the trailing clone (first item)
        scrollToIndex(1, false);
      } else {
        currentIndexRef.current = newIndex;
      }
    } else {
      currentIndexRef.current = newIndex;
    }
  };

  const onScrollBeginDrag = () => {
    isDraggingRef.current = true;
    setIsAutoScrolling(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const onScrollEndDrag = () => {
    isDraggingRef.current = false;
    // Resume auto-scroll after a short delay
    setTimeout(() => setIsAutoScrolling(true), 3000);
  };

  const resolveImageUrl = (url?: string) => {
    if (!url) return '';
    return url.replace('http://localhost:5000', API_BASE_URL);
  };

  if (banners.length === 0) return null;

  return (
    <View style={styles.container}>
      <Animated.FlatList
        ref={flatListRef}
        data={extendedBanners}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        initialScrollIndex={displayBanners.length > 1 ? 1 : 0}
        getItemLayout={(_, index) => ({
          length: itemWidth,
          offset: itemWidth * index,
          index,
        })}
        onScroll={useAnimatedScrollHandler({
          onScroll: (event) => {
            scrollX.value = event.contentOffset.x;
          },
        })}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        keyExtractor={(item: any, index) => item.key || item.id.toString() + index}
        renderItem={({ item }) => (
          <View style={[styles.cardWrapper, { width: itemWidth }]}>
            <Pressable
              accessible
              accessibilityLabel="Banner image"
              accessibilityRole="imagebutton"
              style={({ pressed }) => [
                styles.cardContainer,
                { transform: [{ scale: pressed ? 0.98 : 1 }] },
              ]}
            >
              <Image
                source={{ uri: resolveImageUrl(item.imageUrl) }}
                style={styles.image}
                contentFit="cover"
                transition={200}
              />
            </Pressable>
          </View>
        )}
      />

      {/* Pagination Dots */}
      {displayBanners.length > 1 && (
        <View style={styles.paginationContainer} pointerEvents="none">
          <BlurView intensity={70} tint="dark" style={styles.paginationPill}>
            {displayBanners.map((banner, i) => {
              const inputRange = extendedBanners.map((_, index) => index * itemWidth);
              const outputRangeWidth = extendedBanners.map((b) => b.originalIndex === i ? 18 : 6);
              const outputRangeOpacity = extendedBanners.map((b) => b.originalIndex === i ? 1 : 0.4);

              const dotStyle = useAnimatedStyle(() => {
                return {
                  width: interpolate(scrollX.value, inputRange, outputRangeWidth, Extrapolation.CLAMP),
                  opacity: interpolate(scrollX.value, inputRange, outputRangeOpacity, Extrapolation.CLAMP),
                };
              });

              return (
                <Animated.View
                  key={`dot-${i}`}
                  style={[styles.dot, dotStyle]}
                />
              );
            })}
          </BlurView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 28,
    height: 160,
  },
  cardWrapper: {
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    backgroundColor: '#e0e0e0', // acts as placeholder skeleton
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  paginationContainer: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paginationPill: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    overflow: 'hidden',
  },
  dot: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff',
    marginHorizontal: 3,
  },
});
