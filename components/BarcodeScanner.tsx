import { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Pressable } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  onClose: () => void;
  onBarcodeScanned: (barcode: string) => void;
}

export default function BarcodeScanner({ visible, onClose, onBarcodeScanned }: Props) {
  const [permission, requestPermission] = useCameraPermissions();

  if (!permission) {
    return null;
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color="#999" />
          <Text style={styles.permissionTitle}>Akses Kamera</Text>
          <Text style={styles.permissionDesc}>
            Izinkan akses kamera untuk memindai barcode produk.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Izinkan Akses</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancelText}>Batal</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  const handleScanned = (result: BarcodeScanningResult) => {
    onBarcodeScanned(result.data);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39'] }}
          onBarcodeScanned={handleScanned}
        >
          {/* Scanning overlay */}
          <View style={styles.overlay}>
            <View style={styles.scanFrame} />
            <Text style={styles.scanHint}>Arahkan kamera ke barcode produk</Text>
          </View>
        </CameraView>

        {/* Close button */}
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },

  overlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
  },
  scanFrame: {
    width: 250, height: 250, borderWidth: 2, borderColor: '#fff',
    borderRadius: 16, backgroundColor: 'transparent',
  },
  scanHint: {
    color: '#fff', fontSize: 15, marginTop: 24,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 20, overflow: 'hidden',
  },

  closeButton: {
    position: 'absolute', top: 60, right: 20,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },

  permissionContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#fff', padding: 24,
  },
  permissionTitle: { fontSize: 20, fontWeight: '700', color: '#111', marginTop: 16 },
  permissionDesc: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  permissionButton: {
    backgroundColor: '#0a7ea4', borderRadius: 10,
    paddingHorizontal: 32, paddingVertical: 14, marginTop: 24,
  },
  permissionButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancelText: { color: '#666', fontSize: 15, marginTop: 16 },
});
