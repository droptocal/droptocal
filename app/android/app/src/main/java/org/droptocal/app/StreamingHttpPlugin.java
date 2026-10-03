package org.droptocal.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.Reader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * An HTTP request made by the app rather than by its page, answered as it arrives.
 *
 * A web page may only call an API that says, in CORS headers, that pages may.
 * Most hosted inference APIs say no — deliberately, since a key sent from a
 * page is a key given away — so an API of one's own that says no could not be
 * used from the app at all, although the rule is a browser's and the app is
 * not one. Capacitor's own HTTP bridge is not held to it either, but it hands
 * the body back whole, and a model's answer is worth seeing as it is written:
 * the page shows the first title while the rest is still coming, and it notices
 * a stream that has gone silent.
 *
 * So the request is made here, and the page is told in events: "head" with the
 * status and headers, "chunk" for each piece of the body as it arrives, then
 * "end" or "error". Each carries the id the page chose, so several requests can
 * be in flight. "abort" hangs one up.
 */
@CapacitorPlugin(name = "StreamingHttp")
public class StreamingHttpPlugin extends Plugin {

    /** Longer than the page's own 120 s wait for silence, so the page decides first. */
    private static final int READ_TIMEOUT_MS = 130_000;
    private static final int CONNECT_TIMEOUT_MS = 20_000;

    private final Map<String, HttpURLConnection> open = new ConcurrentHashMap<>();
    private final ExecutorService pool = Executors.newCachedThreadPool();

    @PluginMethod
    public void request(PluginCall call) {
        String id = call.getString("id");
        String url = call.getString("url");
        if (id == null || url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("A request needs an id and an http(s) address.");
            return;
        }
        String method = call.getString("method", "GET");
        JSObject headers = call.getObject("headers", new JSObject());
        String body = call.getString("body");
        // Answered at once: what happens next arrives as events.
        call.resolve();

        pool.execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(url).openConnection();
                open.put(id, connection);
                connection.setRequestMethod(method);
                connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
                connection.setReadTimeout(READ_TIMEOUT_MS);
                connection.setUseCaches(false);
                for (Iterator<String> names = headers.keys(); names.hasNext(); ) {
                    String name = names.next();
                    connection.setRequestProperty(name, headers.getString(name));
                }
                if (body != null) {
                    connection.setDoOutput(true);
                    try (OutputStream out = connection.getOutputStream()) {
                        out.write(body.getBytes(StandardCharsets.UTF_8));
                    }
                }

                int status = connection.getResponseCode();
                JSObject head = new JSObject();
                head.put("id", id);
                head.put("status", status);
                JSObject received = new JSObject();
                for (Map.Entry<String, List<String>> field : connection.getHeaderFields().entrySet()) {
                    if (field.getKey() != null) received.put(field.getKey().toLowerCase(), String.join(", ", field.getValue()));
                }
                head.put("headers", received);
                notifyListeners("head", head);

                InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                if (stream != null) {
                    // Read as characters, so a multi-byte letter split across two
                    // network packets still arrives whole.
                    try (Reader reader = new InputStreamReader(stream, StandardCharsets.UTF_8)) {
                        char[] buffer = new char[4096];
                        int read;
                        while ((read = reader.read(buffer)) != -1) {
                            JSObject chunk = new JSObject();
                            chunk.put("id", id);
                            chunk.put("data", new String(buffer, 0, read));
                            notifyListeners("chunk", chunk);
                        }
                    }
                }
                JSObject end = new JSObject();
                end.put("id", id);
                notifyListeners("end", end);
            } catch (Exception failure) {
                JSObject error = new JSObject();
                error.put("id", id);
                error.put("message", failure.getClass().getSimpleName() + (failure.getMessage() == null ? "" : ": " + failure.getMessage()));
                notifyListeners("error", error);
            } finally {
                open.remove(id);
                if (connection != null) connection.disconnect();
            }
        });
    }

    @PluginMethod
    public void abort(PluginCall call) {
        HttpURLConnection connection = open.remove(call.getString("id", ""));
        // Disconnecting can block on the socket; not on the bridge's thread.
        if (connection != null) pool.execute(connection::disconnect);
        call.resolve();
    }
}
