import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/useAuthStore';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

export default function CashierLayout() {
  const { isAuthenticated, role, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#0a7ea4" />
      </View>
    );
  }

  if (!isAuthenticated) return <Redirect href="/login" />;
  if (role !== 'cashier') return <Redirect href="/(user)" />;

  return (
    <Tabs screenOptions={{ headerShown: true, tabBarActiveTintColor: '#0a7ea4' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'POS',
          tabBarIcon: ({ color, size }) => <Ionicons name="calculator" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Checkout',
          tabBarIcon: ({ color, size }) => <Ionicons name="cart" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Transactions',
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
});
