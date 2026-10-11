package ai.saraiva.roteiros;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.hardware.camera2.CaptureRequest;
import android.net.Uri;
import android.util.Range;
import android.graphics.Color;
import android.os.Build;
import android.provider.MediaStore;
import android.view.KeyEvent;
import android.view.Surface;
import android.view.ViewGroup;
import android.view.WindowManager;
import androidx.annotation.OptIn;
import androidx.camera.camera2.interop.Camera2Interop;
import androidx.camera.camera2.interop.ExperimentalCamera2Interop;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraInfo;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.DynamicRange;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.video.FallbackStrategy;
import androidx.camera.video.MediaStoreOutputOptions;
import androidx.camera.video.PendingRecording;
import androidx.camera.video.Quality;
import androidx.camera.video.QualitySelector;
import androidx.camera.video.Recorder;
import androidx.camera.video.Recording;
import androidx.camera.video.VideoCapture;
import androidx.camera.video.VideoRecordEvent;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.common.util.concurrent.ListenableFuture;
import java.text.SimpleDateFormat;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.Executor;

/**
 * Câmera e gravação nativas (CameraX) para o teleprompter.
 * O preview fica atrás da WebView transparente; o vídeo sai em MP4
 * direto no disco (Movies/Roteiro Studio), sem segurar nada na RAM.
 */
