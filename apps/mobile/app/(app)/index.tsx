import { useCallback, useEffect, useState } from "react";
import { FlatList, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  describeError,
  findMaterial,
  getLastProjectId,
  listMyProjects,
  setLastProjectId,
  type MaterialHit,
  type Membership,
} from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { Banner, BigButton, Segmented, StatusChip, colors, layout, type } from "../../lib/ui";

/**
 * Home: one huge Scan button, a project picker when the user is on more than
 * one project, and "Find material" (find_material RPC) for the chosen project.
 */
export default function Home() {
  const router = useRouter();
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MaterialHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [rows, last] = await Promise.all([listMyProjects(), getLastProjectId()]);
      setMemberships(rows);
      setLoadError(null);
      setProjectId((current) => {
        const ids = rows.map((m) => m.project.id);
        if (current && ids.includes(current)) return current;
        if (last && ids.includes(last)) return last;
        return ids[0] ?? null;
      });
    } catch (e) {
      setLoadError(describeError(e));
      setMemberships((m) => m ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (projectId) setLastProjectId(projectId);
  }, [projectId]);

  function pickProject(id: string) {
    setProjectId(id);
    setHits(null);
    setSearchError(null);
  }

  async function search() {
    if (!projectId || !query.trim()) return;
    Keyboard.dismiss();
    setSearching(true);
    setSearchError(null);
    try {
      setHits(await findMaterial(projectId, query));
    } catch (e) {
      setSearchError(describeError(e));
      setHits(null);
    } finally {
      setSearching(false);
    }
  }

  const projects = memberships ?? [];
  const current = projects.find((m) => m.project.id === projectId) ?? null;

  const header = (
    <View style={styles.top}>
      <BigButton title="Scan QR" huge onPress={() => router.push("/(app)/scan")} />

      {loadError && <Banner tone="warn">{loadError}</Banner>}

      {memberships !== null && projects.length === 0 && !loadError && (
        <Banner tone="info">You are not on any project yet. Ask a coordinator to invite you.</Banner>
      )}

      {projects.length > 1 && (
        <View style={styles.group}>
          <Text style={type.label}>Project</Text>
          <Segmented
            options={projects.map((m) => ({ value: m.project.id, label: m.project.code || m.project.name }))}
            value={projectId}
            onChange={pickProject}
          />
        </View>
      )}

      {current && (
        <View style={styles.group}>
          <Text style={type.h2}>{current.project.name}</Text>
          <Text style={type.muted}>
            {current.project.code ? `${current.project.code} · ` : ""}
            {current.role}
          </Text>
        </View>
      )}

      {current && (
        <View style={styles.group}>
          <Text style={type.label}>Find material</Text>
          <TextInput
            style={layout.input}
            placeholder="Description, piece mark or PKL code"
            placeholderTextColor={colors.disabledText}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
          />
          <BigButton title="Search" busy={searching} disabled={!query.trim()} onPress={search} />
          {searchError && <Banner tone="warn">{searchError}</Banner>}
          {hits !== null && hits.length === 0 && <Text style={type.muted}>Nothing matched.</Text>}
        </View>
      )}
    </View>
  );

  return (
    <View style={layout.screen}>
      <FlatList
        data={hits ?? []}
        keyExtractor={(h) => h.unit_id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={layout.content}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/(app)/item/[token]", params: { token: item.short_code } })}
            style={({ pressed }) => [styles.hit, pressed && styles.pressed]}
          >
            <Text style={styles.hitCode}>{item.short_code}</Text>
            <Text style={type.body} numberOfLines={2}>
              {item.description || "(no description)"}
            </Text>
            <View style={styles.hitMeta}>
              <StatusChip status={item.status} />
              <Text style={type.muted}>{item.location_name || item.zone_name || ""}</Text>
            </View>
          </Pressable>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <BigButton title="Sign out" variant="secondary" onPress={() => supabase.auth.signOut()} />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { gap: 20 },
  group: { gap: 10 },
  hit: {
    marginTop: 12,
    padding: 16,
    gap: 6,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  pressed: { backgroundColor: colors.surface },
  hitCode: { fontSize: 26, fontWeight: "700", fontFamily: "monospace", color: colors.text },
  hitMeta: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" },
  footer: { marginTop: 32 },
});
