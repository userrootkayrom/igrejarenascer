import { supabase } from "/supabase-compat.js";

const MODULES = [
  { key: "ministerios", table: "ministries", label: "Ministérios", scopedToLeader: true, fields: [["name", "Nome", "text", true], ["description", "Descrição", "textarea", false], ["active", "Ativo", "checkbox", false]] },
  { key: "celulas", table: "cells", label: "Células", fields: [["name", "Nome", "text", true], ["address", "Endereço", "text", false], ["meeting_day", "Dia", "text", false], ["meeting_time", "Horário", "time", false]] },
  { key: "escalas", table: "schedules", label: "Escalas", fields: [["title", "Título", "text", true], ["starts_at", "Início", "datetime-local", true], ["ends_at", "Fim", "datetime-local", false], ["location", "Local", "text", false]] },
  { key: "presenca", table: "attendance_sessions", label: "Presença", fields: [["title", "Encontro", "text", true], ["starts_at", "Data e hora", "datetime-local", true], ["checkin_code", "Código", "text", false]] },
  { key: "pastoral", table: "pastoral_followups", label: "Pastoral", pastorOnly: true, fields: [["title", "Título", "text", true], ["notes", "Anotações", "textarea", false], ["priority", "Prioridade", "text", false], ["status", "Status", "text", false]] },
  { key: "financeiro", table: "finance_categories", label: "Categorias financeiras", fields: [["name", "Nome", "text", true], ["kind", "Tipo", "text", true], ["active", "Ativa", "checkbox", false]] },
  { key: "patrimonio", table: "assets", label: "Patrimônio", fields: [["name", "Nome", "text", true], ["category", "Categoria", "text", false], ["location", "Local", "text", false], ["condition", "Condição", "text", false], ["value", "Valor", "number", false]] },
  { key: "manutencao", table: "maintenance_requests", label: "Manutenção", fields: [["title", "Título", "text", true], ["description", "Descrição", "textarea", false], ["priority", "Prioridade", "text", false], ["status", "Status", "text", false], ["due_on", "Prazo", "date", false]] },
  { key: "notificacoes", table: "notifications", label: "Notificações", fields: [["title", "Título", "text", true], ["body", "Mensagem", "textarea", true], ["type", "Tipo", "text", false]] },
  { key: "integracoes", table: "integration_connections", label: "Integrações", fields: [["provider", "Provedor", "text", true], ["label", "Nome", "text", true], ["active", "Ativa", "checkbox", false]] }
];

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
const input = ([name, label, type, required], value = "") => type === "textarea"
  ? `<label class="grid gap-1 text-sm font-semibold">${label}<textarea name="${name}"${required ? " required" : ""} class="rounded-xl border border-slate-200 bg-slate-50 p-3">${esc(value)}</textarea></label>`
  : `<label class="grid gap-1 text-sm font-semibold">${label}<input name="${name}" type="${type}" value="${type === "checkbox" ? "" : esc(value)}"${required ? " required" : ""}${type === "checkbox" && value ? " checked" : ""} class="rounded-xl border border-slate-200 bg-slate-50 p-3"></label>`;

function hasPermission(profile, key) {
  return profile?.role === "superadmin" || profile?.permissions?.[key] === true;
}

function isPastor(profile) {
  const role = `${profile?.role || ""} ${profile?.nomenclatura || ""} ${profile?.cargo || ""}`.toLowerCase();
  return profile?.role === "superadmin" || profile?.permissions?.pastoral === true || role.includes("pastor");
}

