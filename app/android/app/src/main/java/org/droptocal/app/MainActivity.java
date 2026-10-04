package org.droptocal.app;

import android.os.Bundle;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registered before the bridge starts, so the page can find it on load.
        registerPlugin(CalendarInsertPlugin.class);
        registerPlugin(ShareTargetPlugin.class);
        registerPlugin(ClipboardReadPlugin.class);
        registerPlugin(StreamingHttpPlugin.class);
        registerPlugin(SecureStorePlugin.class);
        registerPlugin(OrientationPlugin.class);
        registerPlugin(TextRecognitionPlugin.class);
        registerPlugin(IntegrityPlugin.class);
        super.onCreate(savedInstanceState);
        // A WebView is white until the page paints; in the page's own colour
        // the gap between the splash and the app is not a flash.
        getBridge().getWebView().setBackgroundColor(ContextCompat.getColor(this, R.color.splash_background));
    }
}
