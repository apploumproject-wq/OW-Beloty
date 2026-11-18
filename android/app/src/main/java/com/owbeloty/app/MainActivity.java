package com.owbeloty.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalHotspotPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
