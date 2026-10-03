package org.droptocal.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Secrets kept encrypted, with a key that never leaves the phone's keystore.
 *
 * An API key is money: whoever reads it can spend on its owner's account. The
 * page's localStorage is a plain file in the app's data, readable by anything
 * that gets at that data — a backup, a rooted phone, a debugging bridge. Here
 * a value is encrypted with AES-GCM under a key generated inside the Android
 * Keystore, which hands out no copy of it, and only the result is stored.
 *
 * The keystore key is not part of a backup, so a value restored onto another
 * phone cannot be read there. That is reported as no value at all, and the
 * person enters their key again — the right outcome for a secret.
 */
@CapacitorPlugin(name = "SecureStore")
public class SecureStorePlugin extends Plugin {

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String ALIAS = "caldrop-secrets";
    private static final String PREFS = "caldrop-secure";
    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance(KEYSTORE);
        store.load(null);
        if (store.containsAlias(ALIAS)) {
            return ((KeyStore.SecretKeyEntry) store.getEntry(ALIAS, null)).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(
            new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        );
        return generator.generateKey();
    }

    /** Names are the page's field names; nothing else may be stored here. */
    private String name(PluginCall call) {
        String name = call.getString("name");
        if (name == null || !name.matches("[A-Za-z][A-Za-z0-9]{0,40}")) {
            call.reject("A secret needs a plain name.");
            return null;
        }
        return name;
    }

    @PluginMethod
    public void get(PluginCall call) {
        String name = name(call);
        if (name == null) return;
        JSObject result = new JSObject();
        String stored = prefs().getString(name, null);
        if (stored == null) {
            result.put("value", null);
            call.resolve(result);
            return;
        }
        try {
            ByteBuffer sealed = ByteBuffer.wrap(Base64.decode(stored, Base64.NO_WRAP));
            byte[] iv = new byte[IV_BYTES];
            sealed.get(iv);
            byte[] body = new byte[sealed.remaining()];
            sealed.get(body);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(TAG_BITS, iv));
            result.put("value", new String(cipher.doFinal(body), StandardCharsets.UTF_8));
        } catch (Exception unreadable) {
            // Restored from another phone, or the keystore was reset: there is
            // no getting it back, so it is no value — and not kept around.
            prefs().edit().remove(name).apply();
            result.put("value", null);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String name = name(call);
        if (name == null) return;
        String value = call.getString("value", "");
        if (value == null || value.isEmpty()) {
            prefs().edit().remove(name).apply();
            call.resolve();
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] iv = cipher.getIV();
            byte[] body = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] sealed = ByteBuffer.allocate(iv.length + body.length).put(iv).put(body).array();
            prefs().edit().putString(name, Base64.encodeToString(sealed, Base64.NO_WRAP)).apply();
            call.resolve();
        } catch (Exception failure) {
            call.reject("The secret could not be stored: " + failure.getMessage());
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String name = name(call);
        if (name == null) return;
        prefs().edit().remove(name).apply();
        call.resolve();
    }
}
