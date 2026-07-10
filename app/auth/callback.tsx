import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackScreen() {
  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        router.replace('/');
      }
    });
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0a7ea4" />
      <Text style={styles.text}>Completing sign in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
  text: { marginTop: 12, fontSize: 16, color: '#666' },
});
