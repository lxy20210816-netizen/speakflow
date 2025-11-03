// Offscreen Document for playing AI audio in background
// 用于在后台播放AI语音的Offscreen文档

let currentAudio = null;
let audioContext = null; // Web Audio API context
let isLooping = false;
let audioData = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Offscreen收到消息:', message.type, 'base64Audio长度:', message.base64Audio?.length);
    
    try {
        switch (message.type) {
            case 'playAudio':
                if (!message.base64Audio) {
                    console.error('Offscreen: base64Audio为空');
                    sendResponse({ success: false, error: '音频数据为空' });
                    return true;
                }
                playAudio(message.base64Audio, message.shouldLoop);
                sendResponse({ success: true });
                break;
                
            case 'stopAudio':
                stopAudio();
                sendResponse({ success: true });
                break;
                
            case 'getAudioStatus':
                sendResponse({ isPlaying: currentAudio !== null && !currentAudio.paused });
                break;
                
            default:
                sendResponse({ success: false, error: 'Unknown message type' });
        }
    } catch (error) {
        console.error('Offscreen处理消息错误:', error);
        sendResponse({ success: false, error: error.message });
    }
    
    return true;
});

console.log('Offscreen文档已加载，消息监听器已注册');

// 测试：尝试播放一个静音的测试音频，确保Audio对象可以工作
// 这可以帮助确认自动播放策略是否允许播放
setTimeout(() => {
    console.log('Offscreen: 测试Audio对象是否可用...');
    try {
        const testAudio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
        testAudio.volume = 0;
        testAudio.play().then(() => {
            console.log('Offscreen: ✅ Audio对象测试成功，可以播放');
            testAudio.pause();
        }).catch((error) => {
            console.warn('Offscreen: ⚠️ Audio对象测试失败（可能需要用户交互）:', error);
        });
    } catch (error) {
        console.error('Offscreen: ❌ Audio对象测试异常:', error);
    }
}, 1000);

function playAudio(base64Audio, shouldLoop) {
    console.log('Offscreen: 开始播放音频, base64Audio长度:', base64Audio.length, 'shouldLoop:', shouldLoop);
    
    stopAudio();
    
    if (!base64Audio || !base64Audio.trim()) {
        console.error('Offscreen: base64Audio为空或无效');
        return;
    }
    
    try {
        // 解码base64
        console.log('Offscreen: 开始解码base64...');
        const binaryString = atob(base64Audio);
        console.log('Offscreen: Base64解码完成, 二进制长度:', binaryString.length);
        
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
        console.log('Offscreen: Blob创建完成, 大小:', audioBlob.size, 'bytes');
        
        const audioUrl = URL.createObjectURL(audioBlob);
        console.log('Offscreen: Audio URL创建完成');
        
        // 使用Audio对象（更简单可靠）
        const audio = new Audio(audioUrl);
        currentAudio = audio;
        isLooping = shouldLoop;
        audioData = shouldLoop ? { base64Audio, audioUrl, audioBlob } : null;
        
        // 设置循环属性
        audio.loop = shouldLoop;
        
        // 设置音量
        audio.volume = 1.0;
        
        // 播放结束事件（循环模式下需要手动处理，因为loop=true时onended不会触发）
        if (shouldLoop) {
            // 监听timeupdate来检测循环（或者使用onended，但需要重新创建）
            // 实际上，如果loop=true，onended不会触发，但我们可以监听播放状态
        } else {
            audio.onended = () => {
                console.log('Offscreen: 音频播放结束');
                URL.revokeObjectURL(audioUrl);
                currentAudio = null;
                audioData = null;
            };
        }
        
        // 错误处理
        audio.onerror = (error) => {
            console.error('Offscreen: 音频播放错误:', error);
            console.error('Offscreen: 音频错误详情:', audio.error);
            URL.revokeObjectURL(audioUrl);
            stopAudio();
        };
        
        // 开始播放
        console.log('Offscreen: 尝试播放音频...');
        console.log('Offscreen: 音频readyState:', audio.readyState);
        
        audio.play().then(() => {
            console.log('Offscreen: ✅ 音频播放已开始');
            console.log('Offscreen: 音频时长:', audio.duration, '秒');
            console.log('Offscreen: 是否循环:', audio.loop);
            console.log('Offscreen: 音频是否暂停:', audio.paused);
            console.log('Offscreen: 音频音量:', audio.volume);
        }).catch((error) => {
            console.error('Offscreen: ❌ 播放失败:', error);
            console.error('Offscreen: 错误名称:', error.name);
            console.error('Offscreen: 错误消息:', error.message);
            
            // 如果是自动播放被阻止，尝试使用Web Audio API作为备选
            if (error.name === 'NotAllowedError' || error.message.includes('play')) {
                console.log('Offscreen: 自动播放被阻止，尝试使用Web Audio API...');
                playAudioWithWebAudio(bytes, shouldLoop);
            } else {
                URL.revokeObjectURL(audioUrl);
                stopAudio();
            }
        });
        
        // 如果音频已经加载好，确保播放
        if (audio.readyState >= 2) {
            console.log('Offscreen: 音频已准备好，确保正在播放');
            audio.play().catch(err => {
                console.warn('Offscreen: 再次尝试播放失败:', err);
            });
        }
        
    } catch (error) {
        console.error('Offscreen: playAudio异常:', error);
        console.error('Offscreen: 异常堆栈:', error.stack);
        stopAudio();
    }
}

