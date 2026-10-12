package com.royalaashishking.rakai;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.content.ContentValues;
import android.net.Uri;
import android.provider.MediaStore;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Matrix;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://rakeditingstudio.github.io/Rakeditingstudio/";
    private static final String PHOTO_TOOL_URL = "https://labs.google/fx/tools/flow";
    private static final String VIDEO_TOOL_URL = "https://labs.google/fx/tools/flow";
    private LinearLayout root;
    private Bitmap originalBitmap, editedBitmap;
    private ImageView photoPreview;
    private TextView editStatus;
    private int filterIndex = 0;
    private WebView webView;
    private EditText promptDetails;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(8,8,8));
        getWindow().setNavigationBarColor(Color.rgb(8,8,8));
        showHome();
    }

    private int dp(float n) { return (int)(n * getResources().getDisplayMetrics().density + 0.5f); }
    private TextView text(String s, int size, int color) {
        TextView t = new TextView(this); t.setText(s); t.setTextSize(size); t.setTextColor(color);
        t.setPadding(dp(4),dp(6),dp(4),dp(6)); return t;
    }
    private Button button(String label, Runnable action) {
        Button b = new Button(this); b.setText(label); b.setAllCaps(false);
        b.setOnClickListener(v -> action.run());
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1,-2); p.setMargins(0,dp(5),0,dp(5)); b.setLayoutParams(p);
        return b;
    }
    private void setup(String title) {
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(8,8,8)); root.setPadding(dp(16),dp(12),dp(16),dp(16));
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true);
        scroll.addView(root); setContentView(scroll);
        TextView heading = text("◆  RAK AI  |  " + title, 22, Color.rgb(243,189,84));
        heading.setGravity(Gravity.CENTER_VERTICAL); heading.setPadding(dp(4),dp(12),dp(4),dp(18)); root.addView(heading);
    }
    private void showHome() {
        setup("ROYAL STUDIO");
        root.addView(text("Create • Edit • Inspire",17,Color.WHITE));
        root.addView(text("RAK Editing Studio by Royal Aashish King",14,Color.LTGRAY));
        root.addView(button("📷  Photo Editor — edit and save your photos", this::showEditor));
        root.addView(button("✨  AI Photo Generator", () -> showGenerator(false)));
        root.addView(button("🎬  AI Video Generator", () -> showGenerator(true)));
        root.addView(button("🌐  Open RAK Editing Studio website inside app", this::showWebsite));
        root.addView(button("🤖  RAK AI Assistant", () -> showWebsiteAt("#rakgpt")));
        root.addView(text("Photo Editor works on-device. AI image/video generation needs a connected generation service; the generator screen prepares prompts and opens an available AI tool.",12,Color.GRAY));
    }
    private void showEditor() {
        setup("PHOTO EDITOR");
        root.addView(button("Choose photo from Gallery", this::pickPhoto));
        photoPreview = new ImageView(this); photoPreview.setAdjustViewBounds(true); photoPreview.setScaleType(ImageView.ScaleType.FIT_CENTER);
        photoPreview.setBackgroundColor(Color.rgb(20,20,20));
        LinearLayout.LayoutParams img = new LinearLayout.LayoutParams(-1,dp(320)); img.setMargins(0,dp(8),0,dp(8)); root.addView(photoPreview,img);
        editStatus = text("Choose a photo to begin editing.",13,Color.LTGRAY); root.addView(editStatus);
        root.addView(button("Brightness +", () -> applyAdjust(1.12f, 0f)));
        root.addView(button("Dark cinematic", () -> applyAdjust(0.82f, 0f)));
        root.addView(button("Warm / royal tone", () -> applyWarm()));
        root.addView(button("Black & white", () -> applyGray()));
        root.addView(button("Rotate 90°", () -> rotatePhoto()));
        root.addView(button("Add RAK EDITING STUDIO watermark", () -> addWatermark()));
        root.addView(button("Save edited photo to Gallery", () -> savePhoto()));
        root.addView(button("← Back to RAK AI home", this::showHome));
    }
    private void pickPhoto() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT); i.setType("image/*"); i.addCategory(Intent.CATEGORY_OPENABLE);
        startActivityForResult(i, 41);
    }
    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req,res,data);
        if(req==41 && res==RESULT_OK && data!=null && data.getData()!=null) {
            try {
                Uri uri=data.getData(); getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                InputStream in=getContentResolver().openInputStream(uri);
                originalBitmap=BitmapFactory.decodeStream(in); if(in!=null)in.close();
                editedBitmap=originalBitmap.copy(Bitmap.Config.ARGB_8888,true); filterIndex=0;
                if(photoPreview!=null) photoPreview.setImageBitmap(editedBitmap);
                if(editStatus!=null) editStatus.setText("Photo loaded. Choose an edit, then save to Gallery.");
            } catch(Exception e) { toast("Could not open this photo. Try another image."); }
        }
    }
    private boolean ready() { if(editedBitmap==null){toast("Pehle Gallery se photo choose karo.");return false;} return true; }
    private void showBitmap() { if(photoPreview!=null) photoPreview.setImageBitmap(editedBitmap); }
    private void applyAdjust(float factor,float ignored) {
        if(!ready())return;
        Bitmap out=Bitmap.createBitmap(editedBitmap.getWidth(),editedBitmap.getHeight(),Bitmap.Config.ARGB_8888);
        Canvas c=new Canvas(out); Paint p=new Paint(3);
        android.graphics.ColorMatrix cm=new android.graphics.ColorMatrix(new float[]{factor,0,0,0,0, 0,factor,0,0,0, 0,0,factor,0,0, 0,0,0,1,0});
        p.setColorFilter(new android.graphics.ColorMatrixColorFilter(cm)); c.drawBitmap(editedBitmap,0,0,p);
        editedBitmap=out;showBitmap();editStatus.setText("Adjustment applied. You can apply another effect or save.");
    }
    private void applyWarm() {
        if(!ready())return;
        Bitmap out=Bitmap.createBitmap(editedBitmap.getWidth(),editedBitmap.getHeight(),Bitmap.Config.ARGB_8888);
        Canvas c=new Canvas(out); Paint p=new Paint(3);
        p.setColorFilter(new android.graphics.ColorMatrixColorFilter(new float[]{1.08f,0,0,0,5, 0,1.0f,0,0,1, 0,0,0.88f,0,-4, 0,0,0,1,0}));
        c.drawBitmap(editedBitmap,0,0,p); editedBitmap=out;showBitmap();editStatus.setText("Warm royal tone applied.");
    }
    private void applyGray() {
        if(!ready())return;
        Bitmap out=Bitmap.createBitmap(editedBitmap.getWidth(),editedBitmap.getHeight(),Bitmap.Config.ARGB_8888);
        Canvas c=new Canvas(out);Paint p=new Paint(3);android.graphics.ColorMatrix cm=new android.graphics.ColorMatrix();cm.setSaturation(0);
        p.setColorFilter(new android.graphics.ColorMatrixColorFilter(cm));c.drawBitmap(editedBitmap,0,0,p);editedBitmap=out;showBitmap();editStatus.setText("Black & white applied.");
    }
    private void rotatePhoto() {
        if(!ready())return;
        Matrix m=new Matrix();m.postRotate(90);editedBitmap=Bitmap.createBitmap(editedBitmap,0,0,editedBitmap.getWidth(),editedBitmap.getHeight(),m,true);showBitmap();editStatus.setText("Rotated 90 degrees.");
    }
    private void addWatermark() {
        if(!ready())return;
        Bitmap out=editedBitmap.copy(Bitmap.Config.ARGB_8888,true);Canvas c=new Canvas(out);Paint p=new Paint(3);
        p.setColor(Color.WHITE);p.setAlpha(210);p.setTextSize(Math.max(18,out.getWidth()*0.035f));p.setShadowLayer(3,1,1,Color.BLACK);
        String mark="Royal Aashish King";c.drawText(mark,dp(16),out.getHeight()-dp(22),p);
        editedBitmap=out;showBitmap();editStatus.setText("Watermark added.");
    }
    private void savePhoto() {
        if(!ready())return;
        OutputStream out=null;
        try {
            String stamp=new SimpleDateFormat("yyyyMMdd_HHmmss",Locale.US).format(new Date());
            ContentValues values=new ContentValues();values.put(MediaStore.Images.Media.DISPLAY_NAME,"RAK_Edit_"+stamp+".jpg");values.put(MediaStore.Images.Media.MIME_TYPE,"image/jpeg");
            if(Build.VERSION.SDK_INT>=29) values.put(MediaStore.Images.Media.RELATIVE_PATH,"Pictures/RAK Editing Studio");
            Uri uri=getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI,values);
            if(uri==null)throw new Exception("Gallery unavailable");
            out=getContentResolver().openOutputStream(uri);editedBitmap.compress(Bitmap.CompressFormat.JPEG,94,out);out.flush();
            toast("Saved in Gallery → Pictures/RAK Editing Studio");
        } catch(Exception e){toast("Save failed: "+e.getMessage());}
        finally{try{if(out!=null)out.close();}catch(Exception ignored){}}
    }
    private void showGenerator(boolean video) {
        setup(video ? "AI VIDEO GENERATOR" : "AI PHOTO GENERATOR");
        root.addView(text(video ? "Build a cinematic video prompt" : "Build a photo generation prompt",18,Color.WHITE));
        root.addView(text(video ? "Video type: 10-second cinematic reel / logo reveal / photo-to-video" : "Photo style: realistic portrait / royal black & gold / profile photo / festival poster",13,Color.LTGRAY));
        promptDetails=new EditText(this);promptDetails.setTextColor(Color.WHITE);promptDetails.setHintTextColor(Color.GRAY);
        promptDetails.setHint(video?"Describe the scene, motion, camera movement…":"Describe the subject, style, background, lighting…");
        promptDetails.setMinLines(3);promptDetails.setGravity(Gravity.TOP);promptDetails.setPadding(dp(12),dp(12),dp(12),dp(12));promptDetails.setBackgroundColor(Color.rgb(25,25,25));root.addView(promptDetails);
        TextView output=text("",14,Color.WHITE);output.setBackgroundColor(Color.rgb(20,20,20));output.setPadding(dp(12),dp(12),dp(12),dp(12));root.addView(output);
        root.addView(button("Generate prompt", () -> {
            String details=promptDetails.getText().toString().trim();
            String p=video
             ? "Create a polished 10-second cinematic video in 9:16 vertical format. Premium black and gold look, smooth camera movement, consistent subject, realistic motion, clean transitions, crisp final frame. Scene: "+details+". Avoid flicker, warped objects and random text."
             : "Create a high-quality, realistic AI photo in a premium royal black-and-gold cinematic style. Detailed lighting, natural textures, sharp subject, balanced composition. Preserve the reference person's identity and face if a reference image is provided. Scene/details: "+details+".";
            output.setText(p);
        }));
        root.addView(button("Open Google Flow (actual AI generation)", () -> openExternal(video?VIDEO_TOOL_URL:PHOTO_TOOL_URL)));
        root.addView(text("Important: this screen creates the prompt, not the final generated media. Actual photo/video generation requires an AI provider/API that supports it; Google Flow may require sign-in and availability in your account/region.",12,Color.rgb(220,190,130)));
        root.addView(button("← Back to RAK AI home", this::showHome));
    }
    private void showWebsite() { showWebsiteAt(""); }
    private void showWebsiteAt(String anchor) {
        setup("WEBSITE");
        root.removeAllViews();
        webView=new WebView(this);webView.setBackgroundColor(Color.rgb(8,8,8));
        WebSettings s=webView.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setLoadsImagesAutomatically(true);s.setMediaPlaybackRequiresUserGesture(true);
        webView.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView v, android.webkit.WebResourceRequest r){
            Uri u=r.getUrl();String h=u.getHost();if(h!=null&&(h.equals("rakeditingstudio.github.io")||h.endsWith(".github.io")))return false;
            openExternal(u.toString());return true;
        }});
        root.addView(webView,new LinearLayout.LayoutParams(-1,0,1));
        root.addView(button("← Back to RAK AI home",this::showHome));
        webView.loadUrl(HOME_URL+anchor);
    }
    private void openExternal(String url) {
        try {startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));} catch(Exception e){toast("Could not open link.");}
    }
    private void toast(String s){Toast.makeText(this,s,Toast.LENGTH_LONG).show();}
    @Override public void onBackPressed(){showHome();}
}