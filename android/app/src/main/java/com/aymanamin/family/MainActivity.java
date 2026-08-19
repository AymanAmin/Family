package com.aymanamin.family;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://aymanamin.github.io/Family/";
    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;
    private static final int SPLASH_BACKGROUND = Color.rgb(255, 249, 238);

    private WebView webView;
    private FrameLayout splashOverlay;
    private ValueCallback<Uri[]> filePathCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        webView.setBackgroundColor(SPLASH_BACKGROUND);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        splashOverlay = createSplashOverlay();
        root.addView(splashOverlay, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebView.setWebContentsDebuggingEnabled(false);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setUserAgentString(settings.getUserAgentString() + " FamilyAndroidApp/1.0");

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleExternalUrl(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleExternalUrl(Uri.parse(url));
            }

            @Override
            public void onPageCommitVisible(WebView view, String url) {
                super.onPageCommitVisible(view, url);
                view.postDelayed(MainActivity.this::hideNativeSplash, 140);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }

                MainActivity.this.filePathCallback = filePathCallback;

                try {
                    Intent intent = fileChooserParams.createIntent();
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE);
                    return true;
                } catch (Exception ex) {
                    MainActivity.this.filePathCallback = null;
                    Toast.makeText(MainActivity.this, "تعذر فتح اختيار الملفات", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            try {
                String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setMimeType(mimeType);
                request.addRequestHeader("User-Agent", userAgent);

                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null && !cookies.isEmpty()) {
                    request.addRequestHeader("Cookie", cookies);
                }

                request.setTitle(fileName);
                request.setDescription("Family");
                request.setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);

                DownloadManager downloadManager =
                        (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                downloadManager.enqueue(request);
                Toast.makeText(this, "بدأ تنزيل الملف", Toast.LENGTH_SHORT).show();
            } catch (Exception ex) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {
                    Toast.makeText(this, "تعذر تنزيل الملف", Toast.LENGTH_SHORT).show();
                }
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl(HOME_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }

        webView.postDelayed(this::hideNativeSplash, 5000);
    }

    private FrameLayout createSplashOverlay() {
        FrameLayout overlay = new FrameLayout(this);
        overlay.setBackgroundColor(SPLASH_BACKGROUND);
        overlay.setClickable(true);
        overlay.setFocusable(true);

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.sila_approved_logo);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        logo.setContentDescription("شعار صلة القرابة");

        int logoSize = dpToPx(188);
        FrameLayout.LayoutParams logoParams = new FrameLayout.LayoutParams(
                logoSize,
                logoSize,
                Gravity.CENTER);
        overlay.addView(logo, logoParams);
        return overlay;
    }

    private void hideNativeSplash() {
        FrameLayout overlay = splashOverlay;
        if (overlay == null || overlay.getVisibility() != View.VISIBLE) {
            return;
        }

        splashOverlay = null;
        overlay.animate()
                .alpha(0f)
                .setDuration(220)
                .withEndAction(() -> {
                    View parent = (View) overlay.getParent();
                    if (parent instanceof FrameLayout) {
                        ((FrameLayout) parent).removeView(overlay);
                    } else {
                        overlay.setVisibility(View.GONE);
                    }
                })
                .start();
    }

    private int dpToPx(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private boolean handleExternalUrl(Uri uri) {
        String scheme = uri.getScheme();
        if (scheme == null) {
            return false;
        }

        if (scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https")) {
            return false;
        }

        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
            return true;
        } catch (Exception ex) {
            return false;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == FILE_CHOOSER_REQUEST_CODE && filePathCallback != null) {
            Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) {
            webView.saveState(outState);
        }
        super.onSaveInstanceState(outState);
    }
}
