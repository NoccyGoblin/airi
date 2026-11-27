package dev.fairy.companion;

import android.content.Intent;
import android.speech.RecognitionService;
import android.speech.SpeechRecognizer;

/**
 * Android lists an assistant only when it also names a speech recognizer. The PC transcribes her voice messages, so
 * this one only says that it cannot help.
 */
public class RecognitionStub extends RecognitionService {
    @Override
    protected void onStartListening(Intent intent, Callback listener) {
        try {
            listener.error(SpeechRecognizer.ERROR_CLIENT);
        }
        catch (Exception ignored) {
        }
    }

    @Override
    protected void onCancel(Callback listener) {
    }

    @Override
    protected void onStopListening(Callback listener) {
    }
}
