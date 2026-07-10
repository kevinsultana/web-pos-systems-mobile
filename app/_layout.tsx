import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Toast from 'react-native-toast-message';

export default function RootLayout() {
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
      <StatusBar style="auto" />
      <Toast />
    </>
  );
}
