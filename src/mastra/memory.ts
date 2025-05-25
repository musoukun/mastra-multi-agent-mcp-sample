import { LibSQLStore } from "@mastra/core/storage/libsql";
import { LibSQLVector } from "@mastra/core/vector/libsql";
import { Memory } from "@mastra/memory";

// データベースファイルのパス設定（開発環境用）
const DB_PATH = "file:.mastra/memory.db"; // ローカルファイルとして保存
const VECTOR_DB_PATH = "file:.mastra/vector.db"; // ベクトル検索用DB

// メモリインスタンスの作成
export const memory = new Memory({
	// ストレージ設定 - LibSQLを使用
	storage: new LibSQLStore({
		config: {
			url: DB_PATH,
		},
	}),

	// ベクトル検索設定 - LibSQLを使用
	vector: new LibSQLVector({
		connectionUrl: VECTOR_DB_PATH,
	}),

	// メモリオプション設定
	options: {
		// 最新メッセージの取得数
		lastMessages: 20,

		// セマンティック検索の設定
		semanticRecall: {
			topK: 3, // 類似メッセージ取得数
			messageRange: {
				// メッセージ周辺の取得範囲
				before: 2,
				after: 1,
			},
		},

		// ワーキングメモリの設定
		workingMemory: {
			enabled: true,
			template: `
	# ユーザー情報
	- **名前**:
	- **好み**:
	- **関心事**:
	`,
			use: "tool-call",
		},
		// スレッドタイトルの自動生成
		threads: {
			generateTitle: true,
		},
	},
});

// スレッド作成関数
export async function createMemoryThread(resourceId: string, title?: string) {
	try {
		return await memory.createThread({
			resourceId,
			title,
		});
	} catch (error) {
		console.error("スレッド作成中にエラーが発生しました:", error);
		throw error;
	}
}

// スレッド取得関数
export async function getThreadsByResourceId(resourceId: string) {
	try {
		return await memory.getThreadsByResourceId({ resourceId: resourceId });
	} catch (error) {
		console.error("スレッド取得中にエラーが発生しました:", error);
		throw error;
	}
}

// スレッド詳細取得関数
export async function getThreadById(threadId: string) {
	try {
		return await memory.getThreadById({ threadId: threadId });
	} catch (error) {
		console.error("スレッド詳細取得中にエラーが発生しました:", error);
		throw error;
	}
}
