import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';

// Config pública do app web (gestao-manutencao-app) — chave de API do
// Firebase não é secreta, é protegida pelas Security Rules e pelos
// domínios autorizados do projeto, não precisa ficar fora do repo.
const firebaseConfig = {
  apiKey: 'AIzaSyD8PfRBaeWK6TIt95n49TUPEfZLZAgciWU',
  authDomain: 'gestao-manutencao-app.firebaseapp.com',
  projectId: 'gestao-manutencao-app',
  storageBucket: 'gestao-manutencao-app.firebasestorage.app',
  messagingSenderId: '621788866951',
  appId: '1:621788866951:web:cb26be7a83c84bb65dcb22'
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
// E-mails que o Firebase manda (redefinir senha) saem em português.
auth.languageCode = 'pt-BR';
export const functions = getFunctions(firebaseApp, 'southamerica-east1');
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

// Por padrão o app fala com o Firebase real na nuvem, inclusive em
// desenvolvimento local. O Emulator Suite entra só por opt-in explícito
// (localStorage 'gm-emulador' = '1', em localhost), pra testar Functions e
// Security Rules novas antes do deploy, com os dados do `npm run seed`.
// Ligar: localStorage.setItem('gm-emulador', '1') no console e recarregar.
function emuladorLigado(): boolean {
  try {
    return typeof location !== 'undefined'
      && ['localhost', '127.0.0.1'].includes(location.hostname)
      && localStorage.getItem('gm-emulador') === '1';
  } catch {
    return false;
  }
}

export const emulando = emuladorLigado();

if (emulando) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}
