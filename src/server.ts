import WebSocket, { Server } from 'ws';
import { IncomingMessage } from 'http';
import { parse as parseUrl } from 'url';
import axios from 'axios';

// WebSocketの型拡張インターフェース
interface CustomWebSocket extends WebSocket {
	username: string;
	docId?: string;
}

const LIFTING_SERVER_URL = 'http://localhost:3002/api/autosave';
const MAX_CONNECTIONS = 2;
const AUTHCHECK_ERROR_CODE = 4001;
const POLICYCHECK_ERROR_CODE = 4002;
const CONNECTIONLIMIT_ERROR_CODE = 4003;

// Authcheck hoge ErrorCode 4001
function authcheck(username: string | undefined): boolean {
	if (!username) return false;
	console.log(username);
	return username.length >= 3 && username.length <= 20;
}

// Policycheck hoge ErrorCode 4002
function policyCheck(username: string | undefined): boolean {
	if (!username) return false;
	return username.length <= 6;
}

// Connection数の上限チェック　ErrorCode 4003
function maxConnectionCheck(): boolean {
	const activeClients = [...wss.clients].filter(client =>
		client.readyState === WebSocket.OPEN
	).length;
	return activeClients <= MAX_CONNECTIONS;
}



// 😎 【verifyClient】
//
//    ハンドシェイク前チェック
// 　  ・origin: リクエスト元のオリジン
//   　・secure: SSL/TLS接続かどうか
// 　  ・req: HTTP接続リクエストオブジェクト（IncomingMessage型）
//
//　　callback 関数 - 検証結果を通知
// 　　　・第1引数: 接続を許可するかどうか
// 　　　・第2引数（オプション）: 拒否する場合のステータスコード
// 　　　・第3引数（オプション）: 拒否理由のメッセージ
// 　　※詳しくはWSドキュメントを参照
const wss = new Server({
	port: 3001,
	verifyClient: (info: { origin: string; secure: boolean; req: IncomingMessage }, callback: (res: boolean, code?: number, message?: string) => void) => {
		const { query } = parseUrl(info.req.url || '', true);
		const username = query.username as string | undefined;

		console.log(`接続試行: ユーザー名=${username}`);
		//auth,policyチェック
		if (!maxConnectionCheck()) {
			callback(false, CONNECTIONLIMIT_ERROR_CODE, "maxConnection NG");
		} else if (!authcheck(username)) {
			callback(false, AUTHCHECK_ERROR_CODE, "AuthCheck NG");
		} else if (!policyCheck(username)) {
			callback(false, POLICYCHECK_ERROR_CODE, "PolicyCheck NG");
		} else {
			//ハンドシェイクへ
			callback(true);
		}
	}
}, () => {
	console.log('WebSocket server is running on port 3001');
});

// 接続時の処理 - CustomWebSocketとして型キャスト クライアントにusername,docIdを追加
wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
	const { query } = parseUrl(req.url || '', true);
	const username = query.username as string;
	// CustomWebSocketにキャスト
	const customWs = ws as CustomWebSocket;
	// ユーザー名を保存
	customWs.username = username;
	// DocIdを保存
	customWs.docId = "";
	console.log(`新しいクライアントが接続しました: ${customWs.username}`);
	// クライアント接続時にすべてのクライアントに通知
	wss.clients.forEach((client) => {
		if (client !== customWs && client.readyState === WebSocket.OPEN) {
			client.send(`システム: ${customWs.username}が入室しました`, { binary: false });
		}
	});
	// 受信時
	customWs.on('message', (message: string | Buffer) => {
		const messageStr = message.toString();
		console.log(`受信 (${customWs.username}): ${messageStr}`);

		// 受信したメッセージを全クライアントへブロードキャスト
		wss.clients.forEach((client) => {
			if (client !== customWs && client.readyState === WebSocket.OPEN) {
				client.send(messageStr, { binary: false });
			}
		});
	});
	// 接続終了時処理
	customWs.on('close', (code: number, reason: string) => {
		const reasonStr = reason || `コード=${code}`;
		console.log(`クライアント切断: ${customWs.username}, コード: ${code}, 理由: ${reasonStr}`);

		// KD-LiftingServerに切断通知を送信
		//notifyDisconnect(customWs.username, reasonStr);

		//接続端末数算出
		const activeClients = [...wss.clients].filter(client =>
			client.readyState === WebSocket.OPEN
		).length;
		console.log(`現在の接続端末数: ${activeClients}`);

		broadcastMessage(customWs, activeClients);
		// 接続端末が0になった場合の特別な処理
		if (activeClients === 0) {
			console.log('最後のクライアントが切断されました');
			autoSave('docId1234');
			notifyDisconnect(customWs.username, '自動保存発行！！');
		}
	});
});
// KD-LiftingServerに自動保存処理送信
async function notifyDisconnect(username: string, reason: string): Promise<void> {
	try {
		const encodedUsername = encodeURIComponent(username);
		const encodedReason = encodeURIComponent(reason);
		const url = `${LIFTING_SERVER_URL}/${encodedUsername}/${encodedReason}`;

		const response = await axios.get(url);

		console.log('httpserverへ送信完了:', response.data);
	} catch (error) {
		console.error('httpserver送信エラー:', error);
	}
}
//自動保存処理
function autoSave(docId: string): void {
	// 1 docIdからdochandlを使ってdocID取得。
	console.log(`🔥自動保存処理:automergeDoc=${docId}を取得`);
	console.log(`🔥自動保存処理:canvas作成`);
	console.log(`🔥自動保存処理:automergeDoc削除`);
}
// 自分以外ブロードキャスト
function broadcastMessage(sender: CustomWebSocket, activeClients?: number): void {
	wss.clients.forEach((client) => {
		if (client.readyState === sender.OPEN) {
			client.send(`システム: ${sender.username}が退室しました。現在の接続端末数: ${activeClients}`, { binary: false });
		}
	});
}
// エラーハンドリング
wss.on('error', (error) => {
	console.error('WebSocketサーバーエラー:', error);
});
