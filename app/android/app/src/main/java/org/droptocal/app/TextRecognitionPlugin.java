package org.droptocal.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
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

    /** Every line, regrouped into the rows of the page. */
    static String inRows(Text found) {
        List<Text.Line> lines = new ArrayList<>();
        for (Text.TextBlock block : found.getTextBlocks()) {
            for (Text.Line line : block.getLines()) {
                if (line.getBoundingBox() != null && !line.getText().trim().isEmpty()) lines.add(line);
            }
        }
        lines.sort((a, b) -> Integer.compare(a.getBoundingBox().centerY(), b.getBoundingBox().centerY()));

        List<List<Text.Line>> rows = new ArrayList<>();
        Rect band = null;
        for (Text.Line line : lines) {
            Rect box = line.getBoundingBox();
            // Same row when this line's middle falls inside the row's first
            // line: lenient enough for a slight tilt, strict enough that
            // two lines of a title stay two rows.
            if (band != null && box.centerY() >= band.top && box.centerY() <= band.bottom) {
                rows.get(rows.size() - 1).add(line);
            } else {
                List<Text.Line> row = new ArrayList<>();
                row.add(line);
                rows.add(row);
                band = box;
            }
        }

        StringBuilder out = new StringBuilder();
        for (List<Text.Line> row : rows) {
            row.sort((a, b) -> Integer.compare(a.getBoundingBox().left, b.getBoundingBox().left));
            for (int i = 0; i < row.size(); i++) {
                if (i > 0) out.append(" | ");
                out.append(row.get(i).getText().trim());
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
