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
2. 如果输入文本是日语（包含汉字），请提供带假名注音的原文（furigana）：
   - 必须对原文中的每一个汉字都标注假名注音，包括：单个汉字、复合词中的每个汉字、重复出现的汉字、所有汉字字符
   - 绝对不允许遗漏任何汉字，即使是常见的汉字如"的"、"是"、"在"等也必须标注
   - 平假名和片假名不需要标注（因为本身就是假名），直接显示即可
   - 使用HTML的ruby标签格式：<ruby>汉字<rt>假名</rt></ruby>
   - 对于复合词，每个汉字都要单独标注，例如：<ruby>野<rt>の</rt></ruby><ruby>井<rt>い</rt></ruby><ruby>戸<rt>ど</rt></ruby>
   - 对于单个汉字，也必须标注，例如：<ruby>私<rt>わたし</rt></ruby>、<ruby>本<rt>ほん</rt></ruby>
   - 保持原文的标点符号、空格和换行符
   - 确保furigana字段中没有任何未标注的汉字
   - 如果原文中有换行，furigana字段中也要保留对应的换行，使用HTML的<br>标签或保留原始换行符
3. 单词解释：提取文本中的重点单词（3-8个），每个单词需要包含：
   - 单词本身
   - 注音（日语用假名，英语用音标，其他语言用拼音或音标）
   - 中文解释
4. 语法解释：提取文本中的重点语法点（2-5个），每个语法点需要包含：
   - 语法点本身（只提取语法结构，不是整个句子，例如："〜てしまう"、"〜んです"、"〜んだっけ"等）
   - 语法点的详细解释（说明这个语法结构的用法、意义、语境、例句等）

重要：语法解释不是解释整个句子，而是提取句子中的语法结构并解释这个语法点的用法。
语法解释是必需字段，必须至少提供2个语法点。如果文本中没有明显的语法点，也要提取常见的语法结构（如助词、助动词、句型等）并解释。

请以JSON格式返回，格式如下：
{
  "translation": "翻译文本",
  "furigana": "带假名注音的原文（仅当输入是日语时提供，必须对所有汉字标注假名，使用HTML ruby标签）",
  "vocabulary": [
    {"word": "单词", "pronunciation": "注音", "explanation": "中文解释"}
  ],
  "grammar": [
    {"phrase": "语法点（例如：〜てしまう、〜んです、〜んだっけ）", "explanation": "这个语法点的详细解释，包括用法、意义、语境等"}
  ]
}

