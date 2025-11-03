// Background Service Worker for SpeakFlow
// 处理TTS播放和循环，即使popup关闭也能继续

class BackgroundTTSPlayer {
    constructor() {
        this.isPlaying = false;
        this.currentUtterance = null;
        this.shouldLoop = false;
        this.fallbackCheckInterval = null;
        this.estimatedDuration = 0;
        this.playbackStartTime = null;
        this.eventListenerAdded = false;
        this.heartbeatInterval = null;
        this.ttsEventHandler = null;
        
        // 监听来自popup的消息
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true;
        });
        
        // 监听扩展安装/启动
        chrome.runtime.onStartup.addListener(() => {
            console.log('Background: 扩展启动');
        });
        
        chrome.runtime.onInstalled.addListener(() => {
            console.log('Background: 扩展已安装');
        });
        
        // 定期发送心跳，保持service worker活跃
        this.heartbeatInterval = setInterval(() => {
            if (this.isPlaying) {
                console.log('Background: 心跳 - 正在播放中');
                chrome.storage.local.set({
                    'tts_isPlaying': this.isPlaying,
                    'tts_shouldLoop': this.shouldLoop,
                    'tts_utterance': this.currentUtterance,
                    'tts_estimatedDuration': this.estimatedDuration
                });
            }
        }, 10000);
        
        console.log('SpeakFlow Background Script 已启动');
        
        // 尝试恢复之前的播放状态
        this.restorePlaybackState();
    }
    
    restorePlaybackState() {
        chrome.storage.local.get([
            'tts_isPlaying', 
            'tts_shouldLoop', 
            'tts_utterance',
            'tts_estimatedDuration'
        ], (result) => {
            if (result.tts_isPlaying && result.tts_utterance) {
                console.log('Background: 检测到未完成的播放，恢复状态');
                this.isPlaying = result.tts_isPlaying;
                this.shouldLoop = result.tts_shouldLoop || false;
                this.currentUtterance = result.tts_utterance;
                this.estimatedDuration = result.tts_estimatedDuration || 0;
            }
        });
    }
    
    handleMessage(message, sender, sendResponse) {
        console.log('Background收到消息:', message.type);
        
        try {
            let response;
            
            switch (message.type) {
                case 'play':
                    this.play(message.text, message.options, message.shouldLoop);
                    response = { success: true };
                    break;
                    
                case 'stop':
                    this.stop();
                    response = { success: true };
                    break;
                    
                case 'getStatus':
                    response = { 
                        isPlaying: this.isPlaying,
                        shouldLoop: this.shouldLoop 
                    };
                    break;
                    
                default:
                    response = { success: false, error: 'Unknown message type' };
            }
            
            if (sendResponse) {
                sendResponse(response);
            }
        } catch (error) {
            console.error('处理消息时出错:', error);
            if (sendResponse) {
                sendResponse({ success: false, error: error.message });
            }
        }
        
        return true;
    }
    
    play(text, options, shouldLoop) {
        console.log('Background: 开始播放', text.substring(0, 20) + '...');
        
        this.stop();
        
        this.isPlaying = true;
        this.shouldLoop = shouldLoop;
        this.currentUtterance = { text, options };
        
        // 估算播放时长
        const speedValue = options.rate || 1.0;
        this.estimatedDuration = Math.max(2, (text.length * 0.1) / speedValue);
        this.playbackStartTime = Date.now();
        
        // 监听TTS事件（每次播放时都确保监听器存在）
        if (chrome.tts) {
            if (this.ttsEventHandler) {
                chrome.tts.onEvent.removeListener(this.ttsEventHandler);
            }
            
            this.ttsEventHandler = (event) => {
                this.handleTTSEvent(event);
            };
            
            chrome.tts.onEvent.addListener(this.ttsEventHandler);
            console.log('Background: TTS事件监听器已注册');
        }
        
        // 开始播放
        this.startPlayback(text, options);
    }
    
    startPlayback(text, options) {
        console.log('Background: 调用chrome.tts.speak');
        
        try {
            chrome.tts.speak(text, options, () => {
                if (chrome.runtime.lastError) {
                    console.error('Background TTS错误:', chrome.runtime.lastError);
                    this.isPlaying = false;
                    this.shouldLoop = false;
                } else {
                    console.log('Background: TTS播放已启动');
                    this.startFallbackCheck();
                }
            });
        } catch (error) {
            console.error('Background speak异常:', error);
            this.isPlaying = false;
            this.shouldLoop = false;
        }
    }
    
    handleTTSEvent(event) {
        if (!event) return;
        
        console.log('Background TTS事件:', event.type);
        
        if (event.type === 'end' || event.type === 'error') {
            if (event.type === 'error') {
                console.error('Background TTS错误事件:', event);
                this.isPlaying = false;
                this.shouldLoop = false;
            } else {
                console.log('Background: 播放结束，shouldLoop:', this.shouldLoop);
                this.stopFallbackCheck();
                this.handlePlaybackEnd();
            }
        }
    }
    
    handlePlaybackEnd() {
        if (!this.isPlaying) {
            return;
        }
        
        if (this.shouldLoop && this.currentUtterance) {
            console.log('Background: 准备循环播放');
            setTimeout(() => {
                if (this.isPlaying && this.shouldLoop && this.currentUtterance) {
                    console.log('Background: 开始循环播放');
                    
                    this.playbackStartTime = Date.now();
                    const speedValue = this.currentUtterance.options.rate || 1.0;
                    this.estimatedDuration = Math.max(2, (this.currentUtterance.text.length * 0.1) / speedValue);
                    
                    this.startPlayback(this.currentUtterance.text, this.currentUtterance.options);
                }
            }, 500);
        } else {
            console.log('Background: 单次播放完成');
            this.isPlaying = false;
        }
    }
    
    startFallbackCheck() {
        this.stopFallbackCheck();
        
        const checkDelay = (this.estimatedDuration + 0.5) * 1000;
        console.log('Background: 启动备用检查，将在', checkDelay, 'ms后检查');
        
        this.fallbackCheckInterval = setTimeout(() => {
            if (this.isPlaying && this.shouldLoop) {
                console.log('Background: 备用检查触发，准备循环');
                this.handlePlaybackEnd();
            } else if (this.isPlaying && !this.shouldLoop) {
                this.isPlaying = false;
            }
        }, checkDelay);
    }
    
    stopFallbackCheck() {
        if (this.fallbackCheckInterval) {
            clearTimeout(this.fallbackCheckInterval);
            this.fallbackCheckInterval = null;
        }
    }
    
    stop() {
        console.log('Background: 停止播放');
        this.isPlaying = false;
        this.shouldLoop = false;
        this.stopFallbackCheck();
        
        if (chrome.tts) {
            chrome.tts.stop();
        }
        
        this.currentUtterance = null;
        
        chrome.storage.local.remove([
            'tts_isPlaying',
            'tts_shouldLoop', 
            'tts_utterance',
            'tts_estimatedDuration'
        ]);
    }
}

// 初始化
const player = new BackgroundTTSPlayer();

