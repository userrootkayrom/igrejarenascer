import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.SUPABASE_CONFIG;
if (!config?.url || !config?.anonKey || config.url.includes("seu-projeto") || config.anonKey === "******" || config.anonKey.includes("sua_chave")) {
  throw new Error("Configure supabase-config.js com a URL e a chave pública do Supabase.");
}

export const supabase = window.__supabaseClient || createClient(config.url, config.anonKey);
window.__supabaseClient = supabase;
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

function sanitizeData(value) {
  const sanitize = (item) => {
    if (item === undefined || typeof item === "function" || typeof item === "symbol") return undefined;
    if (item === null || typeof item === "string" || typeof item === "boolean") return item;
    if (typeof item === "number") return Number.isFinite(item) ? item : null;
    if (item instanceof Date) return item.toISOString();
    if (typeof item.toDate === "function") return sanitize(item.toDate());
    if (Array.isArray(item)) return item.map((entry) => sanitize(entry) ?? null);
    if (typeof item === "object") {
      return Object.fromEntries(Object.entries(item).flatMap(([key, entry]) => {
        const sanitized = sanitize(entry);
        return sanitized === undefined ? [] : [[key, sanitized]];
      }));
    }
    return undefined;
  };
  const result = sanitize(value);
  return result && typeof result === "object" && !Array.isArray(result) ? result : {};
}

function collectionNameFor(name) {
  return tableFor(name) === "inbox_submissions" ? name : undefined;
}

