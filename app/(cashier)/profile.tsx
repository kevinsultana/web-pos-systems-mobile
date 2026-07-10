import { Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import { useAuthStore } from '@/stores/useAuthStore';

export default function CashierProfileScreen() {
  const { profile, signOut } = useAuthStore();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.info}>{profile?.name ?? 'Cashier'}</Text>
      <Text style={styles.info}>{profile?.email}</Text>
      <Text style={styles.badge}>Role: {profile?.role}</Text>
      <TouchableOpacity style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 8 },
  info: { fontSize: 16, color: '#333', marginBottom: 4 },
  badge: { fontSize: 14, color: '#0a7ea4', fontWeight: '600', marginTop: 4, marginBottom: 24 },
  button: { backgroundColor: '#dc2626', borderRadius: 10, padding: 14, paddingHorizontal: 32 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
