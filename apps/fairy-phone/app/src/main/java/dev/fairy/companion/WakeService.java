package dev.fairy.companion;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Bundle;
import android.os.IBinder;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.util.Log;

import com.k2fsa.sherpa.onnx.FeatureConfig;
import com.k2fsa.sherpa.onnx.KeywordSpotter;
import com.k2fsa.sherpa.onnx.KeywordSpotterConfig;
import com.k2fsa.sherpa.onnx.OnlineModelConfig;
import com.k2fsa.sherpa.onnx.OnlineStream;
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * "Hey Lumi" with the screen off. A foreground service listens to the microphone with a small keyword spotting model
 * that runs on the phone (sherpa-onnx, the same model and wake words as the PC). Nothing leaves the phone until it hears
 * the wake word. Then it opens the app, which listens for what the owner says next.
 *
 * - Android requires the "listening" notification for this. It has a Stop button.
 * - The listener pauses while the app is open, so the app's own microphone works.
 * - The wake words come from the PC (`/api/wake`), so they follow the active character. The last list stays cached.
 */
public class WakeService extends Service implements Runnable {
    public static final String ACTION_STOP = "dev.fairy.companion.STOP_WAKE";
    /** The owner's choice: listen for the wake word. MainActivity starts the service while this is on. */
    public static final String PREF_ON = "wakeOn";

    private static final String TAG = "FairyWake";
    private static final String CHANNEL = "wake";
    private static final String CHANNEL_WAKE = "woke";
    private static final int NOTIFICATION = 1;
    private static final int NOTIFICATION_WOKE = 2;
    private static final int RATE = 16_000;
    /** After a wake, the next one counts only after this much time. */
    private static final long COOLDOWN_MS = 3_000;
    /** The search settings of the PC's wake word detection. See kws-model.ts. */
    private static final int MAX_ACTIVE_PATHS = 16;

    /** True while the app is on screen. The listener then lets go of the microphone. */
    public static volatile boolean paused;

    private volatile boolean stopping;
    private Thread thread;

    public static void start(Context context) {
        context.startForegroundService(new Intent(context, WakeService.class));
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Listening for the wake word", NotificationManager.IMPORTANCE_LOW));
        manager.createNotificationChannel(new NotificationChannel(CHANNEL_WAKE, "Wake word heard", NotificationManager.IMPORTANCE_HIGH));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            prefs().edit().putBoolean(PREF_ON, false).apply();
            stopSelf();
            return START_NOT_STICKY;
        }
        startForeground(NOTIFICATION, listening("Starting…"), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        if (thread == null) {
            stopping = false;
            thread = new Thread(this, "fairy-wake");
            thread.start();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopping = true;
        if (thread != null)
            thread.interrupt();
        thread = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private SharedPreferences prefs() {
        return getSharedPreferences("fairy", MODE_PRIVATE);
    }

    private Notification listening(String text) {
        Intent stop = new Intent(this, WakeService.class).setAction(ACTION_STOP);
        Intent open = new Intent(this, MainActivity.class);
        return new Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle(prefs().getString("wakeName", "Wake word"))
            .setContentText(text)
            .setOngoing(true)
            .setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE))
            .addAction(new Notification.Action.Builder(null, "Stop", PendingIntent.getService(this, 1, stop, PendingIntent.FLAG_IMMUTABLE)).build())
            .build();
    }

    private void showStatus(String text) {
        getSystemService(NotificationManager.class).notify(NOTIFICATION, listening(text));
    }

