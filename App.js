import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  BackHandler,
  Platform,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Dimensions,
  Animated,
  Linking,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TARGET_URL = 'https://app.talentrayz.com/en/login';

// High-end Universal Monkey-Patch script to catch programmatic downloads in the WebView
const WEBVIEW_INJECTED_JS = `
  (function() {
    // Hook dynamically created anchor click events
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      const href = this.href;
      const download = this.getAttribute('download') || this.download;
      
      if (download || href.startsWith('blob:') || href.startsWith('data:') || href.includes('download') || href.includes('template')) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'DOWNLOAD_INTERCEPTED',
          url: href,
          filename: download || 'template.csv'
        }));
        return; // Intercept and block default browser actions
      }
      originalClick.apply(this, arguments);
    };

    // Hook window.open for download queries
    const originalOpen = window.open;
    window.open = function(url, target, features) {
      if (url && (url.includes('download') || url.includes('template') || url.endsWith('.csv') || url.endsWith('.pdf'))) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'DOWNLOAD_INTERCEPTED',
          url: url,
          filename: 'template.csv'
        }));
        return null;
      }
      return originalOpen.apply(this, arguments);
    };
  })();
  true;
`;

export default function App() {
  const webViewRef = useRef(null);

  // States
  const [isConnected, setIsConnected] = useState(true);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isProgressVisible, setIsProgressVisible] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(TARGET_URL);

  // Animated values for premium micro-animations
  const offlineFadeAnim = useRef(new Animated.Value(0)).current;
  const progressFadeAnim = useRef(new Animated.Value(0)).current;

  // Track network state changes in real time
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isNetConnected = state.isConnected !== false;
      setIsConnected(isNetConnected);
      
      // If internet is lost, show the premium offline screen
      if (!isNetConnected) {
        setIsOfflineMode(true);
      } else {
        setIsOfflineMode(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Animate the offline screen appearance
  useEffect(() => {
    Animated.timing(offlineFadeAnim, {
      toValue: isOfflineMode ? 1 : 0,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [isOfflineMode]);

  // Handle Android hardware back button inside the WebView
  useEffect(() => {
    const handleBackPress = () => {
      if (webViewRef.current && canGoBack) {
        webViewRef.current.goBack();
        return true; // Stop default OS back action (exiting app)
      }
      return false; // Allow default OS action (exiting app)
    };

    let subscription;
    if (Platform.OS === 'android') {
      subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    }

    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [canGoBack]);

  // Handle Web Page progress bar animations
  useEffect(() => {
    Animated.timing(progressFadeAnim, {
      toValue: isProgressVisible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isProgressVisible]);

  // WebView navigation state updates
  const handleNavigationStateChange = useCallback((navState) => {
    setCanGoBack(navState.canGoBack);
    setCurrentUrl(navState.url);
  }, []);

  // WebView loading progress updates
  const handleLoadProgress = useCallback(({ nativeEvent }) => {
    setProgress(nativeEvent.progress);
  }, []);

  const handleLoadStart = useCallback(() => {
    setIsProgressVisible(true);
    setProgress(0);
  }, []);

  const handleLoadEnd = useCallback(() => {
    setIsProgressVisible(false);
    setIsLoading(false);
  }, []);

  // Triggered on connection error, SSL failure, DNS issues
  const handleWebViewError = useCallback((syntheticEvent) => {
    const { nativeEvent } = syntheticEvent;
    console.warn('WebView failed to load page: ', nativeEvent.description);
    setIsOfflineMode(true);
    setIsLoading(false);
  }, []);

  // Intercept file downloads and hand them off to the native system browser
  const handleShouldStartLoadWithRequest = useCallback((request) => {
    const { url } = request;
    
    const isDownload = 
      url.toLowerCase().endsWith('.csv') ||
      url.toLowerCase().endsWith('.pdf') ||
      url.toLowerCase().endsWith('.xlsx') ||
      url.toLowerCase().endsWith('.xls') ||
      url.toLowerCase().endsWith('.zip') ||
      url.includes('download') ||
      url.includes('template');

    if (isDownload && webViewRef.current) {
      // Direct clicks: Hand them over to the same downloader
      handleDownloadTrigger(url, url.split('/').pop().split('?')[0] || 'template.csv');
      return false; // Block internal WebView rendering
    }
    
    return true; // Allow normal page navigation
  }, []);

  // Universal helper to trigger and bundle downloads from the WebView session
  const handleDownloadTrigger = useCallback((url, filename) => {
    if (!webViewRef.current) return;

    if (url.startsWith('data:')) {
      handleDataUrlDownload(url, filename);
    } else {
      const downloadJS = `
        (async () => {
          try {
            const response = await fetch('${url}');
            const blob = await response.blob();
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64data = reader.result.split(',')[1];
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'DOWNLOAD_FILE_SUCCESS',
                base64: base64data,
                filename: '${filename}'
              }));
            };
            reader.readAsDataURL(blob);
          } catch (error) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'DOWNLOAD_FILE_ERROR',
              error: error.message
            }));
          }
        })();
        true;
      `;
      webViewRef.current.injectJavaScript(downloadJS);
    }
  }, []);

  // Write base64 or raw data from data: URLs natively
  const handleDataUrlDownload = useCallback(async (dataUrl, filename) => {
    try {
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      if (dataUrl.includes('base64,')) {
        const base64 = dataUrl.split('base64,')[1];
        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else {
        const rawText = decodeURIComponent(dataUrl.split(',')[1]);
        await FileSystem.writeAsStringAsync(fileUri, rawText, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      await Sharing.shareAsync(fileUri, {
        dialogTitle: `Download ${filename}`,
      });
    } catch (error) {
      console.warn('Data URL download error:', error);
    }
  }, []);

  // Handle messages posted from the WebView (e.g. downloaded files)
  const handleMessage = useCallback(async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'DOWNLOAD_INTERCEPTED') {
        const { url, filename } = data;
        handleDownloadTrigger(url, filename);
      } else if (data.type === 'DOWNLOAD_FILE_SUCCESS') {
        const { base64, filename } = data;
        const fileUri = `${FileSystem.documentDirectory}${filename}`;
        
        await FileSystem.writeAsStringAsync(fileUri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        await Sharing.shareAsync(fileUri, {
          dialogTitle: `Download ${filename}`,
        });
      } else if (data.type === 'DOWNLOAD_FILE_ERROR') {
        console.warn('WebView file download error:', data.error);
        Alert.alert('Download Failed', 'We were unable to download this file template.');
      }
    } catch (e) {
      // Ignore normal web messages
    }
  }, []);

  // Check network manually and refresh the page when user clicks "Try Again"
  const handleRetry = async () => {
    setIsLoading(true);
    const netState = await NetInfo.fetch();
    const isNowConnected = netState.isConnected !== false;

    setIsConnected(isNowConnected);

    if (isNowConnected) {
      setIsOfflineMode(false);
      if (webViewRef.current) {
        // If webview is on a broken page or failed, reload it
        webViewRef.current.reload();
      }
    } else {
      setIsLoading(false);
      // Brief wiggle or animation can go here to show retry was hit
      Animated.sequence([
        Animated.timing(offlineFadeAnim, { toValue: 0.8, duration: 80, useNativeDriver: true }),
        Animated.timing(offlineFadeAnim, { toValue: 1.0, duration: 80, useNativeDriver: true }),
      ]).start();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" translucent={true} />

      {/* Main WebView Port */}
      <View style={styles.container}>
        <WebView
          ref={webViewRef}
          source={{ uri: TARGET_URL }}
          style={styles.webView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          allowsBackForwardNavigationGestures={true}
          scalesPageToFit={true}
          mixedContentMode="always"
          cacheEnabled={true}
          originWhitelist={['*']}
          onNavigationStateChange={handleNavigationStateChange}
          onLoadProgress={handleLoadProgress}
          onLoadStart={handleLoadStart}
          onLoadEnd={handleLoadEnd}
          onError={handleWebViewError}
          onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
          onMessage={handleMessage}
          injectedJavaScript={WEBVIEW_INJECTED_JS}
          onFileDownload={({ nativeEvent: { downloadUrl } }) => {
            if (downloadUrl) {
              Linking.openURL(downloadUrl).catch((err) =>
                console.warn('Failed to open file download:', err)
              );
            }
          }}
          renderLoading={() => (
            // Built-in loading view
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4F46E5" />
              <Text style={styles.loadingText}>Connecting to LearnHub...</Text>
            </View>
          )}
        />

        {/* Sleek Progress Bar at top of screen (similar to mobile Chrome/Safari) */}
        {isProgressVisible && (
          <Animated.View 
            style={[
              styles.progressBarContainer, 
              { opacity: progressFadeAnim }
            ]}
          >
            <View 
              style={[
                styles.progressBarFill, 
                { width: `${progress * 100}%` }
              ]} 
            />
          </Animated.View>
        )}

        {/* Custom Overlay Spinner for route changes or background loads */}
        {isLoading && !isOfflineMode && !isProgressVisible && (
          <View style={styles.overlayLoader}>
            <ActivityIndicator size="large" color="#4F46E5" />
          </View>
        )}

        {/* Premium Offline / Error Screen Overlay */}
        {isOfflineMode && (
          <Animated.View 
            style={[
              styles.offlineOverlay, 
              { opacity: offlineFadeAnim }
            ]}
            pointerEvents={isOfflineMode ? 'auto' : 'none'}
          >
            <View style={styles.offlineCard}>
              <View style={styles.offlineIconContainer}>
                <View style={styles.offlineIconRing1}>
                  <View style={styles.offlineIconRing2}>
                    {/* Visual custom-crafted Wi-Fi disconnected icon */}
                    <Text style={styles.wifiIcon}>📶</Text>
                    <View style={styles.crossLine} />
                  </View>
                </View>
              </View>

              <Text style={styles.offlineTitle}>No Connection</Text>
              <Text style={styles.offlineDesc}>
                Your device is currently offline. Please check your Wi-Fi or cellular network and try again.
              </Text>

              <View style={styles.tipsContainer}>
                <Text style={styles.tipItem}>• Check if Wi-Fi or Mobile Data is on</Text>
                <Text style={styles.tipItem}>• Verify airplane mode is disabled</Text>
              </View>

              <TouchableOpacity 
                style={styles.retryButton} 
                onPress={handleRetry}
                activeOpacity={0.8}
              >
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.copyrightText}>© 2026 TalentRayz Demo App</Text>
          </Animated.View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0,
  },
  container: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#F8FAFC',
  },
  webView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  // Sleek progress bar
  progressBarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#E2E8F0',
    zIndex: 9999,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4F46E5', // Premium Indigo
  },
  // Initial loading spinner
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  loadingText: {
    marginTop: 15,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  // Overlay loader for subtle actions
  overlayLoader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 90,
  },
  // Premium offline screen
  offlineOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F1F5F9', // Sleek light gray
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000,
    paddingHorizontal: 24,
  },
  offlineCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 36,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 15,
    elevation: 8, // Native Android shadow
  },
  offlineIconContainer: {
    marginBottom: 20,
  },
  offlineIconRing1: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#FEE2E2', // Crimson-light
    justifyContent: 'center',
    alignItems: 'center',
  },
  offlineIconRing2: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FCA5A5', // Red-lighter
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  wifiIcon: {
    fontSize: 28,
  },
  crossLine: {
    position: 'absolute',
    width: 46,
    height: 4,
    backgroundColor: '#EF4444', // Danger red line
    borderRadius: 2,
    transform: [{ rotate: '-45deg' }],
  },
  offlineTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A', // Dark Slate
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  offlineDesc: {
    fontSize: 14,
    color: '#64748B', // Muted Gray text
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  tipsContainer: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    marginBottom: 28,
  },
  tipItem: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 6,
  },
  retryButton: {
    width: '100%',
    height: 48,
    backgroundColor: '#4F46E5', // Premium Indigo Action Button
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  copyrightText: {
    position: 'absolute',
    bottom: 24,
    fontSize: 11,
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
});
