import { useState } from "react";
import { Alert, Button, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../lib/supabase";

/** Email one-time-code sign-in. Step 1 sends the code, step 2 verifies it. */
export default function SignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) return Alert.alert("Could not send code", error.message);
    setSent(true);
  }

  async function verify() {
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) Alert.alert("Sign-in failed", error.message);
    // On success the root layout's onAuthStateChange redirects into the app.
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pro-K-Logic</Text>
      {!sent ? (
        <>
          <Text>Enter your work email to receive a sign-in code.</Text>
          <TextInput
            style={styles.input}
            placeholder="you@company.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Button title={busy ? "Sending..." : "Send code"} onPress={sendCode} disabled={busy || !email} />
        </>
      ) : (
        <>
          <Text>We sent a code to {email}.</Text>
          <TextInput
            style={styles.input}
            placeholder="6-digit code"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            value={code}
            onChangeText={setCode}
          />
          <Button title={busy ? "Checking..." : "Verify"} onPress={verify} disabled={busy || !code} />
          <Button title="Use a different email" onPress={() => setSent(false)} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "600", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#999", borderRadius: 6, padding: 12, fontSize: 16 },
});
