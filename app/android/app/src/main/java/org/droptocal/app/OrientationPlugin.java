package org.droptocal.app;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The screen around the camera: which way it may turn, and what colour its
 * edges are.
 *
 * The app is a portrait app: a list, a form and a sheet of settings read
 * best upright, and turning them sideways only makes everything shorter.
 * The camera is the exception — a poster on a wall is often wider than it is
 * tall — so while it is open the screen follows the phone, and when it
 * closes the screen goes back upright. "As the user has it" rather than
 * "as the sensor says": a phone with its rotation locked stays as it is.
 *
 * And while it is open its edges are black. The status bar, the system's
 * buttons and the strip beside a camera notch show the window, not the page,
 * and the window is the app's light background — a grey frame around a
 * viewfinder. On a phone that draws edge to edge the bars are the page's
 * own and the colours set here change nothing, which is as it should be.
 *
 * Capacitor's SystemBars paints the window's background behind the bars
 * itself, from the theme, and does it again on every configuration change —
 * which is every turn of the screen, and the camera is exactly where the
 * screen turns. So the black is painted again after each one, once SystemBars
 * has had its turn.
 */
@CapacitorPlugin(name = "Orientation")
public class OrientationPlugin extends Plugin {

    private Drawable background;
    private int statusBar;
    private int navigationBar;
    private boolean lightStatus;
    private boolean lightNavigation;
    private boolean dark;

    @Override
    public void load() {
        getActivity().runOnUiThread(() ->
            getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT));
    }

    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);
        if (!dark) return;
        View decor = getActivity().getWindow().getDecorView();
        decor.post(this::paintDark);
        decor.postDelayed(this::paintDark, 150);
    }

    @PluginMethod
    public void allowLandscape(PluginCall call) {
        boolean allowed = Boolean.TRUE.equals(call.getBoolean("allowed", false));
        getActivity().runOnUiThread(() -> {
            getActivity().setRequestedOrientation(
                allowed ? ActivityInfo.SCREEN_ORIENTATION_USER : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
            darken(allowed);
            call.resolve();
        });
    }

    @SuppressWarnings("deprecation")
    private void darken(boolean on) {
        if (on == dark) return;
        Window window = getActivity().getWindow();
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
        if (on) {
            background = window.getDecorView().getBackground();
            statusBar = window.getStatusBarColor();
            navigationBar = window.getNavigationBarColor();
            lightStatus = bars.isAppearanceLightStatusBars();
            lightNavigation = bars.isAppearanceLightNavigationBars();
            dark = true;
            paintDark();
            return;
        } else {
            window.getDecorView().setBackground(background);
            window.setStatusBarColor(statusBar);
            window.setNavigationBarColor(navigationBar);
            bars.setAppearanceLightStatusBars(lightStatus);
            bars.setAppearanceLightNavigationBars(lightNavigation);
        }
        dark = on;
    }

    @SuppressWarnings("deprecation")
    private void paintDark() {
        if (!dark) return;
        Window window = getActivity().getWindow();
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
        window.getDecorView().setBackground(new ColorDrawable(Color.BLACK));
        window.setStatusBarColor(Color.BLACK);
        window.setNavigationBarColor(Color.BLACK);
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);
    }
}
