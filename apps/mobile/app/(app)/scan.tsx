import { useState } from "react";
import { Button, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

/**
 * Placeholder scanner: opens the camera with QR scanning and shows the raw value.
 * Token resolution (resolve_token RPC) and event recording come in Phase 1.
 */
export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState<string | null>(null);

  if (!permission) return <View style={styles.center} />;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.text}>Camera access is needed to scan labels and paperwork.</Text>
        <Button title="Allow camera" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {scanned ? (
        <View style={styles.center}>
          <Text style={styles.label}>Scanned value</Text>
          <Text selectable style={styles.value}>
            {scanned}
          </Text>
          <Button title="Scan again" onPress={() => setScanned(null)} />
        </View>
      ) : (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={(result) => setScanned(result.data)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12, backgroundColor: "#fff" },
  text: { textAlign: "center" },
  label: { color: "#666" },
  value: { fontSize: 18, fontFamily: "monospace", textAlign: "center" },
});
