// Background Service Worker for SpeakFlow
// 处理TTS播放和循环，即使popup关闭也能继续

class BackgroundTTSPlayer {
    constructor() {
        this.isPlaying = false;
        this.currentUtterance = null;
        this.shouldLoop = false;
        this.fallbackCheckInterval = null;
        this.keepAliveInterval = null;
        this.loopProtectionTimer = null;
        this.estimatedDuration = 0;
        this.playbackStartTime = null;
        this.eventListenerAdded = false;
        this.heartbeatInterval = null;
        this.ttsEventHandler = null;
        this.loopCount = 0;
        this.currentAudio = null; // 用于存储当前播放的Audio对象
        this.isAudioMode = false; // 标记是否使用音频播放模式
        this.isHandlingPlaybackEnd = false; // 防止重复处理播放结束事件
        
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
        // 播放时更频繁（3秒），非播放时较慢（15秒）
        this.heartbeatInterval = setInterval(() => {
            this.keepAlive();
        }, 3000);
        
        console.log('SpeakFlow Background Script 已启动');
        
        // 尝试恢复之前的播放状态
        this.restorePlaybackState();
        
        // 监听 Service Worker 可能被挂起的情况
        self.addEventListener('activate', () => {
            console.log('Background: Service Worker 被激活');
        });
    }
    
    keepAlive() {
        // 执行一些操作来保持 Service Worker 活跃
        if (this.isPlaying) {
            // 保存状态，这会保持 Service Worker 活跃
            chrome.storage.local.set({
                'tts_isPlaying': this.isPlaying,
                'tts_shouldLoop': this.shouldLoop,
                'tts_utterance': this.currentUtterance,
                'tts_estimatedDuration': this.estimatedDuration,
                'tts_keepAlive': Date.now() // 时间戳，确保每次都有变化
            }).then(() => {
                // 静默成功，不打印日志（减少控制台噪音）
            }).catch(() => {
                // 忽略错误
            });
        } else {
            // 即使不在播放，也偶尔操作 storage 来保持活跃
            chrome.storage.local.set({
                'tts_keepAlive': Date.now()
            }).catch(() => {});
        }
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
                    
                case 'playAudio':
                    // AI语音现在通过offscreen播放，这里转发消息
                    try {
                        console.log('Background: 转发消息到offscreen, base64Audio长度:', message.base64Audio?.length);
                        // 转发到offscreen文档
                        chrome.runtime.sendMessage({
                            type: 'playAudio',
                            base64Audio: message.base64Audio,
                            shouldLoop: message.shouldLoop
                        }, (response) => {
                            if (chrome.runtime.lastError) {
                                console.error('Background: 转发到offscreen失败:', chrome.runtime.lastError.message);
                            } else {
                                console.log('Background: offscreen响应:', response);
                            }
                        });
                        response = { success: true };
                    } catch (error) {
                        console.error('Background: playAudio消息处理异常:', error);
                        response = { success: false, error: error.message || '播放失败' };
                    }
                    break;
                    
                case 'stopAudio':
                    // 停止AI语音（转发到offscreen）
                    try {
                        chrome.runtime.sendMessage({ type: 'stopAudio' }, (offscreenResponse) => {
                            if (chrome.runtime.lastError) {
                                console.warn('Background: 停止offscreen音频失败（可能文档不存在）:', chrome.runtime.lastError.message);
                            } else {
                                console.log('Background: Offscreen音频已停止');
                            }
                        });
                        response = { success: true };
                    } catch (error) {
                        console.error('Background: stopAudio异常:', error);
                        response = { success: true }; // 即使失败也返回成功，避免阻塞
                    }
                    break;
                    
                case 'stop':
                    this.stop();
                    // 同时停止offscreen的播放
                    try {
                        chrome.runtime.sendMessage({ type: 'stopAudio' }, (offscreenResponse) => {
                            if (chrome.runtime.lastError) {
                                console.warn('Background: 停止offscreen音频失败（可能文档不存在）:', chrome.runtime.lastError.message);
                            } else {
                                console.log('Background: Offscreen音频已停止');
                            }
                        });
                    } catch (error) {
                        console.error('Background: stop时停止offscreen异常:', error);
                    }
                    response = { success: true };
                    break;
                    
                case 'getStatus':
                    response = { 
                        isPlaying: this.isPlaying,
                        shouldLoop: this.shouldLoop 
                    };
                    break;
                    
                case 'checkAIAudioStatus':
                    // 检查AI音频播放状态（通过发送消息到offscreen检查）
                    chrome.runtime.sendMessage({ type: 'getAudioStatus' }, (offscreenResponse) => {
                        if (sendResponse) {
                            if (offscreenResponse && offscreenResponse.isPlaying) {
                                sendResponse({ isPlaying: true });
                            } else {
                                sendResponse({ isPlaying: false });
                            }
                        }
                    });
                    return true; // 异步响应
                    
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
        console.log('Background: 开始播放', text.substring(0, 20) + '...', 'shouldLoop:', shouldLoop);
        
        this.stop();
        
        this.isPlaying = true;
        this.shouldLoop = shouldLoop;
        this.currentUtterance = { text, options };
        this.loopCount = 0; // 重置循环计数
        
        // 改进的播放时长估算（考虑不同语言的字符特点）
        const speedValue = options.rate || 1.0;
        // 日语/中文：每个字符约0.15秒；英文/其他：每个字符约0.08秒
        const lang = options.lang || '';
        const isCJK = /^(ja|zh|ko)/i.test(lang);
        const charsPerSecond = isCJK ? 6.5 : 12.5; // 字符/秒（1.0倍速）
        const estimatedChars = text.length;
        this.estimatedDuration = Math.max(3, (estimatedChars / charsPerSecond) / speedValue);
        console.log('Background: 估算播放时长', this.estimatedDuration, '秒（语言:', lang, ', 倍速:', speedValue, ', 字符数:', estimatedChars, ')');
        this.playbackStartTime = Date.now();
        
        // 监听TTS事件（每次播放时都确保监听器存在）
        if (chrome.tts) {
            if (this.ttsEventHandler) {
                try {
                    chrome.tts.onEvent.removeListener(this.ttsEventHandler);
                } catch (e) {
                    // 忽略错误
                }
            }
            
            this.ttsEventHandler = (event) => {
                this.handleTTSEvent(event);
            };
            
            chrome.tts.onEvent.addListener(this.ttsEventHandler);
            console.log('Background: TTS事件监听器已注册');
        }
        
        // 保存状态
        this.keepAlive();
        
        // 开始播放
        this.startPlayback(text, options);
    }
    
