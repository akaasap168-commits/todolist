# ToDo リスト兼デイリープランナー 実装プラン

> コメント歓迎です。各セクションに番号を振っているので「3.2 の〜」のように指して書いてもらえると反映しやすいです。
> 「💬」が付いている箇所は特に意見がほしいポイントです。

## 1. Context（背景と狙い）

現在は A4 横の紙プランナー（`プランナー/3_WeeklyPlanner.tex`）で以下を運用中。

- 左列: Month / Daily Priorities / Weekly Priorities(4) / Micro Success(4) / Weekly Evaluation(4)
- 右 7 列（SUN〜SAT）: 各日に Daily Priorities(3) と、5:00〜22:00 を **Vision（理想の予定）| Real（実際）** に左右分割したタイムライン

紙の問題（持ち歩き・手書きの可読性・過去参照のしにくさ）を解消するため、**この紙のフォーマットをそのままデジタル化**し、
複数端末から URL でアクセスでき、15 分刻みで「理想 → 実績」を記録でき、Google カレンダーとも連携する Web アプリを作る。

決定済み事項（ヒアリング結果）:

| 項目 | 決定 |
| --- | --- |
| ホスティング | GitHub Pages（GitHub Actions で自動デプロイ） |
| データ同期 | Firebase（Firestore + Google ログイン） |
| 主端末 | PC ブラウザ中心。スマホは 1 日ビューで閲覧・軽い記録ができれば OK |
| Google カレンダー | 取り込み（表示）＋ Vision の書き出し。Real は書き出さない |
| 技術 | Vite + React + TypeScript |

公開 URL（予定）: `https://akaasap168-commits.github.io/todolist/`

## 2. 全体アーキテクチャ

```
[ブラウザ / PWA] ──(Firebase SDK)──▶ Firestore（データ本体、リアルタイム同期・オフラインキャッシュ）
      │                └─ Firebase Auth（Google ログイン、自分のアカウントのみ許可）
      └──(Google Identity Services + Calendar REST API)──▶ Google カレンダー（取り込み / Vision 書き出し）

[GitHub リポジトリ] ── push ──▶ GitHub Actions（vite build）──▶ GitHub Pages（静的配信）
```

- サーバーは持たない。すべてブラウザ内で完結し、Firestore のセキュリティルールで自分の UID 以外を拒否する。
- Firebase の Web 設定値は公開して問題ない種類のもの（秘密は Firestore ルール側で守る）。公開リポジトリでも可。
- オフライン時も Firestore のローカルキャッシュで読み書きでき、復帰時に自動同期。
- PWA 対応（ホーム画面に追加して全画面で起動、アイコン付き）。

## 3. 画面設計（紙版との対応）

### 3.1 週間ビュー（PC のメイン画面）

紙版と同じ構成を横に並べる。

```
┌──────────────┬──────┬──────┬──────┬──────┬──────┬──────┬──────┐
│ 2026年9月 W38 │ SUN  │ MON  │ TUE  │ WED  │ THU  │ FRI  │ SAT  │
├──────────────┼──────┴──────┴──────┴──────┴──────┴──────┴──────┤
│ Daily Prior. │ 各日 3 行（ToDo からドラッグ or 直接入力、チェック可）   │
├──────────────┼──────┬──────┬──────┬──────┬──────┬──────┬──────┤
│ Weekly Prior.│Vis│Re│Vis│Re│Vis│Re│Vis│Re│Vis│Re│Vis│Re│Vis│Re│
│  ○ ____      │ 5 ───────── 15 分刻みのタイムライン ─────────────── │
│ Micro Success│ 6                                                  │
│  ○ ____      │ …                                                  │
│ Weekly Eval. │ 22                                                 │
│  ○ ____      │                                                    │
└──────────────┴──────┴──────┴──────┴──────┴──────┴──────┴──────┘
```

