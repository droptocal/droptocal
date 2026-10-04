package org.droptocal.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Point;
import android.graphics.Rect;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.util.ArrayList;
import java.util.List;

/**
 * The words in a photo, read on the phone.
 *
 * The free API is asked with text: a photo costs more to send and to read,
 * and ML Kit reads print well enough offline on any Android phone. Only the
 * words leave the device.
 *
 * ML Kit hands back blocks in the order it found them, which for a timetable
 * is column by column — every date, then every title — and the pairing is
 * lost. So the lines are put back into rows by where they sit on the page,
 * left to right, with " | " between the pieces of one row.
 */
@CapacitorPlugin(name = "TextRecognition")
public class TextRecognitionPlugin extends Plugin {

    private TextRecognizer recognizer;

    @PluginMethod
    public void read(PluginCall call) {
        String data = call.getString("data", "");
        // A data: URL is accepted as it comes from the page.
        int comma = data.indexOf(',');
        if (data.startsWith("data:") && comma > 0) data = data.substring(comma + 1);
        final String encoded = data;

        new Thread(() -> {
            try {
                byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
                Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bitmap == null) {
                    call.reject("The picture could not be decoded.");
                    return;
                }
                Text found = Tasks.await(recognizer().process(InputImage.fromBitmap(bitmap, 0)));
                JSObject result = new JSObject();
                result.put("text", inRows(found));
                result.put("width", bitmap.getWidth());
                result.put("height", bitmap.getHeight());
                call.resolve(result);
            } catch (Exception failed) {
                call.reject("Text recognition failed: " + failed.getMessage());
            }
        }).start();
    }

    private synchronized TextRecognizer recognizer() {
        if (recognizer == null) recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        return recognizer;
    }

    /** A line, placed on the page as if the page were held straight. */
    private static final class Placed {
        final String text;
        final double x;
        final double y;
        final double height;

        Placed(String text, double x, double y, double height) {
            this.text = text;
            this.x = x;
            this.y = y;
            this.height = height;
        }
    }

    /**
     * Every line, regrouped into the rows of the page.
     *
     * A photo is rarely straight, and on a table held at 4° the right-hand
     * column sits a whole row lower than the left: grouped by plain height,
     * every row came out split in two. So the page's tilt — the middle of the
     * angles ML Kit gives each line — is taken out first, and lines are
     * grouped by where they sit once it is.
     */
    static String inRows(Text found) {
        List<Text.Line> lines = new ArrayList<>();
        for (Text.TextBlock block : found.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                if (line.getBoundingBox() != null && !line.getText().trim().isEmpty()) lines.add(line);
            }
        }
        if (lines.isEmpty()) return "";

        List<Float> angles = new ArrayList<>();
        for (Text.Line line : lines) angles.add(line.getAngle());
        angles.sort(Float::compare);
        double tilt = Math.toRadians(angles.get(angles.size() / 2));
        double cos = Math.cos(tilt);
        double sin = Math.sin(tilt);

        List<Placed> placed = new ArrayList<>();
        for (Text.Line line : lines) {
            Rect box = line.getBoundingBox();
            double cx = box.exactCenterX();
            double cy = box.exactCenterY();
            // The line's own height, not its box's: a tilted box is taller.
            double height = box.height();
            // Where the line starts, so a row reads in column order.
            double startX = box.left;
            double startY = cy;
            Point[] corners = line.getCornerPoints();
            if (corners != null && corners.length == 4) {
                height = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
                startX = corners[0].x;
                startY = corners[0].y;
            }
            placed.add(new Placed(line.getText().trim(), startX * cos + startY * sin, -cx * sin + cy * cos, height));
        }
        placed.sort((a, b) -> Double.compare(a.y, b.y));

        List<List<Placed>> rows = new ArrayList<>();
        Placed first = null;
        for (Placed line : placed) {
            // Same row when the straightened middles are within half a line.
            if (first != null && Math.abs(line.y - first.y) < 0.5 * Math.max(line.height, first.height)) {
                rows.get(rows.size() - 1).add(line);
            } else {
                List<Placed> row = new ArrayList<>();
                row.add(line);
                rows.add(row);
                first = line;
            }
        }

        StringBuilder out = new StringBuilder();
        for (List<Placed> row : rows) {
            row.sort((a, b) -> Double.compare(a.x, b.x));
            for (int i = 0; i < row.size(); i++) {
                if (i > 0) out.append(" | ");
                out.append(row.get(i).text);
            }
            out.append('\n');
        }
        return out.toString().trim();
    }

    @Override
    protected void handleOnDestroy() {
        if (recognizer != null) recognizer.close();
    }
}