    startPlayback(text, options) {
        console.log('Background: ========== 调用chrome.tts.speak ==========');
        console.log('Background: 文本长度:', text.length, '选项:', JSON.stringify(options));
        console.log('Background: 当前状态 - isPlaying:', this.isPlaying, 'shouldLoop:', this.shouldLoop, 'loopCount:', this.loopCount);
        
        // 更新播放开始时间
        this.playbackStartTime = Date.now();
        
        // 确保事件监听器存在
        if (chrome.tts) {
            if (!this.ttsEventHandler) {
                this.ttsEventHandler = (event) => {
                    this.handleTTSEvent(event);
                };
            }
            try {
                chrome.tts.onEvent.removeListener(this.ttsEventHandler);
            } catch (e) {
                // 忽略错误
            }
            chrome.tts.onEvent.addListener(this.ttsEventHandler);
            console.log('Background: TTS事件监听器已确认注册');
        }
        
        try {
            chrome.tts.speak(text, options, () => {
                if (chrome.runtime.lastError) {
                    console.error('Background TTS错误:', chrome.runtime.lastError);
                    // 在循环模式下，错误可能是暂时的，继续尝试
                    if (!this.shouldLoop) {
                        this.isPlaying = false;
                        this.shouldLoop = false;
                        this.stopFallbackCheck();
                    } else {
                        console.log('Background: 循环模式下遇到错误，等待下次循环');
                    }
                } else {
                    console.log('Background: TTS播放已启动（回调执行），loopCount:', this.loopCount);
                    // 注意：不在这里启动fallback检查，因为应该在'start'事件中启动
                    // 但如果'start'事件没有触发，我们在回调后延迟启动作为备用
                    setTimeout(() => {
                        // 如果还没收到'start'事件，作为备用启动检查
                        if (this.isPlaying && !this.fallbackCheckInterval) {
                            console.log('Background: 未收到start事件，启动备用检查');
                            this.startFallbackCheck();
                        }
                        // 如果循环模式且还没启动保护，启动循环保护
                        if (this.isPlaying && this.shouldLoop && !this.loopProtectionTimer) {
                            console.log('Background: 未收到start事件，启动循环保护机制');
                            this.startLoopProtection();
                        }
                    }, 500);
                }
            });
        } catch (error) {
            console.error('Background speak异常:', error);
            // 在循环模式下，异常可能是暂时的
            if (!this.shouldLoop) {
                this.isPlaying = false;
                this.shouldLoop = false;
                this.stopFallbackCheck();
            }
        }
    }
    
