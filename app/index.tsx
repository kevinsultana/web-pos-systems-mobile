import { useEffect, useRef } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator, StyleSheet, Text, Linking } from 'react-native';
import { useAuthStore } from '@/stores/useAuthStore';
import Toast from 'react-native-toast-message';

const WEB_APP_URL = 'https://web-pos-systems.vercel.app/login?redirectedFrom=%2Fprofile';

export default function Index() {
  const {
    isAuthenticated, role, isLoading, shouldRedirectToWeb, session, profile, initialize,
    signOutAndClearSession,
  } = useAuthStore();
  const handled = useRef(false);

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (isLoading || !isAuthenticated || handled.current) return;
    handled.current = true;

    if (shouldRedirectToWeb) {
      Toast.show({
        type: 'info',
        text1: 'Akun Admin',
        text2: `Halo ${profile?.name ?? 'Admin'}, kamu akan diarahkan ke web dashboard.`,
        visibilityTime: 3000,
        position: 'top',
      });

      const timer = setTimeout(async () => {
        const webUrl = session?.access_token
          ? `${WEB_APP_URL}&access_token=${session.access_token}`
          : WEB_APP_URL;

        await signOutAndClearSession();
        Linking.openURL(webUrl);
      }, 2500);

      return () => clearTimeout(timer);
    }

    // User or Cashier — welcome toast
    const label = role === 'cashier' ? 'Kasir' : 'User';
    Toast.show({
      type: 'success',
      text1: `Selamat datang, ${profile?.name ?? label}`,
      text2: role === 'cashier' ? 'Mode Kasir' : 'Mode Belanja',
      visibilityTime: 2000,
      position: 'top',
    });
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#0a7ea4" />
        <Text style={styles.splashText}>Loading...</Text>
      </View>
    );
  }

  if (!isAuthenticated) return <Redirect href="/login" />;

  if (shouldRedirectToWeb) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#0a7ea4" />
        <Text style={styles.splashText}>Mengarahkan ke web dashboard...</Text>
      </View>
    );
  }

  if (role === 'cashier') return <Redirect href="/(cashier)" />;
  return <Redirect href="/(user)" />;
}

const styles = StyleSheet.create({
  splash: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  splashText: { marginTop: 12, fontSize: 16, color: '#666' },
});
