import { useEffect, useMemo, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { App } from './App';
import { AppDataProvider } from './data/hooks';
import { FirestoreStore, LocalStore } from './data/store';
import { firebaseEnabled, getFirebase } from './firebase';
import { GcalProvider } from './features/calendar/GcalContext';

export interface Session {
  mode: 'local' | 'firebase';
  user?: { uid: string; email: string | null; name: string | null };
  signOut?: () => void;
  migrateLocal?: () => Promise<number>;
}

let localStore: LocalStore | null = null;

export function Root() {
  if (!firebaseEnabled) {
    localStore ??= new LocalStore();
    return <Shell store={localStore} session={{ mode: 'local' }} />;
  }
  return <FirebaseRoot />;
}

function FirebaseRoot() {
  const { auth, db } = getFirebase();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), [auth]);

  const store = useMemo(
    () =>
      user
        ? new FirestoreStore(db, user.uid, (e) => {
            console.error(e);
            const code = (e as { code?: string })?.code;
            setError(
              code === 'permission-denied'
                ? 'データへのアクセスが拒否されました。Firestore のセキュリティルールに、下の UID を追加してください。'
                : `同期エラー: ${String((e as Error)?.message ?? e)}`,
            );
          })
        : null,
    [db, user],
  );

  if (user === undefined) return <div className="splash">読み込み中…</div>;

  if (!user || !store) {
    return (
      <div className="login">
        <div className="login-card">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={64} height={64} />
          <h1>Daily Planner</h1>
          <p>理想の予定（Vision）と実際の記録（Real）を 15 分単位で。</p>
          <button
            className="btn primary"
            onClick={() => signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => alert(e.message))}
          >
            Google でログイン
          </button>
        </div>
      </div>
    );
  }

  const session: Session = {
    mode: 'firebase',
    user: { uid: user.uid, email: user.email, name: user.displayName },
    signOut: () => void signOut(auth),
    migrateLocal: async () => {
      const items = LocalStore.dumpAll();
      await store.importAll(items);
      return items.length;
    },
  };

  return (
    <>
      {error && (
        <div className="error-banner" role="alert">
          <div>{error}</div>
          <code>UID: {user.uid}</code>
          <button className="btn small" onClick={() => setError(null)}>
            閉じる
          </button>
        </div>
      )}
      <Shell store={store} session={session} />
    </>
  );
}

function Shell({ store, session }: { store: LocalStore | FirestoreStore; session: Session }) {
  return (
    <AppDataProvider store={store}>
      <GcalProvider>
        <App session={session} />
      </GcalProvider>
    </AppDataProvider>
  );
}
