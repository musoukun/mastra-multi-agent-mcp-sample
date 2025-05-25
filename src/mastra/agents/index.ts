import { Agent } from "@mastra/core/agent";
import { google } from "@ai-sdk/google";
import { MCPConfiguration } from "@mastra/mcp";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { memory } from "../memory"; // メモリモジュールをインポート

/**
 * エージェント定義モジュール
 * 複数のモデルを使用するエージェントを定義・管理
 */

// ESMモジュールでのファイルパス取得のためのヘルパー
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 基本指示文 - すべてのエージェントで共通して使用
const baseInstructions = `
あなたは高性能な会話エージェントです。
ユーザーの質問に対して、簡潔かつ正確な回答を提供してください。

【基本的な応答方針】
- ユーザーの質問や要求を正確に理解し、適切に応答してください
- 回答は簡潔でわかりやすく構成してください
- 1つの質問をしたときに、会話履歴の質問全ての回答を行わないようにしてください。
	その時の質問にのみ回答してください。もし過去の質問に対する回答が必要な場合は
- わからないことには正直に「わかりません」と答えてください
- 利用可能なツールがある場合は、それらを適切に活用して回答の質を高めてください

【ツール使用について】
- ツールが利用可能な場合は、適切なタイミングでツールを使用してください
- ツールの使用前に、必要なパラメータを適切に設定してください
- ツールの結果を適切に解釈し、ユーザーにわかりやすく説明してください

【メモリ機能について】
- 以前のやり取りを覚えておき、会話の文脈を維持してください
- ユーザーの好みや関心事を覚えて、応答をパーソナライズしてください
`;

/**
 * エージェント設定の配列
 * name: エージェント名
 * model: 使用するモデル
 * instructions: エージェントへの指示文
 * memory: メモリ設定
 */
export const agentConfigs = [
	{
		name: "Gemini Flash Experimental",
		model: google("gemini-2.0-flash-exp"),
		instructions: baseInstructions,
		memory: memory, // メモリを追加
	},
	// 以下に他のエージェント設定を追加できます
	// {
	//   name: "Claude 3 Haiku",
	//   model: anthropic("claude-3-haiku"),
	//   instructions: baseInstructions,
	//   memory: memory, // メモリを追加
	// },
];

/**
 * JSONファイルからMCP設定を読み込む関数
 * @param configPath JSONファイルの相対パス
 * @returns MCPサーバー設定オブジェクト
 */
function loadMCPConfig(configPath: string): any {
	try {
		// ESMモジュール対応でのパス解決
		// 現在のファイルからの相対パスでファイルを読み込む
		const absolutePath = path.resolve(__dirname, "../../", configPath);
		console.log(`MCPサーバー設定を読み込み中: ${absolutePath}`);

		if (!fs.existsSync(absolutePath)) {
			console.error(`設定ファイルが見つかりません: ${absolutePath}`);
			return { servers: {} };
		}

		const configContent = fs.readFileSync(absolutePath, "utf8");
		const config = JSON.parse(configContent);
		console.log(
			`MCPサーバー設定を読み込みました: ${Object.keys(config.servers || {}).length}個のサーバー設定`
		);
		return config;
	} catch (error) {
		console.error(
			"MCPサーバー設定の読み込み中にエラーが発生しました:",
			error
		);
		return { servers: {} }; // エラー時は空の設定を返す
	}
}

// JSONファイルからMCP設定を読み込む
const mcpConfig = loadMCPConfig("mcp-servers.json");

// MCP設定を作成
const mcp = new MCPConfiguration({
	id: "mastra-mcp",
	servers: mcpConfig.servers || {},
});

/**
 * MCP通信を初期化する非同期関数
 * エージェント生成前にMCPとの接続を確立
 * @returns 初期化されたMCPツールオブジェクト
 */
