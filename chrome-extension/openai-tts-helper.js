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
            { id: 'shimmer', name: 'Shimmer（最甜美女性）', gender: 'female', lang: 'all' },
            { id: 'nova', name: 'Nova（女性）', gender: 'female', lang: 'all' },
            { id: 'alloy', name: 'Alloy（中性）', gender: 'neutral', lang: 'all' },
            { id: 'echo', name: 'Echo（男性）', gender: 'male', lang: 'all' },
            { id: 'fable', name: 'Fable（中性）', gender: 'neutral', lang: 'all' },
            { id: 'onyx', name: 'Onyx（男性）', gender: 'male', lang: 'all' }
        ];
    }
    
    // 根据语言代码获取推荐的语音
    getRecommendedVoice(langCode) {
        const voices = this.getVoices();
        const lang = langCode.toLowerCase();
        
        // 默认推荐Nova（女性音色）
        // 根据语言推荐合适的语音
        if (lang.startsWith('zh')) {
            // 中文推荐Nova
            return voices.find(v => v.id === 'nova') || voices[0];
        } else if (lang.startsWith('ja')) {
            // 日语推荐Nova
            return voices.find(v => v.id === 'nova') || voices[0];
        } else if (lang.startsWith('ko')) {
            // 韩语推荐Nova
            return voices.find(v => v.id === 'nova') || voices[0];
        } else {
            // 其他语言默认使用Nova
            return voices.find(v => v.id === 'nova') || voices[0];
        }
    }
    
    // 生成语音音频
    async generateSpeech(text, options = {}) {
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            throw new Error('未设置OpenAI API Key。请在设置中输入您的API Key。');
        }
        
        const voice = options.voice || 'nova'; // 默认使用Nova女性音色
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
    
    // 翻译文本并获取单词和语法解释（使用OpenAI的翻译API）
    async translateText(text, targetLanguage = '中文') {
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            throw new Error('未设置OpenAI API Key。请在设置中输入您的API Key。');
        }
        
        try {
            console.log('OpenAI翻译: 开始翻译，文本长度:', text.length, '目标语言:', targetLanguage);
            
            // 使用Chat API进行翻译和解释
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'system',
                            content: `你是一个专业的语言学习助手。请分析用户提供的文本，并提供以下内容：
1. 中文翻译：将文本翻译成${targetLanguage}
2. 单词解释：提取文本中的重点单词（3-8个），每个单词需要包含：
   - 单词本身
   - 注音（日语用假名，英语用音标，其他语言用拼音或音标）
   - 中文解释
3. 语法解释：提取文本中的重点语法点（2-5个），每个语法点需要包含：
   - 语法点本身（只提取语法结构，不是整个句子，例如："〜てしまう"、"〜んです"、"〜んだっけ"等）
   - 语法点的详细解释（说明这个语法结构的用法、意义、语境、例句等）

重要：语法解释不是解释整个句子，而是提取句子中的语法结构并解释这个语法点的用法。

请以JSON格式返回，格式如下：
{
  "translation": "翻译文本",
  "vocabulary": [
    {"word": "单词", "pronunciation": "注音", "explanation": "中文解释"}
  ],
  "grammar": [
    {"phrase": "语法点（例如：〜てしまう、〜んです、〜んだっけ）", "explanation": "这个语法点的详细解释，包括用法、意义、语境等"}
  ]
}

重要要求：
- 对于日语单词，pronunciation必须是假名（平假名或片假名）
- 对于英语单词，pronunciation必须是音标（使用IPA国际音标）
- 语法解释必须提取语法结构（如助词、助动词、句型等），而不是解释整个句子
- 语法解释要说明这个语法点的用法、意义、语境等
- 只返回JSON，不要添加任何其他内容。`
                        },
                        {
                            role: 'user',
                            content: text
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 2000,
                    response_format: { type: "json_object" }
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
                
                if (response.status === 401) {
                    throw new Error('API Key无效或已过期，请检查您的OpenAI API Key。');
                } else if (response.status === 429) {
                    throw new Error('API调用次数超限，请稍后再试或检查您的OpenAI账户配额。');
                } else {
                    throw new Error('OpenAI翻译API错误: ' + errorMessage);
                }
            }
            
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content?.trim();
            
            if (!content) {
                throw new Error('翻译结果为空');
            }
            
            // 解析JSON响应
            let result;
            try {
                result = JSON.parse(content);
            } catch (parseError) {
                // 如果解析失败，尝试提取JSON部分
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    result = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error('无法解析翻译结果');
                }
            }
            
            console.log('OpenAI翻译: 翻译成功');
            return {
                translation: result.translation || '',
                vocabulary: result.vocabulary || [],
                grammar: result.grammar || []
            };
        } catch (error) {
            console.error('OpenAI翻译失败:', error);
            if (error.message) {
                throw error;
            } else {
                throw new Error('翻译时出错: ' + (error.message || '未知错误'));
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

