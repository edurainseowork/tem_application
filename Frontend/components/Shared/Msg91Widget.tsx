import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

let NativeWidget: any = null;
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

if (!isExpoGo) {
  try {
    // Only attempt to load the native widget if not running inside Expo Go
    NativeWidget = require('@msg91comm/sendotp-react-native').DefaultWidget;
  } catch (err) {
    console.warn('Native Msg91Widget could not be loaded:', err);
  }
}

export function Msg91Widget(props: any) {
  if (NativeWidget) {
    return <NativeWidget {...props} />;
  }

  if (!props.visible) return null;

  const handleSimulateSuccess = () => {
    props.onCompletion?.({
      success: true,
      message: 'expo-go-simulated-token-123456',
    });
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.container}>
        <Text style={styles.title}>Expo Go Dev Verification</Text>
        <Text style={styles.desc}>
          MSG91 Native SDK requires an Android/iOS development build and is not supported directly in Expo Go.
        </Text>
        <TouchableOpacity style={styles.button} onPress={handleSimulateSuccess}>
          <Text style={styles.buttonText}>Simulate OTP Success (For Dev)</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeBtn} onPress={props.onClose}>
          <Text style={styles.closeText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  container: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 16,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#0a2540',
  },
  desc: {
    fontSize: 14,
    color: '#425466',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  closeBtn: {
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  closeText: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: 16,
  },
});
