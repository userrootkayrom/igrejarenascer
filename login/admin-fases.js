import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.SUPABASE_CONFIG;
if (!config?.url || !config?.anonKey || config.url.includes("seu-projeto")) {
  throw new Error("Configure supabase-config.js antes de abrir o painel.");
}
const supabase = createClient(config.url, config.anonKey);
const phase = document.body.dataset.phase;
const SUPERADMIN_EMAIL = "admin@renascer.com";
const phases = {
  "1": {
    permission: "fase1",
    title: "Fase 1 · Gestão da igreja",
    description: "Organize membros, eventos, respostas e registros administrativos.",
    modules: [
      { table: "members", label: "Membros", fields: [["name", "Nome", "text", true], ["phone", "Telefone", "tel", false], ["email", "E-mail", "email", false], ["status", "Status", "text", false]] },
      { table: "events", label: "Eventos", fields: [["title", "Título", "text", true], ["event_date", "Data e hora", "datetime-local", true], ["location", "Local", "text", false]] },
      { table: "inbox_submissions", label: "Respostas recebidas", readOnly: true }
    ]
  },
  "2": {
    permission: "fase2",
    title: "Fase 2 · Operação da igreja",
    description: "Gerencie ministérios, células, escalas, presença e acompanhamento pastoral.",
    modules: [
      { table: "ministries", label: "Ministérios", fields: [["name", "Nome", "text", true], ["description", "Descrição", "textarea", false], ["active", "Ativo", "checkbox", false]] },
      { table: "cells", label: "Células", fields: [["name", "Nome", "text", true], ["address", "Endereço", "text", false], ["meeting_day", "Dia da reunião", "text", false], ["meeting_time", "Horário", "time", false]] },
      { table: "schedules", label: "Escalas", fields: [["title", "Título", "text", true], ["starts_at", "Início", "datetime-local", true], ["ends_at", "Fim", "datetime-local", false], ["location", "Local", "text", false]] },
      { table: "attendance_sessions", label: "Presença", fields: [["title", "Encontro", "text", true], ["starts_at", "Data e hora", "datetime-local", true], ["checkin_code", "Código QR", "text", false]] },
      { table: "pastoral_followups", label: "Acompanhamento pastoral", fields: [["title", "Título", "text", true], ["notes", "Anotações", "textarea", false], ["priority", "Prioridade", "text", false], ["status", "Status", "text", false]] }
    ]
  },
  "3": {
    permission: "fase3",
    title: "Fase 3 · Gestão avançada",
    description: "Controle financeiro, patrimônio, manutenção, notificações e integrações.",
    modules: [
      { table: "finance_categories", label: "Categorias financeiras", fields: [["name", "Nome", "text", true], ["kind", "Tipo (income/expense)", "text", true], ["active", "Ativa", "checkbox", false]] },
      { table: "finance_transactions", label: "Lançamentos financeiros", fields: [["description", "Descrição", "text", true], ["amount", "Valor", "number", true], ["kind", "Tipo (income/expense)", "text", true], ["occurred_on", "Data", "date", true], ["notes", "Observações", "textarea", false]] },
      { table: "assets", label: "Patrimônio", fields: [["name", "Nome", "text", true], ["category", "Categoria", "text", false], ["inventory_code", "Código", "text", false], ["location", "Localização", "text", false], ["condition", "Condição", "text", false], ["value", "Valor", "number", false]] },
      { table: "maintenance_requests", label: "Manutenção", fields: [["title", "Título", "text", true], ["description", "Descrição", "textarea", false], ["priority", "Prioridade", "text", false], ["status", "Status", "text", false], ["due_on", "Prazo", "date", false]] },
      { table: "notifications", label: "Notificações", fields: [["title", "Título", "text", true], ["body", "Mensagem", "textarea", true], ["type", "Tipo", "text", false]] },
      { table: "integration_connections", label: "Integrações", fields: [["provider", "Provedor", "text", true], ["label", "Nome", "text", true], ["active", "Ativa", "checkbox", false]] }
    ]
  }
};
const definition = phases[phase];
const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
let user;
let editing = null;

function notify(message, error = false) {
  const element = $("#notice");
  element.textContent = message;
  element.className = `mb-5 rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`;
  element.hidden = false;
}

function canAccess(profile) {
  if (profile?.role === "superadmin" || user?.email?.toLowerCase() === SUPERADMIN_EMAIL) return true;
  if (profile?.permissions?.[definition.permission] || profile?.permissions?.[`fase${phase}`]) return true;
  if (phase === "1") return ["membros", "eventos", "respostas"].some((permission) => profile?.permissions?.[permission] === true);
  return false;
}

function inputMarkup(field, value = "") {
  const [name, label, type, required] = field;
  const requiredAttr = required ? " required" : "";
  if (type === "textarea") return `<label class="grid gap-1 text-sm font-semibold">${label}<textarea name="${name}"${requiredAttr} class="min-h-24 rounded-xl border border-slate-200 bg-slate-50 p-3">${escapeHtml(value)}</textarea></label>`;
  if (type === "checkbox") return `<label class="flex items-center gap-2 text-sm font-semibold"><input name="${name}" type="checkbox"${value ? " checked" : ""} class="h-4 w-4 accent-green-600"> ${label}</label>`;
  return `<label class="grid gap-1 text-sm font-semibold">${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}"${requiredAttr} class="rounded-xl border border-slate-200 bg-slate-50 p-3"></label>`;
}

async function loadRows(module) {
  const query = supabase.from(module.table).select("*").order("created_at", { ascending: false }).limit(100);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => row.data ? { ...row.data, id: row.id, _legacyId: row.legacy_id, _raw: row } : row);
}

