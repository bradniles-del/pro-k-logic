import { useEffect, useState } from "react";
import { Button, FlatList, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import type { ProjectRole } from "@prok/shared";
import { supabase } from "../../lib/supabase";

type Membership = {
  role: ProjectRole;
  projects: { id: string; name: string; code: string | null } | null;
};

/** Lists every project the signed-in user is a member of, with their role. */
export default function Projects() {
  const [rows, setRows] = useState<Membership[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("project_members")
      .select("role, projects(id,name,code)")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setRows(data ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <Link href="/(app)/scan" asChild>
          <Button title="Scan QR" />
        </Link>
        <Button title="Sign out" onPress={() => supabase.auth.signOut()} />
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
      {!loading && rows.length === 0 && !error && (
        <Text style={styles.empty}>You are not on any project yet. Ask a coordinator to invite you.</Text>
      )}
      <FlatList
        data={rows}
        keyExtractor={(m) => m.projects?.id ?? m.role}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.projects?.name ?? "(unknown project)"}</Text>
            <Text style={styles.meta}>
              {item.projects?.code} · {item.role}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  actions: { flexDirection: "row", justifyContent: "space-between" },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#ccc" },
  name: { fontSize: 18, fontWeight: "500" },
  meta: { color: "#666", marginTop: 2 },
  empty: { color: "#666" },
  error: { color: "#b00020" },
});
