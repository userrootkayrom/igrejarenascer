import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = window.SUPABASE_CONFIG;
const mode = document.body.dataset.authGuard || "protected";
const loginPath = "/login/index.html";
const dashboardPath = "/login/admin-dashboard.html";
document.documentElement.style.visibility = "hidden";

if (!config?.url || !config?.anonKey || config.url.includes("seu-projeto") || config.anonKey === "******" || config.anonKey.includes("sua_chave")) {
  console.error("Configuração pública do Supabase ausente ou inválida.");
  document.documentElement.style.visibility = "visible";
} else {
  const supabase = createClient(config.url, config.anonKey);
  document.documentElement.classList.add("auth-checking");
  let redirected = false;
  const redirect = (url) => {
    if (redirected || window.location.pathname === new URL(url, window.location.origin).pathname) return;
    redirected = true;
    window.location.replace(url);
  };
  const readSession = async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await supabase.auth.getSession();
      if (result.error) throw result.error;
      if (result.data.session) return result.data.session;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400));
    }
    return null;
  };

  readSession().then((session) => {
    const hasSession = Boolean(session);
    if (mode === "login" && hasSession) {
      redirect(dashboardPath);
      return;
    }
    if (mode === "protected" && !hasSession) {
      const returnTo = `${window.location.pathname}${window.location.hash}`;
      redirect(`${loginPath}?redirect=${encodeURIComponent(returnTo)}`);
      return;
    }
    document.documentElement.classList.remove("auth-checking");
    document.documentElement.style.visibility = "visible";
  }).catch((error) => {
    console.error("Não foi possível verificar a sessão:", error);
    if (mode === "protected") redirect(loginPath);
    else {
      document.documentElement.classList.remove("auth-checking");
      document.documentElement.style.visibility = "visible";
    }
  });

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && mode === "login" && session) redirect(dashboardPath);
    if (event === "SIGNED_OUT" && mode === "protected") redirect(loginPath);
  });
}