重要要求：
- 如果输入是日语，furigana字段必须提供，必须对原文中的每一个汉字都使用ruby标签标注假名
- 绝对不允许遗漏任何汉字，所有汉字（无论常见与否）都必须标注
- ruby标签格式：<ruby>汉字<rt>假名</rt></ruby>，例如：<ruby>彼女<rt>かのじょ</rt></ruby><ruby>は<rt>は</rt></ruby><ruby>その<rt>その</rt></ruby><ruby>時<rt>とき</rt></ruby>
- 即使是一个字的汉字也必须标注，例如：<ruby>私<rt>わたし</rt></ruby>、<ruby>本<rt>ほん</rt></ruby>
- 对于复合词，每个汉字都要单独用ruby标签标注，例如：<ruby>図書館<rt>としょかん</rt></ruby> 应该写成 <ruby>図<rt>と</rt></ruby><ruby>書<rt>しょ</rt></ruby><ruby>館<rt>かん</rt></ruby>
- 平假名和片假名不需要用ruby标签包裹，直接显示即可
- 检查furigana字段，确保没有任何未标注的汉字字符（汉字字符范围：\u4e00-\u9faf）
- 对于日语单词，pronunciation必须是假名（平假名或片假名）
- 对于英语单词，pronunciation必须是音标（使用IPA国际音标）
- 语法解释是必需字段，必须提供至少2个语法点，每个语法点必须包含phrase和explanation字段
- 语法解释必须提取语法结构（如助词、助动词、句型等），而不是解释整个句子
- 语法解释要说明这个语法点的用法、意义、语境等
- grammar字段不能为空数组，必须至少包含2个语法点
- 重要：返回的JSON必须是有效的JSON格式，所有字符串中的特殊字符必须正确转义
- furigana字段中的HTML标签（如<ruby>、<rt>等）必须作为普通字符串正确转义在JSON中
- 字符串中的双引号必须使用反斜杠转义：\"，例如：<ruby>汉字<rt>假名</rt></ruby> 在JSON中应该写成 "<ruby>汉字<rt>假名<\\/rt><\\/ruby>"
- 字符串中的反斜杠必须转义：\\，例如：路径中的反斜杠要写成 \\\\
- 确保所有字符串都被双引号正确闭合，不要有未闭合的引号
- 只返回JSON，不要添加任何其他内容，不要包含markdown代码块标记
- 返回前请仔细检查JSON格式的有效性，确保所有引号、括号都正确闭合`
                        },
                        {
                            role: 'user',
                            content: text
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 4000, // 增加token限制，避免响应被截断
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
            
            // 检查响应是否被截断
            const finishReason = data.choices?.[0]?.finish_reason;
            if (finishReason === 'length') {
                console.warn('OpenAI响应可能被截断（达到max_tokens限制）');
            }
            
            if (!content) {
                throw new Error('翻译结果为空');
            }
            
            console.log('收到的内容长度:', content.length);
            console.log('内容前200字符:', content.substring(0, 200));
            console.log('内容后200字符:', content.substring(Math.max(0, content.length - 200)));
            
            // 解析JSON响应
            let result;
            try {
                result = JSON.parse(content);
            } catch (parseError) {
                console.error('JSON解析错误:', parseError.message);
                const errorPos = parseInt(parseError.message.match(/position (\d+)/)?.[1] || '0');
                console.error('原始内容长度:', content.length);
                console.error('错误位置:', errorPos);
                
                // 检查是否是"Unexpected end of JSON input"错误
                if (parseError.message.includes('Unexpected end of JSON input')) {
                    console.error('检测到JSON响应被截断');
                    // 尝试修复被截断的JSON
                    let fixedContent = content.trim();
                    
                    // 尝试补全被截断的JSON
                    // 如果JSON不完整，尝试找到最后一个完整的部分
                    let braceCount = 0;
                    let lastValidPos = -1;
                    for (let i = 0; i < fixedContent.length; i++) {
                        if (fixedContent[i] === '{') braceCount++;
                        if (fixedContent[i] === '}') {
                            braceCount--;
                            if (braceCount === 0) {
                                lastValidPos = i;
                            }
                        }
                    }
                    
                    // 如果找到未闭合的JSON，尝试补全
                    if (braceCount > 0) {
                        console.warn('JSON未闭合，尝试补全');
                        // 尝试补全缺失的部分
                        let incompleteJson = fixedContent;
                        
                        // 检查是否缺少数组或对象的闭合
                        let openBraces = (incompleteJson.match(/\{/g) || []).length;
                        let closeBraces = (incompleteJson.match(/\}/g) || []).length;
                        let openBrackets = (incompleteJson.match(/\[/g) || []).length;
                        let closeBrackets = (incompleteJson.match(/\]/g) || []).length;
                        
                        // 补全缺失的闭合括号
                        while (openBraces > closeBraces) {
                            incompleteJson += '}';
                            closeBraces++;
                        }
                        while (openBrackets > closeBrackets) {
                            incompleteJson += ']';
                            closeBrackets++;
                        }
                        
                        // 尝试解析补全后的JSON
                        try {
                            result = JSON.parse(incompleteJson);
                            console.log('成功解析补全后的JSON');
                        } catch (repairError) {
                            console.error('补全后仍然无法解析:', repairError.message);
                            throw new Error(`翻译结果被截断，无法完整解析。可能是响应过长导致。内容长度: ${content.length}字符。请尝试缩短输入文本或检查API响应。`);
                        }
                    } else {
                        // 如果不是未闭合问题，尝试其他修复方法
                        const jsonMatch = fixedContent.match(/(\{[\s\S]*\})/);
                        if (jsonMatch && jsonMatch[1]) {
                            try {
                                result = JSON.parse(jsonMatch[1]);
                            } catch (matchError) {
                                throw new Error(`翻译结果被截断，无法解析。内容长度: ${content.length}字符。请尝试缩短输入文本。`);
                            }
                        } else {
                            throw new Error(`翻译结果被截断，无法解析。内容长度: ${content.length}字符。`);
                        }
                    }
                } else {
                    // 其他JSON解析错误
                    if (errorPos > 0) {
                        const start = Math.max(0, errorPos - 200);
                        const end = Math.min(content.length, errorPos + 200);
                        console.error('错误位置附近的内容:', content.substring(start, end));
                    }
                    
                    // 检查是否是"Unterminated string"错误
                    if (parseError.message.includes('Unterminated string')) {
                        console.error('检测到未闭合的字符串，尝试修复');
                        let fixedContent = content.trim();
                        
                        // 尝试修复未闭合的字符串
                        // 方法：找到错误位置，尝试补全字符串
                        if (errorPos > 0 && errorPos < fixedContent.length) {
                            // 从错误位置向前查找，找到最近的未闭合字符串开始位置
                            let quoteCount = 0;
                            let escapeNext = false;
                            
                            // 向前查找，计算引号数量（考虑转义）
                            for (let i = errorPos - 1; i >= 0; i--) {
                                if (escapeNext) {
                                    escapeNext = false;
                                    continue;
                                }
                                if (fixedContent[i] === '\\') {
                                    escapeNext = true;
                                    continue;
                                }
                                if (fixedContent[i] === '"' && !escapeNext) {
                                    quoteCount++;
                                }
                            }
                            
                            // 如果引号数量是奇数，说明有未闭合的字符串
                            if (quoteCount % 2 === 1) {
                                // 尝试在错误位置插入闭合引号
                                let beforeError = fixedContent.substring(0, errorPos);
                                let afterError = fixedContent.substring(errorPos);
                                
                                // 检查错误位置前最后一个字符，如果不是引号，尝试插入
                                const lastChar = beforeError[beforeError.length - 1];
                                if (lastChar !== '"' || (beforeError.length > 1 && beforeError[beforeError.length - 2] === '\\')) {
                                    // 在错误位置前插入闭合引号
                                    fixedContent = beforeError + '"' + afterError;
                                    console.log('尝试在位置', errorPos, '前插入闭合引号');
                                    try {
                                        result = JSON.parse(fixedContent);
                                        console.log('成功修复未闭合字符串');
                                    } catch (repairError) {
                                        console.error('修复未闭合字符串失败:', repairError.message);
                                        // 尝试在错误位置之后查找合适的位置插入引号
                                        // 查找下一个可能是字符串结束的位置
                                        let foundInsertPos = false;
                                        for (let i = errorPos; i < Math.min(errorPos + 100, fixedContent.length); i++) {
                                            if (fixedContent[i] === ',' || fixedContent[i] === '}' || fixedContent[i] === ']') {
                                                fixedContent = fixedContent.substring(0, i) + '"' + fixedContent.substring(i);
                                                console.log('尝试在位置', i, '前插入闭合引号');
                                                try {
                                                    result = JSON.parse(fixedContent);
                                                    console.log('成功修复未闭合字符串（在后续位置）');
                                                    foundInsertPos = true;
                                                    break;
                                                } catch (tryError) {
                                                    // 回滚，尝试下一个位置
                                                    fixedContent = content.trim();
                                                }
                                            }
                                        }
                                        if (!foundInsertPos) {
                                            fixedContent = content.trim();
                                        }
                                    }
                                }
                            }
                        }
                        
                        // 如果修复失败，尝试提取JSON部分
                        if (!result) {
                            let extractedContent = content.trim();
                            const jsonMatch = extractedContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || extractedContent.match(/(\{[\s\S]*\})/);
                            if (jsonMatch && jsonMatch[1]) {
                                extractedContent = jsonMatch[1];
                                try {
                                    result = JSON.parse(extractedContent);
                                } catch (matchError) {
                                    console.error('提取JSON部分后仍然失败:', matchError.message);
                                }
                            }
                        }
                        
                        if (!result) {
                            throw new Error(`无法解析翻译结果: ${parseError.message}. JSON中包含未闭合的字符串（可能是HTML标签中的引号未正确转义）。错误位置: ${errorPos || '未知'}. 建议：请检查furigana字段中的HTML标签是否正确转义了所有引号和反斜杠。`);
                        }
                    } else {
                        // 其他类型的JSON错误
                        // 尝试提取JSON部分
                        let fixedContent = content.trim();
                        const jsonMatch = fixedContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) || fixedContent.match(/(\{[\s\S]*\})/);
                        if (jsonMatch && jsonMatch[1]) {
                            fixedContent = jsonMatch[1];
                            try {
                                result = JSON.parse(fixedContent);
                            } catch (secondError) {
                                console.error('第二次解析也失败:', secondError.message);
                                throw new Error(`无法解析翻译结果: ${parseError.message}. 错误位置: ${errorPos || '未知'}. 请检查返回的JSON格式是否正确。`);
                            }
                        } else {
                            throw new Error(`无法解析翻译结果: ${parseError.message}. 未找到有效的JSON对象。错误位置: ${errorPos || '未知'}.`);
                        }
                    }
                }
            }
            
            console.log('OpenAI翻译: 翻译成功');
            return {
                translation: result.translation || '',
                furigana: result.furigana || '',
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

