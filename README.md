# mastra-multi-agent-mcp-sample

## 概要

このプロジェクトは、Mastra（TypeScript AI エージェントフレームワーク）を使用したマルチエージェントシステムのサンプルです。MCP（Model Context Protocol）を活用して、複数のAIエージェントが連携して動作するシステムを構築します。

## Mastraについて

Mastraは、TypeScriptで構築されたオープンソースのAIエージェントフレームワークです。以下の特徴があります：

- **統一されたモデルAPI**: OpenAI、Anthropic、Google Geminiなど、任意のLLMプロバイダーとの統一インターフェース
- **エージェントメモリとツール呼び出し**: 永続的なメモリとカスタム関数の実行機能
- **ワークフローグラフ**: 決定論的なLLM呼び出しのためのグラフベースワークフローエンジン
- **RAG（検索拡張生成）**: ドキュメント処理、埋め込み、ベクトルデータベースの統一API
- **デプロイメント**: React、Next.js、Node.jsアプリケーションへの組み込みやスタンドアロンエンドポイントとしての展開
- **評価システム**: 毒性、偏見、関連性、事実精度の自動評価メトリクス

## プロジェクトセットアップ

### 1. 新しいMastraプロジェクトの作成

```bash
npm create mastra@latest mastra-multi-agent-mcp-sample \
  --components agents,tools,workflows,memory \
  --llm openai \
  --example
cd mastra-multi-agent-mcp-sample
```

### 2. 環境変数の設定

`.env`ファイルを作成し、必要なAPIキーを設定：

```env
# OpenAI API Key
OPENAI_API_KEY=your_openai_api_key_here

# その他のLLMプロバイダー（必要に応じて）
ANTHROPIC_API_KEY=your_anthropic_api_key_here
GOOGLE_API_KEY=your_google_api_key_here

# データベース設定（メモリ機能用）
DATABASE_URL=your_database_url_here
```

### 3. 依存関係のインストール

```bash
npm install
```

### 4. 開発サーバーの起動

```bash
npm run dev
```

これにより以下のURLでサービスが利用可能になります：
- API: `http://localhost:4111/api`
- Playground: `http://localhost:4111/`
- Swagger UI: `http://localhost:4111/swagger-ui`
- OpenAPI仕様: `http://localhost:4111/openapi.json`

### 5. プロジェクト構造

```
src/
├── mastra/
│   ├── agents/          # AIエージェントの定義
│   ├── tools/           # カスタムツールの実装
│   ├── workflows/       # ワークフローの定義
│   ├── memory/          # メモリ設定
│   └── index.ts         # Mastraインスタンスの設定
├── app/                 # Next.jsアプリケーション（フロントエンド）
└── api/                 # APIルート
```

## frontendについて(※このプロジェクトにはfrontendの実装はありません）
もしfrontendを実装する場合は、Assistant UIを利用するのが良いです。
以下の実装パターンを参考にしてください。

### Assistant UIとは

Assistant UIは、チャットインターフェースを構築するためのReactコンポーネントライブラリです。
Mastraと組み合わせることで、強力なAIチャットアプリケーションを構築できます。

### 1. Assistant UIのインストール

```bash
npm install @assistant-ui/react
```

### 2. useLocalRuntimeを使用したカスタムランタイムの実装

`src/app/components/MastraRuntimeProvider.tsx`を作成：

```typescript
"use client";

import type { ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from "@assistant-ui/react";

// Mastraの応答形式に対応したアダプター
const MastraModelAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    try {
      // Mastraの/streamエンドポイントを呼び出し
      const response = await fetch("/api/agents/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content.map(part => 
              part.type === "text" ? part.text : part
            ).join("")
          }))
        }),
        signal: abortSignal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      let text = "";
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Mastraのストリーミング応答をパース
          const chunk = new TextDecoder().decode(value);
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                // Mastraの応答形式に応じてデータをパース
                if (data.type === 'text-delta') {
                  text += data.textDelta;
                } else if (data.type === 'text') {
                  text = data.text;
                } else if (data.content) {
                  // 完全な応答の場合
                  text = data.content;
                }

                yield {
                  content: [{ type: "text", text }],
                };
              } catch (parseError) {
                console.warn("Failed to parse streaming data:", parseError);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      console.error("Mastra API error:", error);
      throw error;
    }
  },
};

export function MastraRuntimeProvider({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const runtime = useLocalRuntime(MastraModelAdapter);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
```

### 3. 履歴管理の実装

`src/app/hooks/useMastraHistory.ts`を作成：

