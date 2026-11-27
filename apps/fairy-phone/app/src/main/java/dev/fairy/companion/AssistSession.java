package dev.fairy.companion;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.service.voice.VoiceInteractionSession;

/** A press of the assistant button, for example a long press of the side button: open the app and listen. */
public class AssistSession extends VoiceInteractionSession {
    public AssistSession(Context context) {
        super(context);
    }

    @Override
    public void onShow(Bundle args, int showFlags) {
        super.onShow(args, showFlags);
        Intent intent = new Intent(getContext(), MainActivity.class)
            .putExtra(MainActivity.EXTRA_LISTEN, true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startAssistantActivity(intent);
        hide();
    }
}
