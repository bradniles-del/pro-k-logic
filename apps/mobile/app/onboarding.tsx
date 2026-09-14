import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { acceptInvitation, createOrganization, describeError, type Enums } from "../lib/api";
import { refreshProfile, setPendingInvite, useAuthState } from "../lib/auth-state";
import { supabase } from "../lib/supabase";
import { Banner, BigButton, Segmented, colors, layout, type } from "../lib/ui";

type Path = "choose" | "invite" | "create";

const KINDS: { value: Enums["org_kind"]; label: string }[] = [
  { value: "contractor", label: "Contractor" },
  { value: "supplier", label: "Supplier" },
  { value: "carrier", label: "Carrier" },
  { value: "owner", label: "Owner" },
  { value: "other", label: "Other" },
];

type JurisdictionChoice = "CA-AB" | "CA-BC" | "CA-ON" | "CA-QC" | "US-CA" | "US-TX" | "other";
const JURISDICTIONS: { value: JurisdictionChoice; label: string }[] = [
  { value: "CA-AB", label: "Alberta" },
  { value: "CA-BC", label: "BC" },
  { value: "CA-ON", label: "Ontario" },
  { value: "CA-QC", label: "Quebec" },
  { value: "US-CA", label: "California" },
  { value: "US-TX", label: "Texas" },
  { value: "other", label: "Other" },
];
const COUNTRIES: { value: "CA-*" | "US-*"; label: string }[] = [
  { value: "CA-*", label: "Elsewhere in Canada" },
  { value: "US-*", label: "Elsewhere in the US" },
];

/**
 * First run for a signed-in user with no organization. Two paths:
 * an invitation code (typed, pasted, or from prok://invite/<token> and
 * https://<host>/onboarding?invite=<token>) or creating a company.
 */
export default function Onboarding() {
  const router = useRouter();
  const { invite } = useLocalSearchParams<{ invite?: string }>();
  const { profile, pendingInvite } = useAuthState();
  const linkedInvite = (typeof invite === "string" && invite.trim()) || pendingInvite || "";

  const [path, setPath] = useState<Path>(linkedInvite ? "invite" : "choose");
  const [code, setCode] = useState(linkedInvite);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Enums["org_kind"] | null>(null);
  const [juris, setJuris] = useState<JurisdictionChoice | null>(null);
  const [country, setCountry] = useState<"CA-*" | "US-*" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A link opened by someone already in an organization: only the invite path applies.
  const hasOrg = !!profile?.organization_id;
  useEffect(() => {
    if (hasOrg && !linkedInvite) router.replace("/(app)");
  }, [hasOrg, linkedInvite, router]);

  useEffect(() => {
    if (linkedInvite) {
      setCode(linkedInvite);
      setPath("invite");
    }
  }, [linkedInvite]);

  async function finish() {
    setPendingInvite(null);
    await refreshProfile();
    router.replace("/(app)");
  }

  async function submitInvite() {
    setBusy(true);
    setError(null);
    try {
      await acceptInvitation(code);
      await finish();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  const jurisdiction = juris === "other" ? country : juris;
  const canCreate = name.trim().length >= 2 && kind !== null && jurisdiction !== null;

  async function submitCreate() {
    if (!kind || !jurisdiction) return;
    setBusy(true);
    setError(null);
    try {
      await createOrganization({ name, kind, jurisdiction });
      await finish();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={layout.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={layout.content} keyboardShouldPersistTaps="handled">
        {path === "choose" && (
          <>
            <Text style={type.h1}>Welcome</Text>
            <Text style={type.body}>How are you joining Pro-K-Logic?</Text>
            <BigButton title="I have an invitation" huge onPress={() => setPath("invite")} />
            <BigButton title="Create my company" huge variant="secondary" onPress={() => setPath("create")} />
            <BigButton title="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
          </>
        )}

        {path === "invite" && (
          <>
            <Text style={type.h1}>Invitation</Text>
            <Text style={type.body}>
              Paste the invitation code from your email, or open the invite link on this phone.
            </Text>
            <TextInput
              style={[layout.input, styles.mono]}
              placeholder="Invitation code"
              placeholderTextColor={colors.disabledText}
              autoCapitalize="none"
              autoCorrect={false}
              value={code}
              onChangeText={setCode}
              editable={!busy}
            />
            {error && <Banner tone="danger">{error}</Banner>}
            <BigButton title="Join project" huge busy={busy} disabled={!code.trim()} onPress={submitInvite} />
            {!hasOrg && (
              <BigButton title="Back" variant="secondary" disabled={busy} onPress={() => setPath("choose")} />
            )}
            {hasOrg && (
              <BigButton title="Skip" variant="secondary" disabled={busy} onPress={finish} />
            )}
          </>
        )}

        {path === "create" && (
          <>
            <Text style={type.h1}>Your company</Text>
            <View style={styles.group}>
              <Text style={type.label}>Company name</Text>
              <TextInput
                style={layout.input}
                placeholder="Acme Contractors"
                placeholderTextColor={colors.disabledText}
                autoCapitalize="words"
                value={name}
                onChangeText={setName}
                editable={!busy}
              />
            </View>
            <View style={styles.group}>
              <Text style={type.label}>We are a</Text>
              <Segmented options={KINDS} value={kind} onChange={setKind} />
            </View>
            <View style={styles.group}>
              <Text style={type.label}>Based in</Text>
              <Segmented options={JURISDICTIONS} value={juris} onChange={setJuris} />
              {juris === "other" && <Segmented options={COUNTRIES} value={country} onChange={setCountry} />}
            </View>
            {error && <Banner tone="danger">{error}</Banner>}
            <BigButton title="Create company" huge busy={busy} disabled={!canCreate} onPress={submitCreate} />
            <BigButton title="Back" variant="secondary" disabled={busy} onPress={() => setPath("choose")} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  group: { gap: 10 },
  mono: { fontFamily: "monospace" },
});
