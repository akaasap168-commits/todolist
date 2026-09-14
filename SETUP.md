# セットアップ手順

アプリは設定なしでも「ローカル保存モード（この端末のブラウザにだけ保存）」で動きます。
複数端末で同期するには **1. Firebase**、Google カレンダーと連携するには **2. Google カレンダー連携** を行ってください。

公開 URL: https://akaasap168-commits.github.io/todolist/

---

## 1. Firebase（複数端末での同期・Google ログイン）

所要時間: 10〜15 分。無料枠（Spark プラン）で十分です。

### 1-1. プロジェクトを作る
1. https://console.firebase.google.com/ を開き「プロジェクトを作成」。
2. 名前は例えば `daily-planner`。Google アナリティクスは **オフ** で OK。

### 1-2. Web アプリを登録して設定値を控える
1. プロジェクトのトップで「</>（ウェブ）」アイコンを押す。
2. アプリのニックネームに `planner` など。「Firebase Hosting」は **チェックしない**。
3. 表示される `firebaseConfig` の値（apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId）を控える。
   - これらは公開されても問題ない値です。データは後述のセキュリティルールで守ります。

### 1-3. Google ログインを有効にする
1. 左メニュー「構築 > Authentication」→「始める」。
2. 「Sign-in method」タブ →「Google」→ 有効にする → サポートメールを選んで保存。
3. 「Settings」タブ →「承認済みドメイン」→「ドメインを追加」→ `akaasap168-commits.github.io` を追加。

### 1-4. Firestore を作る
1. 左メニュー「構築 > Firestore Database」→「データベースを作成」。
2. ロケーションは `asia-northeast1`（東京）がおすすめ。
3. 「本番環境モード」で開始。

### 1-5. 設定値を GitHub に登録する
下のコマンドの値を 1-2 で控えたものに置き換えて、このフォルダで実行します（Claude に値を渡して実行を頼んでも OK）。

```bash
gh variable set VITE_FIREBASE_API_KEY --body "xxxxx"
gh variable set VITE_FIREBASE_AUTH_DOMAIN --body "xxxxx.firebaseapp.com"
gh variable set VITE_FIREBASE_PROJECT_ID --body "xxxxx"
gh variable set VITE_FIREBASE_APP_ID --body "1:xxxx:web:xxxx"
gh variable set VITE_FIREBASE_MESSAGING_SENDER_ID --body "xxxx"
gh variable set VITE_FIREBASE_STORAGE_BUCKET --body "xxxxx.firebasestorage.app"
gh workflow run deploy.yml
```

ローカルで開発する場合は `.env.example` を `.env` にコピーして同じ値を書きます。

### 1-6. 自分だけがアクセスできるようにする（重要）
1. 数分後に公開 URL を開き、Google でログイン。
   - まだルールを設定していないので「アクセスが拒否されました」と表示され、UID が出ます。
2. その UID をコピー。
3. このリポジトリの `firestore.rules` の `REPLACE_WITH_YOUR_UID` を UID に置き換えた内容を、
   Firebase コンソール「Firestore Database > ルール」に貼り付けて「公開」。
4. アプリを再読み込みすると使えるようになります。

### 1-7. ローカル保存モードで使っていたデータを移す（必要なら）
ローカル保存モードで使っていた **同じブラウザ** でログインし、「⚙ 設定 > アカウントとデータ > この端末のローカルデータを移行」を押します。

---

## 2. Google カレンダー連携

所要時間: 10 分。Firebase と同じ Google Cloud プロジェクトを使うと楽です。

### 2-1. Calendar API を有効にする
1. https://console.cloud.google.com/ で、上部のプロジェクト選択から 1-1 で作ったプロジェクトを選ぶ。
2. 「API とサービス > ライブラリ」で「Google Calendar API」を検索して「有効にする」。

### 2-2. OAuth 同意画面
1. 「API とサービス > OAuth 同意画面」（「Google Auth Platform」と表示される場合あり）。
2. User Type は「外部」、アプリ名 `Daily Planner`、サポートメールを入力。
3. 「対象」または「テストユーザー」に **自分の Gmail アドレス** を追加。
4. 公開ステータスは「テスト」のままで OK（自分だけが使うため）。

### 2-3. OAuth クライアント ID
1. 「API とサービス > 認証情報」→「認証情報を作成 > OAuth クライアント ID」。
   - Firebase が自動作成した「Web client (auto created by Google Service)」を編集して使っても構いません。
2. 種類「ウェブ アプリケーション」。
3. 「承認済みの JavaScript 生成元」に以下を追加:
   - `https://akaasap168-commits.github.io`
   - `http://localhost:5173`（ローカル開発用）
4. 作成されたクライアント ID を登録:

```bash
gh variable set VITE_GOOGLE_CLIENT_ID --body "xxxxx.apps.googleusercontent.com"
gh workflow run deploy.yml
```

### 2-4. 書き出し用カレンダーを作る
1. Google カレンダー（Web）の左「他のカレンダー ＋ > 新しいカレンダーを作成」で `Planner` を作成。
2. アプリの「📅 接続」→「⚙ 設定 > Google カレンダー」で
   - 取り込むカレンダー（普段の予定が入っているもの）にチェック
   - 「Vision の書き出し先」に `Planner` を選択

### 補足
- 接続はブラウザのタブを閉じるまで有効です。開き直したら「📅 接続」を押してください。
- 同意画面が「テスト」状態のため、しばらくすると再度許可を求められることがあります。
