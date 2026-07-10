import { Text, View, StyleSheet } from 'react-native';

export default function OrdersScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Orders</Text>
      <Text style={styles.subtitle}>Track your purchases</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '700', color: '#111' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 8 },
});
