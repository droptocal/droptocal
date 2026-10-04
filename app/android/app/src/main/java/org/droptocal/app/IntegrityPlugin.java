package org.droptocal.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.integrity.IntegrityManagerFactory;
import com.google.android.play.core.integrity.StandardIntegrityManager;
import com.google.android.play.core.integrity.StandardIntegrityManager.PrepareIntegrityTokenRequest;
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenProvider;
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenRequest;

/**
 * Play's word that this is DropToCal as Play installed it, on a real device —
 * which the free API asks for before it lets an installation use the larger
 * daily ration (free/integrity.js checks it with Google).
 *
 * A build from GitHub, or a phone without Play, gets a token Play will not
 * vouch for, or none; either way the plain ration still applies.
 */
@CapacitorPlugin(name = "Integrity")
public class IntegrityPlugin extends Plugin {

    private StandardIntegrityTokenProvider provider;
    private long preparedFor;

    @PluginMethod
    public void token(PluginCall call) {
        long project;
        try {
            project = Long.parseLong(call.getString("cloudProjectNumber", ""));
        } catch (NumberFormatException none) {
            call.reject("No Cloud project number.");
            return;
        }
        String hash = call.getString("requestHash", "");

        if (provider != null && preparedFor == project) {
            request(call, hash);
            return;
        }
        // Preparing warms Play up and takes a moment; it is done once a run.
        StandardIntegrityManager manager = IntegrityManagerFactory.createStandard(getContext());
        manager
            .prepareIntegrityToken(PrepareIntegrityTokenRequest.builder().setCloudProjectNumber(project).build())
            .addOnSuccessListener(prepared -> {
                provider = prepared;
                preparedFor = project;
                request(call, hash);
            })
            .addOnFailureListener(failed -> call.reject("Play Integrity is not available: " + failed.getMessage()));
    }

    private void request(PluginCall call, String hash) {
        provider
            .request(StandardIntegrityTokenRequest.builder().setRequestHash(hash).build())
            .addOnSuccessListener(response -> {
                JSObject result = new JSObject();
                result.put("token", response.token());
                call.resolve(result);
            })
            .addOnFailureListener(failed -> {
                // A provider can go stale; the next call prepares a fresh one.
                provider = null;
                call.reject("Play Integrity gave no token: " + failed.getMessage());
            });
    }
}
