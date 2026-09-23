import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.SUPABASE_CONFIG;
if (!config?.url || !config?.anonKey || config.url.includes("seu-projeto")) {
  throw new Error("Configure supabase-config.js com a URL e a chave pública do Supabase.");
}

export const supabase = createClient(config.url, config.anonKey);
const collectionMap = {
  membros_oficiais: "members",
  agenda_eventos: "events",
  conexoes_novos_membros: "inbox_submissions",
  inscricoes_batismo: "inbox_submissions",
  inscricoes_voluntarios: "inbox_submissions",
  pedidos_oracao: "inbox_submissions",
  interesse_grupos: "inbox_submissions",
  usuarios_admin: "admin_profiles"
};
const tableFor = (name) => collectionMap[name] || name;
const unwrap = (row) => ({ ...(row?.data || {}), id: row?.legacy_id || row?.id, _supabaseId: row?.id });
const wrap = (name, row) => name === "usuarios_admin"
  ? { ...row, nome: row.name, nomenclatura: row.nomenclatura, photoURL: row.photo_url }
  : unwrap(row);

export function initializeApp(configValue, name) { return { config: configValue, name }; }
export function getAnalytics() { return null; }
export function getAuth() { return supabase.auth; }
export function getFirestore() { return supabase; }
export function getStorage() { return supabase.storage; }
export function collection(_db, name) { return { name }; }
export function doc(_db, name, id) { return { name, id }; }
export function where(field, operator, value) { return { type: "where", field, operator, value }; }
export function orderBy(field, direction = "asc") { return { type: "orderBy", field, direction }; }
export function query(source, ...constraints) { return { name: source.name, constraints }; }
export function serverTimestamp() { return new Date().toISOString(); }
export function increment(value) { return { __increment: value }; }

function makeQuery(source) {
  const constraints = source.constraints || [];
  let request = supabase.from(tableFor(source.name)).select("*");
  for (const constraint of constraints) {
    if (constraint.type === "where" && constraint.operator === "==") {
      request = request.eq(`data->>${constraint.field}`, constraint.value);
    }
    if (constraint.type === "orderBy") {
      const column = source.name === "agenda_eventos" && constraint.field === "data_evento" ? "event_date" : "created_at";
      request = request.order(column, { ascending: constraint.direction !== "desc" });
    }
  }
  return request;
}

export async function getDocs(source) {
  const { data, error } = await makeQuery(source).limit(1000);
  if (error) throw error;
  return { size: data.length, docs: data.map((row) => ({ id: row.id, data: () => wrap(source.name, row) })) };
}

export async function getDoc(reference) {
  const request = supabase.from(tableFor(reference.name)).select("*");
  const { data, error } = reference.name === "usuarios_admin"
    ? await request.eq("id", reference.id).maybeSingle()
    : await request.or(`id.eq.${reference.id},legacy_id.eq.${reference.id}`).maybeSingle();
  if (error) throw error;
  return { exists: () => Boolean(data), data: () => data ? wrap(reference.name, data) : undefined, id: reference.id };
}

export async function addDoc(reference, value) {
  const table = tableFor(reference.name);
  const row = table === "admin_profiles"
    ? { email: value.email, name: value.nome || value.name || null, role: value.role || "admin", permissions: value.permissions || {}, photo_url: value.photoURL || null }
    : { legacy_id: crypto.randomUUID(), data: value, status: value.status || "new", collection_name: reference.name, event_date: value.data_evento || null };
  const { data, error } = await supabase.from(table).insert(row).select("id").single();
  if (error) throw error;
  return { id: data.id };
}

export async function setDoc(reference, value, options = {}) {
  const table = tableFor(reference.name);
  const row = table === "admin_profiles"
    ? { id: reference.id, email: value.email, name: value.nome || value.name || null, nomenclatura: value.nomenclatura || null, role: value.role || "admin", permissions: value.permissions || {}, photo_url: value.photoURL || null }
    : { legacy_id: reference.id, data: value, status: value.status || null };
  const request = options.merge
    ? supabase.from(table).upsert(row, { onConflict: table === "admin_profiles" ? "id" : "legacy_id" })
    : supabase.from(table).upsert(row);
  const { error } = await request;
  if (error) throw error;
}

export async function updateDoc(reference, value) {
  const table = tableFor(reference.name);
  const read = reference.name === "usuarios_admin"
    ? supabase.from(table).select("*").eq("id", reference.id).maybeSingle()
    : supabase.from(table).select("*").or(`id.eq.${reference.id},legacy_id.eq.${reference.id}`).maybeSingle();
  const { data: current, error: readError } = await read;
  if (readError) throw readError;
  if (!current) throw new Error(`Registro não encontrado: ${reference.id}`);
  const merged = { ...(current.data || {}), ...value };
  const { error } = await supabase.from(table).update({ data: merged, status: merged.status || current.status }).eq("id", current.id);
  if (error) throw error;
}

export async function deleteDoc(reference) {
  const request = supabase.from(tableFor(reference.name)).delete();
  const { error } = reference.name === "usuarios_admin"
    ? await request.eq("id", reference.id)
    : await request.or(`id.eq.${reference.id},legacy_id.eq.${reference.id}`);
  if (error) throw error;
}

export function onSnapshot(source, callback) {
  let stopped = false;
  const run = async () => {
    try { if (!stopped) callback(await getDocs(source)); }
    catch (error) { console.error("Erro ao consultar Supabase:", error); }
  };
  run();
  const timer = setInterval(run, 5000);
  return () => { stopped = true; clearInterval(timer); };
}

export async function signInWithEmailAndPassword(_auth, email, password) {
  const result = await supabase.auth.signInWithPassword({ email, password });
  if (result.error) throw result.error;
  return result.data;
}

export async function signOut() {
  const result = await supabase.auth.signOut();
  if (result.error) throw result.error;
}

export function onAuthStateChanged(_auth, callback) {
  supabase.auth.getSession().then(({ data }) => callback(data.session?.user || null));
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session?.user || null));
  return () => data.subscription.unsubscribe();
}

export async function updateProfile(_user, values) {
  const result = await supabase.auth.updateUser({ data: { display_name: values.displayName, avatar_url: values.photoURL } });
  if (result.error) throw result.error;
}

export async function updatePassword(_user, password) {
  const result = await supabase.auth.updateUser({ password });
  if (result.error) throw result.error;
}

export async function createUserWithEmailAndPassword(_auth, email, password) {
  const { data: currentSession } = await supabase.auth.getSession();
  const result = await supabase.auth.signUp({ email, password });
  if (currentSession.session) await supabase.auth.setSession(currentSession.session);
  if (result.error) throw result.error;
  return { user: result.data.user };
}

export function ref(_storage, path) { return { path }; }

export async function uploadBytes(reference, file) {
  const { error } = await supabase.storage.from("church-files").upload(reference.path, file, { upsert: true });
  if (error) throw error;
  return { ref: reference };
}

export async function getDownloadURL(reference) {
  const { data } = supabase.storage.from("church-files").getPublicUrl(reference.path);
  return data.publicUrl;
}