```typescript
import { useAssistantRuntime } from "@assistant-ui/react";
import { useCallback, useEffect } from "react";

export function useMastraHistory() {
  const runtime = useAssistantRuntime();

  // Mastraから履歴を取得してAssistantRuntimeに読み込む
  const loadHistoryFromMastra = useCallback(async (threadId?: string) => {
    try {
      const response = await fetch(`/api/memory/threads/${threadId || 'default'}`);
      if (!response.ok) return;

      const historyData = await response.json();
      
      // Mastraの履歴データをAssistant UI形式に変換
      const messages = historyData.messages?.map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        content: [{ type: "text", text: msg.content }],
        createdAt: new Date(msg.createdAt),
      })) || [];

      // 新しいスレッドに切り替えて履歴を読み込み
      if (threadId) {
        runtime.switchToThread(threadId);
      } else {
        runtime.switchToNewThread();
      }

      // メッセージを順次追加
      for (const message of messages) {
        runtime.append(message);
      }
    } catch (error) {
      console.error("Failed to load history from Mastra:", error);
    }
  }, [runtime]);

  // 新しいスレッドを作成
  const createNewThread = useCallback(() => {
    runtime.switchToNewThread();
  }, [runtime]);

  // 既存のスレッドに切り替え
  const switchToThread = useCallback((threadId: string) => {
    loadHistoryFromMastra(threadId);
  }, [loadHistoryFromMastra]);

  return {
    loadHistoryFromMastra,
    createNewThread,
    switchToThread,
  };
}
```

### 4. メインチャットコンポーネントの実装

`src/app/components/MastraChat.tsx`を作成：

```typescript
"use client";

import { Thread } from "@assistant-ui/react";
import { useMastraHistory } from "../hooks/useMastraHistory";
import { useEffect } from "react";

export function MastraChat({ threadId }: { threadId?: string }) {
  const { loadHistoryFromMastra, createNewThread, switchToThread } = useMastraHistory();

  useEffect(() => {
    if (threadId) {
      switchToThread(threadId);
    } else {
      createNewThread();
    }
  }, [threadId, switchToThread, createNewThread]);

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 overflow-hidden">
        <Thread />
      </div>
    </div>
  );
}
```

### 5. アプリケーションのルートレイアウト

`src/app/layout.tsx`を更新：

```typescript
import type { ReactNode } from "react";
import { MastraRuntimeProvider } from "./components/MastraRuntimeProvider";
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <MastraRuntimeProvider>
          {children}
        </MastraRuntimeProvider>
      </body>
    </html>
  );
}
```

### 6. メインページの実装

`src/app/page.tsx`を作成：

```typescript
import { MastraChat } from "./components/MastraChat";

export default function Home() {
  return (
    <main className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Mastra Multi-Agent Chat</h1>
      <MastraChat />
    </main>
  );
}
```

## 重要なポイント

### Mastraとの連携

1. **ストリーミング応答の処理**: Mastraの`/stream`エンドポイントからのServer-Sent Eventsを適切にパースする
2. **エラーハンドリング**: ネットワークエラーやAPI エラーに対する適切な処理
3. **メッセージ形式の変換**: MastraとAssistant UIの間でのメッセージ形式の変換

### 履歴管理

1. **スレッド管理**: `switchToThread`や`switchToNewThread`を使用した適切なスレッド管理
2. **データ同期**: MastraのAPIから取得したメッセージをAssistant UIの形式に変換
3. **永続化**: ブラウザのリロード時にも履歴が保持されるような実装

### パフォーマンス最適化

1. **メモ化**: `useCallback`や`useMemo`を使用した不要な再レンダリングの防止
2. **ストリーミング**: リアルタイムでの応答表示
3. **エラー境界**: エラーが発生した場合のフォールバック処理

## デプロイメント

### 開発環境

```bash
npm run dev
```

### 本番環境

```bash
npm run build
npm start
```

### Vercelへのデプロイ

```bash
npm install -g vercel
vercel --prod
```

## 参考リンク

- [Mastra公式ドキュメント](https://mastra.ai/docs)
- [Assistant UI公式ドキュメント](https://www.assistant-ui.com/docs)
- [Mastra GitHub](https://github.com/mastra-ai/mastra)
- [Assistant UI GitHub](https://github.com/Yonom/assistant-ui)

## Agent定義とMCP設定

### Agent定義（agentConfigs）

`src/mastra/agents/index.ts`でエージェントを定義します：

```typescript
export const agentConfigs = [
  {
    name: "Gemini Flash Experimental",
    model: google("gemini-2.0-flash-exp"),
    instructions: baseInstructions,
    memory: memory,
  },
  // 他のエージェントを追加
  // {
  //   name: "Claude 3 Haiku",
  //   model: anthropic("claude-3-haiku"),
  //   instructions: baseInstructions,
  //   memory: memory,
  // },
];
```

**設定項目：**
- `name`: エージェント名
- `model`: 使用するLLMモデル（google、anthropic、openaiなど）
- `instructions`: エージェントへの指示文
- `memory`: メモリ設定

### MCP設定（mcp-servers.json）

プロジェクトルートの`mcp-servers.json`でMCPサーバーを設定します：

```json
{
  "servers": {
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "your_brave_api_key_here"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/directory"]
    },
    "sqlite": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "./data.db"]
    }
  }
}
```

**利用可能なMCPサーバー例：**
- `@modelcontextprotocol/server-brave-search`: Web検索
- `@modelcontextprotocol/server-filesystem`: ファイルシステム操作
- `@modelcontextprotocol/server-sqlite`: SQLiteデータベース操作
- `@modelcontextprotocol/server-github`: GitHub操作
- `@modelcontextprotocol/server-postgres`: PostgreSQL操作

**設定方法：**
1. 必要なAPIキーを環境変数または`env`セクションに設定
2. `command`と`args`でMCPサーバーの起動方法を指定
3. エージェントは自動的にこれらのツールにアクセス可能
