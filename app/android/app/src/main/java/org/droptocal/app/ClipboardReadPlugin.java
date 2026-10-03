package org.droptocal.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.Context;
import android.net.Uri;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * The clipboard, which the WebView will not hand over.
 *
 * In Chrome, Paste asks once and then reads navigator.clipboard. A WebView
 * has no such prompt and refuses the read outright, so inside the app the
 * button found nothing every time. The app itself may read its own clipboard
 * while it is in front, which is exactly when the button is pressed.
 *
 * Only on request: reading shows Android's "pasted from your clipboard"
 * notice, so this is never done just to preview what is there.
 */
@CapacitorPlugin(name = "ClipboardRead")
public class ClipboardReadPlugin extends Plugin {

    /** The same ceiling as a shared file: past this it is not a poster. */
    private static final int MAX_BYTES = 12 * 1024 * 1024;

    @PluginMethod
    public void read(PluginCall call) {
        // The clipboard service expects the main thread; plugin calls do not
        // arrive on it.
        getActivity().runOnUiThread(() -> {
            try {
                call.resolve(readClip());
            } catch (Exception unreadable) {
                call.resolve(new JSObject());
            }
        });
    }

    private JSObject readClip() {
        JSObject result = new JSObject();
        ClipboardManager clipboard = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null || !clipboard.hasPrimaryClip()) return result;
        ClipData clip = clipboard.getPrimaryClip();
        if (clip == null || clip.getItemCount() == 0) return result;
        ClipData.Item item = clip.getItemAt(0);

        // A copied image travels as a content:// URI with an image type.
        Uri uri = item.getUri();
        if (uri != null) {
            ContentResolver resolver = getContext().getContentResolver();
            String type = resolver.getType(uri);
            if (type != null && type.startsWith("image/")) {
                String data = readBytes(resolver, uri);
                if (data != null) {
                    result.put("type", type);
                    result.put("data", data);
                    return result;
                }
            }
        }

        CharSequence text = item.coerceToText(getContext());
        result.put("text", text == null ? "" : text.toString());
        return result;
    }

    private String readBytes(ContentResolver resolver, Uri uri) {
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) return null;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] chunk = new byte[64 * 1024];
            int read;
            while ((read = in.read(chunk)) != -1) {
                out.write(chunk, 0, read);
                if (out.size() > MAX_BYTES) return null;
            }
            return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Exception unreadable) {
            return null;
        }
    }
}
