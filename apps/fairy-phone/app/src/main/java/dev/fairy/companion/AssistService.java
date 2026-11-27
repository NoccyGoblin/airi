package dev.fairy.companion;

import android.service.voice.VoiceInteractionService;

/**
 * Makes the app selectable as the phone's digital assistant, in place of Google's. The work happens in
 * {@link AssistSession}.
 *
 * While the app is the assistant, Android keeps this service running. The wake word listener then opens her through
 * {@link #showSession}, which Android allows from the background, unlike a plain activity start.
 */
public class AssistService extends VoiceInteractionService {
    /** The running service, while the app is the phone's assistant. */
    public static volatile AssistService current;

    @Override
    public void onReady() {
        super.onReady();
        current = this;
    }

    @Override
    public void onShutdown() {
        if (current == this)
            current = null;
        super.onShutdown();
    }
}
