// SpeakFlow - 影子跟读工具 Chrome扩展

class SpeakFlowApp {
    constructor() {
        this.isPlaying = false;
        this.voices = [];
        this.openaiTTS = new OpenAITTSHelper();
        this.useAIVoice = false;
        this.currentAudio = null; // 用于存储当前播放的Audio对象（AI语音）
        this.aiAudioLooping = false; // AI语音循环标记
        this.aiAudioData = null; // 保存音频数据用于循环
        
        this.initElements();
        this.initEvents();
        // 初始化按钮状态
        this.playBtn.disabled = false;
        this.stopBtn.disabled = false; // 停止按钮始终可用
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
                        // 停止按钮始终可用，不根据播放状态禁用
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
        this.useAIVoiceCheckbox = document.getElementById('use-ai-voice');
        this.aiVoiceSettings = document.getElementById('ai-voice-settings');
        this.openaiApiKeyInput = document.getElementById('openai-api-key');
        this.voiceSection = document.getElementById('voice-section');
        this.translationSection = document.getElementById('translation-section');
        this.translationText = document.getElementById('translation-text');
        this.furiganaSection = document.getElementById('furigana-section');
        this.furiganaText = document.getElementById('furigana-text');
        this.vocabularySection = document.getElementById('vocabulary-section');
        this.vocabularyList = document.getElementById('vocabulary-list');
        this.grammarSection = document.getElementById('grammar-section');
        this.grammarList = document.getElementById('grammar-list');
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
            if (this.useAIVoice) {
                this.loadAIVoices();
            } else {
                this.loadVoices();
            }
        });
        
        this.useAIVoiceCheckbox.addEventListener('change', () => {
            this.useAIVoice = this.useAIVoiceCheckbox.checked;
            this.aiVoiceSettings.style.display = this.useAIVoice ? 'block' : 'none';
            this.voiceSection.style.display = this.useAIVoice ? 'none' : 'block';
            
            const aiTipText = document.getElementById('ai-tip-text');
            if (aiTipText) {
                aiTipText.style.display = this.useAIVoice ? 'block' : 'none';
            }
            
            if (this.useAIVoice) {
                this.loadAIVoices();
            } else {
                this.loadVoices();
            }
            this.saveSettings();
        });
        
        this.openaiApiKeyInput.addEventListener('change', () => {
            const apiKey = this.openaiApiKeyInput.value.trim();
            if (apiKey) {
                this.openaiTTS.setApiKey(apiKey);
            }
            this.saveSettings();
        });

        this.playBtn.addEventListener('click', () => {
            this.play();
        });

        this.stopBtn.addEventListener('click', () => {
            this.stop();
        });
        
        // 当输入框内容变化时，检查是否需要更新翻译
        this.textInput.addEventListener('input', () => {
            const currentText = this.textInput.value.trim();
            if (!currentText) {
                // 如果输入框为空，隐藏翻译区域并清除保存的翻译
                this.translationSection.style.display = 'none';
                chrome.storage.local.remove('translationData');
            } else {
                // 如果输入框有内容，检查是否与保存的翻译文本匹配（使用trim()处理空格差异）
                chrome.storage.local.get(['translationData'], (result) => {
                    if (result.translationData) {
                        const translationTextTrimmed = (result.translationData.text || '').trim();
                        if (translationTextTrimmed === currentText) {
                            // 文本匹配，恢复翻译显示
                            this.restoreTranslation(result.translationData);
                        } else {
                            // 文本不匹配，隐藏翻译区域（等待新的翻译）
                            this.translationSection.style.display = 'none';
                        }
                    } else {
                        // 没有翻译数据，隐藏翻译区域
                        this.translationSection.style.display = 'none';
                    }
                });
            }
        });
    }

    loadSavedSettings() {
        chrome.storage.local.get(['savedText', 'language', 'voice', 'speed', 'loop', 'useAIVoice', 'openai_api_key', 'translationData'], (result) => {
            if (result.savedText) {
                this.textInput.value = result.savedText;
                
                // 如果存在翻译数据，检查文本是否匹配（使用trim()处理空格差异）
                if (result.translationData) {
                    const savedTextTrimmed = result.savedText.trim();
                    const translationTextTrimmed = (result.translationData.text || '').trim();
                    
                    if (translationTextTrimmed === savedTextTrimmed) {
                        // 文本匹配，恢复翻译显示
                        this.restoreTranslation(result.translationData);
                    } else {
                        console.log('翻译数据文本不匹配:', {
                            saved: savedTextTrimmed,
                            translation: translationTextTrimmed
                        });
                    }
                }
            } else if (result.translationData) {
                // 即使没有savedText，如果有翻译数据，也尝试恢复（可能用户清空了输入框但翻译数据还在）
                // 但这种情况不自动恢复，因为不知道应该显示哪个文本的翻译
                console.log('存在翻译数据但没有保存的文本');
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
            if (result.useAIVoice) {
                this.useAIVoiceCheckbox.checked = true;
                this.useAIVoice = true;
                this.aiVoiceSettings.style.display = 'block';
                this.voiceSection.style.display = 'none';
                this.loadAIVoices();
            }
            if (result.openai_api_key) {
                this.openaiApiKeyInput.value = result.openai_api_key;
                this.openaiTTS.setApiKey(result.openai_api_key);
            }
        });
    }

    saveSettings() {
        // 使用trim()确保文本一致性，避免空格导致的匹配问题
        chrome.storage.local.set({
            savedText: this.textInput.value.trim(),
            language: this.languageSelect.value,
            voice: this.voiceSelect.value,
            speed: this.speedSlider.value,
            loop: this.loopCheckbox.checked,
            useAIVoice: this.useAIVoice
        });
    }
    
    // 保存翻译数据
    saveTranslationData(translationData) {
        // 使用trim()确保文本一致性，避免空格导致的匹配问题
        const textToSave = this.textInput.value.trim();
        const dataToSave = {
            text: textToSave,
            translation: translationData.translation,
            furigana: translationData.furigana,
            vocabulary: translationData.vocabulary,
            grammar: translationData.grammar
        };
        chrome.storage.local.set({ 'translationData': dataToSave });
        console.log('翻译数据已保存，文本:', textToSave);
    }
    
    // 恢复翻译显示
    restoreTranslation(translationData) {
        if (!translationData || !translationData.translation) {
            return;
        }
        
        // 显示翻译区域
        this.translationSection.style.display = 'block';
        this.translationText.textContent = translationData.translation || '';
        
        // 显示假名注音（如果是日语）
        if (translationData.furigana) {
            // 处理换行：将\n转换为<br>，同时保留已有的<br>标签
            let furiganaHtml = translationData.furigana
                .replace(/\n/g, '<br>')  // 将换行符转换为<br>标签
                .replace(/<br><br>/g, '<br>');  // 避免重复的<br>
            this.furiganaText.innerHTML = furiganaHtml;
            this.furiganaSection.style.display = 'block';
        } else {
            this.furiganaSection.style.display = 'none';
        }
        
        // 显示单词解释
        if (translationData.vocabulary && translationData.vocabulary.length > 0) {
            this.vocabularyList.innerHTML = translationData.vocabulary.map(item => {
                const word = item.word || '';
                const pronunciation = item.pronunciation || '';
                const explanation = item.explanation || '';
                
                let displayText = '';
                if (pronunciation) {
                    displayText = `<strong>${word}</strong>（${pronunciation}）: ${explanation}`;
                } else {
                    displayText = `<strong>${word}</strong>: ${explanation}`;
                }
                return `<div style="margin-bottom: 6px;">${displayText}</div>`;
            }).join('');
            this.vocabularySection.style.display = 'block';
        } else {
            this.vocabularySection.style.display = 'none';
        }
        
        // 显示语法解释
        if (translationData.grammar && translationData.grammar.length > 0) {
            this.grammarList.innerHTML = translationData.grammar.map(item => {
                const phrase = item.phrase || '';
                const explanation = item.explanation || '';
                return `<div style="margin-bottom: 6px;"><strong>「${phrase}」</strong>: ${explanation}</div>`;
            }).join('');
            this.grammarSection.style.display = 'block';
        } else {
            this.grammarSection.style.display = 'none';
        }
    }
    
    loadAIVoices() {
        const voices = this.openaiTTS.getVoices();
        this.voiceSelect.innerHTML = '<option value="">自动选择（推荐：Nova）</option>';
        
        voices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.id;
            option.textContent = voice.name;
            this.voiceSelect.appendChild(option);
        });
        
        // 恢复保存的选择
        chrome.storage.local.get(['voice'], (result) => {
            if (result.voice) {
                const voiceExists = Array.from(this.voiceSelect.options).some(
                    option => option.value === result.voice
                );
                if (voiceExists) {
                    this.voiceSelect.value = result.voice;
                }
            }
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

    async play() {
        const text = this.textInput.value.trim();
        
        if (!text) {
            this.updateStatus('请输入要练习的文字！', 'error');
            return;
        }

        // 先停止所有正在播放的音频（包括循环播放）
        console.log('开始播放前，先停止所有正在播放的音频');
        await this.stopAll();
        
        // 等待一下，确保停止操作完成（增加等待时间以确保循环播放也停止）
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 开始生成/播放 - 注意：此时不设置 isPlaying，因为音频还没有真正开始播放
        this.playBtn.disabled = true; // 禁用播放按钮，防止重复点击
        // 停止按钮始终可用，不根据播放状态禁用
        this.updateStatus('正在生成语音...', 'loading');
        this.saveSettings();
        
        // 如果使用AI语音，先翻译文本（并行进行，不阻塞播放）
        if (this.useAIVoice) {
            this.translateText(text).catch(error => {
                console.warn('翻译失败（不影响播放）:', error);
            });
        }

        // 开始播放逻辑
        if (this.useAIVoice) {
                // 使用OpenAI TTS
                try {
                    const apiKey = await this.openaiTTS.getApiKey();
                    if (!apiKey) {
                        this.updateStatus('请先设置OpenAI API Key！', 'error');
                        // 恢复播放按钮，因为还没有开始播放
                        this.isPlaying = false;
                        this.playBtn.disabled = false;
                        return;
                    }
                    
                    this.updateStatus('正在生成AI语音...', 'loading');
                    
                    const speedValue = Math.max(0.25, Math.min(4.0, parseFloat(this.speedSlider.value)));
                    const selectedVoice = this.voiceSelect.value || 'nova'; // 默认使用Nova女性音色
                    
                    // 生成语音
                    this.updateStatus('正在生成AI语音...', 'loading');
                    const audioBlob = await this.openaiTTS.generateSpeech(text, {
                        voice: selectedVoice,
                        model: 'tts-1', // 可以使用 'tts-1-hd' 获得更高质量
                        speed: speedValue
                    });
                    
                    console.log('OpenAI TTS: 音频生成成功，大小:', audioBlob.size, 'bytes');
                    
                    // 转换为base64以便传递到offscreen
                    this.updateStatus('正在准备播放...', 'loading');
                    
                    const arrayBuffer = await audioBlob.arrayBuffer();
                    const uint8Array = new Uint8Array(arrayBuffer);
                    
                    // 分块处理，避免栈溢出
                    let base64Audio = '';
                    const chunkSize = 8192; // 每次处理8KB
                    for (let i = 0; i < uint8Array.length; i += chunkSize) {
                        const chunk = uint8Array.slice(i, i + chunkSize);
                        base64Audio += String.fromCharCode.apply(null, Array.from(chunk));
                    }
                    base64Audio = btoa(base64Audio);
                    
                    console.log('OpenAI TTS: Base64编码完成，长度:', base64Audio.length);
                    
                    // 先在popup中触发播放（用户交互），然后立即转移到offscreen
                    // 这样可以"解锁"音频播放权限，让offscreen也能播放
                    this.updateStatus('正在准备播放...', 'loading');
                    
                    const audioUrl = URL.createObjectURL(audioBlob);
                    const testAudio = new Audio(audioUrl);
                    
                    try {
                        // 先在popup中启动播放（获得用户交互权限）
                        await testAudio.play();
                        console.log('Popup: 音频已在popup中启动（触发用户交互）');
                        
                        // 立即暂停并清理
                        testAudio.pause();
                        testAudio.src = '';
                        URL.revokeObjectURL(audioUrl);
                        
                        // 等待一小段时间确保权限已传递
                        await new Promise(resolve => setTimeout(resolve, 100));
                        
                        // 确保offscreen文档存在
                        await this.ensureOffscreenDocument();
                        await new Promise(resolve => setTimeout(resolve, 300));
                        
                        console.log('Popup: 准备发送音频到background/offscreen');
                        
                        // 发送到background，由background转发到offscreen
                        chrome.runtime.sendMessage({
                            type: 'playAudio',
                            base64Audio: base64Audio,
                            shouldLoop: this.loopCheckbox.checked
                        }, (response) => {
                            console.log('Popup: 收到background响应:', response);
                            
                            if (chrome.runtime.lastError) {
                                const errorMsg = chrome.runtime.lastError.message;
                                console.error('Popup: 发送播放消息失败:', errorMsg);
                                this.updateStatus('播放失败: ' + errorMsg, 'error');
                                this.isPlaying = false;
                                this.playBtn.disabled = false;
                            } else if (response && response.success) {
                                this.updateStatus('正在播放（AI语音，后台运行）...', 'loading');
                                this.isPlaying = true;
                                this.playBtn.disabled = true;
                                // 停止按钮始终可用
                                this.aiAudioLooping = this.loopCheckbox.checked;
                            } else if (response && response.error) {
                                this.updateStatus('播放失败: ' + response.error, 'error');
                                this.isPlaying = false;
                                this.playBtn.disabled = false;
                            } else {
                                this.updateStatus('播放失败', 'error');
                                this.isPlaying = false;
                                this.playBtn.disabled = false;
                            }
                        });
                    } catch (error) {
                        console.error('Popup: 启动播放失败:', error);
                        URL.revokeObjectURL(audioUrl);
                        this.updateStatus('播放失败: ' + (error.message || '需要用户交互'), 'error');
                        this.isPlaying = false;
                        this.playBtn.disabled = false;
                    }
                } catch (error) {
                    console.error('OpenAI TTS生成失败:', error);
                    this.updateStatus('生成失败: ' + (error.message || '未知错误'), 'error');
                    // 恢复播放按钮，因为还没有开始播放
                    this.isPlaying = false;
                    this.playBtn.disabled = false;
                }
            } else {
                // 使用Chrome TTS
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
                        } else if (response && response.success) {
                            this.updateStatus('正在播放（后台运行）...', 'loading');
                            // Chrome TTS 立即开始播放
                            this.isPlaying = true;
                            this.playBtn.disabled = true;
                            // 停止按钮始终可用
                        } else {
                            this.updateStatus('播放失败', 'error');
                            this.isPlaying = false;
                            this.playBtn.disabled = false;
                        }
                    });
                } catch (error) {
                    console.error('发送消息异常:', error);
                    this.updateStatus('播放失败: ' + error.message, 'error');
                    this.isPlaying = false;
                    this.playBtn.disabled = false;
                }
            }
    }
    
    estimateDuration(text, speed) {
        // 估算播放时长（OpenAI TTS大致估算）
        const isCJK = /[\u4e00-\u9fa5\u3040-\u309f\u30a0-\u30ff\uac00-\ud7a3]/.test(text);
        const charsPerSecond = isCJK ? 6.5 : 12.5;
        return Math.max(2, (text.length / charsPerSecond) / speed);
    }
    
    async ensureOffscreenDocument() {
        // 检查offscreen文档是否已存在
        try {
            const hasDocument = await chrome.offscreen.hasDocument();
            if (hasDocument) {
                console.log('Offscreen文档已存在');
                return;
            }
            
            // 创建offscreen文档
            console.log('正在创建Offscreen文档...');
            await chrome.offscreen.createDocument({
                url: 'offscreen.html',
                reasons: ['AUDIO_PLAYBACK'],
                justification: '需要播放AI语音以支持后台播放功能'
            });
            console.log('Offscreen文档已创建');
            
            // 等待一下，确保offScreen文档完全加载
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log('已等待Offscreen文档加载');
        } catch (error) {
            console.error('创建Offscreen文档失败:', error);
            throw error;
        }
    }

    async playAIAudio(audioData) {
        // 如果URL已被revoke，需要重新创建
        let audioUrl = audioData.audioUrl;
        try {
            // 尝试创建新的URL（如果原来的被revoke了）
            if (audioData.audioBlob) {
                audioUrl = URL.createObjectURL(audioData.audioBlob);
            }
        } catch (e) {
            console.warn('无法创建Audio URL，可能需要重新生成音频');
            return;
        }
        
        const audio = new Audio(audioUrl);
        this.currentAudio = audio;
        
        audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            if (this.aiAudioLooping && this.aiAudioData) {
                setTimeout(() => {
                    if (this.aiAudioLooping && this.aiAudioData) {
                        this.playAIAudio(this.aiAudioData);
                    }
                }, 300);
            } else {
                this.isPlaying = false;
                this.playBtn.disabled = false;
            }
        };
        
        audio.onerror = (error) => {
            console.error('AI语音循环播放错误:', error);
            URL.revokeObjectURL(audioUrl);
            this.aiAudioLooping = false;
            this.isPlaying = false;
            this.playBtn.disabled = false;
            this.updateStatus('播放错误', 'error');
        };
        
        try {
            await audio.play();
            console.log('AI语音循环播放开始');
        } catch (error) {
            console.error('循环播放失败:', error);
            URL.revokeObjectURL(audioUrl);
            this.aiAudioLooping = false;
            this.isPlaying = false;
            this.playBtn.disabled = false;
        }
    }
    
    async stopAll() {
        // 停止所有正在播放的音频（包括循环播放）
        console.log('stopAll: 停止所有音频');
        
        // 1. 停止popup中的AI语音（如果有）
        if (this.currentAudio) {
            console.log('stopAll: 停止popup中的AI语音');
            try {
                this.currentAudio.pause();
                this.currentAudio.currentTime = 0;
                if (this.aiAudioData && this.aiAudioData.audioUrl) {
                    URL.revokeObjectURL(this.aiAudioData.audioUrl);
                }
            } catch (e) {
                console.warn('停止popup音频时出错:', e);
            }
            this.currentAudio = null;
        }
        
        // 2. 停止AI语音播放（通过offscreen和background）- 并行执行提高速度
        console.log('stopAll: 停止offscreen中的AI语音');
        const stopAIPromise = new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'stopAudio' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn('stopAll: 停止AI语音消息发送失败:', chrome.runtime.lastError.message);
                } else {
                    console.log('stopAll: 停止AI语音响应:', response);
                }
                resolve();
            });
            // 超时保护
            setTimeout(resolve, 500);
        });
        
        // 3. 停止Chrome TTS播放 - 并行执行
        console.log('stopAll: 停止Chrome TTS');
        const stopTTSPromise = new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'stop' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn('stopAll: 停止Chrome TTS消息发送失败:', chrome.runtime.lastError.message);
                } else {
                    console.log('stopAll: Chrome TTS已停止:', response);
                }
                resolve();
            });
            // 超时保护
            setTimeout(resolve, 500);
        });
        
        // 等待所有停止操作完成
        await Promise.all([stopAIPromise, stopTTSPromise]);
        
        // 4. 清理所有状态
        this.aiAudioLooping = false;
        this.aiAudioData = null;
        this.isPlaying = false;
        
        console.log('stopAll: 所有音频已停止');
    }
    
    async stop() {
        // 停止后台播放的音频
        console.log('用户点击停止播放按钮');
        
        // 立即更新UI状态
        this.playBtn.disabled = false;
        // 停止按钮始终可用，不禁用
        this.updateStatus('正在停止播放...', 'loading');
        
        try {
            // 停止所有正在播放的音频（包括后台播放）
            await this.stopAll();
            
            // 再次确认状态（检查后台是否真的停止了）
            await new Promise((resolve) => {
                chrome.runtime.sendMessage({ type: 'getStatus' }, (response) => {
                    if (response) {
                        console.log('停止后状态检查:', response);
                        if (response.isPlaying) {
                            // 如果后台还在播放，再次尝试停止
                            console.warn('后台仍在播放，再次尝试停止');
                            this.stopAll().then(resolve);
                        } else {
                            resolve();
                        }
                    } else {
                        resolve();
                    }
                });
                setTimeout(resolve, 500); // 超时保护
            });
            
            // 更新UI
            this.isPlaying = false;
            this.playBtn.disabled = false;
            // 停止按钮始终可用，不禁用
            this.updateStatus('已停止播放', 'success');
            console.log('停止播放完成');
        } catch (error) {
            console.error('停止播放出错:', error);
            this.updateStatus('停止时出错', 'error');
            // 即使出错也更新UI状态
            this.isPlaying = false;
            this.playBtn.disabled = false;
            // 停止按钮始终可用，不禁用
        }
    }

    updateStatus(message, type = '') {
        this.statusBar.textContent = message;
        this.statusBar.className = 'status-bar ' + type;
    }
    
    // 翻译文本并显示单词和语法解释
    async translateText(text) {
        if (!text || !text.trim()) {
            return;
        }
        
        // 检查是否使用AI语音（需要API Key）
        if (!this.useAIVoice) {
            return;
        }
        
        try {
            // 根据选择的语言判断目标语言
            const selectedLang = this.languageSelect.value;
            let targetLanguage = '中文';
            
            // 如果选择的不是中文，翻译成中文；如果选择的是中文，翻译成英文
            if (selectedLang.startsWith('zh')) {
                targetLanguage = '英文';
            } else {
                targetLanguage = '中文';
            }
            
            // 显示翻译区域并显示加载状态
            this.translationSection.style.display = 'block';
            this.translationText.textContent = '正在翻译...';
            this.furiganaSection.style.display = 'none';
            this.vocabularySection.style.display = 'none';
            this.grammarSection.style.display = 'none';
            
            // 调用翻译API
            const result = await this.openaiTTS.translateText(text, targetLanguage);
            
            // 保存翻译数据
            this.saveTranslationData(result);
            
            // 显示翻译结果
            this.translationText.textContent = result.translation || '翻译结果为空';
            
            // 显示假名注音（如果是日语）
            if (result.furigana) {
                // 处理换行：将\n转换为<br>，同时保留已有的<br>标签
                let furiganaHtml = result.furigana
                    .replace(/\n/g, '<br>')  // 将换行符转换为<br>标签
                    .replace(/<br><br>/g, '<br>');  // 避免重复的<br>
                this.furiganaText.innerHTML = furiganaHtml;
                this.furiganaSection.style.display = 'block';
            } else {
                this.furiganaSection.style.display = 'none';
            }
            
            // 显示单词解释（包含注音）
            if (result.vocabulary && result.vocabulary.length > 0) {
                this.vocabularyList.innerHTML = result.vocabulary.map(item => {
                    const word = item.word || '';
                    const pronunciation = item.pronunciation || '';
                    const explanation = item.explanation || '';
                    
                    // 如果有注音，显示为：单词（注音）: 解释
                    // 如果没有注音，显示为：单词: 解释
                    let displayText = '';
                    if (pronunciation) {
                        displayText = `<strong>${word}</strong>（${pronunciation}）: ${explanation}`;
                    } else {
                        displayText = `<strong>${word}</strong>: ${explanation}`;
                    }
                    return `<div style="margin-bottom: 6px;">${displayText}</div>`;
                }).join('');
                this.vocabularySection.style.display = 'block';
            } else {
                this.vocabularySection.style.display = 'none';
            }
            
            // 显示语法解释
            console.log('翻译结果中的grammar:', result.grammar);
            if (result.grammar && Array.isArray(result.grammar) && result.grammar.length > 0) {
                this.grammarList.innerHTML = result.grammar.map(item => {
                    const phrase = item.phrase || '';
                    const explanation = item.explanation || '';
                    return `<div style="margin-bottom: 6px;"><strong>「${phrase}」</strong>: ${explanation}</div>`;
                }).join('');
                this.grammarSection.style.display = 'block';
                console.log('语法解释已显示');
            } else {
                console.warn('语法解释为空或格式不正确:', result.grammar);
                this.grammarSection.style.display = 'none';
            }
        } catch (error) {
            console.error('翻译失败:', error);
            // 翻译失败时显示错误信息
            this.translationText.textContent = '翻译失败: ' + (error.message || '未知错误');
            this.furiganaSection.style.display = 'none';
            this.vocabularySection.style.display = 'none';
            this.grammarSection.style.display = 'none';
        }
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new SpeakFlowApp();
});