async function initMCP() {
	try {
		console.log("MCPツールを初期化しています...");

		// 設定されたサーバーがない場合は警告を表示
		if (Object.keys(mcpConfig.servers || {}).length === 0) {
			console.warn(
				"警告: MCPサーバーが設定されていません。一部の機能が利用できない可能性があります。"
			);
		}

		const tools = await mcp.getTools();
		console.log(
			`${Object.keys(tools).length}個のMCPツールを初期化しました`
		);
		return tools;
	} catch (error) {
		console.error("MCPツール初期化中にエラーが発生しました:", error);
		return {}; // エラーが発生しても空のオブジェクトを返す
	}
}

/**
 * 設定から複数のエージェントを生成して管理するクラス
 */
class AgentManager {
	// 初期化したエージェントを保持する配列
	agents: Agent[] = [];

	/**
	 * 設定配列からエージェントを初期化
	 * @param configs エージェント設定の配列
	 */
	constructor(configs = agentConfigs) {
		// 各設定からエージェントを生成
		this.agents = configs.map(
			(config) =>
				new Agent({
					name: config.name,
					model: config.model,
					instructions: config.instructions,
					tools: {}, // 初期状態では空のツール設定
					memory: config.memory, // メモリを追加
				})
		);

		console.log(`${this.agents.length}個のエージェントを初期化しました`);
	}

	/**
	 * すべてのエージェントにMCPツールを設定
	 * @param tools 設定するMCPツール
	 */
	setToolsToAll(tools: Record<string, any>) {
		for (const agent of this.agents) {
			// @ts-ignore - tools プロパティは通常読み取り専用だが、初期化時に設定可能
			agent.tools = tools;
		}
		console.log(
			`${this.agents.length}個のエージェントにツールを設定しました`
		);
	}

	/**
	 * 名前からエージェントを取得
	 * @param name エージェント名
	 * @returns 見つかったエージェント、または最初のエージェント
	 */
	getAgent(name?: string): Agent {
		if (name) {
			const found = this.agents.find((agent) => agent.name === name);
			if (found) return found;
		}
		// 指定したエージェントが見つからない場合は最初のエージェントを返す
		return this.agents[0];
	}

	/**
	 * 名前によるエージェント検索結果を返す
	 * @param name エージェント名
	 * @returns 見つかったエージェントまたはundefined
	 */
	findAgent(name: string): Agent | undefined {
		return this.agents.find((agent) => agent.name === name);
	}

	/**
	 * 利用可能なすべてのエージェント名を取得
	 * @returns エージェント名の配列
	 */
	getAgentNames(): string[] {
		return this.agents.map((agent) => agent.name);
	}
}

// エージェントマネージャーのインスタンスを作成
const agentManager = new AgentManager();

// エージェント初期化後にMCPツールを設定
(async () => {
	try {
		const mcpTools = await initMCP();

		// すべてのエージェントにツールを設定
		agentManager.setToolsToAll(mcpTools);

		console.log("すべてのエージェントを正常に初期化しました");
	} catch (error) {
		console.error("エージェント初期化中にエラーが発生しました:", error);
	}
})();

// エクスポート用のエージェントリファレンスを作成
// 後方互換性のために最初のエージェントをデフォルトとしてエクスポート
export const geminiFlashAgent = agentManager.getAgent(
	"Gemini Flash Experimental"
);

// すべてのエージェントとマネージャーをエクスポート
export const agents = agentManager.agents;
export { agentManager };

// ユーティリティ関数をエクスポート
/**
 * 利用可能なすべてのエージェント名を取得
 * @returns エージェント名の配列
 */
export function getAvailableAgents(): string[] {
	return agentManager.getAgentNames();
}

/**
 * 名前からエージェントを取得
 * @param name エージェント名
 * @returns 見つかったエージェント、または最初のエージェント
 */
export function getAgentByName(name?: string): Agent {
	return agentManager.getAgent(name);
}

/**
 * MCPサーバー設定情報を取得
 * @returns MCPサーバー設定情報
 */
export function getMCPConfig(): any {
	return mcpConfig;
}
