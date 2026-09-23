import { createClient } from "@supabase/supabase-js";

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Método não permitido." });
  const authorization = event.headers.authorization || event.headers.Authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return json(401, { error: "Sessão não informada." });

  const body = JSON.parse(event.body || "{}");
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || password.length < 6) return json(400, { error: "Informe um e-mail válido e uma senha com pelo menos 6 caracteres." });

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: actor, error: actorError } = await admin.auth.getUser(token);
  if (actorError || !actor.user) return json(401, { error: "Sessão inválida ou expirada." });
  const actorEmail = String(actor.user.email || "").trim().toLowerCase();
  const { data: profile } = await admin.from("admin_profiles").select("role,permissions").eq("id", actor.user.id).maybeSingle();
  const allowed = actorEmail === "admin@renascer.com" || profile?.role === "superadmin" || profile?.permissions?.users === true;
  if (!allowed) return json(403, { error: "Somente um administrador autorizado pode criar usuários." });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: body.name || email }
  });
  if (createError) return json(400, { error: createError.message, code: createError.code });

  const { error: profileError } = await admin.from("admin_profiles").upsert({
    id: created.user.id,
    email,
    name: body.name || email,
    nomenclatura: body.nomenclatura || "Administrador",
    role: "admin",
    permissions: body.permissions || {}
  });
  if (profileError) return json(500, { error: profileError.message });
  return json(200, { user: { id: created.user.id, email } });
};