- タイムラインの表示時間帯（既定 5:00〜22:00）は設定で変更可。範囲外の予定があれば自動で伸びる。
- 「今」の位置に赤い横線。今日の列を薄くハイライト。
- 前週/次週の移動、日付ジャンプ、「今週へ戻る」。
- 紙のように印刷できる印刷用 CSS（PDF 化して紙運用と併用可能）。💬 必要ですか？

### 3.2 1 日ビュー（集中用・スマホ用）

1 日分だけを大きく表示。Vision | Real が広くなるので記録が楽。
右（PC）または下部ドロワー（スマホ）に ToDo パネル。

### 3.3 ToDo パネル

- 常時サイドに開ける ToDo リスト（週間ビューでは折りたたみ可）。
- グループ: 「今日」「期限あり」「いつか」「完了」。
- 各タスク: タイトル、メモ、期限、カテゴリ（色）、見積り時間、完了チェック。ドラッグで並べ替え。
- タスクをタイムラインの Vision 側にドラッグすると、その時間の予定ブロックになる（タイムブロッキング）。
- タスクを Daily Priorities の枠にドラッグしてその日の優先 3 つにする。
- 完了したタスクは「完了」に移動し、いつ完了したかが残る（過去参照用）。

### 3.4 タイムライン（Vision | Real）の操作

| 操作 | PC | スマホ |
| --- | --- | --- |
| 予定作成 | 空き部分をドラッグ（15 分スナップ） | 空き部分をタップ → 開始/終了と内容の簡易入力 |
| 移動・時間変更 | ブロックをドラッグ / 端を引っ張る | 同上（ハンドル大きめ） |
| 内容編集 | クリックでポップオーバー（タイトル・カテゴリ・メモ） | 同上 |
| Vision → Real | ブロックの「予定どおり実施」ボタンで Real に同じブロックをコピー | 同上 |
| 今から記録 | 「▶ 今から」ボタンで Real に進行中ブロックを作成、「■ 終了」or 次の「▶」で締める | 同上 |
| 削除 | Delete キー / メニュー | メニュー |

- カテゴリ（例: 仕事 / 勉強 / 運動 / 生活 / 休憩）に色を付け、Vision と Real を色で見比べられる。
- 日単位で「予定どおり率」（Vision と Real の重なり時間 ÷ Vision 合計）を小さく表示。

### 3.5 週間セクション（左列）

- Weekly Priorities / Micro Success / Weekly Evaluation は紙と同じく各 4 行。行数は設定で増減可。
- Weekly Priorities はチェック可能（ToDo とは独立した週の目標）。
- 「先週の Weekly Evaluation を見る」リンクで振り返りがしやすいように。

### 3.6 過去の記録

- 週間/1 日ビューで過去へ自由に遡れる（紙より圧倒的に楽）。
- 検索: Real / Vision / ToDo / 週間セクションをキーワード横断検索。
- 統計（後回し可）: 週ごとのカテゴリ別実績時間、予定どおり率の推移。

## 4. データモデル（Firestore）

すべて `users/{uid}/...` 配下。時刻は「その日の 0:00 からの分」で持ち、15 の倍数にスナップ。

```
users/{uid}
  settings                      // 1 ドキュメント
    dayStart: 5, dayEnd: 22, weekStartsOn: 0(日)
    categories: [{id, name, color}]
    weeklySectionRows: 4
    gcal: { importCalendarIds: [], exportCalendarId: "" }

  tasks/{taskId}
    title, notes, categoryId, dueDate?, estimateMin?, order
    done: bool, doneAt?, createdAt, updatedAt

  days/{YYYY-MM-DD}
    priorities: [{text, taskId?, done}] × 3
    vision: [Block], real: [Block]
    note?: string

  weeks/{YYYY-Www}
    priorities: [{text, done}], microSuccess: [{text}], evaluation: [{text}]

Block = { id, start, end, title, categoryId?, taskId?, note?, gcalEventId? }
```

- `days` を 1 ドキュメントにまとめるのは、1 日分を 1 回の読み取りで取れて同期も単純なため（1 日のブロック数は数十程度で十分収まる）。
- セキュリティルール: `request.auth.uid == uid` かつ許可 UID リストに含まれること（初回ログイン後に自分の UID を設定）。

