import dotenv from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || ".env.local" });
dotenv.config();

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "FIREBASE_SERVICE_ACCOUNT_PATH"];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Variável obrigatória ausente: ${key}`);
}

const dryRun = process.env.MIGRATION_DRY_RUN !== "false";
const serviceAccount = JSON.parse(await fs.readFile(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf8"));
const firebaseApp = initializeApp({
  credential: cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined
});
const firestore = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const collections = {
  membros_oficiais: "members",
  agenda_eventos: "events",
  conexoes_novos_membros: "inbox_submissions",
  inscricoes_batismo: "inbox_submissions",
  inscricoes_voluntarios: "inbox_submissions",
  pedidos_oracao: "inbox_submissions",
  interesse_grupos: "inbox_submissions",
  usuarios_admin: "admin_profiles"
};
const report = { dryRun, collections: {}, users: { invited: 0, skipped: 0, invalid: [] }, files: { copied: 0, skipped: 0 }, errors: [] };

function plainValue(value) {
  if (value?.toDate) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(plainValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plainValue(item)]));
  return value;
}

async function migrateCollection(source, destination) {
  const snapshot = await firestore.collection(source).get();
  report.collections[source] = snapshot.size;
  if (destination === "admin_profiles") return;
  if (dryRun || !snapshot.size) return;
  const rows = snapshot.docs.map((document) => {
    const data = plainValue(document.data());
    if (destination === "members") return { legacy_id: document.id, data, status: data.status || null };
    if (destination === "events") return { legacy_id: document.id, data, event_date: data.data_evento ? new Date(data.data_evento).toISOString() : null };
    if (destination === "admin_profiles") return { id: data.uid, email: data.email || "", name: data.nome || null, role: data.role || "admin", permissions: data.permissions || {}, photo_url: data.photoURL || null };
    return { legacy_id: document.id, collection_name: source, data, status: data.status || "new" };
  });
  for (let index = 0; index < rows.length; index += 500) {
    const conflict = destination === "admin_profiles" ? "id" : "legacy_id";
    const { error } = await supabase.from(destination).upsert(rows.slice(index, index + 500), { onConflict: conflict });
    if (error) throw new Error(`${source}: ${error.message}`);
  }
}

async function migrateUsers() {
  let page;
  do {
    page = await auth.listUsers(1000, page?.pageToken);
    for (const user of page.users) {
      if (dryRun) { report.users.skipped++; continue; }
      try {
        const { error } = await supabase.auth.admin.inviteUserByEmail(user.email, {
          data: { firebase_uid: user.uid, display_name: user.displayName || "" }
        });
        if (error && !error.message.toLowerCase().includes("already")) throw error;
        report.users.invited++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.toLowerCase().includes("email") && message.toLowerCase().includes("invalid")) {
          report.users.invalid.push({ uid: user.uid, email: user.email || null, message });
          continue;
        }
        throw error;
      }
    }
  } while (page.pageToken);
}

async function migrateAdminProfiles() {
  const snapshot = await firestore.collection("usuarios_admin").get();
  if (dryRun || !snapshot.size) return;
  const { data, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  const byEmail = new Map(data.users.map((user) => [user.email?.toLowerCase(), user.id]));
  const rows = snapshot.docs.flatMap((document) => {
    const profile = plainValue(document.data());
    const id = byEmail.get(profile.email?.toLowerCase());
    if (!id) return [];
    return [{ id, email: profile.email || "", name: profile.nome || null, nomenclatura: profile.nomenclatura || null, role: profile.role || "admin", permissions: profile.permissions || {}, photo_url: profile.photoURL || null }];
  });
  if (rows.length) {
    const { error } = await supabase.from("admin_profiles").upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }
}

async function migrateStorage() {
  if (!process.env.FIREBASE_STORAGE_BUCKET) {
    report.files.skipped = "Firebase Storage não configurado";
    return;
  }
  const bucket = getStorage(firebaseApp).bucket();
  if (!bucket.name) return;
  const [files] = await bucket.getFiles();
  report.files.total = files.length;
  const destinationBucket = process.env.SUPABASE_STORAGE_BUCKET || "church-files";
  if (!dryRun) {
    const { error } = await supabase.storage.createBucket(destinationBucket, { public: false });
    if (error && !error.message.toLowerCase().includes("already exists")) throw error;
  }
  for (const file of files) {
    if (dryRun) { report.files.skipped++; continue; }
    const [contents] = await file.download();
    const contentType = file.metadata.contentType || "application/octet-stream";
    const { error } = await supabase.storage.from(destinationBucket).upload(file.name, contents, { contentType, upsert: true });
    if (error) throw new Error(`${file.name}: ${error.message}`);
    report.files.copied++;
  }
}

async function main() {
  for (const [source, destination] of Object.entries(collections)) {
    try { await migrateCollection(source, destination); }
    catch (error) { report.errors.push({ source, message: error.message }); }
  }
  try { await migrateUsers(); } catch (error) { report.errors.push({ source: "auth", message: error.message }); }
  try { await migrateAdminProfiles(); } catch (error) { report.errors.push({ source: "usuarios_admin", message: error.message }); }
  try { await migrateStorage(); } catch (error) { report.errors.push({ source: "storage", message: error.message }); }
  const output = path.resolve(`migration-report-${Date.now()}.json`);
  await fs.writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, reportFile: output }, null, 2));
  if (report.errors.length) process.exitCode = 1;
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
