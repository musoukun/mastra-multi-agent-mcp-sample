import { Mastra } from "@mastra/core";
import { createLogger } from "@mastra/core/logger";
import { agents, geminiFlashAgent, agentManager, getMCPConfig } from "./agents";

/**
 * Mastraメインモジュール
 * アプリケーションのエントリーポイント
 */

// MCPサーバー設定の取得
const mcpConfig = getMCPConfig();

// Mastraインスタンスの作成（エージェントを直接指定）
export const mastra: Mastra = new Mastra({
	agents: agents.reduce((acc, agent) => {
		// エージェント名をキーとして、エージェントをオブジェクトに登録
		// 空白を除去して識別子として使用
		acc[agent.name.replace(/\s+/g, "")] = agent;
		return acc;
	}, {}),
	logger: createLogger({
		name: "Mastra",
		level: "info",
	}),
});

// MCPサーバー設定をログに出力
console.log(
	`MCPサーバー設定: ${Object.keys(mcpConfig.servers || {}).length}個のサーバー`
);

/**
 * メッセージを処理する関数
 * ユーザーからのメッセージをエージェントに送信し、応答を返す
 * @param message 処理するメッセージ
 * @param agentName 使用するエージェント名（省略可）
 * @returns エージェントの応答
 */
export async function processMessage(
	message: string,
	agentName?: string
): Promise<string> {
	try {
		console.log(`メッセージを処理します: ${message}`);

		// デフォルトエージェント名（空白を除去したもの）
		const defaultAgentKey = "GeminiFlashExperimental";

		// 指定されたエージェント名がある場合はそれを使用、なければデフォルト
		const agentKey = agentName
			? agentName.replace(/\s+/g, "")
			: defaultAgentKey;

		const agent = await mastra.getAgent(agentKey);

		if (!agent) {
			return `エージェント "${agentName || defaultAgentKey}" が見つかりません`;
		}

		// メッセージを生成
		const response = await agent.generate(message);
		return response.text;
	} catch (error) {
		console.error("メッセージ処理中にエラーが発生しました:", error);
		return `エラーが発生しました: ${error.message || error}`;
	}
}

/**
 * 利用可能なすべてのエージェント名を取得
 * @returns エージェント名の配列
 */
export function getAvailableAgents(): string[] {
	return agentManager.getAgentNames();
}

/**
 * 初期化されたMCPサーバー情報を取得
 * @returns MCPサーバー設定情報
 */
export function getMCPServerInfo(): any {
	return {
		serverCount: Object.keys(mcpConfig.servers || {}).length,
		serverNames: Object.keys(mcpConfig.servers || {}),
	};
}

// 後方互換性のための exports
export { geminiFlashAgent, agents };