## 5. Google カレンダー連携の設計

- **認証**: Firebase ログインとは別に、Google Identity Services で Calendar 用のアクセストークンを取得（ブラウザ内のみ、保存しない）。スコープは `calendar.events` + `calendar.readonly`。
- **取り込み**: 表示中の週/日の範囲で、設定で選んだカレンダーの予定を取得し、Vision 列に「外部予定」として薄い枠線で表示。編集不可、Firestore には保存しない（真のデータは Google 側）。
- **書き出し**: Vision ブロックの「📅 カレンダーへ」トグルで、事前に作っておいた **「Planner」カレンダー** に予定を作成。以後この app 側でブロックを動かす/消すと追従（`gcalEventId` で紐付け）。1 日まとめて「今日の Vision を全部送る」ボタンも用意。
- **Real は書き出さない**（決定済み）。将来 Log カレンダーに書きたくなったら同じ仕組みで追加可能。
- 制約: GCP の OAuth 同意画面を「テスト」状態で使うため、数日〜1 週間ごとに再ログイン（ポップアップ 1 回）が必要になる場合がある。個人利用なら許容範囲。

💬 取り込んだ Google カレンダーの予定を「予定どおり実施」で Real にコピーできるようにしますか？（会議など）→ 実装は簡単なので入れる想定。

## 6. 技術構成・リポジトリ構成

- Vite + React 19 + TypeScript、状態管理は React hooks + Firestore の `onSnapshot`。
- ライブラリ: `firebase`、`date-fns`、`@dnd-kit`（ドラッグ）、`vite-plugin-pwa`。CSS は素の CSS Modules（軽量・依存少）。
- ユニットテスト: `vitest`（時間計算・重なり率・15 分スナップなど純粋関数のみ）。

```
C:\todolist\                     ← このフォルダをそのまま Git リポジトリ「todolist」に
  .github/workflows/deploy.yml   ← push で build → Pages へ
  index.html / vite.config.ts / package.json
  firestore.rules                ← セキュリティルール（Firebase コンソールに貼る）
  public/  (manifest, icons)
  src/
    firebase.ts                  ← Firebase 初期化（設定値は .env の VITE_* から）
    auth/                        ← Google ログイン、ログイン画面
    data/                        ← types.ts, Firestore 読み書き hooks
    lib/time.ts                  ← 分↔時刻、スナップ、重なり計算
    features/
      timeline/                  ← DayColumn, Block, ドラッグ、Now 線
      tasks/                     ← ToDo パネル
      week/                      ← 週間ビュー、週間セクション
      day/                       ← 1 日ビュー
      calendar/                  ← GCal 取り込み/書き出し
      settings/
      history/                   ← 検索・統計
  プランナー/                    ← 紙版 LaTeX（参照用に残す。aux 等は .gitignore）
  plans/
```

## 7. 実装フェーズ

各フェーズ末に GitHub Pages 上で動くものを確認してから次へ進む。

| # | フェーズ | 成果物 | あなたにお願いする作業 |
| --- | --- | --- | --- |
| 0 | 土台 | リポジトリ作成、Vite 雛形、Actions で Pages 公開、空アプリが URL で開く | GitHub リポジトリ作成は `gh` で私が実行可。Pages の Source を「GitHub Actions」に設定（1 クリック） |
| 1 | ログインとデータ層 | Google ログイン、Firestore 接続、オフラインキャッシュ、設定画面、セキュリティルール | Firebase プロジェクト作成、Google ログイン有効化、承認ドメインに `akaasap168-commits.github.io` 追加、Firestore 作成、設定値を `.env` に貼る（手順書を用意） |
| 2 | 1 日ビューのタイムライン | Vision / Real の 15 分グリッド、作成・移動・リサイズ・編集・削除、Vision→Real コピー、「今から」記録、カテゴリ色、Now 線 | 触って使い勝手のコメント |
| 3 | ToDo | ToDo パネル、並べ替え、完了、タイムラインへのドラッグ、Daily Priorities | 同上 |
| 4 | 週間ビュー | 7 日並び、週間セクション（Weekly Priorities / Micro Success / Evaluation）、週送り、印刷 CSS | 同上 |
| 5 | Google カレンダー | 取り込み表示、Vision 書き出し、カレンダー選択設定 | GCP で OAuth クライアント ID 作成・Calendar API 有効化・テストユーザー登録、「Planner」カレンダー作成（手順書を用意） |
| 6 | 仕上げ | PWA、キーボードショートカット、検索、統計、スマホ調整 | 実運用して要望出し |

