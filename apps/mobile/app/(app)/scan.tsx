import { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { parseCode } from "../../lib/token";
import { BigButton, Centered, colors, layout, type } from "../../lib/ui";

/**
 * Full-screen QR scanner. A hit vibrates and opens the item screen. Labels
 * encode https://<host>/s/<token>; paint-marked units have only a short code,
 * so "Type code instead" accepts PKL-XXXX-XXXX (or a pasted link) by hand.
 */
export default function Scan() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const locked = useRef(false);

  // Re-arm the scanner whenever this screen regains focus.
  useFocusEffect(
    useCallback(() => {
      locked.current = false;
      setNotice(null);
      return () => {
        locked.current = true;
      };
    }, []),
  );

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => {
      setNotice(null);
      locked.current = false;
    }, 1800);
    return () => clearTimeout(t);
  }, [notice]);

  function go(raw: string) {
    const parsed = parseCode(raw);
    if (!parsed) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setNotice("Not a Pro-K-Logic code");
      return false;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.push({ pathname: "/(app)/item/[token]", params: { token: parsed.value } });
    return true;
  }

  function onScanned(data: string) {
    if (locked.current) return;
    locked.current = true; // a failed parse shows a notice whose timer re-arms the scanner
    go(data);
  }

  function submitTyped() {
    if (!typed.trim()) return;
    if (go(typed)) {
      setTyped("");
      setTyping(false);
    }
  }

  if (!permission) return <View style={styles.black} />;

  if (!permission.granted) {
    return (
      <Centered>
        <Text style={[type.body, styles.centerText]}>Camera access is needed to scan labels and paperwork.</Text>
        <BigButton title="Allow camera" huge onPress={() => void requestPermission()} />
        <BigButton title="Type code instead" variant="secondary" onPress={() => setTyping(true)} />
        {typing && <TypeCodePanel value={typed} onChange={setTyped} onSubmit={submitTyped} onClose={() => setTyping(false)} />}
        <BigButton title="Back" variant="secondary" onPress={() => router.back()} />
      </Centered>
    );
  }

  return (
    <View style={styles.black}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={typing ? undefined : (r) => onScanned(r.data)}
      />

      {/* Viewfinder frame */}
      <View pointerEvents="none" style={styles.frameWrap}>
        <View style={styles.frame} />
        <Text style={styles.hint}>Point at the QR label</Text>
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
        <Text style={styles.title}>Scan</Text>
        <View style={styles.closeBtn} />
      </View>

      {notice && (
        <View style={styles.noticeWrap}>
          <Text style={styles.notice}>{notice}</Text>
        </View>
      )}

      {/* Bottom controls */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}
      >
        {typing ? (
          <TypeCodePanel value={typed} onChange={setTyped} onSubmit={submitTyped} onClose={() => setTyping(false)} />
        ) : (
          <BigButton title="Type code instead" variant="secondary" onPress={() => setTyping(true)} />
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

function TypeCodePanel({
  value,
  onChange,
  onSubmit,
  onClose,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.panel}>
      <Text style={type.label}>Code on the label or paint mark</Text>
      <TextInput
        style={[layout.input, styles.codeInput]}
        placeholder="PKL-XXXX-XXXX"
        placeholderTextColor={colors.disabledText}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        returnKeyType="go"
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onSubmit}
      />
      <BigButton title="Open" disabled={!value.trim()} onPress={onSubmit} />
      <BigButton title="Back to camera" variant="secondary" onPress={onClose} />
    </View>
  );
}

const FRAME = 260;

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: "#000" },
  centerText: { textAlign: "center" },
  frameWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  frame: {
    width: FRAME,
    height: FRAME,
    borderWidth: 4,
    borderColor: "#fff",
    borderRadius: 20,
    backgroundColor: "transparent",
  },
  hint: { color: "#fff", fontSize: 20, fontWeight: "600", textShadowColor: "#000", textShadowRadius: 6 },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  closeBtn: { minWidth: 88, minHeight: 56, justifyContent: "center" },
  closeText: { color: "#fff", fontSize: 22, fontWeight: "700" },
  title: { color: "#fff", fontSize: 22, fontWeight: "700" },
  noticeWrap: {
    position: "absolute",
    top: "22%",
    left: 20,
    right: 20,
    backgroundColor: colors.danger,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  notice: { color: "#fff", fontSize: 22, fontWeight: "700" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 16 },
  panel: { backgroundColor: colors.bg, borderRadius: 16, padding: 16, gap: 12, width: "100%" },
  codeInput: { fontFamily: "monospace", fontSize: 26, letterSpacing: 1 },
});
