package org.droptocal.app;

import com.getcapacitor.Plugin;
import java.util.Collections;
import java.util.List;

/** The plugins only this flavour has: Play Integrity. */
final class Flavor {

    static final List<Class<? extends Plugin>> PLUGINS = Collections.singletonList(IntegrityPlugin.class);

    private Flavor() {}
}
