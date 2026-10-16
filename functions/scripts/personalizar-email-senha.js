// Personaliza o e-mail "definir/recuperar senha" enviado pelo Firebase Auth
// em produção: remetente "Zella", assunto e corpo em português com botão.
// Sem --aplicar só mostra o que seria gravado. Usa o token do Firebase CLI.
//
// Limite do Firebase: o link (%LINK%) é montado por ele e não pode ser
// encurtado; por isso o corpo usa um botão, e a URL não aparece no texto.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { refreshToken } = require('firebase-admin/app');

const PROJETO = 'gestao-manutencao-app';
const APLICAR = process.argv.includes('--aplicar');

const store = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
const credential = refreshToken({
  type: 'authorized_user',
  client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
  client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
  refresh_token: store.tokens.refresh_token
});

const corpo = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1c22;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:36px 32px;">
        <tr><td style="font-size:22px;font-weight:700;color:#5b3fd6;padding-bottom:20px;">Zella</td></tr>
        <tr><td style="font-size:20px;font-weight:700;line-height:1.3;padding-bottom:12px;">Seu acesso à Zella está pronto</td></tr>
        <tr><td style="font-size:15px;line-height:1.6;color:#3d3d47;padding-bottom:8px;">
          Olá, %DISPLAY_NAME%. Este é o link para você definir a senha da sua conta na Zella,
          a plataforma de chamados, ordens de serviço e contratos de manutenção.
        </td></tr>
        <tr><td style="font-size:15px;line-height:1.6;color:#3d3d47;padding-bottom:24px;">
          Se você já tinha senha e esqueceu, o mesmo botão serve para criar uma nova.
        </td></tr>
        <tr><td align="center" style="padding-bottom:24px;">
          <a href="%LINK%" style="display:inline-block;background:#6f56e8;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:999px;">Definir minha senha</a>
        </td></tr>
        <tr><td style="font-size:13px;line-height:1.6;color:#6b6b78;padding-bottom:6px;">
          O link é pessoal, vale para o e-mail %EMAIL% e pode ser usado uma única vez.
        </td></tr>
        <tr><td style="font-size:13px;line-height:1.6;color:#6b6b78;">
          Se você não pediu este e-mail, pode ignorá-lo. Sua conta continua como está.
        </td></tr>
      </table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;padding:16px 8px;">
        <tr><td style="font-size:12px;color:#8a8a96;line-height:1.5;">Zella · gestão de manutenção com contrato na mão</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const template = {
  senderDisplayName: 'Zella',
  subject: 'Seu acesso à Zella: defina sua senha',
  body: corpo,
  bodyFormat: 'HTML'
};

(async () => {
  const token = (await credential.getAccessToken()).access_token;
  const cab = { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROJETO, 'Content-Type': 'application/json' };
  if (!APLICAR) {
    console.log('Prévia (use --aplicar para gravar):');
    console.log(JSON.stringify({ ...template, body: `${corpo.length} caracteres de HTML` }, null, 2));
    return;
  }
  const r = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJETO}/config?updateMask=notification.sendEmail.resetPasswordTemplate`, {
    method: 'PATCH',
    headers: cab,
    body: JSON.stringify({ notification: { sendEmail: { resetPasswordTemplate: template } } })
  });
  const cfg = await r.json();
  if (!r.ok) { console.log('ERRO', r.status, JSON.stringify(cfg).slice(0, 600)); process.exit(1); }
  const t = cfg.notification?.sendEmail?.resetPasswordTemplate ?? {};
  console.log(JSON.stringify({ gravado: true, remetente: t.senderDisplayName, assunto: t.subject, formato: t.bodyFormat, personalizado: t.customized, tamanhoCorpo: (t.body || '').length }, null, 2));
})();