function displayValue(row, module) {
  if (module.table === "inbox_submissions") return row.collection_name || "Resposta";
  const field = module.fields?.[0]?.[0];
  return row[field] ?? row.data?.[field] ?? row.id;
}

async function renderModule(module) {
  const container = document.querySelector(`[data-module="${module.table}"]`);
  try {
    const rows = await loadRows(module);
    container.querySelector("[data-rows]").innerHTML = rows.length
      ? rows.map((row) => `<li class="flex items-center justify-between gap-3 border-b border-slate-100 py-3"><span><strong>${escapeHtml(displayValue(row, module))}</strong><small class="ml-2 text-slate-400">${escapeHtml(row.status || row.kind || row.created_at || "")}</small></span>${module.readOnly ? "" : `<span class="flex gap-2"><button data-edit="${row.id}" class="text-xs font-bold text-green-700">Editar</button><button data-delete="${row.id}" class="text-xs font-bold text-red-600">Excluir</button></span>`}</li>`).join("")
      : `<li class="py-3 text-sm text-slate-400">Nenhum registro encontrado.</li>`;
    container.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => startEdit(module, rows.find((row) => row.id === button.dataset.edit))));
    container.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => removeRow(module, button.dataset.delete)));
  } catch (error) {
    console.error(`Erro ao carregar ${module.table}:`, error);
    container.querySelector("[data-rows]").innerHTML = `<li class="py-3 text-sm text-red-600">Não foi possível carregar este módulo.</li>`;
  }
}

function startEdit(module, row) {
  editing = { module, id: row.id };
  const form = document.querySelector(`[data-form="${module.table}"]`);
  for (const [name] of module.fields) {
    const control = form.elements[name];
    if (!control) continue;
    control.type === "checkbox" ? control.checked = Boolean(row[name]) : control.value = row[name] ?? "";
  }
  form.querySelector("[data-submit]").textContent = "Salvar alterações";
  form.querySelector("[data-cancel]").hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetForm(form) {
  form.reset();
  form.querySelector("[data-submit]").textContent = "Adicionar registro";
  form.querySelector("[data-cancel]").hidden = true;
  editing = null;
}

async function saveRow(event, module) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = {};
  for (const [name, , type] of module.fields) values[name] = type === "checkbox" ? form.elements[name].checked : (form.elements[name].value || null);
  try {
    const legacyTable = ["members", "events"].includes(module.table);
    const payload = legacyTable
      ? { data: values, status: values.status || null, event_date: values.event_date || null, updated_at: new Date().toISOString() }
      : { ...values, updated_at: new Date().toISOString() };
    const result = editing?.module.table === module.table
      ? await supabase.from(module.table).update(payload).eq("id", editing.id)
      : await supabase.from(module.table).insert(legacyTable ? { ...payload, legacy_id: crypto.randomUUID() } : values);
    if (result.error) throw result.error;
    notify(editing ? "Registro atualizado." : "Registro criado.");
    resetForm(form);
    await renderModule(module);
  } catch (error) {
    console.error(`Erro ao salvar ${module.table}:`, error);
    notify(error.message || "Não foi possível salvar o registro.", true);
  }
}

async function removeRow(module, id) {
  if (!confirm("Excluir este registro?")) return;
  const { error } = await supabase.from(module.table).delete().eq("id", id);
  if (error) return notify(error.message, true);
  notify("Registro excluído.");
  renderModule(module);
}

function renderModules() {
  $("#modules").innerHTML = definition.modules.map((module) => `
    <section data-module="${module.table}" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="mb-4 flex items-center justify-between gap-3"><div><h2 class="font-bold">${module.label}</h2><p class="text-xs text-slate-400">${module.table}</p></div><button data-refresh="${module.table}" class="text-xs font-bold text-green-700">Atualizar</button></div>
      ${module.readOnly ? "" : `<form data-form="${module.table}" class="mb-5 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">${module.fields.map((field) => inputMarkup(field)).join("")}<div class="flex items-center gap-2 sm:col-span-2"><button data-submit class="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white">Adicionar registro</button><button data-cancel type="button" hidden class="rounded-xl border px-4 py-2 text-sm font-bold">Cancelar</button></div></form>`}
      <ul data-rows class="divide-y divide-slate-100"></ul>
    </section>`).join("");
  for (const module of definition.modules) {
    if (!module.readOnly) {
      const form = document.querySelector(`[data-form="${module.table}"]`);
      form.addEventListener("submit", (event) => saveRow(event, module));
      form.querySelector("[data-cancel]").addEventListener("click", () => resetForm(form));
    }
    document.querySelector(`[data-refresh="${module.table}"]`)?.addEventListener("click", () => renderModule(module));
    renderModule(module);
  }
}

async function init() {
  const { data: sessionData } = await supabase.auth.getSession();
  user = sessionData.session?.user;
  if (!user) return window.location.href = "/login/index.html";
  const { data: profileById, error: idError } = await supabase.from("admin_profiles").select("*").eq("id", user.id).maybeSingle();
  const { data: profileByEmail, error: emailError } = profileById || !user.email
    ? { data: null, error: null }
    : await supabase.from("admin_profiles").select("*").eq("email", user.email.toLowerCase()).maybeSingle();
  const profile = profileById || profileByEmail;
  const error = idError || emailError;
  if (error || !canAccess(profile)) return window.location.href = "/login/admin-dashboard.html";
  $("#user").textContent = profile.name || user.email;
  $("#title").textContent = definition.title;
  $("#description").textContent = definition.description;
  $("#logout").addEventListener("click", async () => { await supabase.auth.signOut(); window.location.href = "/login/index.html"; });
  renderModules();
  $("#loading").remove();
  $("#app").classList.remove("hidden");
}

init().catch((error) => { console.error(error); $("#loading").textContent = "Não foi possível carregar esta área."; });
