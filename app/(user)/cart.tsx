import { Text, View, StyleSheet } from 'react-native';

export default function CartScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Cart</Text>
      <Text style={styles.subtitle}>Review items before checkout</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '700', color: '#111' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 8 },
});