@CapacitorPlugin(
    name = "NativeCamera",
    permissions = {
        @Permission(alias = "camera", strings = { Manifest.permission.CAMERA }),
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class NativeCameraPlugin extends Plugin {

    static NativeCameraPlugin instance;

    private static final String ALBUM = "Movies/Roteiro Studio";

    /**
     * A Samsung só declara até 1080p no CamcorderProfile da frontal, embora o
     * sensor entregue 4K. Derivar as qualidades do codec libera o 4K.
     */
    private static final int CAPS_SOURCE = Recorder.VIDEO_CAPABILITIES_SOURCE_CODEC_CAPABILITIES;

    private PreviewView previewView;
    private ProcessCameraProvider provider;
    private Preview preview;
    private VideoCapture<Recorder> videoCapture;
    private Camera camera;
    private Recording recording;
    private PluginCall pendingStop;

    private int lensFacing = CameraSelector.LENS_FACING_FRONT;
    private String quality = "UHD";
    private boolean hdr = false;
    private boolean hdrSupported = false;
    private boolean remoteEnabled = false;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        releaseCamera();
        if (instance == this) instance = null;
    }

    private Executor mainExecutor() {
        return ContextCompat.getMainExecutor(getContext());
    }

    // ---------- câmera ----------

    @PluginMethod
    public void start(PluginCall call) {
        lensFacing = "back".equals(call.getString("facing")) ? CameraSelector.LENS_FACING_BACK : CameraSelector.LENS_FACING_FRONT;
        quality = call.getString("quality", quality);
        hdr = Boolean.TRUE.equals(call.getBoolean("hdr", hdr));
        if (getPermissionState("camera") != PermissionState.GRANTED || getPermissionState("microphone") != PermissionState.GRANTED) {
            requestAllPermissions(call, "permissionsCallback");
            return;
        }
        openCamera(call);
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            call.reject("Permissão de câmera negada. Libere em Configurações > Apps > Roteiro Studio.");
            return;
        }
        openCamera(call);
    }

    private void openCamera(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            ensurePreviewView();
            ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(getContext());
            future.addListener(() -> {
                try {
                    provider = future.get();
                    bind();
                    call.resolve(status());
                } catch (Exception e) {
                    call.reject("Não foi possível abrir a câmera: " + e.getMessage());
                }
            }, mainExecutor());
        });
    }

    private void ensurePreviewView() {
        if (previewView != null) return;
        previewView = new PreviewView(getContext());
        previewView.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
        ViewGroup parent = (ViewGroup) bridge.getWebView().getParent();
        parent.addView(previewView, 0, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        bridge.getWebView().setBackgroundColor(Color.TRANSPARENT);
        getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private int displayRotation() {
        return previewView != null && previewView.getDisplay() != null ? previewView.getDisplay().getRotation() : Surface.ROTATION_0;
    }

    private Quality toQuality(String q) {
        switch (q) {
            case "UHD": return Quality.UHD;
            case "HD": return Quality.HD;
            case "SD": return Quality.SD;
            default: return Quality.FHD;
        }
    }

    /** Bitrate alvo por qualidade — perto do que o app da Samsung usa. */
    private int bitrateFor(String q) {
        switch (q) {
            case "UHD": return 50_000_000;
            case "HD": return 12_000_000;
            case "SD": return 6_000_000;
            default: return 24_000_000;
        }
    }

    /**
     * Ajustes de imagem via Camera2: exposição priorizando o rosto, redução de
     * ruído e nitidez em alta qualidade e 30 fps travados (movimento estável).
     */
    @OptIn(markerClass = ExperimentalCamera2Interop.class)
    private void tune(Camera2Interop.Extender<?> extender) {
        extender.setCaptureRequestOption(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_USE_SCENE_MODE);
        extender.setCaptureRequestOption(CaptureRequest.CONTROL_SCENE_MODE, CaptureRequest.CONTROL_SCENE_MODE_FACE_PRIORITY);
        extender.setCaptureRequestOption(CaptureRequest.NOISE_REDUCTION_MODE, CaptureRequest.NOISE_REDUCTION_MODE_HIGH_QUALITY);
        extender.setCaptureRequestOption(CaptureRequest.EDGE_MODE, CaptureRequest.EDGE_MODE_HIGH_QUALITY);
        extender.setCaptureRequestOption(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, new Range<>(30, 30));
        extender.setCaptureRequestOption(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO);
    }

    private boolean supportsHdr(CameraInfo info) {
        return Recorder.getVideoCapabilities(info, CAPS_SOURCE).getSupportedDynamicRanges().contains(DynamicRange.HLG_10_BIT);
    }

    private void bind() {
        if (provider == null) return;
        provider.unbindAll();
        CameraSelector cameraSelector = new CameraSelector.Builder().requireLensFacing(lensFacing).build();
        List<CameraInfo> matches = cameraSelector.filter(provider.getAvailableCameraInfos());
        CameraInfo info = matches.isEmpty() ? null : matches.get(0);
        hdrSupported = info != null && supportsHdr(info);
        boolean useHdr = hdr && hdrSupported;

        Preview.Builder previewBuilder = new Preview.Builder();
        tune(new Camera2Interop.Extender<>(previewBuilder));
        if (useHdr) previewBuilder.setDynamicRange(DynamicRange.HLG_10_BIT);
        preview = previewBuilder.build();
        preview.setSurfaceProvider(previewView.getSurfaceProvider());

        QualitySelector selector = QualitySelector.from(toQuality(quality), FallbackStrategy.lowerQualityOrHigherThan(Quality.SD));
        Recorder recorder = new Recorder.Builder()
            .setQualitySelector(selector)
            .setTargetVideoEncodingBitRate(bitrateFor(quality))
            .setVideoCapabilitiesSource(CAPS_SOURCE)
            .build();
        VideoCapture.Builder<Recorder> videoBuilder = new VideoCapture.Builder<>(recorder);
        tune(new Camera2Interop.Extender<>(videoBuilder));
        if (useHdr) videoBuilder.setDynamicRange(DynamicRange.HLG_10_BIT);
        videoCapture = videoBuilder.build();

        int rotation = displayRotation();
        preview.setTargetRotation(rotation);
        videoCapture.setTargetRotation(rotation);
        camera = provider.bindToLifecycle((LifecycleOwner) getActivity(), cameraSelector, preview, videoCapture);
    }

    private JSObject status() {
        JSObject ret = new JSObject();
        ret.put("facing", lensFacing == CameraSelector.LENS_FACING_BACK ? "back" : "front");
        ret.put("quality", quality);
        JSArray qualities = new JSArray();
        if (camera != null) {
            List<Quality> supported = Recorder.getVideoCapabilities(camera.getCameraInfo(), CAPS_SOURCE).getSupportedQualities(DynamicRange.SDR);
            if (supported.contains(Quality.UHD)) qualities.put("UHD");
            if (supported.contains(Quality.FHD)) qualities.put("FHD");
            if (supported.contains(Quality.HD)) qualities.put("HD");
            if (supported.contains(Quality.SD)) qualities.put("SD");
        }
        ret.put("qualities", qualities);
        ret.put("hdr", hdr && hdrSupported);
        ret.put("hdrSupported", hdrSupported);
        ret.put("hasMicrophone", getPermissionState("microphone") == PermissionState.GRANTED);
        return ret;
    }

    @PluginMethod
    public void configure(PluginCall call) {
        if (recording != null) {
            call.reject("Pare a gravação antes de trocar a câmera ou a qualidade.");
            return;
        }
        String facing = call.getString("facing");
        if (facing != null) lensFacing = "back".equals(facing) ? CameraSelector.LENS_FACING_BACK : CameraSelector.LENS_FACING_FRONT;
        quality = call.getString("quality", quality);
        hdr = Boolean.TRUE.equals(call.getBoolean("hdr", hdr));
        getActivity().runOnUiThread(() -> {
            try {
                bind();
                call.resolve(status());
            } catch (Exception e) {
                call.reject("Não foi possível reconfigurar a câmera: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            releaseCamera();
            call.resolve();
        });
    }

    private void releaseCamera() {
        if (recording != null) {
            recording.stop();
            recording = null;
        }
        if (provider != null) provider.unbindAll();
        camera = null;
        videoCapture = null;
        if (previewView != null) {
            ((ViewGroup) previewView.getParent()).removeView(previewView);
            previewView = null;
        }
        if (getActivity() != null) getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    /** Chamado pela MainActivity quando o aparelho gira. */
    void onRotationChanged() {
        if (recording != null || preview == null || videoCapture == null) return;
        int rotation = displayRotation();
        preview.setTargetRotation(rotation);
        videoCapture.setTargetRotation(rotation);
    }

    // ---------- gravação ----------

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void startRecording(PluginCall call) {
        if (videoCapture == null) {
            call.reject("Câmera desligada.");
            return;
        }
        if (recording != null) {
            call.reject("Já está gravando.");
            return;
        }
        String name = "Roteiro_" + new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(System.currentTimeMillis());
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(MediaStore.MediaColumns.MIME_TYPE, "video/mp4");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) values.put(MediaStore.Video.Media.RELATIVE_PATH, ALBUM);
        MediaStoreOutputOptions options = new MediaStoreOutputOptions.Builder(
            getContext().getContentResolver(), MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        ).setContentValues(values).build();

        PendingRecording pending = videoCapture.getOutput().prepareRecording(getContext(), options);
        if (getPermissionState("microphone") == PermissionState.GRANTED) pending = pending.withAudioEnabled();
        recording = pending.start(mainExecutor(), this::onRecordEvent);
        JSObject ret = new JSObject();
        ret.put("name", name);
        call.resolve(ret);
    }

    private void onRecordEvent(VideoRecordEvent event) {
        if (!(event instanceof VideoRecordEvent.Finalize)) return;
        VideoRecordEvent.Finalize fin = (VideoRecordEvent.Finalize) event;
        JSObject data = new JSObject();
        boolean saved = fin.getOutputResults().getOutputUri() != android.net.Uri.EMPTY;
        data.put("saved", saved);
        data.put("uri", fin.getOutputResults().getOutputUri().toString());
        data.put("durationMs", fin.getRecordingStats().getRecordedDurationNanos() / 1_000_000L);
        data.put("bytes", fin.getRecordingStats().getNumBytesRecorded());
        data.put("album", ALBUM);
        if (fin.hasError()) data.put("error", "Código " + fin.getError());
        notifyListeners("recordingFinished", data);
        if (pendingStop != null) {
            pendingStop.resolve(data);
            pendingStop = null;
        }
    }

    @PluginMethod
    public void stopRecording(PluginCall call) {
        if (recording == null) {
            call.reject("Não está gravando.");
            return;
        }
        pendingStop = call;
        recording.stop();
        recording = null;
    }

    // ---------- Google Drive ----------

    private static final String DRIVE_PACKAGE = "com.google.android.apps.docs";

    /** Abre o "Enviar para o Drive" com o vídeo; sem o app do Drive, cai no menu de compartilhar. */
    @PluginMethod
    public void sendToDrive(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null || uri.isEmpty()) {
            call.reject("Nenhum vídeo para enviar.");
            return;
        }
        Intent send = new Intent(Intent.ACTION_SEND)
            .setType("video/mp4")
            .putExtra(Intent.EXTRA_STREAM, Uri.parse(uri))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            getActivity().startActivity(new Intent(send).setPackage(DRIVE_PACKAGE));
            call.resolve();
        } catch (ActivityNotFoundException e) {
            getActivity().startActivity(Intent.createChooser(send, "Enviar vídeo"));
            call.resolve();
        }
    }

    // ---------- controle remoto ----------

    @PluginMethod
    public void setRemoteEnabled(PluginCall call) {
        remoteEnabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        call.resolve();
    }

    private static String keyName(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_VOLUME_UP: return "volumeUp";
            case KeyEvent.KEYCODE_VOLUME_DOWN: return "volumeDown";
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
            case KeyEvent.KEYCODE_HEADSETHOOK: return "playPause";
            case KeyEvent.KEYCODE_MEDIA_NEXT: return "next";
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS: return "previous";
            case KeyEvent.KEYCODE_PAGE_DOWN: return "pageDown";
            case KeyEvent.KEYCODE_PAGE_UP: return "pageUp";
            default: return null;
        }
    }

    /** Teclas de volume/mídia/página viram comandos enquanto o teleprompter está aberto. */
    boolean handleKey(KeyEvent event) {
        if (!remoteEnabled) return false;
        String key = keyName(event.getKeyCode());
        if (key == null) return false;
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
            JSObject data = new JSObject();
            data.put("key", key);
            notifyListeners("remoteKey", data);
        }
        return true;
    }
}
