// Web build of PushNotificationsManager: push notifications only exist on Android/iOS devices,
// and expo-notifications' listeners are not supported in the browser, so render nothing.
export function PushNotificationsManager() {
    return null;
  }