export function initAdminModules({ profile, user, notify }) {
  const root = document.querySelector("#admin-modules");
  if (!root) return;
  const visible = MODULES.filter((module) => hasPermission(profile, module.key) && (!module.pastorOnly || isPastor(profile)));
  root.innerHTML = visible.length ? visible.map((module) => `
    <article data-admin-module="${module.key}" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div class="mb-4 flex items-center justify-between gap-3"><div><h3 class="font-bold">${module.label}</h3><p class="text-xs text-slate-400">${module.table}</p></div><button data-refresh type="button" class="text-xs font-bold text-green-700">Atualizar</button></div>
      <form data-form class="mb-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">${module.fields.map((field) => input(field)).join("")}<div class="flex gap-2 sm:col-span-2"><button data-submit class="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white">Adicionar</button><button data-cancel type="button" hidden class="rounded-xl border px-4 py-2 text-sm font-bold">Cancelar</button></div></form>
      <ul data-rows class="divide-y divide-slate-100"></ul>
    </article>`).join("") : `<div class="rounded-2xl border border-dashed border-slate-300 p-8 text-sm text-slate-500">Nenhum módulo liberado para este usuário.</div>`;

  const state = new Map();
  const card = (module) => root.querySelector(`[data-admin-module="${module.key}"]`);
  const load = async (module) => {
    let query = supabase.from(module.table).select("*").order("created_at", { ascending: false }).limit(100);
    if (module.scopedToLeader && profile?.role !== "superadmin" && !profile?.permissions?.ministerios_coordenacao) query = query.eq("leader_user_id", user.id);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    const target = card(module).querySelector("[data-rows]");
    target.innerHTML = rows.length ? rows.map((row) => {
      const value = row.name || row.title || row.description || row.body || row.id;
      return `<li class="flex items-center justify-between gap-3 py-3"><span class="truncate"><strong>${esc(value)}</strong><small class="ml-2 text-slate-400">${esc(row.status || row.kind || "")}</small></span><span class="flex gap-2"><button type="button" data-edit="${row.id}" class="text-xs font-bold text-green-700">Editar</button><button type="button" data-delete="${row.id}" class="text-xs font-bold text-red-600">Excluir</button></span></li>`;
    }).join("") : `<li class="py-3 text-sm text-slate-400">Nenhum registro encontrado.</li>`;
    target.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => {
      const row = rows.find((item) => item.id === button.dataset.edit);
      state.set(module.key, row);
      const form = card(module).querySelector("[data-form]");
      module.fields.forEach(([name, , type]) => { if (form.elements[name]) form.elements[name].type === "checkbox" ? form.elements[name].checked = Boolean(row[name]) : form.elements[name].value = row[name] ?? ""; });
      form.querySelector("[data-submit]").textContent = "Salvar alterações";
      form.querySelector("[data-cancel]").hidden = false;
    }));
    target.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("Excluir este registro?")) return;
      const result = await supabase.from(module.table).delete().eq("id", button.dataset.delete);
      if (result.error) return notify("Erro ao excluir", result.error.message, "error");
      await load(module);
    }));
  };
  visible.forEach((module) => {
    const container = card(module);
    const form = container.querySelector("[data-form]");
    container.querySelector("[data-refresh]").addEventListener("click", () => load(module));
    container.querySelector("[data-cancel]").addEventListener("click", () => { form.reset(); state.delete(module.key); form.querySelector("[data-submit]").textContent = "Adicionar"; form.querySelector("[data-cancel]").hidden = true; });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(module.fields.map(([name, , type]) => [name, type === "checkbox" ? form.elements[name].checked : (form.elements[name].value || null)]));
      if (module.table === "ministries" && !hasPermission(profile, "ministerios")) return;
      if (module.table === "ministries" && profile?.role !== "superadmin" && !profile?.permissions?.ministerios_coordenacao) values.leader_user_id = user.id;
      if (module.table === "notifications") values.recipient_id = user.id;
      const editing = state.get(module.key);
      const result = editing
        ? await supabase.from(module.table).update(values).eq("id", editing.id)
        : await supabase.from(module.table).insert(values);
      if (result.error) return notify("Não foi possível salvar", result.error.message, "error");
      notify("Registro salvo", `${module.label} atualizado com sucesso.`);
      form.reset(); state.delete(module.key); form.querySelector("[data-submit]").textContent = "Adicionar"; form.querySelector("[data-cancel]").hidden = true; await load(module);
    });
    load(module).catch((error) => { container.querySelector("[data-rows]").innerHTML = `<li class="py-3 text-sm text-red-600">${esc(error.message)}</li>`; });
  });
}