    handleTTSEvent(event) {
        if (!event) {
            console.warn('Background: 收到空事件');
            return;
        }
        
        console.log('Background TTS事件:', event.type, event, '当前状态: isPlaying=', this.isPlaying, 'shouldLoop=', this.shouldLoop, 'loopCount=', this.loopCount);
        
        // 处理所有可能的事件类型
        if (event.type === 'end') {
            console.log('Background: 播放正常结束，shouldLoop:', this.shouldLoop, 'loopCount:', this.loopCount);
            this.stopFallbackCheck();
            
            // 立即处理结束事件
            this.handlePlaybackEnd();
        } else if (event.type === 'error') {
            console.error('Background TTS错误事件:', event);
            this.stopFallbackCheck();
            // 只有在不是循环模式时才停止，循环模式下错误可能是临时的
            if (!this.shouldLoop) {
                this.isPlaying = false;
                this.shouldLoop = false;
            }
        } else if (event.type === 'start') {
            console.log('Background: 播放已开始（第', (this.loopCount || 0) + 1, '次）');
            // 确保在播放真正开始后才启动fallback检查
            this.stopFallbackCheck();
            this.startFallbackCheck();
            // 同时启动循环保护机制
            if (this.shouldLoop) {
                this.startLoopProtection();
            }
        } else if (event.type === 'interrupted') {
            console.log('Background: 播放被中断');
            // 在循环模式下，中断可能只是暂停，继续尝试循环
            if (!this.shouldLoop) {
                this.stopFallbackCheck();
                this.isPlaying = false;
                this.shouldLoop = false;
            }
        } else if (event.type === 'cancelled') {
            console.log('Background: 播放被取消');
            // 在循环模式下，取消可能是暂时的
            if (!this.shouldLoop) {
                this.stopFallbackCheck();
                this.isPlaying = false;
                this.shouldLoop = false;
            }
        } else {
            console.log('Background: 其他TTS事件:', event.type);
        }
    }
    
