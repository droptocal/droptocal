package org.droptocal.app;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * What the rest of the phone hands to this app.
 *
 * A poster is rarely already in DropToCal: it is in a browser, a chat, a mail,
 * the gallery. Android's answer to that is the share sheet and "open with",
 * and both arrive here as an Intent — a link as text, a photo or a PDF as a
 * content:// URI that this app may read for as long as the intent lives.
 *
 * Two ways in, because there are two moments. An intent that started the app
 * is waiting when the page loads and is collected by consume(); one that
 * arrives while the app is already open is announced as an event, so a poster
 * shared twice in a row is read twice rather than ignored the second time.
 *
 * PROCESS_TEXT is the same idea one level down: text selected anywhere on the
 * phone — in a message, a web page, a note — can be sent straight here from
 * the selection menu, next to Copy and Web search, without going through the
 * share sheet at all.
 */
@CapacitorPlugin(name = "ShareTarget")
public class ShareTargetPlugin extends Plugin {

    /** Bigger than this and it is not a poster. The endpoint refuses a body
     *  past 12MB anyway, and an image is downscaled long before that. */
    private static final int MAX_BYTES = 12 * 1024 * 1024;

    private JSObject waiting;

    @Override
    public void load() {
        waiting = read(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        JSObject shared = read(intent);
        if (shared == null) return;
        waiting = shared;
        notifyListeners("shared", shared);
    }

    /** Hand over whatever is waiting, once. A second call gets nothing, so a
     *  reload does not read the same poster again. */
    @PluginMethod
    public void consume(PluginCall call) {
        JSObject payload = waiting == null ? new JSObject() : waiting;
        waiting = null;
        call.resolve(payload);
    }

    private JSObject read(Intent intent) {
        if (intent == null || intent.getAction() == null) return null;
        String action = intent.getAction();
        List<Uri> uris = new ArrayList<>();
        String text = "";

        if (Intent.ACTION_SEND.equals(action)) {
            CharSequence sent = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            if (sent != null) text = sent.toString();
            Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (stream != null) uris.add(stream);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> streams = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (streams != null) uris.addAll(streams);
        } else if (Intent.ACTION_VIEW.equals(action)) {
            // "Open with", from a file manager or a downloads list.
            if (intent.getData() != null) uris.add(intent.getData());
        } else if (Intent.ACTION_PROCESS_TEXT.equals(action)) {
            // Selected text, from the menu that also offers Copy and Web search.
            CharSequence selected = intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT);
            if (selected == null) selected = intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT_READONLY);
            if (selected != null) text = selected.toString();
        } else {
            return null;
        }

        // Some apps hand over what they share only as clip data, not as the
        // extras above; the URIs and any text are there instead.
        ClipData clip = intent.getClipData();
        if (clip != null && !Intent.ACTION_PROCESS_TEXT.equals(action)) {
            for (int i = 0; i < clip.getItemCount(); i++) {
                ClipData.Item item = clip.getItemAt(i);
                if (uris.isEmpty() && item.getUri() != null) {
                    for (int j = i; j < clip.getItemCount(); j++) {
                        Uri uri = clip.getItemAt(j).getUri();
                        if (uri != null) uris.add(uri);
                    }
                    break;
                }
                if (text.isEmpty() && item.getText() != null) text = item.getText().toString();
            }
        }

        if (text.isEmpty() && uris.isEmpty()) return null;

        JSObject payload = new JSObject();
        payload.put("text", text);
        CharSequence subject = intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT);
        payload.put("title", subject == null ? "" : subject.toString());

        JSArray files = new JSArray();
        for (Uri uri : uris) {
            JSObject file = readFile(uri, intent.getType());
            if (file != null) files.put(file);
        }
        payload.put("files", files);
        return payload;
    }

    /**
     * A shared file as bytes the page can use. Base64 rather than a path,
     * because the WebView has no business with the filesystem and the grant
     * on this URI belongs to the app, not to the page.
     */
    private JSObject readFile(Uri uri, String fallbackType) {
        ContentResolver resolver = getContext().getContentResolver();
        String type = resolver.getType(uri);
        if (type == null) type = fallbackType == null ? "application/octet-stream" : fallbackType;

        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) return null;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] chunk = new byte[64 * 1024];
            int read;
            while ((read = in.read(chunk)) != -1) {
                out.write(chunk, 0, read);
                if (out.size() > MAX_BYTES) return null;
            }
            JSObject file = new JSObject();
            file.put("name", displayName(uri, type));
            file.put("type", type);
            file.put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
            return file;
        } catch (Exception unreadable) {
            // A URI whose grant has expired, or a provider that refuses: the
            // share is simply one file lighter rather than an error screen.
            return null;
        }
    }

    private String displayName(Uri uri, String type) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (column >= 0) {
                    String name = cursor.getString(column);
                    if (name != null && !name.isEmpty()) return name;
                }
            }
        } catch (Exception noName) {
            /* fall through to something plausible */
        }
        return type.startsWith("image/") ? "shared-image" : "shared-file";
    }
}
