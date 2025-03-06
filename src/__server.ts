import WebSocket, { Server } from 'ws';

const wss = new Server({ port: 3001 }, () => {
	console.log('WebSocket server is running 3001');
});

// 接続時の処理
wss.on('connection', (ws: WebSocket) => {
	console.log('新しいクライアントが接続しました');

	// 受信時
	ws.on('message', (message: string | Buffer) => {
		console.log('受信: %s', message);

		// 受信したメッセージ全クライアントへブロードキャスト
		wss.clients.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(message, { binary: false });
			}
		});
	});

	// 接続終了時処理
	ws.on('close', () => {
		console.log('クライアントが切断されました');
	});
});