    handlePlaybackEnd() {
        console.log('Background: ========== handlePlaybackEnd 被调用 ==========');
        console.log('Background: 当前状态 - isPlaying:', this.isPlaying, 'shouldLoop:', this.shouldLoop, 'loopCount:', this.loopCount);
        console.log('Background: currentUtterance存在:', !!this.currentUtterance);
        
        // 防止重复调用：检查是否正在处理结束事件
        if (this.isHandlingPlaybackEnd) {
            console.log('Background: 正在处理播放结束事件，跳过重复调用');
            return;
        }
        
        // 标记正在处理
        this.isHandlingPlaybackEnd = true;
        
        // 先保存当前状态（防止在setTimeout期间被修改）
        const shouldLoop = this.shouldLoop;
        const utterance = this.currentUtterance;
        
        if (!this.isPlaying) {
            console.log('Background: 播放已停止，退出循环');
            this.isHandlingPlaybackEnd = false;
            return;
        }
        
        // 确保状态保存
        this.keepAlive();
        
        if (shouldLoop && utterance) {
            console.log('Background: ✓ 准备循环播放（shouldLoop=true, utterance存在）');
            
            // 立即更新循环计数
            this.loopCount = (this.loopCount || 0) + 1;
            console.log('Background: 循环计数更新为:', this.loopCount);
            
            // 重新注册事件监听器（在延迟之前就做好）
            if (chrome.tts) {
                if (!this.ttsEventHandler) {
                    // 如果事件处理器丢失，重新创建
                    this.ttsEventHandler = (event) => {
                        this.handleTTSEvent(event);
                    };
                }
                try {
                    chrome.tts.onEvent.removeListener(this.ttsEventHandler);
                } catch (e) {
                    console.warn('Background: 移除监听器时出错（可能不存在）:', e);
                }
                chrome.tts.onEvent.addListener(this.ttsEventHandler);
                console.log('Background: TTS事件监听器已重新注册（准备循环）');
            }
            
            // 使用一个函数来执行循环播放
            const doLoop = () => {
                // 再次检查状态（可能被用户停止）
                console.log('Background: doLoop执行，检查状态...');
                console.log('Background: this.isPlaying:', this.isPlaying, 'shouldLoop:', shouldLoop, 'utterance:', !!utterance);
                
                if (!this.isPlaying || !shouldLoop || !utterance) {
                    console.log('Background: ✗ 循环被取消（isPlaying:', this.isPlaying, 'shouldLoop:', shouldLoop, 'utterance:', !!utterance, ')');
                    return;
                }
                
                // 确保状态
                this.isPlaying = true;
                this.shouldLoop = shouldLoop;
                this.currentUtterance = utterance;
                
                console.log('Background: ✓ 开始循环播放（第', this.loopCount, '次）');
                
                // 重新计算估算时长（使用改进的算法）
                const speedValue = utterance.options.rate || 1.0;
                const lang = utterance.options.lang || '';
                const isCJK = /^(ja|zh|ko)/i.test(lang);
                const charsPerSecond = isCJK ? 6.5 : 12.5;
                const estimatedChars = utterance.text.length;
                this.estimatedDuration = Math.max(3, (estimatedChars / charsPerSecond) / speedValue);
                console.log('Background: 循环播放 - 估算时长', this.estimatedDuration, '秒');
                
                // 保存状态
                this.keepAlive();
                
                // 启动一个基于时间的循环保护机制
                this.startLoopProtection();
                
                // 开始下一次播放
                console.log('Background: 调用startPlayback开始第', this.loopCount, '次循环');
                this.startPlayback(utterance.text, utterance.options);
            };
            
            // 延迟执行
            setTimeout(() => {
                // 清除处理标记（延迟后清除，允许下一次循环）
                this.isHandlingPlaybackEnd = false;
                doLoop();
            }, 300);
        } else {
            console.log('Background: ✗ 单次播放完成（shouldLoop=' + shouldLoop + ', utterance=' + !!utterance + '）');
            this.isHandlingPlaybackEnd = false;
            this.isPlaying = false;
            this.loopCount = 0;
            this.stopLoopProtection();
        }
    }
    
