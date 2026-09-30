import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
// @ts-ignore
import { getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Force cache invalidation to load new .env variables
const firebaseConfig = {
  apiKey: "AIzaSyBLw5eneJGCi4-YshAf5wgBA-yDT8o70Mc",
  authDomain: "edurain-pvt.firebaseapp.com",
  projectId: "edurain-pvt",
  storageBucket: "edurain-pvt.firebasestorage.app",
  messagingSenderId: "5660601224",
  appId: "1:5660601224:web:e12194bc33e38cd1e8e83d"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth with AsyncStorage persistence for React Native
const auth = Platform.OS === 'web' 
  ? getAuth(app) 
  : initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });

export { app, auth };
