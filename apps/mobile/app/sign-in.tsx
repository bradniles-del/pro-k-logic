import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { describeError } from "../lib/api";
import { supabase } from "../lib/supabase";
import { Banner, BigButton, colors, layout, type } from "../lib/ui";

/** Email one-time-code sign-in. Step 1 sends the code, step 2 verifies it. */
export default function SignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) return setError(describeError(error));
    setSent(true);
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (error) setError(describeError(error));
    // On success the root layout's auth state redirects into the app.
  }

  return (
    <KeyboardAvoidingView style={layout.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[layout.content, styles.center]} keyboardShouldPersistTaps="handled">
        <Text style={type.h1}>Pro-K-Logic</Text>
        {!sent ? (
          <>
            <Text style={type.body}>Enter your work email to receive a sign-in code.</Text>
            <TextInput
              style={layout.input}
              placeholder="you@company.com"
              placeholderTextColor={colors.disabledText}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              editable={!busy}
            />
            {error && <Banner tone="danger">{error}</Banner>}
            <BigButton title="Send code" huge busy={busy} disabled={!email.trim()} onPress={sendCode} />
          </>
        ) : (
          <>
            <Text style={type.body}>We sent a code to {email}.</Text>
            <TextInput
              style={[layout.input, styles.code]}
              placeholder="6-digit code"
              placeholderTextColor={colors.disabledText}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              value={code}
              onChangeText={setCode}
              editable={!busy}
            />
            {error && <Banner tone="danger">{error}</Banner>}
            <BigButton title="Verify" huge busy={busy} disabled={!code.trim()} onPress={verify} />
            <BigButton title="Use a different email" variant="secondary" disabled={busy} onPress={() => setSent(false)} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flexGrow: 1, justifyContent: "center" },
  code: { fontFamily: "monospace", fontSize: 30, letterSpacing: 4, textAlign: "center" },
});
