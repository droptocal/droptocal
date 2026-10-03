package org.droptocal.app;

import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.CalendarContract;
import android.provider.MediaStore;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * The handover a web page is not allowed to make.
 *
 * A browser can only offer the event as a file and hope something sensible
 * opens it — Chromium adds CATEGORY_BROWSABLE to every intent a page fires,
 * and a calendar's insert filter does not declare it, so the intent matches
 * nothing. Inside the app there is no such rule: ACTION_INSERT on an event is
 * answered by apps that keep a calendar, and by all of them, so whichever
 * calendar this person actually uses opens with the event already filled in.
 *
 * No vendor is named anywhere in here. That is the point of asking for an
 * event rather than for something that opens .ics files.
 */
@CapacitorPlugin(name = "CalendarInsert")
public class CalendarInsertPlugin extends Plugin {

    /** A field the page left out, or explicitly sent as null, is no field at
     *  all — getString hands back the default only for the first of those. */
    private String text(PluginCall call, String name) {
        String value = call.getString(name, "");
        return value == null ? "" : value;
    }

    /** The bare intent, without the event, for asking whether anyone answers it. */
    private Intent blank() {
        return new Intent(Intent.ACTION_INSERT).setData(CalendarContract.Events.CONTENT_URI);
    }

    /**
     * Is there a calendar app at all? The page asks before offering the button,
     * so a phone with no calendar installed is never shown a door to nowhere.
     * This needs the <queries> element in the manifest: from Android 11 an app
     * that has not asked to see a package cannot see it, and the answer would
     * be "nobody" on a phone full of calendars.
     */
    @PluginMethod
    public void available(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", blank().resolveActivity(getContext().getPackageManager()) != null);
        call.resolve(result);
    }

    @PluginMethod
    public void insert(PluginCall call) {
        String title = text(call, "title");
        Long begin = call.getLong("begin");
        Long end = call.getLong("end");
        if (begin == null || end == null) {
            call.reject("An event needs a beginning and an end.");
            return;
        }

        Intent intent = blank()
            .putExtra(CalendarContract.Events.TITLE, title)
            .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, begin.longValue())
            .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end.longValue())
            .putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, Boolean.TRUE.equals(call.getBoolean("allDay", false)));

        String location = text(call, "location");
        if (!location.isEmpty()) intent.putExtra(CalendarContract.Events.EVENT_LOCATION, location);

        String description = text(call, "description");
        if (!description.isEmpty()) intent.putExtra(CalendarContract.Events.DESCRIPTION, description);

        // A repeat rule survives this handover, which is the one thing the
        // Google and Outlook links drop.
        String rrule = text(call, "rrule");
        if (!rrule.isEmpty()) intent.putExtra(CalendarContract.Events.RRULE, rrule);

        // The venue's zone when the poster said enough to know it. Without it a
        // calendar reads the instants in the phone's own zone, which is right
        // for someone at home and wrong for someone reading a poster abroad.
        String timezone = text(call, "timezone");
        if (!timezone.isEmpty()) intent.putExtra(CalendarContract.Events.EVENT_TIMEZONE, timezone);

        try {
            // Not startActivityForResult: a calendar app returns CANCELED
            // whether the event was saved or the screen was dismissed, so the
            // result would be a fact this cannot know dressed as one it can.
            // What is worth reporting is only whether the screen opened.
            getActivity().startActivity(intent);
        } catch (ActivityNotFoundException nothingAnswers) {
            JSObject refused = new JSObject();
            refused.put("opened", false);
            call.resolve(refused);
            return;
        }

        JSObject opened = new JSObject();
        opened.put("opened", true);
        call.resolve(opened);
    }

    /**
     * The calendar file, handed to whatever opens one.
     *
     * In a browser the file is a link the browser downloads. Inside the app
     * the same link left the app for the browser, which then asked where to
     * save a file that still had to be found and opened. Here it is written to
     * the cache and opened directly — a calendar that imports .ics files
     * answers VIEW; failing that, the share sheet lets it go anywhere.
     */
    @PluginMethod
    public void openFile(PluginCall call) {
        String name = text(call, "name");
        String content = text(call, "content");
        if (content.isEmpty()) {
            call.reject("An empty calendar is not a file worth opening.");
            return;
        }
        Uri uri;
        try {
            File dir = new File(getContext().getCacheDir(), "events");
            if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("no cache");
            File file = new File(dir, (name.isEmpty() ? "event" : name) + ".ics");
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(content.getBytes(StandardCharsets.UTF_8));
            }
            uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        } catch (Exception unwritable) {
            call.reject("The calendar file could not be written.");
            return;
        }

        JSObject result = new JSObject();
        Intent view = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "text/calendar")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            getActivity().startActivity(view);
            result.put("opened", "calendar");
        } catch (ActivityNotFoundException noImporter) {
            Intent send = new Intent(Intent.ACTION_SEND)
                .setType("text/calendar")
                .putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try {
                getActivity().startActivity(Intent.createChooser(send, null));
                result.put("opened", "share");
            } catch (ActivityNotFoundException nowhere) {
                result.put("opened", "");
            }
        }
        call.resolve(result);
    }

    /**
     * The same calendar, kept rather than handed on.
     *
     * Opening the file is what it is usually for, and until now it was all
     * the app could do with one: a web view has no Downloads of its own, so
     * a page's download either leaves for the browser or goes nowhere. A
     * calendar worth keeping — to mail on, to import elsewhere, to hold onto
     * — is a plain enough thing to want, so the shell writes it where the
     * phone keeps downloads and says where that was.
     *
     * Through MediaStore from Android 10 on, which needs no permission and
     * puts the file where the Files app will show it; below that the public
     * Downloads directory is still writable directly.
     */
    @PluginMethod
    public void saveFile(PluginCall call) {
        String name = text(call, "name");
        String content = text(call, "content");
        if (content.isEmpty()) {
            call.reject("An empty calendar is not a file worth keeping.");
            return;
        }
        String file = (name.isEmpty() ? "event" : name) + ".ics";
        JSObject result = new JSObject();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues entry = new ContentValues();
                entry.put(MediaStore.Downloads.DISPLAY_NAME, file);
                entry.put(MediaStore.Downloads.MIME_TYPE, "text/calendar");
                Uri saved = getContext()
                    .getContentResolver()
                    .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, entry);
                if (saved == null) throw new IllegalStateException("nowhere to put it");
                try (OutputStream out = getContext().getContentResolver().openOutputStream(saved)) {
                    if (out == null) throw new IllegalStateException("not writable");
                    out.write(content.getBytes(StandardCharsets.UTF_8));
                }
                result.put("saved", file);
            } else {
                File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("no Downloads");
                File target = new File(dir, file);
                try (FileOutputStream out = new FileOutputStream(target)) {
                    out.write(content.getBytes(StandardCharsets.UTF_8));
                }
                result.put("saved", file);
            }
        } catch (Exception unwritable) {
            // The web side falls back to asking the endpoint for it, so this
            // is an answer rather than a failure.
            result.put("saved", "");
        }
        call.resolve(result);
    }
}
