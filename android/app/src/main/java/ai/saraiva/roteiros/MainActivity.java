package ai.saraiva.roteiros;

import android.content.res.Configuration;
import android.os.Bundle;
import android.view.KeyEvent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeCameraPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        NativeCameraPlugin camera = NativeCameraPlugin.instance;
        if (camera != null && camera.handleKey(event)) return true;
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        NativeCameraPlugin camera = NativeCameraPlugin.instance;
        if (camera != null) camera.onRotationChanged();
    }
}