    startLoopProtection() {
        // 停止之前的保护
        this.stopLoopProtection();
        
        if (!this.shouldLoop || !this.currentUtterance) {
            return;
        }
        
        console.log('Background: 启动循环保护机制（基于时间）');
        
        // 基于估算时长 + 10% 边距来设置循环保护
        const protectionDelay = (this.estimatedDuration * 1.1) * 1000;
        
        this.loopProtectionTimer = setTimeout(() => {
            if (this.isPlaying && this.shouldLoop && this.currentUtterance) {
                console.log('Background: ⚠️ 循环保护机制触发（可能没有收到end事件）');
                const elapsed = (Date.now() - this.playbackStartTime) / 1000;
                console.log('Background: 已播放', elapsed.toFixed(1), '秒，估算', this.estimatedDuration.toFixed(1), '秒');
                
                // 防止重复触发：如果正在处理播放结束，跳过
                if (this.isHandlingPlaybackEnd) {
                    console.log('Background: 正在处理播放结束，循环保护跳过');
                    this.startLoopProtection(); // 继续保护
                    return;
                }
                
                // 如果已经播放超过估算时长的80%，认为播放已完成
                if (elapsed >= this.estimatedDuration * 0.8) {
                    console.log('Background: 判定播放已完成，触发循环');
                    if (this.isAudioMode) {
                        this.handleAudioPlaybackEnd();
                    } else {
                        this.handlePlaybackEnd();
                    }
                } else {
                    // 继续等待
                    console.log('Background: 播放时间未到，继续保护');
                    this.startLoopProtection();
                }
            }
        }, protectionDelay);
    }
    
    stopLoopProtection() {
        if (this.loopProtectionTimer) {
            clearTimeout(this.loopProtectionTimer);
            this.loopProtectionTimer = null;
            console.log('Background: 循环保护机制已停止');
        }
    }
    
    startFallbackCheck() {
        this.stopFallbackCheck();
        
        // 增加额外的安全边距（50%），确保不会过早触发
        const checkDelay = (this.estimatedDuration * 1.5) * 1000;
        console.log('Background: 启动备用检查，将在', checkDelay / 1000, '秒后检查（估算时长:', this.estimatedDuration, '秒）');
        
        // 在等待期间定期保持活跃（每2秒）
        const keepAliveInterval = setInterval(() => {
            if (this.isPlaying) {
                this.keepAlive();
            } else {
                clearInterval(keepAliveInterval);
            }
        }, 2000);
        
        this.fallbackCheckInterval = setTimeout(() => {
            clearInterval(keepAliveInterval);
            
            if (this.isPlaying) {
                const elapsed = (Date.now() - this.playbackStartTime) / 1000;
                console.log('Background: 备用检查触发（已播放', elapsed.toFixed(1), '秒，估算', this.estimatedDuration.toFixed(1), '秒）');
                console.log('Background: 备用检查 - isPlaying:', this.isPlaying, 'shouldLoop:', this.shouldLoop, 'currentUtterance:', !!this.currentUtterance);
                
                // 防止重复触发：如果正在处理播放结束，跳过
                if (this.isHandlingPlaybackEnd) {
                    console.log('Background: 正在处理播放结束，备用检查跳过');
                    return;
                }
                
                // 只有在超过估算时长50%以上，且没有收到end事件时，才触发备用检查
                if (elapsed >= this.estimatedDuration * 0.8) {
                    if (this.shouldLoop && this.currentUtterance) {
                        console.log('Background: 备用检查触发，准备循环（超时保护）');
                        this.handlePlaybackEnd();
                    } else if (!this.shouldLoop) {
                        console.log('Background: 备用检查：单次播放应已结束（超时保护）');
                        this.isPlaying = false;
                    }
                } else {
                    console.log('Background: 备用检查：播放时间未到，继续等待');
                    // 如果还没到时间，重新设置一个较短的检查
                    this.startFallbackCheck();
                }
            }
        }, checkDelay);
        
        // 保存 keepAliveInterval，以便在需要时清除
        this.keepAliveInterval = keepAliveInterval;
    }
    
    stopFallbackCheck() {
        if (this.fallbackCheckInterval) {
            clearTimeout(this.fallbackCheckInterval);
            this.fallbackCheckInterval = null;
        }
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }
    
