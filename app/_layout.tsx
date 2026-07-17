import { setBackgroundColorAsync, setButtonStyleAsync } from 'expo-navigation-bar';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import Toast from 'react-native-toast-message';

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'android') {
      setBackgroundColorAsync('#1e1e1e');
      setButtonStyleAsync('light');
    }
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="(user)" />
        <Stack.Screen name="(cashier)" />
        <Stack.Screen name="auth/callback" options={{ presentation: 'modal' }} />
      </Stack>
      <StatusBar style="dark" />
      <Toast />
    </>
  );
}

