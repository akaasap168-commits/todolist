# Daily Planner

紙のウィークリープランナー（`プランナー/3_WeeklyPlanner.tex`）をデジタル化した、ToDo リスト兼デイリー/ウィークリープランナーです。

- **週ビュー**: 紙と同じレイアウト。Daily Priorities、Weekly Priorities / Micro Success / Weekly Evaluation、7 日分のタイムライン。
- **日ビュー**: 1 日を大きく表示。スマホではこちらが既定。
- **Vision | Real**: 15 分刻みで「理想の予定」と「実際にしたこと」を並べて記録。予定どおり率を自動計算。
- **ToDo**: 今日 / 期限あり / いつか / 完了。タイムラインや Daily Priorities にドラッグして予定化。
- **Google カレンダー**: 予定の取り込み表示と、Vision の書き出し。
- **検索**: 過去の Vision / Real / ToDo / 振り返りを横断検索。
- **同期**: Firebase（Firestore）でリアルタイム同期。オフラインでも使え、復帰時に同期。
- **PWA**: ホーム画面に追加してアプリのように起動。

公開 URL: https://akaasap168-commits.github.io/todolist/

## 使い方のコツ

| 操作 | 方法 |
| --- | --- |
| 予定を作る | タイムラインの空き部分をドラッグ（クリックだと 30 分） |
| 移動・長さ変更 | ブロックをドラッグ / 上下の端を引っ張る |
| 予定どおりにできた | Vision ブロックを開いて「✓ 予定どおり実施」 |
| 今やっていることを記録 | 「▶ 今から記録」→ 終わったら「■ 記録終了」 |
| ToDo を予定にする | ToDo をタイムラインにドラッグ |

## セットアップ

[SETUP.md](SETUP.md) を参照してください。設定しなくてもローカル保存モードで使えます。

## 開発

```bash
npm install
npm run dev
```

`main` ブランチへ push すると GitHub Actions がテスト・ビルドして GitHub Pages に公開します。