function eventDateFor(data) {
  if (data.event_date) {
    const date = new Date(data.event_date);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (!data.data_evento) return null;
  const time = data.horario || data.hora || "00:00";
  const date = new Date(`${data.data_evento}T${time.length === 5 ? `${time}:00` : time}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function recordRow(sourceName, data, legacyId) {
  const table = tableFor(sourceName);
  const row = { legacy_id: legacyId, data };
  if (table === "members") row.status = data.status || null;
  if (table === "events") row.event_date = eventDateFor(data);
  if (table === "inbox_submissions") {
    row.status = data.status || "new";
    row.collection_name = collectionNameFor(sourceName);
  }
  return row;
}

function mergeData(currentData, patch) {
  const merged = { ...(currentData || {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && "__increment" in value) {
      const amount = Number(value.__increment);
      if (!Number.isFinite(amount)) throw new Error(`Incremento inválido no campo ${key}.`);
      merged[key] = (Number(merged[key]) || 0) + amount;
    } else {
      merged[key] = value;
    }
  }
  return sanitizeData(merged);
}

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
      const column = source.name === "usuarios_admin" ? constraint.field === "nome" ? "name" : constraint.field : `data->>${constraint.field}`;
      request = request.eq(column, constraint.value);
    }
    if (constraint.type === "orderBy") {
      const column = source.name === "agenda_eventos" && constraint.field === "data_evento" ? "event_date" : "created_at";
      request = request.order(column, { ascending: constraint.direction !== "desc" });
    }
  }
  return request;
}

function makeDoc(sourceName, row) {
  const docId = row?.legacy_id || row?.id;
  return {
    id: docId,
    _supabaseId: row?.id,
    data: () => wrap(sourceName, row || {}),
    exists: () => Boolean(row),
  };
}
function makeSnapshot(source, rows) {
  const docs = (rows || []).map((row) => makeDoc(source.name, row));
  return {
    size: docs.length,
    docs,
    empty: docs.length === 0,
    forEach(callback) { docs.forEach((d) => callback(d)); },
  };
}
export async function getDocs(source) {
  const { data, error } = await makeQuery(source).limit(1000);
  if (error) throw error;
  return makeSnapshot(source, data || []);
}

export async function getDoc(reference) {
  const request = supabase.from(tableFor(reference.name)).select("*");
  const { data, error } = reference.name === "usuarios_admin"
    ? await request.eq("id", reference.id).maybeSingle()
    : await request.or(`id.eq.${reference.id},legacy_id.eq.${reference.id}`).maybeSingle();
  if (error) throw error;
  if (!data) return { exists: () => false, data: () => undefined, id: reference.id };
  const d = makeDoc(reference.name, data);
  return { exists: () => true, data: d.data, id: d.id };
}

export async function addDoc(reference, value) {
  const table = tableFor(reference.name);
  const safeData = sanitizeData(value || {});
  const legacy_id = safeData.id || crypto.randomUUID();

  const row = table === "admin_profiles"
    ? {
        id: safeData.uid || safeData.id || reference.id || undefined,
        email: safeData.email,
        name: safeData.nome || safeData.name || null,
        nomenclatura: safeData.nomenclatura || null,
        role: safeData.role || "admin",
        permissions: safeData.permissions || {},
        photo_url: safeData.photoURL || safeData.photo_url || null,
      }
    : recordRow(reference.name, safeData, legacy_id);

  const { data, error } = await supabase.from(table).insert(row).select("*").single();
  if (error) throw error;
  const d = makeDoc(reference.name, data);
  return { id: d.id };
}

export async function setDoc(reference, value, options = {}) {
  const table = tableFor(reference.name);
  const safeData = sanitizeData(value || {});
  const legacy_id = reference.id || safeData.id || crypto.randomUUID();

  if (table === "admin_profiles") {
    if (options.merge) {
      const updates = {};
      if ("nome" in safeData || "name" in safeData) updates.name = safeData.nome ?? safeData.name;
      if ("nomenclatura" in safeData) updates.nomenclatura = safeData.nomenclatura;
      if ("role" in safeData) updates.role = safeData.role;
      if ("permissions" in safeData) updates.permissions = safeData.permissions;
      if ("photoURL" in safeData || "photo_url" in safeData) updates.photo_url = safeData.photoURL ?? safeData.photo_url;
      const { data: existing, error: readError } = await supabase.from(table).select("id").eq("id", reference.id).maybeSingle();
      if (readError) throw readError;
      if (existing) {
        const { error } = await supabase.from(table).update(updates).eq("id", reference.id);
        if (error) throw error;
        return;
      }
      const { data: authResult, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const email = safeData.email || authResult.user?.email;
      if (!email) throw new Error("Não foi possível identificar o e-mail para criar o perfil administrativo.");
      const { error } = await supabase.from(table).insert({
        id: reference.id,
        email,
        name: updates.name || authResult.user?.user_metadata?.display_name || email,
        nomenclatura: updates.nomenclatura || null,
        role: updates.role || "admin",
        permissions: updates.permissions || {},
        photo_url: updates.photo_url || authResult.user?.user_metadata?.avatar_url || null,
      });
      if (error) throw error;
      return;
    }
    const payload = {
      id: reference.id,
      email: safeData.email,
      name: safeData.nome || safeData.name || null,
      nomenclatura: safeData.nomenclatura || null,
      role: safeData.role || "admin",
      permissions: safeData.permissions || {},
      photo_url: safeData.photoURL || safeData.photo_url || null,
    };
    const { error } = await supabase.from(table).upsert(payload, { onConflict: "id" });
    if (error) throw error;
    return;
  }

  const row = recordRow(reference.name, safeData, legacy_id);
  const request = options.merge
    ? supabase.from(table).upsert(row, { onConflict: "legacy_id" })
    : supabase.from(table).upsert(row);
  const { error } = await request;
  if (error) throw error;
}

export async function updateDoc(reference, value) {
  const table = tableFor(reference.name);
  const safeValue = sanitizeData(value || {});
  const read = reference.name === "usuarios_admin"
    ? supabase.from(table).select("*").eq("id", reference.id).maybeSingle()
    : supabase.from(table).select("*").or(`id.eq.${reference.id},legacy_id.eq.${reference.id}`).maybeSingle();
  const { data: current, error: readError } = await read;
  if (readError) throw readError;
  if (!current) throw new Error(`Registro não encontrado: ${reference.id}`);

  if (table === "admin_profiles") {
    const payload = {};
    if ("name" in safeValue || "nome" in safeValue) payload.name = safeValue.nome || safeValue.name;
    if ("nomenclatura" in safeValue) payload.nomenclatura = safeValue.nomenclatura;
    if ("role" in safeValue) payload.role = safeValue.role;
    if ("permissions" in safeValue) payload.permissions = safeValue.permissions;
    if ("photoURL" in safeValue || "photo_url" in safeValue) payload.photo_url = safeValue.photoURL || safeValue.photo_url;
    const { error } = await supabase.from(table).update(payload).eq("id", current.id);
    if (error) throw error;
    return;
  }

  const merged = mergeData(current.data, safeValue);
  const status = merged.status || safeValue.status || current.status;
  const patch = { data: merged };
  if (table === "members" || table === "inbox_submissions") patch.status = status;
  if (table === "events") patch.event_date = eventDateFor(merged) || current.event_date;
  if (table === "inbox_submissions") patch.collection_name = collectionNameFor(reference.name);
  const { error } = await supabase.from(table).update(patch).eq("id", current.id);
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
  const { data: currentSession, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!currentSession.session) throw new Error("A sessão do administrador expirou. Entre novamente antes de criar usuários.");
  const result = await supabase.auth.signUp({ email, password });
  if (result.error) throw result.error;
  const restored = await supabase.auth.setSession(currentSession.session);
  if (restored.error) throw restored.error;
  const { data: verifiedSession, error: verifyError } = await supabase.auth.getSession();
  if (verifyError) throw verifyError;
  if (verifiedSession.session?.user.id !== currentSession.session.user.id) {
    throw new Error("Não foi possível restaurar a sessão do administrador após criar o usuário.");
  }
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
