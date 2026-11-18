package com.owbeloty.app;

import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "LocalHotspot")
public class LocalHotspotPlugin extends Plugin {

    private static final String WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

    private ServerSocket serverSocket;
    private ExecutorService executor;
    private volatile boolean running = false;
    private final Map<String, ClientConnection> clients = new ConcurrentHashMap<>();

    private static class ClientConnection {
        final String clientId;
        final Socket socket;
        final OutputStream out;

        ClientConnection(String clientId, Socket socket, OutputStream out) {
            this.clientId = clientId;
            this.socket = socket;
            this.out = out;
        }

        synchronized void sendTextFrame(String text) throws IOException {
            byte[] payload = text.getBytes(StandardCharsets.UTF_8);
            ByteArrayOutputStream frame = new ByteArrayOutputStream();
            frame.write(0x81); // FIN + Text frame

            if (payload.length <= 125) {
                frame.write(payload.length);
            } else if (payload.length <= 65535) {
                frame.write(126);
                frame.write((payload.length >> 8) & 0xFF);
                frame.write(payload.length & 0xFF);
            } else {
                frame.write(127);
                long len = payload.length;
                for (int shift = 56; shift >= 0; shift -= 8) {
                    frame.write((int) ((len >> shift) & 0xFF));
                }
            }
            frame.write(payload);
            out.write(frame.toByteArray());
            out.flush();
        }

        synchronized void sendPongFrame(byte[] payload) throws IOException {
            ByteArrayOutputStream frame = new ByteArrayOutputStream();
            frame.write(0x8A); // FIN + Pong
            int len = Math.min(payload.length, 125);
            frame.write(len);
            frame.write(payload, 0, len);
            out.write(frame.toByteArray());
            out.flush();
        }

        void closeQuietly() {
            try {
                socket.close();
            } catch (IOException ignored) {
            }
        }
    }