    playAudio(base64AudioData, shouldLoop, estimatedDuration) {
        console.log('Background: 开始播放音频（AI语音）');
        console.log('Background: Base64数据长度:', base64AudioData ? base64AudioData.length : 0);
        
        if (!base64AudioData) {
            console.error('Background: 音频数据为空');
            return;
        }
        
        try {
            this.stop();
            
            this.isPlaying = true;
            this.shouldLoop = shouldLoop;
            this.isAudioMode = true;
            this.loopCount = 0;
            
            // 将base64转换为Blob
            console.log('Background: 开始解码base64数据...');
            const binaryString = atob(base64AudioData);
            console.log('Background: Base64解码完成，二进制长度:', binaryString.length);
            
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
            console.log('Background: Blob创建完成，大小:', audioBlob.size, 'bytes');
            const audioUrl = URL.createObjectURL(audioBlob);
            console.log('Background: Audio URL创建完成:', audioUrl.substring(0, 50) + '...');
            
            // 保存原始base64数据用于循环
            const savedAudioData = base64AudioData;
            
            // 创建Audio对象
            const audio = new Audio(audioUrl);
            this.currentAudio = audio;
            
            // 估算播放时长
            this.estimatedDuration = estimatedDuration || 5;
            this.playbackStartTime = Date.now();
            
            // 播放结束事件
            audio.onended = () => {
                console.log('Background: 音频播放结束');
                URL.revokeObjectURL(audioUrl);
                this.handleAudioPlaybackEnd();
            };
            
            // 错误处理
            audio.onerror = (error) => {
                console.error('Background: 音频播放错误:', error);
                console.error('Background: 音频错误详情:', audio.error);
                URL.revokeObjectURL(audioUrl);
                this.isPlaying = false;
                this.shouldLoop = false;
                this.stopLoopProtection();
            };
            
            // 可以播放事件
            audio.oncanplay = () => {
                console.log('Background: 音频可以播放');
            };
            
            // 加载错误
            audio.onloadstart = () => {
                console.log('Background: 音频开始加载');
            };
            
            // 开始播放
            console.log('Background: 尝试播放音频...');
            audio.play().then(() => {
                console.log('Background: 音频播放已开始');
                this.keepAlive();
                this.startLoopProtection();
            }).catch((error) => {
                console.error('Background: 音频播放失败:', error);
                console.error('Background: 错误名称:', error.name);
                console.error('Background: 错误消息:', error.message);
                URL.revokeObjectURL(audioUrl);
                this.isPlaying = false;
                this.shouldLoop = false;
                this.stopLoopProtection();
            });
            
            // 保存当前播放信息（用于循环）
            this.currentUtterance = {
                audioData: savedAudioData,
                shouldLoop: shouldLoop,
                estimatedDuration: estimatedDuration
            };
        } catch (error) {
            console.error('Background: playAudio异常:', error);
            console.error('Background: 异常堆栈:', error.stack);
            this.isPlaying = false;
            this.shouldLoop = false;
            this.stopLoopProtection();
        }
    }
    
    handleAudioPlaybackEnd() {
        console.log('Background: handleAudioPlaybackEnd 被调用，isPlaying:', this.isPlaying, 'shouldLoop:', this.shouldLoop);
        
        if (!this.isPlaying) {
            return;
        }
        
        this.keepAlive();
        
        if (this.shouldLoop && this.currentUtterance && this.currentUtterance.audioData) {
            console.log('Background: 准备循环播放音频');
            
            const shouldLoop = this.shouldLoop;
            const audioData = this.currentUtterance.audioData;
            const estimatedDuration = this.currentUtterance.estimatedDuration;
            
            setTimeout(() => {
                if (this.isPlaying && shouldLoop && audioData) {
                    this.loopCount = (this.loopCount || 0) + 1;
                    console.log('Background: 开始循环播放音频（第', this.loopCount, '次）');
                    this.playAudio(audioData, shouldLoop, estimatedDuration);
                }
            }, 300);
        } else {
            console.log('Background: 音频单次播放完成');
            this.isPlaying = false;
            this.loopCount = 0;
            this.stopLoopProtection();
        }
    }
    
    stop() {
        console.log('Background: 停止播放');
        this.isPlaying = false;
        this.shouldLoop = false;
        this.loopCount = 0;
        this.stopFallbackCheck();
        this.stopLoopProtection();
        
        // 停止TTS
        if (chrome.tts) {
            chrome.tts.stop();
        }
        
        // 停止音频播放
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
        }
        
        this.isAudioMode = false;
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

