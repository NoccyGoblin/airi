package dev.fairy.companion;

import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;
import android.service.voice.VoiceInteractionSessionService;

/** Gives each press of the assistant button a new {@link AssistSession}. */
public class AssistSessionService extends VoiceInteractionSessionService {
    @Override
    public VoiceInteractionSession onNewSession(Bundle args) {
        return new AssistSession(this);
    }
}