    @PluginMethod
    public void getLocalNetworkInfo(PluginCall call) {
        List<String> ips = detectLocalIpv4Addresses();
        String preferred = pickPreferredHotspotIp(ips);

        JSArray arr = new JSArray();
        for (String ip : ips) {
            arr.put(ip);
        }

        JSObject ret = new JSObject();
        ret.put("ipv4Addresses", arr);
        ret.put("preferredIp", preferred);
        ret.put("isNativeAndroid", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void startHostServer(PluginCall call) {
        int port = call.getInt("port", 7432);
        stopServerInternal();

        try {
            serverSocket = new ServerSocket(port);
            running = true;
            executor = Executors.newCachedThreadPool();

            executor.submit(() -> {
                while (running && serverSocket != null && !serverSocket.isClosed()) {
                    try {
                        Socket socket = serverSocket.accept();
                        socket.setTcpNoDelay(true);
                        executor.submit(() -> handleIncomingSocket(socket));
                    } catch (IOException e) {
                        if (running) {
                            JSObject err = new JSObject();
                            err.put("message", "Erreur serveur Hotspot : " + e.getMessage());
                            notifyListeners("serverError", err);
                        }
                    }
                }
            });

            List<String> ips = detectLocalIpv4Addresses();
            String preferredIp = pickPreferredHotspotIp(ips);

            JSArray arr = new JSArray();
            for (String ip : ips) {
                arr.put(ip);
            }

            JSObject ret = new JSObject();
            ret.put("started", true);
            ret.put("port", port);
            ret.put("hostIp", preferredIp);
            ret.put("ipv4Addresses", arr);
            call.resolve(ret);
        } catch (IOException e) {
            stopServerInternal();
            call.reject("Impossible d'ouvrir le port local " + port + " : " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopHostServer(PluginCall call) {
        stopServerInternal();
        call.resolve();
    }

    @PluginMethod
    public void sendToClient(PluginCall call) {
        String clientId = call.getString("clientId");
        String payload = call.getString("payload");
        if (clientId == null || payload == null) {
            call.reject("clientId et payload requis");
            return;
        }
        ClientConnection conn = clients.get(clientId);
        if (conn == null) {
            call.resolve();
            return;
        }
        try {
            conn.sendTextFrame(payload);
            call.resolve();
        } catch (IOException e) {
            disconnectClient(clientId);
            call.resolve();
        }
    }

    @PluginMethod
    public void broadcast(PluginCall call) {
        String payload = call.getString("payload");
        if (payload == null) {
            call.reject("payload requis");
            return;
        }
        for (Map.Entry<String, ClientConnection> entry : clients.entrySet()) {
            try {
                entry.getValue().sendTextFrame(payload);
            } catch (IOException e) {
                disconnectClient(entry.getKey());
            }
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        stopServerInternal();
        super.handleOnDestroy();
    }

    private void stopServerInternal() {
        running = false;
        for (ClientConnection conn : clients.values()) {
            conn.closeQuietly();
        }
        clients.clear();

        if (serverSocket != null) {
            try {
                serverSocket.close();
            } catch (IOException ignored) {
            }
            serverSocket = null;
        }

        if (executor != null) {
            executor.shutdownNow();
            executor = null;
        }
    }

    private void disconnectClient(String clientId) {
        ClientConnection removed = clients.remove(clientId);
        if (removed != null) {
            removed.closeQuietly();
            JSObject ev = new JSObject();
            ev.put("clientId", clientId);
            notifyListeners("clientDisconnected", ev);
        }
    }

    private void handleIncomingSocket(Socket socket) {
        String clientId = UUID.randomUUID().toString();
        try {
            BufferedInputStream in = new BufferedInputStream(socket.getInputStream(), 16384);
            OutputStream out = socket.getOutputStream();

            String headers = readHttpHeaders(in);
            if (headers == null) {
                socket.close();
                return;
            }

            String wsKey = extractWebSocketKey(headers);
            if (wsKey == null) {
                out.write("HTTP/1.1 400 Bad Request\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
                out.flush();
                socket.close();
                return;
            }

            String acceptKey = computeWebSocketAccept(wsKey);
            String handshakeResponse =
                "HTTP/1.1 101 Switching Protocols\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                "Sec-WebSocket-Accept: " + acceptKey + "\r\n\r\n";
            out.write(handshakeResponse.getBytes(StandardCharsets.US_ASCII));
            out.flush();

            ClientConnection conn = new ClientConnection(clientId, socket, out);
            clients.put(clientId, conn);

            JSObject connectedEv = new JSObject();
            connectedEv.put("clientId", clientId);
            connectedEv.put("remoteAddress", String.valueOf(socket.getInetAddress().getHostAddress()));
            notifyListeners("clientConnected", connectedEv);

            readWebSocketLoop(clientId, conn, in);
        } catch (Exception ignored) {
        } finally {
            disconnectClient(clientId);
        }
    }

    private void readWebSocketLoop(String clientId, ClientConnection conn, InputStream in) throws IOException {
        ByteArrayOutputStream fragmentedBuffer = new ByteArrayOutputStream();

        while (running && !conn.socket.isClosed()) {
            int b1 = in.read();
            if (b1 == -1) break;
            int b2 = in.read();
            if (b2 == -1) break;

            boolean fin = (b1 & 0x80) != 0;
            int opcode = b1 & 0x0F;
            boolean masked = (b2 & 0x80) != 0;
            long payloadLen = b2 & 0x7F;

            if (payloadLen == 126) {
                int h = in.read();
                int l = in.read();
                if (h == -1 || l == -1) throw new EOFException();
                payloadLen = ((h & 0xFF) << 8) | (l & 0xFF);
            } else if (payloadLen == 127) {
                long len = 0;
                for (int i = 0; i < 8; i++) {
                    int b = in.read();
                    if (b == -1) throw new EOFException();
                    len = (len << 8) | (b & 0xFF);
                }
                payloadLen = len;
            }

            if (payloadLen > 2_000_000) {
                break; // Protection contre des trames surdimensionnées
            }

            byte[] maskKey = new byte[4];
            if (masked) {
                readFully(in, maskKey, 4);
            }

            byte[] payload = new byte[(int) payloadLen];
            readFully(in, payload, (int) payloadLen);

            if (masked) {
                for (int i = 0; i < payload.length; i++) {
                    payload[i] = (byte) (payload[i] ^ maskKey[i % 4]);
                }
            }

            if (opcode == 0x8) {
                // Trame Close
                break;
            } else if (opcode == 0x9) {
                // Ping -> Pong
                conn.sendPongFrame(payload);
            } else if (opcode == 0x1 || opcode == 0x0) {
                // Text ou continuation
                fragmentedBuffer.write(payload);
                if (fin) {
                    String text = new String(fragmentedBuffer.toByteArray(), StandardCharsets.UTF_8);
                    fragmentedBuffer.reset();
                    JSObject msgEv = new JSObject();
                    msgEv.put("clientId", clientId);
                    msgEv.put("payload", text);
                    notifyListeners("messageReceived", msgEv);
                }
            }
        }
    }

    private static void readFully(InputStream in, byte[] dst, int len) throws IOException {
        int offset = 0;
        while (offset < len) {
            int read = in.read(dst, offset, len - offset);
            if (read == -1) throw new EOFException();
            offset += read;
        }
    }

    private static String readHttpHeaders(InputStream in) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        int match = 0;
        while (buf.size() < 16384) {
            int b = in.read();
            if (b == -1) return null;
            buf.write(b);
            if ((match == 0 && b == '\r') ||
                (match == 1 && b == '\n') ||
                (match == 2 && b == '\r') ||
                (match == 3 && b == '\n')) {
                match++;
                if (match == 4) {
                    return new String(buf.toByteArray(), StandardCharsets.US_ASCII);
                }
            } else {
                match = (b == '\r') ? 1 : 0;
            }
        }
        return null;
    }

    private static String extractWebSocketKey(String headers) {
        for (String line : headers.split("\r\n")) {
            int idx = line.indexOf(':');
            if (idx > 0) {
                String name = line.substring(0, idx).trim();
                if (name.equalsIgnoreCase("Sec-WebSocket-Key")) {
                    return line.substring(idx + 1).trim();
                }
            }
        }
        return null;
    }

    private static String computeWebSocketAccept(String key) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-1");
        byte[] digest = md.digest((key + WS_GUID).getBytes(StandardCharsets.US_ASCII));
        return Base64.encodeToString(digest, Base64.NO_WRAP);
    }

    private static List<String> detectLocalIpv4Addresses() {
        List<String> prioritized = new ArrayList<>();
        List<String> others = new ArrayList<>();
        try {
            Enumeration<NetworkInterface> ifaces = NetworkInterface.getNetworkInterfaces();
            for (NetworkInterface nif : Collections.list(ifaces)) {
                if (!nif.isUp() || nif.isLoopback()) continue;
                String name = nif.getName().toLowerCase();
                boolean isHotspotOrWifi =
                    name.contains("ap") || name.contains("wlan") || name.contains("swlan");
                for (InetAddress addr : Collections.list(nif.getInetAddresses())) {
                    if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                        String host = addr.getHostAddress();
                        if (host == null) continue;
                        if (isHotspotOrWifi) {
                            prioritized.add(host);
                        } else {
                            others.add(host);
                        }
                    }
                }
            }
        } catch (Exception ignored) {
        }
        prioritized.addAll(others);
        return prioritized;
    }

    private static String pickPreferredHotspotIp(List<String> ips) {
        for (String ip : ips) {
            if (ip.equals("192.168.43.1")) return ip;
        }
        for (String ip : ips) {
            if (ip.startsWith("192.168.")) return ip;
        }
        if (!ips.isEmpty()) return ips.get(0);
        return "192.168.43.1";
    }
}
