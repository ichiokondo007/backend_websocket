import WebSocket, { Server } from 'ws';
import { IncomingMessage } from 'http';
import { parse as parseUrl } from 'url';

//なんちゃって認証
/**
 * hoge auth check
 * @param username ユーザー名
 * @return {boolean} true:OK false:NG
 */
function authCheck(username: string | undefined): boolean {
	if (!username) return false;
	return username.length >= 3 && username.length <= 20;
}

// WebSocketサーバーの設定
const wss = new Server({
	port: 3001,
	// クライアント接続時に実行
	verifyClient: (info: { origin: string; secure: boolean; req: IncomingMessage },
		callback: (res: boolean, code?: number, message?: string) => void) => {
		// クエリパラメータを取得
		const { query } = parseUrl(info.req.url || '', true);
		const username = query.username as string | undefined;

		console.log(`接続試行: ユーザー名=${username}`);

		//authチェック
		if (authCheck(username)) {
			// ユーザー名が有効の場合、接続を許可
			callback(true);
		} else {
			// ユーザー名が無効の場合、カスタムステータスコード4001で接続を拒否
			console.log(`ユーザー名が無効: ${username}`);
			callback(false, 4001, "無効なユーザー名");
		}
	}
}, () => {
	console.log('WebSocketserver running 3001');
});

// 接続時の処理
wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
	// URLからユーザー名を再取得（検証済みなのでここでは安全）
	const { query } = parseUrl(req.url || '', true);
	const username = query.username as string;

	console.log(`新しいクライアントが接続しました: ${username}`);

	// このクライアントのユーザー名を保存
	(ws as any).username = username;

	// クライアント接続時にすべてのクライアントに通知
	wss.clients.forEach((client) => {
		if (client.readyState === WebSocket.OPEN) {
			client.send(`システム: ${username}が入室しました`, { binary: false });
		}
	});

	// 受信時
	ws.on('message', (message: string | Buffer) => {
		const messageStr = message.toString();
		console.log(`受信 (${username}): ${messageStr}`);

		// 受信したメッセージを全クライアントへブロードキャスト
		wss.clients.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(messageStr, { binary: false });
			}
		});
	});

	// 接続終了時処理
	ws.on('close', (code: number, reason: string) => {
		console.log(`クライアントが切断されました: ${username}, コード: ${code}, 理由: ${reason || '理由なし'}`);

		// クライアント切断時にすべてのクライアントに通知
		wss.clients.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(`システム: ${username}が退室しました`, { binary: false });
			}
		});
	});
});

// エラーハンドリング
wss.on('error', (error) => {
	console.error('WebSocketサーバーエラー:', error);
})
