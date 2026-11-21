package it.flussoapp;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Lo stesso indirizzo di server.url in capacitor.config.ts. */
    private static final String SITE = "https://www.flussoapp.it";

    /**
     * Ritorno dall'accesso con Google: Supabase torna con it.flussoapp://auth/callback?code=…
     * (lib/auth-return.ts). Lo si riapre come /auth/callback nella finestra dell'app, dove c'è il
     * codice di verifica (PKCE) salvato quando è partito l'accesso. Un codice mandato da un'altra app
     * non serve a niente: senza quel codice di verifica Supabase lo rifiuta.
     */
    private void openAuthReturn(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null || !"it.flussoapp".equals(data.getScheme()) || !"auth".equals(data.getHost())
                || !"/callback".equals(data.getPath())) {
            return;
        }
        String query = data.getEncodedQuery();
        String target = SITE + "/auth/callback" + (query == null ? "" : "?" + query);
        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView != null) {
            // dopo il caricamento iniziale di Capacitor, se l'app è appena partita
            webView.post(() -> webView.loadUrl(target));
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // l'app era chiusa: è partita direttamente dal link di ritorno
        if (savedInstanceState == null) {
            openAuthReturn(getIntent());
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // l'app era aperta sotto la scheda di Chrome (launchMode singleTask: la scheda si chiude)
        openAuthReturn(intent);
    }
}