フェーズ 2〜3 が終われば紙の代替として使い始められる想定。

## 8. 追加提案（採否コメントください 💬）

1. **日次テンプレート**: 「平日の基本形」「休日の基本形」を保存し、朝ワンクリックで Vision に展開。毎日同じルーチンを引く手間を省く。
2. **昨日の Vision をコピー**: テンプレートより手軽な代替。
3. **未完了の持ち越し**: 日付が変わった時点で未完了の Daily Priorities / 時間割り当て済み ToDo を翌日候補として提示。
4. **夜の振り返りフロー**: 1 日の終わりに「Real の未入力を埋める → Micro Success を書く → 明日の Vision を立てる」をガイドする画面。
5. **ダークモード**。
6. **タスクの繰り返し**（毎週月曜など）。
7. **Real の色分けで「集中/散漫」など気分タグ**を付ける。

私のおすすめは 1・3・4 をフェーズ 6 に含めること。6・7 は運用してみてから。
（通知機能は不要とのことなので入れません）

## 9. 検証方法

- 各フェーズで `npm run dev` をブラウザプレビューで開き、操作を実際に確認（PC 幅と 400px 幅の両方）。
- `vitest` で時間計算ロジックをテスト（`npm test`）。
- Firestore ルールは Firebase コンソールの Rules Playground、または Emulator Suite で「他 UID からのアクセス拒否」を確認。
- push 後、GitHub Actions が成功し公開 URL で最新版が開くこと、別端末（スマホ）で同じデータが数秒で反映されることを確認。
- Google カレンダー: 取り込んだ予定が正しい時刻に出ること、Vision 書き出し → Google カレンダー側に作成され、移動・削除が追従することを確認。

## 10. 未決事項・確認したいこと 💬

1. 週の始まりは紙どおり **日曜**でよいか（月曜始まりにも設定で切替可能にする予定）。
2. Real の記録粒度は 15 分固定でよいか（5 分単位が欲しければグリッドは 15 分のまま 5 分スナップも可）。
3. カテゴリの初期セット案: 仕事 / 勉強 / 運動 / 生活 / 休憩 / 移動。追加・変更したいものは？
4. リポジトリは **公開**で進める。「自分以外は見られない・修正できない」の整理は以下のとおり。

   | 対象 | 他人が見られる？ | 他人が変更できる？ |
   | --- | --- | --- |
   | ソースコード（GitHub リポジトリ） | 見られる（公開リポジトリのため） | できない（push 権限は自分だけ） |
   | アプリの URL | 開ける（ログイン画面が出るだけ） | ログインできないので何も操作できない |
   | 記録データ（ToDo・Vision・Real・週間セクション） | **見られない** | **変更できない** |

   記録データは Firestore にあり、セキュリティルールで「自分の Google アカウントの UID」以外の読み書きを全て拒否するため、URL を知られても中身は一切見えない。他人が自分の Google アカウントでログインしても、許可 UID リストに無いので拒否される。
   ソースコードまで隠したい場合は非公開リポジトリにできるが、GitHub Free では非公開リポジトリから Pages を公開できないため、Firebase Hosting などへの切替が必要になる（対応可能）。
5. Micro Success / Weekly Evaluation はチェックボックス不要（テキストのみ）でよいか。