async function playAudioWithWebAudio(audioBytes, shouldLoop) {
    try {
        console.log('Offscreen: 使用Web Audio API播放');
        
        // 创建AudioContext
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // 解码音频数据
        const audioBuffer = await audioContext.decodeAudioData(audioBytes.buffer);
        console.log('Offscreen: Web Audio解码完成, 时长:', audioBuffer.duration, '秒');
        
        // 创建播放源
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.loop = shouldLoop;
        
        // 连接到输出
        source.connect(audioContext.destination);
        
        // 保存source用于停止
        currentAudio = source;
        isLooping = shouldLoop;
        
        // 播放结束事件（非循环模式）
        if (!shouldLoop) {
            source.onended = () => {
                console.log('Offscreen: Web Audio播放结束');
                currentAudio = null;
            };
        }
        
        // 开始播放
        source.start(0);
        console.log('Offscreen: ✅ Web Audio播放已开始');
        
        // 保存音频数据用于循环（如果需要重新创建）
        if (shouldLoop) {
            audioData = { audioBytes, audioBuffer };
        }
        
    } catch (error) {
        console.error('Offscreen: Web Audio播放失败:', error);
        stopAudio();
    }
}

function playAudioFromUrl(audioUrl) {
    const audio = new Audio(audioUrl);
    currentAudio = audio;
    
    audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        if (isLooping && audioData) {
            setTimeout(() => {
                if (isLooping) {
                    const binaryString = atob(audioData.base64Audio);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
                    const newUrl = URL.createObjectURL(audioBlob);
                    audioData.audioUrl = newUrl;
                    playAudioFromUrl(newUrl);
                }
            }, 300);
        } else {
            currentAudio = null;
        }
    };
    
    audio.onerror = (error) => {
        console.error('Offscreen: 循环播放错误:', error);
        URL.revokeObjectURL(audioUrl);
        stopAudio();
    };
    
    audio.play().catch((error) => {
        console.error('Offscreen: 循环播放失败:', error);
        URL.revokeObjectURL(audioUrl);
        stopAudio();
    });
}

function stopAudio() {
    console.log('Offscreen: 停止播放');
    console.log('Offscreen: 当前音频状态 - currentAudio:', currentAudio, 'isLooping:', isLooping);
    
    // 立即停止循环标记，防止重新开始播放
    isLooping = false;
    
    if (currentAudio) {
        // 如果是Audio对象
        if (currentAudio.pause) {
            console.log('Offscreen: 停止Audio对象');
            currentAudio.pause();
            currentAudio.currentTime = 0;
            currentAudio.loop = false; // 明确取消循环
            // 移除所有事件监听器
            currentAudio.onended = null;
            currentAudio.onerror = null;
            if (audioData && audioData.audioUrl) {
                URL.revokeObjectURL(audioData.audioUrl);
            }
        } else {
            // 如果是Web Audio API的source
            console.log('Offscreen: 停止Web Audio API source');
            try {
                currentAudio.stop();
            } catch (e) {
                // 忽略错误（可能已经停止）
                console.warn('Offscreen: 停止Web Audio source时出错（可忽略）:', e);
            }
        }
        currentAudio = null;
    }
    
    // 清理音频数据
    if (audioData) {
        if (audioData.audioUrl) {
            URL.revokeObjectURL(audioData.audioUrl);
        }
        audioData = null;
    }
    
    console.log('Offscreen: 播放已完全停止');
}

