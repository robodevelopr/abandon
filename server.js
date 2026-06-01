// Stranded: HTTP + WebSocket server.
//
// - Serves index.html and any sibling static assets over HTTP.
// - Hosts a WebSocket relay on the same port for networked co-op.
//
// Run:
//   npm install ws
//   node server.js              # listens on 0.0.0.0:8080
//   PORT=9000 node server.js    # custom port
//
// Then open http://<host>:<port>/ in a browser. Use the same URL (with the
// ws:// or wss:// scheme) when prompted for the relay address in-game — the
// default in the client already auto-detects this.
//
// WebSocket protocol (all messages are JSON):
//   - On connect, client provides ?room=<name>&role=host|client.
//   - First "host" socket per room owns the simulation.
//   - Messages from the host are broadcast to every client in the room.
//   - Messages from a client are forwarded to the host with an added clientId.
//   - The server emits {type:'role',...}, {type:'client_join',...},
//     {type:'client_leave',...}, {type:'host_left'}, {type:'error',...}.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.htm':  'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.map':  'application/json; charset=utf-8',
    '.txt':  'text/plain; charset=utf-8',
};

const httpServer = http.createServer((req, res) => {
    let urlPath;
    try { urlPath = new URL(req.url, 'http://x').pathname; }
    catch (_) { res.writeHead(400); res.end('Bad request'); return; }

    if (urlPath === '/') urlPath = '/index.html';

    const filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
        res.writeHead(403); res.end('Forbidden'); return;
    }
    // Don't serve secret-ish files
    if (/(^|\/)(\.|node_modules\/|package-lock\.json$|server\.js$)/.test(urlPath)) {
        res.writeHead(404); res.end('Not found'); return;
    }

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404); res.end('Not found'); return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': mime,
            'Cache-Control': 'no-cache',
        });
        fs.createReadStream(filePath).pipe(res);
    });
});

// --- WebSocket relay (shares the HTTP port via the upgrade handshake) ---
const wss = new WebSocketServer({ server: httpServer });
const rooms = new Map(); // roomName -> { host, clients: Map<clientId, ws> }
let nextClientId = 1;

function safeSend(ws, obj) {
    if (ws.readyState !== ws.OPEN) return;
    try { ws.send(JSON.stringify(obj)); } catch (_) {}
}

wss.on('connection', (ws, req) => {
    const u = new URL(req.url, 'http://localhost');
    const room = (u.searchParams.get('room') || 'default').slice(0, 64);
    const role = u.searchParams.get('role') === 'host' ? 'host' : 'client';

    if (!rooms.has(room)) rooms.set(room, { host: null, clients: new Map() });
    const r = rooms.get(room);

    ws.room = room;
    ws.role = role;
    ws.clientId = nextClientId++;

    if (role === 'host') {
        if (r.host) {
            safeSend(ws, { type: 'error', message: 'Room already has a host.' });
            ws.close();
            return;
        }
        r.host = ws;
        safeSend(ws, { type: 'role', role: 'host', room });
        for (const [cid, _] of r.clients) safeSend(ws, { type: 'client_join', clientId: cid });
        console.log(`[${room}] host connected (id ${ws.clientId})`);
    } else {
        r.clients.set(ws.clientId, ws);
        safeSend(ws, { type: 'role', role: 'client', clientId: ws.clientId, room });
        if (r.host) safeSend(r.host, { type: 'client_join', clientId: ws.clientId });
        console.log(`[${room}] client ${ws.clientId} connected`);
    }

    ws.on('message', (data) => {
        const r = rooms.get(ws.room);
        if (!r) return;
        const text = data.toString();
        if (ws.role === 'host') {
            for (const c of r.clients.values()) {
                if (c.readyState === c.OPEN) c.send(text);
            }
        } else {
            if (!r.host || r.host.readyState !== r.host.OPEN) return;
            try {
                const obj = JSON.parse(text);
                obj.clientId = ws.clientId;
                r.host.send(JSON.stringify(obj));
            } catch (_) {
                r.host.send(text);
            }
        }
    });

    ws.on('close', () => {
        const r = rooms.get(ws.room);
        if (!r) return;
        if (ws.role === 'host') {
            for (const c of r.clients.values()) {
                safeSend(c, { type: 'host_left' });
                try { c.close(); } catch (_) {}
            }
            rooms.delete(ws.room);
            console.log(`[${ws.room}] host left, room closed`);
        } else {
            r.clients.delete(ws.clientId);
            if (r.host) safeSend(r.host, { type: 'client_leave', clientId: ws.clientId });
            console.log(`[${ws.room}] client ${ws.clientId} left`);
        }
    });
});

httpServer.listen(PORT, HOST, () => {
    console.log(`HTTP + WS listening on http://${HOST}:${PORT}/`);
});
