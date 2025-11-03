// SpeakFlow - 影子跟读工具 Chrome扩展

class SpeakFlowApp {
    constructor() {
        this.isPlaying = false;
        this.voices = [];
        
        this.initElements();
        this.initEvents();
        this.loadVoices();
        this.loadSavedSettings();
        this.checkPlaybackStatus();
    }
    
    checkPlaybackStatus() {
        // 定期检查播放状态（用于更新UI）
        try {
            chrome.runtime.sendMessage({ type: 'getStatus' }, (response) => {
                if (chrome.runtime.lastError) {
                    setTimeout(() => this.checkPlaybackStatus(), 2000);
                    return;
                }
                
                if (response) {
                    if (response.isPlaying !== this.isPlaying) {
                        this.isPlaying = response.isPlaying;
                        this.playBtn.disabled = this.isPlaying;
                        this.stopBtn.disabled = !this.isPlaying;
                        if (this.isPlaying) {
                            this.updateStatus('正在播放（后台运行）...', 'loading');
                        }
                    }
                }
                
                setTimeout(() => this.checkPlaybackStatus(), 2000);
            });
        } catch (error) {
            setTimeout(() => this.checkPlaybackStatus(), 2000);
        }
    }

    initElements() {
        this.textInput = document.getElementById('text-input');
        this.languageSelect = document.getElementById('language-select');
        this.voiceSelect = document.getElementById('voice-select');
        this.refreshBtn = document.getElementById('refresh-voices');
        this.speedSlider = document.getElementById('speed-slider');
        this.speedValue = document.getElementById('speed-value');
        this.loopCheckbox = document.getElementById('loop-checkbox');
        this.playBtn = document.getElementById('play-btn');
        this.stopBtn = document.getElementById('stop-btn');
        this.statusBar = document.getElementById('status-bar');
    }

    initEvents() {
        this.speedSlider.addEventListener('input', () => {
            this.speedValue.textContent = parseFloat(this.speedSlider.value).toFixed(1) + 'x';
            this.saveSettings();
        });
        
        this.loopCheckbox.addEventListener('change', () => {
            this.saveSettings();
        });

        this.languageSelect.addEventListener('change', () => {
            this.filterVoicesByLanguage();
            this.saveSettings();
        });
        
        this.voiceSelect.addEventListener('change', () => {
            this.saveSettings();
        });

        this.refreshBtn.addEventListener('click', () => {
            this.loadVoices();
        });

        this.playBtn.addEventListener('click', () => {
            this.play();
        });

        this.stopBtn.addEventListener('click', () => {
            this.stop();
        });
    }

    loadSavedSettings() {
        chrome.storage.local.get(['savedText', 'language', 'voice', 'speed', 'loop'], (result) => {
            if (result.savedText) {
                this.textInput.value = result.savedText;
            }
            if (result.language) {
                this.languageSelect.value = result.language;
                if (this.voices.length > 0) {
                    this.filterVoicesByLanguage();
                    setTimeout(() => {
                        if (result.voice) {
                            this.voiceSelect.value = result.voice;
                        }
                    }, 50);
                }
            }
            if (result.speed) {
                this.speedSlider.value = result.speed;
                this.speedValue.textContent = parseFloat(result.speed).toFixed(1) + 'x';
            }
            if (result.loop !== undefined) {
                this.loopCheckbox.checked = result.loop;
            }
        });
    }

    saveSettings() {
        chrome.storage.local.set({
            savedText: this.textInput.value,
            language: this.languageSelect.value,
            voice: this.voiceSelect.value,
            speed: this.speedSlider.value,
            loop: this.loopCheckbox.checked
        });
    }

    loadVoices() {
        this.updateStatus('正在加载音色列表...', 'loading');
        
        if (!chrome.tts) {
            this.updateStatus('TTS API不可用', 'error');
            return;
        }

        chrome.tts.getVoices((voices) => {
            if (chrome.runtime.lastError) {
                this.updateStatus('加载音色失败: ' + chrome.runtime.lastError.message, 'error');
                return;
            }

            this.voices = voices || [];
            this.filterVoicesByLanguage();
            this.updateStatus(`已加载 ${this.voices.length} 个音色`, 'success');
            this.restoreSavedVoice();
        });
    }
    
