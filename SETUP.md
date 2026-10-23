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

---

## 3. Spotify 連携（休憩中に自分の音楽を流す）

所要時間: 10 分。**Spotify Premium が必要**です（無料プランや、モバイル専用の Lite / Premium Mini では API から再生できません）。
設定しなくてもポモドーロと環境音はそのまま使えます。

### 3-1. アプリを登録してクライアント ID を取る
1. https://developer.spotify.com/dashboard を開き、Spotify アカウントでログイン。
2. 「Create app」。
   - App name: `Daily Planner`
   - Redirect URIs に次の 2 つを追加（**`localhost` は使えません**。ループバックは IP で書きます）
     - `https://akaasap168-commits.github.io/todolist/`
     - `http://127.0.0.1:5173/todolist/`（ローカル開発用）
   - 「Which API/SDKs are you planning to use?」で **Web API** と **Web Playback SDK** にチェック。
3. 作成後「Settings」から **Client ID** を控える（Client secret はこのアプリでは使いません）。

### 3-2. 自分のアカウントを許可リストに入れる
アプリは「開発モード」のままなので、**使えるのは許可リストに入れた最大 5 人だけ**です。

1. ダッシュボードのアプリ →「User Management」。
2. 自分の名前と Spotify アカウントのメールアドレスを追加。

### 3-3. クライアント ID を登録する

**公開サイト用**（GitHub のブラウザ画面から）:

1. リポジトリ → **Settings** → **Secrets and variables** → **Actions** → **Variables** タブ
2. **New repository variable** → Name に `VITE_SPOTIFY_CLIENT_ID`、Value に取得したクライアント ID
3. `main` へ push すると、この値を使ってビルド・デプロイされます

GitHub CLI を入れている場合は、代わりに次でも登録できます。

```bash
gh variable set VITE_SPOTIFY_CLIENT_ID --body "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
gh workflow run deploy.yml
```

**ローカル用**: `.env` に次の行を足します。

```
VITE_SPOTIFY_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3-3b. ローカルで試すときの注意

Spotify は `localhost` という名前を Redirect URI に使えないため、`npm run dev` は **127.0.0.1** で待ち受けるようにしてあります（`vite.config.ts` の `server.host`）。ブラウザでも `http://127.0.0.1:5173/todolist/` を開いてください。

ただし **Firebase のログインは `localhost` しか許可されていない**ため、`127.0.0.1` ではログインできません。ローカルで Spotify を試すときは、どちらかにしてください。

- **この端末のみ保存モードで試す**（おすすめ・設定変更なし）: `.env.test.local` に Firebase の変数を空で並べ、Spotify のクライアント ID だけを入れて、`npm run dev -- --mode test` で起動する。ログイン不要で Spotify を試せます（データはこのブラウザ内に保存され、Firebase 側には影響しません）
- **ログインしたまま試す**: Firebase コンソール → Authentication → Settings → 承認済みドメイン に `127.0.0.1` を追加する

公開サイト（GitHub Pages）では、どちらも許可済みなので何もしなくて大丈夫です。

> Windows の PowerShell で `npm run dev` が「スクリプトの実行が無効になっている」と言われる場合は、`npm.cmd run dev` を使うか、`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` を実行してください。

### 3-4. アプリ側の設定
1. 「⚙ 設定 > Spotify（休憩中の音楽）」で「Spotify に接続」。Spotify の認証画面に飛び、戻ってきます。
2. 「プレイリストを読み込む」で自分のプレイリストを選ぶ。
   - Spotify が作った公式プレイリストは一覧に出てこないので、その場合はリンクを貼り付けて「設定」を押します。
3. 「再生先」を選ぶ。
   - 「このタブ」＝このブラウザが Spotify の再生先になります（Premium 必須）。
   - スマホやデスクトップの Spotify アプリを選ぶこともできます（そのアプリを起動しておく必要があります）。
4. 「⚙ 設定 > BGM > 休憩中」の「音源」を **Spotify** にする。

### 補足
- 接続は保存され、次に開いたときも有効です。ただし**最初の認証から 6 か月**でつながらなくなるので、そのときは「Spotify に接続」を押し直してください。
- 開発モードのアプリは、**所有者（あなた）の Premium が切れると動かなくなります**。
- iOS の Safari では、休憩に入ったときの自動再生がブロックされることがあります。その場合は画面を一度タップしてください。
- 「再生先が見つかりません」と出たら、Spotify アプリを開くか、再生先を「このタブ」にして「再生先を更新」を押してください。