    @Override
    public void run() {
        KeywordSpotter spotter = null;
        OnlineStream stream = null;
        AudioRecord recorder = null;
        try {
            spotter = createSpotter();
            stream = spotter.createStream("");
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
                throw new IllegalStateException("The app may not use the microphone.");
            int size = Math.max(AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT), RATE / 5 * 2);
            recorder = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, size);
            short[] chunk = new short[RATE / 10];
            float[] samples = new float[chunk.length];
            boolean recording = false;
            long quietUntil = 0;
            String phrase = prefs().getString("wakeName", "the wake word");
            while (!stopping) {
                if (paused) {
                    if (recording) {
                        recorder.stop();
                        recording = false;
                        showStatus("Paused while the app is open");
                    }
                    Thread.sleep(300);
                    continue;
                }
                if (!recording) {
                    recorder.startRecording();
                    recording = true;
                    spotter.reset(stream);
                    showStatus("Listening for \"" + phrase + "\"");
                }
                int read = recorder.read(chunk, 0, chunk.length);
                if (read <= 0)
                    continue;
                for (int i = 0; i < read; i++)
                    samples[i] = chunk[i] / 32768f;
                stream.acceptWaveform(read == samples.length ? samples : java.util.Arrays.copyOf(samples, read), RATE);
                while (spotter.isReady(stream)) {
                    spotter.decode(stream);
                    String keyword = spotter.getResult(stream).getKeyword();
                    if (!keyword.isEmpty()) {
                        spotter.reset(stream);
                        long now = System.currentTimeMillis();
                        if (now >= quietUntil) {
                            quietUntil = now + COOLDOWN_MS;
                            Log.i(TAG, "heard " + keyword);
                            wake();
                        }
                    }
                }
            }
        }
        catch (InterruptedException ignored) {
        }
        catch (Throwable error) {
            Log.e(TAG, "wake word listener failed", error);
            showStatus("Stopped: " + error.getMessage());
        }
        finally {
            if (recorder != null) {
                try {
                    recorder.stop();
                }
                catch (Exception ignored) {
                }
                recorder.release();
            }
            if (stream != null)
                stream.release();
            if (spotter != null)
                spotter.release();
        }
    }

    /** Opens the app listening: as the phone's assistant when it is one, else straight away or with a notification. */
    private void wake() {
        Vibrator vibrator = getSystemService(Vibrator.class);
        if (vibrator != null)
            vibrator.vibrate(VibrationEffect.createOneShot(60, VibrationEffect.DEFAULT_AMPLITUDE));
        AssistService assistant = AssistService.current;
        if (assistant != null) {
            assistant.showSession(new Bundle(), 0);
            return;
        }
        Intent open = new Intent(this, MainActivity.class)
            .putExtra(MainActivity.EXTRA_LISTEN, true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (Settings.canDrawOverlays(this)) {
            startActivity(open);
            return;
        }
        // Android does not let an app open itself from the background, so a tap on this opens her.
        Notification woke = new Notification.Builder(this, CHANNEL_WAKE)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle(prefs().getString("wakeName", "Wake word") + " heard you")
            .setContentText("Tap to talk")
            .setAutoCancel(true)
            .setContentIntent(PendingIntent.getActivity(this, 2, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT))
            .build();
        getSystemService(NotificationManager.class).notify(NOTIFICATION_WOKE, woke);
    }

    /** The keyword spotter with the model from the app's assets and the wake words of the active character. */
    private KeywordSpotter createSpotter() throws Exception {
        File dir = new File(getFilesDir(), "kws");
        if (!dir.isDirectory() && !dir.mkdirs())
            throw new IllegalStateException("Could not make the model folder.");
        for (String name : new String[] { "encoder.onnx", "decoder.onnx", "joiner.onnx", "tokens.txt" })
            copyAsset("kws/" + name, new File(dir, name));

        String keywords = fetchKeywords();
        if (keywords.trim().isEmpty())
            throw new IllegalStateException("This character has no wake word. Add one in her card on the PC.");
        File keywordsFile = new File(dir, "keywords.txt");
        try (OutputStream out = new FileOutputStream(keywordsFile)) {
            out.write(keywords.getBytes(StandardCharsets.UTF_8));
        }

        FeatureConfig feature = new FeatureConfig();
        feature.setSampleRate(RATE);
        feature.setFeatureDim(80);
        OnlineTransducerModelConfig transducer = new OnlineTransducerModelConfig();
        transducer.setEncoder(new File(dir, "encoder.onnx").getAbsolutePath());
        transducer.setDecoder(new File(dir, "decoder.onnx").getAbsolutePath());
        transducer.setJoiner(new File(dir, "joiner.onnx").getAbsolutePath());
        OnlineModelConfig model = new OnlineModelConfig();
        model.setTransducer(transducer);
        model.setTokens(new File(dir, "tokens.txt").getAbsolutePath());
        model.setNumThreads(1);
        model.setProvider("cpu");
        KeywordSpotterConfig config = new KeywordSpotterConfig();
        config.setFeatConfig(feature);
        config.setModelConfig(model);
        config.setMaxActivePaths(MAX_ACTIVE_PATHS);
        config.setKeywordsFile(keywordsFile.getAbsolutePath());
        // The model files are plain files here, so no asset manager.
        return new KeywordSpotter(null, config);
    }

    /** Copies a model file out of the app, once after each install or update of the app. */
    private void copyAsset(String asset, File target) throws Exception {
        long installed = getPackageManager().getPackageInfo(getPackageName(), 0).lastUpdateTime;
        if (target.exists() && target.lastModified() >= installed)
            return;
        try (InputStream in = getAssets().open(asset)) {
            try (OutputStream out = new FileOutputStream(target)) {
                byte[] buffer = new byte[64 * 1024];
                for (int n; (n = in.read(buffer)) > 0; )
                    out.write(buffer, 0, n);
            }
        }
    }

    /** The wake words of the active character from the PC, or the last list when the PC is away. */
    private String fetchKeywords() {
        String page = prefs().getString("pageUrl", null);
        if (page != null) {
            try {
                Uri uri = Uri.parse(page);
                URL url = new URL(uri.getScheme() + "://" + uri.getAuthority() + "/api/wake");
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(8_000);
                connection.setReadTimeout(15_000);
                connection.setRequestProperty("X-Fairy-Key", uri.getQueryParameter("key"));
                try (InputStream in = connection.getInputStream()) {
                    ByteArrayOutputStream body = new ByteArrayOutputStream();
                    byte[] buffer = new byte[8192];
                    for (int n; (n = in.read(buffer)) > 0; )
                        body.write(buffer, 0, n);
                    JSONObject data = new JSONObject(body.toString("UTF-8"));
                    JSONArray lines = data.getJSONObject("wake").getJSONArray("keywords");
                    StringBuilder keywords = new StringBuilder();
                    for (int i = 0; i < lines.length(); i++)
                        keywords.append(lines.getString(i)).append('\n');
                    String name = data.optString("character", "");
                    prefs().edit()
                        .putString("wakeKeywords", keywords.toString())
                        .putString("wakeName", name.isEmpty() ? "Wake word" : "Hey " + name)
                        .apply();
                }
                finally {
                    connection.disconnect();
                }
            }
            catch (Exception error) {
                Log.w(TAG, "could not get the wake words from the PC, using the last ones", error);
            }
        }
        return prefs().getString("wakeKeywords", "");
    }
}