    restoreSavedVoice() {
        chrome.storage.local.get(['voice'], (result) => {
            if (result.voice) {
                setTimeout(() => {
                    const voiceExists = Array.from(this.voiceSelect.options).some(
                        option => option.value === result.voice
                    );
                    if (voiceExists) {
                        this.voiceSelect.value = result.voice;
                    }
                }, 200);
            }
        });
    }

    filterVoicesByLanguage() {
        const selectedLang = this.languageSelect.value;
        const langPrefix = selectedLang.split('-')[0];
        const filtered = this.voices.filter(voice => {
            return voice.lang && voice.lang.startsWith(langPrefix);
        });

        const currentVoice = this.voiceSelect.value;
        this.voiceSelect.innerHTML = '<option value="">自动选择</option>';
        
        filtered.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.voiceName || '';
            const displayName = voice.voiceName || `${voice.lang || 'Unknown'} - ${voice.gender || 'Unknown'}`;
            option.textContent = displayName;
            this.voiceSelect.appendChild(option);
        });

        // 如果没有匹配的音色，显示所有音色
        if (filtered.length === 0 && this.voices.length > 0) {
            this.voices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.voiceName || '';
                const displayName = voice.voiceName || `${voice.lang || 'Unknown'} - ${voice.gender || 'Unknown'}`;
                option.textContent = displayName;
                this.voiceSelect.appendChild(option);
            });
        }
        
        // 恢复之前选择的音色
        if (currentVoice) {
            const voiceExists = Array.from(this.voiceSelect.options).some(
                option => option.value === currentVoice
            );
            if (voiceExists) {
                this.voiceSelect.value = currentVoice;
            }
        }
    }

    play() {
        const text = this.textInput.value.trim();
        
        if (!text) {
            this.updateStatus('请输入要练习的文字！', 'error');
            return;
        }

        // 检查当前播放状态
        chrome.runtime.sendMessage({ type: 'getStatus' }, (response) => {
            if (response && response.isPlaying) {
                this.stop();
                return;
            }
            
            // 开始播放
            this.isPlaying = true;
            this.playBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.updateStatus('正在播放...', 'loading');
            this.saveSettings();

            const speedValue = Math.max(0.1, Math.min(10.0, parseFloat(this.speedSlider.value)));
            
            const options = {
                lang: this.languageSelect.value,
                rate: speedValue,
                pitch: 1.0,
                volume: 1.0,
                enqueue: false
            };

            const selectedVoice = this.voiceSelect.value;
            if (selectedVoice) {
                options.voiceName = selectedVoice;
            }

            // 发送播放请求到background script
            try {
                chrome.runtime.sendMessage({
                    type: 'play',
                    text: text,
                    options: options,
                    shouldLoop: this.loopCheckbox.checked
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        const errorMsg = chrome.runtime.lastError.message;
                        console.error('发送播放消息失败:', errorMsg);
                        this.updateStatus('播放失败: ' + errorMsg, 'error');
                        this.isPlaying = false;
                        this.playBtn.disabled = false;
                        this.stopBtn.disabled = true;
                    } else if (response && response.success) {
                        this.updateStatus('正在播放（后台运行）...', 'loading');
                    } else {
                        this.updateStatus('播放失败', 'error');
                        this.isPlaying = false;
                        this.playBtn.disabled = false;
                        this.stopBtn.disabled = true;
                    }
                });
            } catch (error) {
                console.error('发送消息异常:', error);
                this.updateStatus('播放失败: ' + error.message, 'error');
                this.isPlaying = false;
                this.playBtn.disabled = false;
                this.stopBtn.disabled = true;
            }
        });
    }

    stop() {
        try {
            chrome.runtime.sendMessage({ type: 'stop' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn('停止消息发送失败:', chrome.runtime.lastError.message);
                }
                
                this.isPlaying = false;
                this.playBtn.disabled = false;
                this.stopBtn.disabled = true;
                this.updateStatus('已停止播放', 'success');
            });
        } catch (error) {
            this.isPlaying = false;
            this.playBtn.disabled = false;
            this.stopBtn.disabled = true;
            this.updateStatus('已停止播放', 'success');
        }
    }

    updateStatus(message, type = '') {
        this.statusBar.textContent = message;
        this.statusBar.className = 'status-bar ' + type;
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new SpeakFlowApp();
});

