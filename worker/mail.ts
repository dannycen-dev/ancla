const DEFAULT_TO = "dannycen.dev@gmail.com";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
}

function optionalString(env: Env, name: string): string {
  const value = (env as unknown as Record<string, unknown>)[name];
  return typeof value === "string" ? value.trim() : "";
}

export async function sendRecoveryEmail(env: Env, link: string): Promise<boolean> {
  const to = env.RECOVERY_EMAIL?.trim() || DEFAULT_TO;
  const subject = "Ancla: recupera tu contraseña";
  const text = `Abre este enlace para elegir una contraseña nueva. Caduca en 20 minutos.\n\n${link}\n\nSi no pediste esto, ignóralo.`;
  const safeLink = escapeHtml(link);
  const html = `<p>Abre este enlace para elegir una contraseña nueva. Caduca en 20 minutos.</p><p><a href="${safeLink}">Recuperar contraseña</a></p><p>Si no pediste esto, ignóralo.</p>`;
  const fromEmail = optionalString(env, "MAIL_FROM");
  const email = "EMAIL" in env ? env.EMAIL : undefined;

  if (email && fromEmail) {
    try {
      await email.send({
        to,
        from: { email: fromEmail, name: "Ancla" },
        subject,
        text,
        html,
      });
      return true;
    } catch (error) {
      console.error(JSON.stringify({ message: "email binding failed", error: String(error) }));
    }
  }

  const resendKey = optionalString(env, "RESEND_API_KEY");
  if (resendKey) {
    const from = fromEmail ? `Ancla <${fromEmail}>` : "Ancla <beth.t@example.com>";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
    });
    if (response.ok) return true;
    console.error(JSON.stringify({ message: "resend failed", status: response.status }));
  }

  return false;
}
