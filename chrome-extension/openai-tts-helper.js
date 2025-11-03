// OpenAI TTS API Helper for SpeakFlow
// 使用OpenAI的text-to-speech API生成高质量AI语音

class OpenAITTSHelper {
    constructor() {
        this.apiKey = null;
        this.baseUrl = 'https://api.openai.com/v1/audio/speech';
    }
    
    async setApiKey(apiKey) {
        this.apiKey = apiKey;
        // 保存到chrome.storage
        if (apiKey) {
            chrome.storage.local.set({ 'openai_api_key': apiKey });
        } else {
            chrome.storage.local.remove('openai_api_key');
        }
    }
    
    async getApiKey() {
        if (this.apiKey) {
            return this.apiKey;
        }
        return new Promise((resolve) => {
            chrome.storage.local.get(['openai_api_key'], (result) => {
                this.apiKey = result.openai_api_key || null;
                resolve(this.apiKey);
            });
        });
    }
    
    // OpenAI支持的语音列表
    getVoices() {
        return [
            { id: 'alloy', name: 'Alloy（中性）', gender: 'neutral', lang: 'all' },
            { id: 'echo', name: 'Echo（男性）', gender: 'male', lang: 'all' },
            { id: 'fable', name: 'Fable（中性）', gender: 'neutral', lang: 'all' },
            { id: 'onyx', name: 'Onyx（男性）', gender: 'male', lang: 'all' },
            { id: 'nova', name: 'Nova（女性）', gender: 'female', lang: 'all' },
            { id: 'shimmer', name: 'Shimmer（女性）', gender: 'female', lang: 'all' }
        ];
    }
    
    // 根据语言代码获取推荐的语音
    getRecommendedVoice(langCode) {
        const voices = this.getVoices();
        const lang = langCode.toLowerCase();
        
        // 根据语言推荐合适的语音
        if (lang.startsWith('zh')) {
            // 中文推荐Nova或Shimmer
            return voices.find(v => v.id === 'nova') || voices[0];
        } else if (lang.startsWith('ja')) {
            // 日语推荐Shimmer或Nova
            return voices.find(v => v.id === 'shimmer') || voices[0];
        } else if (lang.startsWith('ko')) {
            // 韩语推荐Shimmer
            return voices.find(v => v.id === 'shimmer') || voices[0];
        } else {
            // 其他语言默认使用Alloy
            return voices[0];
        }
    }
    
    // 生成语音音频
    async generateSpeech(text, options = {}) {
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            throw new Error('未设置OpenAI API Key。请在设置中输入您的API Key。');
        }
        
        const voice = options.voice || 'alloy';
        const model = options.model || 'tts-1'; // tts-1 或 tts-1-hd（更高质量但更慢）
        const speed = Math.max(0.25, Math.min(4.0, options.speed || 1.0)); // OpenAI支持0.25-4.0倍速
        
        try {
            console.log('OpenAI TTS: 开始生成语音，文本长度:', text.length, '语音:', voice, '模型:', model, '倍速:', speed);
            
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: model,
                    input: text,
                    voice: voice,
                    speed: speed
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
                
                if (response.status === 401) {
                    throw new Error('API Key无效或已过期，请检查您的OpenAI API Key。');
                } else if (response.status === 429) {
                    throw new Error('API调用次数超限，请稍后再试或检查您的OpenAI账户配额。');
                } else if (response.status === 400) {
                    throw new Error('请求参数错误: ' + errorMessage);
                } else {
                    throw new Error('OpenAI API错误: ' + errorMessage);
                }
            }
            
            // 返回音频Blob
            const audioBlob = await response.blob();
            console.log('OpenAI TTS: 音频生成成功，大小:', audioBlob.size, 'bytes');
            
            return audioBlob;
        } catch (error) {
            console.error('OpenAI TTS生成失败:', error);
            if (error.message) {
                throw error;
            } else {
                throw new Error('生成语音时出错: ' + (error.message || '未知错误'));
            }
        }
    }
    
    // 验证API Key是否有效（通过调用API来验证）
    async validateApiKey(apiKey) {
        if (!apiKey || !apiKey.trim()) {
            return { valid: false, error: 'API Key不能为空' };
        }
        
        try {
            // 使用一个很短的测试文本来验证（会消耗少量API配额）
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'tts-1',
                    input: 'test',
                    voice: 'alloy'
                })
            });
            
            if (response.ok) {
                return { valid: true };
            } else {
                const errorData = await response.json().catch(() => ({}));
                return { 
                    valid: false, 
                    error: errorData.error?.message || 'API Key验证失败' 
                };
            }
        } catch (error) {
            return { 
                valid: false, 
                error: error.message || 'API Key验证失败' 
            };
        }
    }
}

