import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = window.__supabaseClient || createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
window.__supabaseClient = supabase;
const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
const modules = [
  { key:"members", label:"Membros", table:"members", fields:[["name","Nome","text",true],["email","E-mail","email"],["phone","Telefone","text"],["status","Status","select",true,["Ativo","Inativo","Visitante"]],["notes","Observações","textarea"]], json:true },
  { key:"ministries", label:"Ministérios", table:"ministries", fields:[["name","Nome","text",true],["description","Descrição","textarea"],["active","Ativo","checkbox"]] },
  { key:"cells", label:"Células", table:"cells", fields:[["name","Nome","text",true],["address","Endereço","text"],["meeting_day","Dia da reunião","text"],["meeting_time","Horário","time"],["active","Ativa","checkbox"]] },
  { key:"events", label:"Eventos", table:"events", fields:[["title","Título","text",true],["event_date","Data e hora","datetime-local",true],["description","Descrição","textarea"]], json:true, dateField:"event_date" },
  { key:"schedules", label:"Escalas", table:"schedules", fields:[["title","Título","text",true],["starts_at","Início","datetime-local",true],["ends_at","Fim","datetime-local"],["location","Local","text"]] },
  { key:"attendance_sessions", label:"Presença", table:"attendance_sessions", fields:[["title","Encontro","text",true],["starts_at","Data e hora","datetime-local",true],["checkin_code","Código de check-in","text"]] },
  { key:"pastoral_followups", label:"Acompanhamento pastoral", table:"pastoral_followups", fields:[["title","Título","text",true],["notes","Anotações","textarea"],["priority","Prioridade","select",true,["low","normal","high","urgent"]],["status","Status","select",true,["open","in_progress","completed","archived"]]] },
  { key:"finance_transactions", label:"Financeiro", table:"finance_transactions", fields:[["description","Descrição","text",true],["amount","Valor","number",true],["kind","Tipo","select",true,["income","expense"]],["occurred_on","Data","date",true],["status","Status","select",true,["pending","confirmed","cancelled"]],["notes","Observações","textarea"]] },
  { key:"assets", label:"Patrimônio", table:"assets", fields:[["name","Nome","text",true],["category","Categoria","text"],["inventory_code","Código","text"],["location","Local","text"],["condition","Condição","select",true,["new","good","maintenance","retired"]],["value","Valor","number"],["notes","Observações","textarea"]] },
  { key:"maintenance_requests", label:"Manutenção", table:"maintenance_requests", fields:[["title","Título","text",true],["description","Descrição","textarea"],["priority","Prioridade","select",true,["low","normal","high","urgent"]],["status","Status","select",true,["open","in_progress","completed","cancelled"]],["due_on","Prazo","date"]] },
  { key:"notifications", label:"Notificações", table:"notifications", fields:[["title","Título","text",true],["body","Mensagem","textarea",true],["type","Tipo","text"]] },
  { key:"integration_connections", label:"Integrações", table:"integration_connections", fields:[["provider","Provedor","select",true,["whatsapp","google_calendar","microsoft_calendar","email"]],["label","Nome","text",true],["active","Ativa","checkbox"]] }
];
let profile = null, active = "dashboard", rows = [];
const permissionAliases = {
  members: ["members", "membros"],
  ministries: ["ministries", "ministerios"],
  cells: ["cells", "celulas"],
  events: ["events", "eventos"],
  schedules: ["schedules", "escalas"],
  attendance_sessions: ["attendance_sessions", "presenca"],
  pastoral_followups: ["pastoral_followups", "pastoral"],
  finance_transactions: ["finance_transactions", "financeiro"],
  assets: ["assets", "patrimonio"],
  maintenance_requests: ["maintenance_requests", "manutencao", "patrimonio"],
  notifications: ["notifications", "notificacoes"],
  integration_connections: ["integration_connections", "integracoes"]
};
function notify(message, error = false) { $("notice").textContent = message; $("notice").className = `notice${error ? " error" : ""}`; setTimeout(() => $("notice").classList.add("hidden"), 3800); }
function valueFrom(row, module, field) { return module.json ? row.data?.[field] ?? "" : row[field] ?? ""; }
function input(field, value = "") {
  const [name,label,type,required,options] = field;
  if (type === "textarea") return `<label class="wide">${label}<textarea name="${name}" ${required ? "required" : ""}>${esc(value)}</textarea></label>`;
  if (type === "select") return `<label>${label}<select name="${name}" ${required ? "required" : ""}><option value="">Selecione...</option>${options.map((x) => `<option value="${esc(x)}" ${String(value)===x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>`;
  if (type === "checkbox") return `<label><span>${label}</span><input name="${name}" type="checkbox" ${value ? "checked" : ""}></label>`;
  return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""}></label>`;
}
function display(row, module) { const first = module.fields.find(([name]) => name === "name" || name === "title" || name === "description"); return valueFrom(row,module,first?.[0]) || row.id; }
function can(key) { return profile?.role === "superadmin" || (permissionAliases[key] || [key]).some((permission) => profile?.permissions?.[permission] === true); }
async function loadProfile(user) {
  const normalizedEmail = String(user.email || "").trim().toLowerCase();
  const { data: byId, error: idError } = await supabase.from("admin_profiles").select("*").eq("id", user.id).maybeSingle();
  if (idError) throw idError;
  const { data: byEmail, error: emailError } = byId || !normalizedEmail
    ? { data: null, error: null }
    : await supabase.from("admin_profiles").select("*").ilike("email", normalizedEmail).maybeSingle();
  if (emailError) throw emailError;
  profile = byId || byEmail || (normalizedEmail === "admin@renascer.com" ? { email: normalizedEmail, name: normalizedEmail, role: "superadmin", permissions: {} } : { role:"admin", permissions:{} });
  $("user-name").textContent = profile.name || user.email; $("user-email").textContent = user.email;
}
async function count(table) { const { count, error } = await supabase.from(table).select("*",{count:"exact",head:true}); if (error) return 0; return count || 0; }
async function loadDashboard() { $("module-view").classList.add("hidden"); $("dashboard").classList.remove("hidden"); $("page-title").textContent = "Visão geral"; $("page-subtitle").textContent = "Acompanhe os principais indicadores da comunidade."; const stats = await Promise.all([count("members"),count("events"),count("pastoral_followups"),count("finance_transactions")]); $("dashboard").innerHTML = `<div class="cards">${[["Membros",stats[0]],["Eventos",stats[1]],["Acompanhamentos",stats[2]],["Lançamentos financeiros",stats[3]]].map(([label,total]) => `<div class="card"><span>${label}</span><strong>${total}</strong></div>`).join("")}</div><div class="panel"><div class="panel-head"><div><h2>CRM da Igreja Renascer</h2><p>Use as abas ao lado para cuidar de cada frente da gestão.</p></div></div><p>Os dados são gravados diretamente no Supabase com as políticas de acesso do projeto.</p></div>`; }
async function loadModule(module) {
  active = module.key; $("dashboard").classList.add("hidden"); $("module-view").classList.remove("hidden"); $("page-title").textContent = module.label; $("page-subtitle").textContent = "Cadastre, consulte e atualize os registros deste módulo."; $("module-view").innerHTML = `<div class="panel"><div class="panel-head"><div><h2>${module.label}</h2><p>Registros sincronizados com o Supabase.</p></div><button id="new-record" class="btn btn-primary">Novo registro</button></div><form id="record-form" class="form hidden"></form><div class="table-wrap"><table><thead><tr><th>Registro</th>${module.fields.slice(0,3).map(([,label]) => `<th>${label}</th>`).join("")}<th>Ações</th></tr></thead><tbody id="rows"><tr><td class="empty" colspan="6">Carregando...</td></tr></tbody></table></div></div>`;
  const { data, error } = await supabase.from(module.table).select("*").order("created_at",{ascending:false}).limit(200); if (error) { notify(error.message,true); return; } rows = data || []; renderRows(module); $("new-record").onclick = () => openForm(module);
}
function renderRows(module) { const body = $("rows"); body.innerHTML = rows.length ? rows.map((row) => `<tr><td><strong>${esc(display(row,module))}</strong></td>${module.fields.slice(0,3).map(([name]) => `<td>${esc(valueFrom(row,module,name) || "—")}</td>`).join("")}<td class="actions"><button class="btn btn-muted" data-edit="${row.id}">Editar</button><button class="btn btn-danger" data-delete="${row.id}">Excluir</button></td></tr>`).join("") : `<tr><td class="empty" colspan="6">Nenhum registro encontrado.</td></tr>`; body.querySelectorAll("[data-edit]").forEach((button) => button.onclick = () => openForm(module, rows.find((row) => row.id === button.dataset.edit))); body.querySelectorAll("[data-delete]").forEach((button) => button.onclick = () => removeRecord(module, button.dataset.delete)); }
function openForm(module, row = null) { const form = $("record-form"); form.classList.remove("hidden"); form.innerHTML = module.fields.map((field) => input(field, valueFrom(row || {},module,field[0]))).join("") + `<div class="wide toolbar"><button class="btn btn-primary">${row ? "Salvar alterações" : "Adicionar registro"}</button><button type="button" id="cancel" class="btn btn-muted">Cancelar</button></div>`; $("cancel").onclick = () => form.classList.add("hidden"); form.onsubmit = async (event) => { event.preventDefault(); const values = {}; module.fields.forEach(([name,,type]) => { const control = form.elements[name]; const value = type === "checkbox" ? control.checked : control.value.trim(); if (value !== "" || type === "checkbox") values[name] = value; }); const payload = module.json ? { data: values, status: values.status || "active", event_date: values.event_date || null } : values; const result = row ? await supabase.from(module.table).update(payload).eq("id",row.id) : await supabase.from(module.table).insert(payload); if (result.error) return notify(result.error.message,true); notify("Registro salvo com sucesso."); await loadModule(module); }; }
async function removeRecord(module,id) { if (!confirm("Excluir este registro?")) return; const { error } = await supabase.from(module.table).delete().eq("id",id); if (error) return notify(error.message,true); notify("Registro excluído."); await loadModule(module); }
function renderNav() { $("module-nav").innerHTML = `<button data-module="dashboard" class="active">Visão geral</button>` + modules.filter((module) => can(module.key)).map((module) => `<button data-module="${module.key}">${module.label}</button>`).join(""); $("module-nav").querySelectorAll("[data-module]").forEach((button) => button.onclick = async () => { $("module-nav").querySelectorAll("button").forEach((item) => item.classList.toggle("active", item === button)); const module = modules.find((item) => item.key === button.dataset.module); if (module) await loadModule(module); else await loadDashboard(); }); }
async function start() { const { data, error } = await supabase.auth.getSession(); if (error || !data.session) { location.replace("/login/index.html"); return; } try { await loadProfile(data.session.user); renderNav(); await loadDashboard(); $("loading").classList.add("hidden"); $("app").classList.remove("hidden"); } catch (error) { $("loading").textContent = `Não foi possível carregar o CRM: ${error.message}`; } }
$("logout").onclick = async () => { await supabase.auth.signOut(); location.replace("/login/index.html"); }; $("refresh").onclick = () => active === "dashboard" ? loadDashboard() : loadModule(modules.find((module) => module.key === active)); start();
