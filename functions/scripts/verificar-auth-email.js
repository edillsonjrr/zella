// Só leitura: confere no projeto de produção se o envio de e-mail de senha
// está ativo (provedor e-mail/senha ligado, remetente configurado, domínios
// autorizados). Usa o token do Firebase CLI local, como verificar-saldos.js.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { refreshToken } = require('firebase-admin/app');

const PROJETO = 'gestao-manutencao-app';
const store = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
const credential = refreshToken({
  type: 'authorized_user',
  client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
  client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
  refresh_token: store.tokens.refresh_token
});

(async () => {
  const token = (await credential.getAccessToken()).access_token;
  const r = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJETO}/config`, {
    headers: { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROJETO }
  });
  const cfg = await r.json();
  if (!r.ok) { console.log('ERRO', r.status, JSON.stringify(cfg).slice(0, 400)); process.exit(1); }
  const email = cfg.signIn?.email ?? {};
  const envio = cfg.notification?.sendEmail ?? {};
  const modelo = envio.resetPasswordTemplate ?? {};
  console.log(JSON.stringify({
    provedorEmailSenha: { ativo: !!email.enabled, senhaObrigatoria: !!email.passwordRequired },
    envio: {
      metodo: envio.method,
      remetente: envio.smtp ? 'SMTP próprio' : `${modelo.senderLocalPart ?? 'noreply'}@${envio.dnsInfo?.customDomain || envio.dnsInfo?.useCustomDomain ? envio.dnsInfo.customDomain : PROJETO + '.firebaseapp.com'}`,
      dominioPersonalizado: envio.dnsInfo?.useCustomDomain ? envio.dnsInfo.customDomain : null,
      estadoDominio: envio.dnsInfo?.customDomainState ?? null,
      callbackUri: envio.callbackUri ?? null,
      idiomaPadrao: envio.defaultLocale ?? null
    },
    modeloRedefinicao: { assunto: modelo.subject, remetenteNome: modelo.senderDisplayName ?? null, personalizado: modelo.customized ?? false },
    dominiosAutorizados: cfg.authorizedDomains,
    protecaoEnumeracao: cfg.emailPrivacyConfig?.enableImprovedEmailPrivacy ?? false
  }, null, 2));
})();
